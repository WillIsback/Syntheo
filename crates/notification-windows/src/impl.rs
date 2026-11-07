use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use indexmap::IndexMap;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{BeginPaint, EndPaint, PAINTSTRUCT};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Controls::WM_MOUSELEAVE;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{TME_LEAVE, TRACKMOUSEEVENT, TrackMouseEvent};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CS_HREDRAW, CS_VREDRAW, CreatePopupMenu, CreateWindowExW, DefWindowProcW,
    DestroyMenu, DestroyWindow, DispatchMessageW, GetCursorPos, GetMessageW, HICON, IDC_ARROW,
    KillTimer, LoadCursorW, MF_STRING, MSG, PostThreadMessageW, RegisterClassExW, SPI_GETWORKAREA,
    SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_NOZORDER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, SetTimer,
    SetWindowPos, ShowWindow, SystemParametersInfoW, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON,
    TrackPopupMenu, TranslateMessage, WM_APP, WM_DESTROY, WM_LBUTTONUP, WM_MOUSEMOVE, WM_PAINT,
    WM_TIMER, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    WS_POPUP,
};
use windows::core::{PCWSTR, w};

use syntheo_notification_interface::{DismissTimer, Notification, PrimaryAction, unix_now};

use crate::callbacks;
use crate::icon::{destroy_icon, header_title, load_notification_icon};
use crate::layout::{
    HitTarget, MAX_NOTIFICATIONS, NotificationLayout, fit_stack, stacked_origin, try_expand,
};
use crate::render::{Frame, FrameKey, render, system_prefers_dark};
use crate::theme::ActionStyle;

const CLASS_NAME: windows::core::PCWSTR = w!("SyntheoNotification");
const TIMER_ID: usize = 1;

enum Command {
    Show(Box<Notification>),
    DismissAll,
}

static COMMANDS: OnceLock<Mutex<Option<Sender<Command>>>> = OnceLock::new();
static THREAD_ID: OnceLock<Mutex<u32>> = OnceLock::new();

struct NotificationInstance {
    key: String,
    payload: Notification,
    hwnd: HWND,
    layout: NotificationLayout,
    dismiss_timer: Option<DismissTimer>,
    is_hovered: bool,
    is_expanded: bool,
    tracking_leave: bool,
    icon: Option<HICON>,
    /// Dernière image envoyée à `UpdateLayeredWindow`.
    rendered: Option<FrameKey>,
}

struct NotificationManager {
    active: IndexMap<String, NotificationInstance>,
}

impl NotificationManager {
    fn new() -> Self {
        Self {
            active: IndexMap::new(),
        }
    }

    fn show(&mut self, notification: Notification) {
        let key = notification
            .key
            .clone()
            .unwrap_or_else(|| notification.title.clone());
        if let Some(existing) = self.active.shift_remove(&key) {
            unsafe {
                let _ = DestroyWindow(existing.hwnd);
            }
            destroy_icon(existing.icon);
        }
        while self.active.len() >= MAX_NOTIFICATIONS {
            if let Some(oldest) = self.active.keys().next().cloned() {
                self.dismiss(&oldest, DismissReason::Superseded);
            } else {
                break;
            }
        }

        let layout = NotificationLayout::compact(&notification);
        let occupied = self.occupied_height();
        let (work_x, work_y, work_width, _) = work_area();
        let (card_x, card_y) = stacked_origin(work_x, work_y, work_width, occupied, &layout);
        let (x, y) = layout.window_origin(card_x, card_y);
        let (width, height) = layout.window_size();
        let hwnd = match create_overlay_window(x, y, width, height) {
            Some(hwnd) => hwnd,
            None => return,
        };
        let icon = load_notification_icon(notification.icon.as_ref());
        let timeout = notification.timeout.filter(|timeout| !timeout.is_zero());
        let instance = NotificationInstance {
            key: key.clone(),
            payload: notification,
            hwnd,
            layout,
            dismiss_timer: timeout.map(DismissTimer::new),
            is_hovered: false,
            is_expanded: false,
            tracking_leave: false,
            icon,
            rendered: None,
        };
        unsafe {
            let _ = SetTimer(Some(hwnd), TIMER_ID, 50, None);
        }
        self.active.insert(key, instance);
        self.reposition();
        if self.active.values().any(|instance| instance.hwnd == hwnd) {
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            }
        }
    }

    fn occupied_height(&self) -> i32 {
        self.active
            .values()
            .map(|instance| {
                instance.layout.height + instance.layout.scale(crate::layout::NOTIFICATION_SPACING)
            })
            .sum()
    }

    fn reposition(&mut self) {
        let (work_x, work_y, work_width, work_height) = work_area();
        let mut layouts: Vec<_> = self
            .active
            .values()
            .map(|instance| {
                let dpi = unsafe { GetDpiForWindow(instance.hwnd) }.max(96);
                NotificationLayout::for_state(&instance.payload, instance.is_expanded).at_dpi(dpi)
            })
            .collect();
        let first = fit_stack(&mut layouts, work_height);
        for _ in 0..first {
            if let Some((_, instance)) = self.active.shift_remove_index(0) {
                unsafe {
                    let _ = KillTimer(Some(instance.hwnd), TIMER_ID);
                    let _ = DestroyWindow(instance.hwnd);
                }
                destroy_icon(instance.icon);
            }
        }
        let mut occupied = 0;
        for (instance, layout) in self
            .active
            .values_mut()
            .zip(layouts.into_iter().skip(first))
        {
            instance.layout = layout;
            let (card_x, card_y) =
                stacked_origin(work_x, work_y, work_width, occupied, &instance.layout);
            occupied +=
                instance.layout.height + instance.layout.scale(crate::layout::NOTIFICATION_SPACING);
            let (x, y) = instance.layout.window_origin(card_x, card_y);
            let (width, height) = instance.layout.window_size();
            unsafe {
                let _ = SetWindowPos(
                    instance.hwnd,
                    None,
                    x,
                    y,
                    width,
                    height,
                    SWP_NOACTIVATE | SWP_NOZORDER,
                );
            }
            instance.redraw();
        }
    }

    fn dismiss(&mut self, key: &str, reason: DismissReason) {
        let Some(instance) = self.active.shift_remove(key) else {
            return;
        };
        match reason {
            DismissReason::User => callbacks::dismiss(key.to_string()),
            DismissReason::Timeout => callbacks::timeout(key.to_string()),
            DismissReason::Action | DismissReason::Superseded => {}
        }
        unsafe {
            let _ = KillTimer(Some(instance.hwnd), TIMER_ID);
            let _ = DestroyWindow(instance.hwnd);
        }
        destroy_icon(instance.icon);
        self.reposition();
    }

    fn dismiss_all(&mut self) {
        let keys: Vec<String> = self.active.keys().cloned().collect();
        for key in keys {
            self.dismiss(&key, DismissReason::Superseded);
        }
    }

    fn instance_by_hwnd_mut(&mut self, hwnd: HWND) -> Option<&mut NotificationInstance> {
        self.active
            .values_mut()
            .find(|instance| instance.hwnd == hwnd)
    }

    fn tick(&mut self, hwnd: HWND) {
        if self
            .instance_by_hwnd_mut(hwnd)
            .is_some_and(|instance| unsafe { GetDpiForWindow(hwnd) }.max(96) != instance.layout.dpi)
        {
            self.reposition();
        }
        let now = Instant::now();
        let key = self.instance_by_hwnd_mut(hwnd).and_then(|instance| {
            instance
                .dismiss_timer
                .as_ref()
                .filter(|timer| timer.is_running() && timer.is_expired(now))
                .map(|_| instance.key.clone())
        });
        if let Some(key) = key {
            self.dismiss(&key, DismissReason::Timeout);
            return;
        }
        let started_key = self.instance_by_hwnd_mut(hwnd).and_then(|instance| {
            instance
                .payload
                .should_dismiss_started(unix_now())
                .then(|| instance.key.clone())
        });
        if let Some(key) = started_key {
            self.dismiss(&key, DismissReason::Timeout);
            return;
        }
        if let Some(instance) = self.instance_by_hwnd_mut(hwnd) {
            instance.redraw();
        }
    }

    fn set_hover(&mut self, hwnd: HWND, hovered: bool) {
        let Some(instance) = self.instance_by_hwnd_mut(hwnd) else {
            return;
        };
        if instance.is_hovered == hovered {
            return;
        }
        instance.is_hovered = hovered;
        if !instance.is_expanded
            && let Some(timer) = &mut instance.dismiss_timer
        {
            if hovered {
                timer.pause(Instant::now());
            } else {
                timer.resume(Instant::now());
            }
        }
        instance.redraw();
    }

    fn handle_click(&mut self, hwnd: HWND, x: i32, y: i32) {
        let Some(instance) = self.instance_by_hwnd_mut(hwnd) else {
            return;
        };
        let target = instance.layout.window_hit(&instance.payload, x, y);
        let key = instance.key.clone();
        match target {
            HitTarget::Outside => {}
            HitTarget::Close => self.dismiss(&key, DismissReason::User),
            HitTarget::Action => {
                callbacks::accept(key.clone());
                self.dismiss(&key, DismissReason::Action);
            }
            HitTarget::Options => self.show_options_menu(hwnd),
            HitTarget::Footer => {
                callbacks::footer_action(key.clone());
                self.dismiss(&key, DismissReason::Action);
            }
            HitTarget::Collapse => self.toggle_expanded(hwnd),
            HitTarget::Body => {
                let Some(instance) = self.instance_by_hwnd_mut(hwnd) else {
                    return;
                };
                if instance.payload.has_options() {
                    self.show_options_menu(hwnd);
                } else if instance.payload.has_expandable_content() || instance.is_expanded {
                    self.toggle_expanded(hwnd);
                } else {
                    callbacks::confirm(key.clone());
                    self.dismiss(&key, DismissReason::Action);
                }
            }
        }
    }

    fn toggle_expanded(&mut self, hwnd: HWND) {
        let Some(index) = self
            .active
            .values()
            .position(|instance| instance.hwnd == hwnd)
        else {
            return;
        };
        let instance = self.active.get_index(index).unwrap().1;
        if !instance.payload.has_expandable_content() && !instance.is_expanded {
            return;
        }
        if !instance.is_expanded {
            let mut layouts: Vec<_> = self
                .active
                .values()
                .map(|instance| instance.layout.clone())
                .collect();
            if !try_expand(&mut layouts, index, &instance.payload, work_area().3) {
                return;
            }
        }
        let instance = self.active.get_index_mut(index).unwrap().1;
        instance.is_expanded = !instance.is_expanded;
        instance.layout = NotificationLayout::for_state(&instance.payload, instance.is_expanded);
        if let Some(timer) = &mut instance.dismiss_timer {
            if instance.is_expanded {
                timer.pause(Instant::now());
            } else if !instance.is_hovered {
                timer.resume(Instant::now());
            }
        }
        self.reposition();
    }

    fn show_options_menu(&mut self, hwnd: HWND) {
        let Some(instance) = self.instance_by_hwnd_mut(hwnd) else {
            return;
        };
        let semantic_menu = instance.payload.action_menu.clone();
        let options = match instance.payload.primary_action() {
            PrimaryAction::Options(options) => options.to_vec(),
            PrimaryAction::Accept { .. } if semantic_menu.is_some() => {
                vec![semantic_menu.as_ref().unwrap().label.clone()]
            }
            PrimaryAction::Accept { .. } => return,
        };
        let key = instance.key.clone();
        let menu = unsafe { CreatePopupMenu().ok() };
        let Some(menu) = menu else {
            return;
        };
        for (index, option) in options.iter().enumerate() {
            let mut text = wide(option);
            unsafe {
                let _ = AppendMenuW(menu, MF_STRING, index + 1, PCWSTR(text.as_mut_ptr()));
            }
        }
        if semantic_menu.is_none() {
            let mut create_new = wide("Create New Note...");
            unsafe {
                let _ = AppendMenuW(
                    menu,
                    MF_STRING,
                    options.len() + 1,
                    PCWSTR(create_new.as_mut_ptr()),
                );
            }
        }
        let mut cursor = POINT::default();
        unsafe {
            let _ = GetCursorPos(&mut cursor);
            let selected = TrackPopupMenu(
                menu,
                TPM_LEFTALIGN | TPM_RIGHTBUTTON | TPM_RETURNCMD,
                cursor.x,
                cursor.y,
                None,
                hwnd,
                None,
            );
            let _ = DestroyMenu(menu);
            if selected.0 > 0 {
                callbacks::option_selected(key.clone(), selected.0 - 1);
                self.dismiss(&key, DismissReason::Action);
            }
        }
    }
}

#[derive(Clone, Copy)]
enum DismissReason {
    User,
    Timeout,
    Action,
    Superseded,
}

thread_local! {
    static MANAGER: std::cell::RefCell<NotificationManager> =
        std::cell::RefCell::new(NotificationManager::new());
}

fn ensure_ui_thread() {
    static START: std::sync::Once = std::sync::Once::new();
    START.call_once(|| {
        let (tx, rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        *COMMANDS.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(tx);
        std::thread::Builder::new()
            .name("notification-windows".into())
            .spawn(move || ui_thread(rx, ready_tx))
            .expect("failed to start Windows notification thread");
        let _ = ready_rx.recv();
    });
}

fn ui_thread(rx: Receiver<Command>, ready: Sender<()>) {
    unsafe {
        let _ = THREAD_ID
            .get_or_init(|| Mutex::new(0))
            .lock()
            .map(|mut id| *id = GetCurrentThreadId());
        register_class();
        let _ = ready.send(());
        loop {
            let mut msg = MSG::default();
            let status = GetMessageW(&mut msg, None, 0, 0);
            if status.0 <= 0 {
                break;
            }
            if msg.message == WM_APP {
                while let Ok(command) = rx.try_recv() {
                    MANAGER.with(|manager| match command {
                        Command::Show(notification) => manager.borrow_mut().show(*notification),
                        Command::DismissAll => manager.borrow_mut().dismiss_all(),
                    });
                }
                continue;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

fn send_command(command: Command) {
    ensure_ui_thread();
    if let Some(tx) = COMMANDS
        .get()
        .and_then(|lock| lock.lock().ok().and_then(|guard| guard.clone()))
    {
        let _ = tx.send(command);
    }
    if let Some(thread_id) = THREAD_ID
        .get()
        .and_then(|lock| lock.lock().ok().map(|id| *id))
        .filter(|id| *id != 0)
    {
        unsafe {
            let _ = PostThreadMessageW(thread_id, WM_APP, WPARAM(0), LPARAM(0));
        }
    }
}

unsafe fn register_class() {
    unsafe {
        let hinstance = GetModuleHandleW(None).unwrap_or_default();
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wndproc),
            hInstance: hinstance.into(),
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            lpszClassName: CLASS_NAME,
            ..Default::default()
        };
        let _ = RegisterClassExW(&class);
    }
}

fn create_overlay_window(x: i32, y: i32, width: i32, height: i32) -> Option<HWND> {
    unsafe {
        let hinstance = GetModuleHandleW(None).ok()?;
        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED,
            CLASS_NAME,
            w!(""),
            WS_POPUP,
            x,
            y,
            width,
            height,
            None,
            None,
            Some(hinstance.into()),
            None,
        )
        .ok()?;
        // Pas de `SetLayeredWindowAttributes` : le contenu (coins arrondis,
        // ombre) arrive par `UpdateLayeredWindow` avec un alpha par pixel.
        Some(hwnd)
    }
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_PAINT => {
            paint(hwnd);
            LRESULT(0)
        }
        WM_LBUTTONUP => {
            let x = loword(lparam);
            let y = hiword(lparam);
            MANAGER.with(|manager| manager.borrow_mut().handle_click(hwnd, x, y));
            LRESULT(0)
        }
        WM_MOUSEMOVE => {
            MANAGER.with(|manager| {
                let mut manager = manager.borrow_mut();
                if let Some(instance) = manager.instance_by_hwnd_mut(hwnd)
                    && !instance.tracking_leave
                {
                    instance.tracking_leave = true;
                    let mut event = TRACKMOUSEEVENT {
                        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                        dwFlags: TME_LEAVE,
                        hwndTrack: hwnd,
                        dwHoverTime: 0,
                    };
                    let _ = unsafe { TrackMouseEvent(&mut event) };
                }
                manager.set_hover(hwnd, true);
            });
            LRESULT(0)
        }
        WM_MOUSELEAVE => {
            MANAGER.with(|manager| {
                let mut manager = manager.borrow_mut();
                if let Some(instance) = manager.instance_by_hwnd_mut(hwnd) {
                    instance.tracking_leave = false;
                }
                manager.set_hover(hwnd, false);
            });
            LRESULT(0)
        }
        WM_TIMER => {
            MANAGER.with(|manager| manager.borrow_mut().tick(hwnd));
            LRESULT(0)
        }
        WM_DESTROY => LRESULT(0),
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

/// Le contenu est poussé par `UpdateLayeredWindow` ; il suffit de valider la
/// zone pour que Windows ne renvoie pas `WM_PAINT` en boucle.
fn paint(hwnd: HWND) {
    unsafe {
        let mut ps = PAINTSTRUCT::default();
        let _ = BeginPaint(hwnd, &mut ps);
        let _ = EndPaint(hwnd, &ps);
    }
}

fn expanded_body(notification: &Notification, remaining: Option<Duration>) -> String {
    let mut lines = Vec::new();
    if let Some(details) = &notification.event_details {
        lines.push(format!("What: {}", details.what));
        if let Some(timezone) = &details.timezone {
            lines.push(format!("Invitee Time Zone: {timezone}"));
        }
        if let Some(location) = &details.location {
            lines.push(format!("Where: {location}"));
        }
    }
    if let Some(participants) = &notification.participants {
        for participant in participants {
            let name = participant.name.clone().unwrap_or_default();
            let display = if name.is_empty() {
                participant.email.clone()
            } else {
                format!("{name} ({})", participant.email)
            };
            lines.push(display);
        }
    }
    if let Some(remaining) = remaining {
        lines.push(notification.expanded_schedule_message(remaining));
    }
    if lines.is_empty() {
        notification.message.clone()
    } else {
        lines.join("\n")
    }
}

impl NotificationInstance {
    fn action(&self) -> Option<(&str, ActionStyle)> {
        self.layout.action?;
        Some(match self.payload.primary_action() {
            PrimaryAction::Options(_) if !self.is_expanded => (
                self.payload.labels().options.as_str(),
                ActionStyle::Secondary,
            ),
            PrimaryAction::Options(_) => (
                self.payload.expanded_action_label(),
                action_style(self.payload.is_destructive_action()),
            ),
            PrimaryAction::Accept { label, destructive } => (label, action_style(destructive)),
        })
    }

    /// Redessine la fenêtre si son contenu visible a changé.
    fn redraw(&mut self) {
        let now = Instant::now();
        let body = if self.is_expanded {
            expanded_body(&self.payload, self.schedule_remaining())
        } else {
            self.payload.compact_message(self.compact_remaining(now))
        };
        let frame = Frame {
            layout: &self.layout,
            icon: self.icon,
            title: header_title(&self.payload, self.is_expanded),
            body,
            expanded: self.is_expanded,
            action: self.action(),
            action_menu: self.payload.has_action_menu(),
            collapse_label: self.layout.collapse.map(|_| "Show less"),
            footer: self
                .payload
                .footer
                .as_ref()
                .filter(|_| self.layout.footer_action.is_some())
                .map(|footer| (footer.text.as_str(), footer.action_label.as_str())),
            hovered: self.is_hovered,
            progress: self
                .dismiss_timer
                .as_ref()
                .map(|timer| timer.progress_ratio(now)),
            dark: system_prefers_dark(),
        };
        let key = frame.key();
        if self.rendered.as_ref() == Some(&key) {
            return;
        }
        render(self.hwnd, &frame);
        self.rendered = Some(key);
    }

    fn schedule_remaining(&self) -> Option<Duration> {
        let start_time = self.payload.start_time?;
        Some(Duration::from_secs(
            start_time.saturating_sub(unix_now()).max(0) as u64,
        ))
    }

    fn compact_remaining(&self, now: Instant) -> Option<Duration> {
        if self.payload.start_time.is_some() {
            self.schedule_remaining()
        } else if self.payload.shows_stop_countdown() {
            self.dismiss_timer
                .as_ref()
                .map(|timer| timer.remaining(now))
        } else {
            None
        }
    }
}

fn action_style(destructive: bool) -> ActionStyle {
    if destructive {
        ActionStyle::Destructive
    } else {
        ActionStyle::Primary
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn loword(lparam: LPARAM) -> i32 {
    (lparam.0 as u16) as i16 as i32
}

fn hiword(lparam: LPARAM) -> i32 {
    ((lparam.0 >> 16) as u16) as i16 as i32
}

fn work_area() -> (i32, i32, i32, i32) {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1080,
    };
    unsafe {
        let _ = SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            Some(&mut rect as *mut RECT as *mut std::ffi::c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
    }
    (
        rect.left,
        rect.top,
        rect.right - rect.left,
        rect.bottom - rect.top,
    )
}

pub fn show(notification: &Notification) {
    send_command(Command::Show(Box::new(notification.clone())));
}

pub fn dismiss_all() {
    send_command(Command::DismissAll);
}
