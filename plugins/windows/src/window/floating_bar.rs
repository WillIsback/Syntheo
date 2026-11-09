use serde::{Deserialize, Serialize};

use crate::Error;
use crate::window::live_caption::LiveCaptionPosition;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FloatingBarStatus {
    Recording,
    Reconnecting,
    Error,
    /// Écoute en pause (issue 353) : aucune capture ouverte, « Reprendre » et « Terminer ».
    Paused,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FloatingBarOverlayLayout {
    pub controls_center_x: f64,
    pub expands_upward: bool,
    /// Faux quand le compositeur tient la pastille en calque (layer-shell, issue 448) : elle
    /// reste ancrée en bas au centre et ne se déplace pas à la souris.
    #[serde(default = "default_movable")]
    pub movable: bool,
}

fn default_movable() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FloatingBarColorScheme {
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FloatingTranscriptBubble {
    pub id: String,
    pub speaker_label: String,
    pub text: String,
    pub is_self: bool,
    pub is_final: bool,
    pub start_ms: f64,
    pub end_ms: f64,
    pub overlaps_previous: bool,
    pub overlaps_next: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FloatingDictationState {
    pub session_id: String,
    pub phase: String,
    pub microphone: String,
    pub text: String,
    pub partial: String,
    pub preview_enabled: bool,
    pub preview_unavailable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FloatingBarState {
    #[serde(default)]
    pub dictation: Option<FloatingDictationState>,
    pub amplitude: f64,
    pub title: String,
    pub status: FloatingBarStatus,
    pub color_scheme: FloatingBarColorScheme,
    pub opacity: f64,
    pub live_caption_opacity: f64,
    pub live_caption_width: f64,
    pub live_caption_line_count: u32,
    pub live_caption_position: LiveCaptionPosition,
    pub live_caption_minimized: bool,
    pub live_caption_toggle_visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript_bubbles: Option<Vec<FloatingTranscriptBubble>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript_notice: Option<String>,
    #[serde(default)]
    pub layout: Option<FloatingBarOverlayLayout>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Durée écoutée, pauses exclues (issue 448) : affichée dans la pastille de réunion.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub elapsed_seconds: Option<u32>,
    /// Micro coupé pendant l'écoute (issue 447) : la bascule de la pastille l'affiche barré.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mic_muted: Option<bool>,
}

pub const WINDOW_LABEL: &str = "floating-bar";

#[cfg(any(test, not(target_os = "macos")))]
pub(crate) mod layout {
    use super::{FloatingBarState, FloatingBarStatus};

    /// Marge transparente autour du panneau de dictée (la pastille de réunion n'en a pas).
    pub const INSET: f64 = 4.0;
    pub const SCREEN_MARGIN: f64 = 8.0;
    pub const COMPACT_HEIGHT: f64 = 38.0;
    pub const COMPACT_STOP_WIDTH: f64 = 62.0;
    pub const COMPACT_ICON_SIZE: f64 = 30.0;
    pub const COMPACT_GAP: f64 = 0.0;
    pub const COMPACT_HORIZONTAL_PADDING: f64 = 4.0;
    /// « En pause », « Reprendre » et « Terminer » côte à côte (bar.tsx).
    pub const PAUSED_CONTROLS_WIDTH: f64 = 232.0;
    /// Pastille d'écoute (issue 448) : point, durée, niveau, séparateur, bascule du micro
    /// (issue 447), « Pause » et « Terminer ». Même valeur que FLOATING_BAR_RECORDING_PILL_WIDTH
    /// (layout.ts), vérifiée par bar.test.tsx.
    pub const RECORDING_PILL_WIDTH: f64 = 294.0;
    /// Place supplémentaire de la durée au-delà d'une heure (h:mm:ss au lieu de mm:ss).
    pub const LONG_DURATION_EXTRA_WIDTH: f64 = 16.0;
    pub const LONG_DURATION_SECONDS: u32 = 3600;
    pub const EXPANDED_WIDTH: f64 = 360.0;
    pub const EXPANDED_HEIGHT: f64 = 430.0;

    /// Panneau de transcription ouvert : seule la dictée en a un (issue 448).
    pub fn is_expanded(state: &FloatingBarState) -> bool {
        state.dictation.is_some()
            && state.live_caption_toggle_visible
            && !state.live_caption_minimized
    }

    pub fn compact_controls_width() -> f64 {
        COMPACT_STOP_WIDTH + COMPACT_GAP + COMPACT_ICON_SIZE
    }

    /// Taille de la pastille de réunion : la fenêtre a exactement cette taille, sans marge ni
    /// zone réservée (issue 448).
    pub fn meeting_pill_size(state: &FloatingBarState) -> (f64, f64) {
        let width = if matches!(state.status, FloatingBarStatus::Paused) {
            PAUSED_CONTROLS_WIDTH + COMPACT_HORIZONTAL_PADDING * 2.0
        } else if state
            .elapsed_seconds
            .is_some_and(|seconds| seconds >= LONG_DURATION_SECONDS)
        {
            RECORDING_PILL_WIDTH + LONG_DURATION_EXTRA_WIDTH
        } else {
            RECORDING_PILL_WIDTH
        };
        (width, COMPACT_HEIGHT)
    }

    /// Taille par défaut, avant tout état : la pastille d'écoute.
    pub fn default_size() -> (f64, f64) {
        (RECORDING_PILL_WIDTH, COMPACT_HEIGHT)
    }

    pub fn dictation_container_size(is_expanded: bool) -> (f64, f64) {
        if is_expanded {
            (EXPANDED_WIDTH + INSET * 2.0, EXPANDED_HEIGHT + INSET * 2.0)
        } else {
            (
                compact_controls_width() + COMPACT_HORIZONTAL_PADDING * 2.0 + INSET * 2.0,
                COMPACT_HEIGHT + INSET * 2.0,
            )
        }
    }

    pub fn controls_center_y(height: f64, expands_upward: bool) -> f64 {
        if expands_upward {
            height - INSET - COMPACT_HEIGHT / 2.0
        } else {
            INSET + COMPACT_HEIGHT / 2.0
        }
    }

    /// Cadre du panneau de dictée qui garde ses commandes sous `anchor` quand il s'ouvre ou se
    /// referme.
    pub fn frame_at_controls(
        anchor: (f64, f64),
        size: (f64, f64),
        work: (f64, f64, f64, f64),
        expands_upward: bool,
    ) -> (f64, f64, f64, f64) {
        let width = size.0.min(work.2);
        let min_height = size.1.min(dictation_container_size(false).1).min(work.3);
        let (y, height) = if expands_upward {
            let bottom = (anchor.1 + INSET + COMPACT_HEIGHT / 2.0)
                .clamp(work.1 + min_height, work.1 + work.3);
            let height = size.1.min(bottom - work.1);
            (bottom - height, height)
        } else {
            let y = (anchor.1 - controls_center_y(size.1, false))
                .clamp(work.1, work.1 + work.3 - min_height);
            (y, size.1.min(work.1 + work.3 - y))
        };
        let x = (anchor.0 - width / 2.0).clamp(work.0, work.0 + work.2 - width);
        (x, y, width, height)
    }

    /// Cadre de la pastille de réunion quand sa largeur change (pause, durée au-delà d'une
    /// heure) : elle garde son centre et reste dans la zone de travail.
    pub fn frame_around_center(
        center: (f64, f64),
        size: (f64, f64),
        work: (f64, f64, f64, f64),
    ) -> (f64, f64, f64, f64) {
        let width = size.0.min(work.2);
        let height = size.1.min(work.3);
        let x = (center.0 - width / 2.0).clamp(work.0, work.0 + work.2 - width);
        let y = (center.1 - height / 2.0).clamp(work.1, work.1 + work.3 - height);
        (x, y, width, height)
    }

    /// Écran du panneau : le premier trouvé dans l'ordre de préférence, sinon le premier écran
    /// disponible.
    ///
    /// Sous Wayland (#319), un panneau encore jamais affiché n'a pas d'écran courant (sa fenêtre
    /// GTK n'est pas réalisée) et GDK ne désigne aucun écran principal. Sans ce repli, le premier
    /// affichage échouait sur « monitor not found » au démarrage de l'écoute et le panneau
    /// restait masqué jusqu'à la fermeture de l'app.
    pub fn pick_monitor<M>(preferred: Option<M>, available: impl FnOnce() -> Vec<M>) -> Option<M> {
        preferred.or_else(|| available().into_iter().next())
    }

    /// Taille verrouillée (min = max) du panneau sous Linux.
    ///
    /// Un compositeur en mosaïque (Hyprland, sway…) décide au premier affichage si une fenêtre
    /// flotte : seule une fenêtre de taille fixe, min = max et non nulle, y échappe. Or tao
    /// n'applique `resizable(false)` qu'au premier `configure`, après cette décision : le panneau
    /// était mis en mosaïque et couvrait tout l'écran (issue 416). Des contraintes posées avant
    /// l'affichage, puis suivies à chaque redimensionnement, l'annoncent fixe dès le départ.
    #[cfg(any(test, target_os = "linux"))]
    pub fn fixed_size_constraints(width: f64, height: f64) -> tauri::WindowSizeConstraints {
        use tauri::{LogicalUnit, PixelUnit};

        let width = Some(PixelUnit::Logical(LogicalUnit::new(width)));
        let height = Some(PixelUnit::Logical(LogicalUnit::new(height)));
        tauri::WindowSizeConstraints {
            min_width: width,
            min_height: height,
            max_width: width,
            max_height: height,
        }
    }

    pub fn bottom_center_origin(
        work_x: f64,
        work_y: f64,
        work_width: f64,
        work_height: f64,
        window_width: f64,
        window_height: f64,
    ) -> (f64, f64) {
        (
            work_x + (work_width - window_width) / 2.0,
            work_y + work_height - window_height - SCREEN_MARGIN,
        )
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::CStr;
    use std::os::raw::c_char;
    use std::sync::OnceLock;

    use swift_rs::{Bool, SRString, swift};
    use tauri_specta::Event;

    use super::FloatingBarState;
    use crate::Error;

    swift!(fn _floating_bar_show() -> Bool);
    swift!(fn _floating_bar_hide() -> Bool);
    swift!(fn _floating_bar_update(json: &SRString) -> Bool);
    swift!(fn _floating_bar_update_amplitude(amplitude: f64) -> Bool);

    static APP_HANDLE: OnceLock<tauri::AppHandle<tauri::Wry>> = OnceLock::new();

    pub fn set_app_handle(app: tauri::AppHandle<tauri::Wry>) {
        let _ = APP_HANDLE.set(app);
    }

    pub fn show() -> Result<(), Error> {
        unsafe {
            _floating_bar_show();
        }
        Ok(())
    }

    pub fn hide() -> Result<(), Error> {
        unsafe {
            _floating_bar_hide();
        }
        Ok(())
    }

    pub fn update(state: FloatingBarState) -> Result<(), Error> {
        let json = serde_json::to_string(&state).map_err(|error| {
            Error::PanelError(format!("failed to serialize floating bar state: {error}"))
        })?;
        let ok = swift_rs::autoreleasepool!({
            let json = SRString::from(json.as_str());
            unsafe { _floating_bar_update(&json) }
        });
        if ok {
            Ok(())
        } else {
            Err(Error::PanelError(
                "failed to update native floating bar".to_string(),
            ))
        }
    }

    pub fn update_amplitude(amplitude: f64) -> Result<(), Error> {
        let ok = unsafe { _floating_bar_update_amplitude(amplitude) };
        if ok {
            Ok(())
        } else {
            Err(Error::PanelError(
                "failed to update native floating bar amplitude".to_string(),
            ))
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_stop() {
        if let Some(app) = APP_HANDLE.get() {
            let _ = crate::events::FloatingBarStop {}.emit(app);
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_open_main() {
        if let Some(app) = APP_HANDLE.get() {
            let _ = crate::events::FloatingBarOpenMain {}.emit(app);
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_dictation_action(payload: *const c_char) {
        if payload.is_null() {
            return;
        }
        let Ok(json) = (unsafe { CStr::from_ptr(payload) }).to_str() else {
            return;
        };
        if let (Some(app), Ok(event)) = (
            APP_HANDLE.get(),
            serde_json::from_str::<crate::events::FloatingBarDictationAction>(json),
        ) {
            let _ = event.emit(app);
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_settings_change(settings_ptr: *const c_char) {
        if settings_ptr.is_null() {
            return;
        }

        let Ok(settings_json) = (unsafe { CStr::from_ptr(settings_ptr) }).to_str() else {
            return;
        };

        let Ok(settings) =
            serde_json::from_str::<crate::events::FloatingBarSettingsChange>(settings_json)
        else {
            return;
        };

        if let Some(app) = APP_HANDLE.get() {
            let _ = settings.emit(app);
        }
    }

    pub fn current_state() -> Option<FloatingBarState> {
        None
    }
}

// Type-check the webview implementation in macOS tests as well.
#[cfg(any(test, not(target_os = "macos")))]
#[cfg_attr(target_os = "macos", allow(dead_code))]
mod cross_platform {
    use std::sync::{Mutex, OnceLock};

    use tauri::{
        LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl, WebviewWindow,
        WebviewWindowBuilder, window::Color,
    };
    use tauri_specta::Event;

    use super::layout::{
        bottom_center_origin, controls_center_y, default_size, dictation_container_size,
        frame_around_center, frame_at_controls, is_expanded, meeting_pill_size, pick_monitor,
    };
    use super::{FloatingBarOverlayLayout, FloatingBarState, WINDOW_LABEL};
    use crate::Error;
    use crate::ext::run_on_main_thread;

    static APP_HANDLE: OnceLock<tauri::AppHandle<tauri::Wry>> = OnceLock::new();
    static LAST_STATE: Mutex<Option<FloatingBarState>> = Mutex::new(None);

    pub fn set_app_handle(app: tauri::AppHandle<tauri::Wry>) {
        let _ = APP_HANDLE.set(app);
    }

    pub fn current_state() -> Option<FloatingBarState> {
        LAST_STATE.lock().ok().and_then(|guard| guard.clone())
    }

    fn app() -> Result<&'static tauri::AppHandle<tauri::Wry>, Error> {
        APP_HANDLE
            .get()
            .ok_or_else(|| Error::PanelError("floating bar app handle is not ready".to_string()))
    }

    pub fn show() -> Result<(), Error> {
        let app = app()?;
        run_on_main_thread(app, move || {
            let window = ensure_window(app)?;
            let mut state = current_state();
            let layout = apply_layout(&window, state.as_ref(), true)?;
            if let Some(state) = state.as_mut() {
                state.layout = Some(layout);
            }
            if let Some(state) = state {
                publish_state(state)?;
            }
            window.show()?;
            crate::window::exclude_from_capture(&window);
            Ok(())
        })?
    }

    pub fn hide() -> Result<(), Error> {
        if let Ok(app) = app() {
            run_on_main_thread(app, move || -> Result<(), Error> {
                if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                    window.hide()?;
                }
                Ok(())
            })??;
        }
        if let Ok(mut state) = LAST_STATE.lock() {
            *state = None;
        }
        Ok(())
    }

    pub fn update(mut state: FloatingBarState) -> Result<(), Error> {
        let app = app()?;
        // Publish inside the marshal so update/show publishes stay serialized in
        // main-thread task order; publish_state itself is cheap (a lock and an emit).
        run_on_main_thread(app, move || {
            if state.transcript_bubbles.is_none() {
                state.transcript_bubbles = current_state().and_then(|last| last.transcript_bubbles);
            }
            if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                state.layout = Some(apply_layout(&window, Some(&state), false)?);
            }
            publish_state(state)
        })?
    }

    fn publish_state(state: FloatingBarState) -> Result<(), Error> {
        if let Ok(mut last) = LAST_STATE.lock() {
            *last = Some(state.clone());
        }
        let _ = crate::events::FloatingBarOverlayState { state }.emit(app()?);
        Ok(())
    }

    pub fn update_amplitude(amplitude: f64) -> Result<(), Error> {
        let amplitude = amplitude.clamp(0.0, 1.0);
        if let Ok(mut last) = LAST_STATE.lock()
            && let Some(state) = last.as_mut()
        {
            state.amplitude = amplitude;
        }
        if let Ok(app) = app() {
            let _ = crate::events::FloatingBarOverlayAmplitude { amplitude }.emit(app);
        }
        Ok(())
    }

    fn ensure_window(
        app: &tauri::AppHandle<tauri::Wry>,
    ) -> Result<WebviewWindow<tauri::Wry>, Error> {
        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
            return Ok(window);
        }

        let (width, height) = default_size();
        let builder = WebviewWindowBuilder::new(
            app,
            WINDOW_LABEL,
            WebviewUrl::App("app/floating-bar".into()),
        )
        .title(syntheo_brand::PRODUCT_NAME)
        .inner_size(width, height)
        .visible(false)
        .focused(false)
        .decorations(false);
        // Taille fixe annoncée avant le premier affichage, pour que Hyprland la fasse flotter.
        #[cfg(target_os = "linux")]
        let builder =
            builder.inner_size_constraints(super::layout::fixed_size_constraints(width, height));
        #[cfg(any(not(target_os = "macos"), feature = "macos-private-api"))]
        let builder = builder.transparent(true);
        let window = builder
            .shadow(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .content_protected(true)
            .background_color(Color(0, 0, 0, 0))
            .disable_drag_drop_handler()
            .build()?;

        // Wayland (issue 448) : calque ancré en bas au centre quand le compositeur le gère, avant
        // le premier affichage ; sinon, fenêtre ordinaire placée par `apply_layout`.
        #[cfg(target_os = "linux")]
        crate::window::layer_shell::try_init(&window, super::layout::SCREEN_MARGIN as i32);

        crate::window::exclude_from_capture(&window);

        Ok(window)
    }

    /// La pastille est un calque Wayland : le compositeur tient sa position.
    fn is_layer_surface() -> bool {
        #[cfg(target_os = "linux")]
        {
            crate::window::layer_shell::is_active()
        }
        #[cfg(not(target_os = "linux"))]
        {
            false
        }
    }

    fn differs(current: LogicalSize<f64>, size: (f64, f64)) -> bool {
        (current.width - size.0).abs() >= 0.5 || (current.height - size.1).abs() >= 0.5
    }

    fn apply_layout(
        window: &WebviewWindow<tauri::Wry>,
        state: Option<&FloatingBarState>,
        force_default_position: bool,
    ) -> Result<FloatingBarOverlayLayout, Error> {
        let is_expanded = state.is_some_and(is_expanded);
        let dictation = state.is_some_and(|state| state.dictation.is_some());
        window.set_focusable(!dictation)?;
        let size = match state {
            _ if dictation => dictation_container_size(is_expanded),
            Some(state) => meeting_pill_size(state),
            None => default_size(),
        };
        let scale = window.scale_factor()?;
        let current_size = window.outer_size()?.to_logical::<f64>(scale);
        if is_layer_surface() {
            // Calque : ancré en bas au centre par le compositeur, seule la taille change.
            if differs(current_size, size) {
                set_fixed_size(window, LogicalSize::new(size.0, size.1))?;
            }
            return Ok(FloatingBarOverlayLayout {
                controls_center_x: size.0 / 2.0,
                expands_upward: true,
                movable: false,
            });
        }
        let current_position = window.outer_position()?.to_logical::<f64>(scale);
        let previous = current_state();
        let old_layout =
            previous
                .as_ref()
                .and_then(|state| state.layout)
                .unwrap_or(FloatingBarOverlayLayout {
                    controls_center_x: current_size.width / 2.0,
                    expands_upward: true,
                    movable: true,
                });
        if force_default_position {
            let origin = default_origin(window, size.0, size.1)?;
            set_fixed_size(window, LogicalSize::new(size.0, size.1))?;
            // Sans écran connu, le compositeur place la fenêtre lui-même.
            if let Some((x, y)) = origin {
                window.set_position(Position::Logical(LogicalPosition::new(x, y)))?;
            }
            return Ok(FloatingBarOverlayLayout {
                controls_center_x: size.0 / 2.0,
                expands_upward: true,
                movable: true,
            });
        }
        let preferred = window
            .current_monitor()?
            .or(window.app_handle().primary_monitor()?);
        let Some(monitor) = pick_monitor(preferred, || {
            window.available_monitors().unwrap_or_default()
        }) else {
            // Aucun écran pour cadrer : la taille suit l'état, la position reste au compositeur.
            if differs(current_size, size) {
                set_fixed_size(window, LogicalSize::new(size.0, size.1))?;
            }
            return Ok(FloatingBarOverlayLayout {
                controls_center_x: size.0 / 2.0,
                movable: true,
                ..old_layout
            });
        };
        let work = monitor.work_area();
        let origin = work.position.to_logical::<f64>(monitor.scale_factor());
        let work_size = work.size.to_logical::<f64>(monitor.scale_factor());
        let work = (origin.x, origin.y, work_size.width, work_size.height);
        let ((x, y, width, height), controls_center_x, expands_upward) = if dictation {
            let anchor = (
                current_position.x + old_layout.controls_center_x,
                current_position.y
                    + controls_center_y(current_size.height, old_layout.expands_upward),
            );
            let grows = is_expanded && !previous.as_ref().is_some_and(super::layout::is_expanded);
            let upwards = if grows {
                anchor.1 - origin.y > origin.y + work_size.height - anchor.1
            } else {
                old_layout.expands_upward
            };
            let frame = frame_at_controls(anchor, size, work, upwards);
            (frame, anchor.0 - frame.0, upwards)
        } else {
            // Pastille de réunion (issue 448) : elle change de largeur autour de son centre.
            let center = (
                current_position.x + current_size.width / 2.0,
                current_position.y + current_size.height / 2.0,
            );
            let frame = frame_around_center(center, size, work);
            (frame, frame.2 / 2.0, true)
        };
        if differs(current_size, (width, height)) {
            set_fixed_size(window, LogicalSize::new(width, height))?;
        }
        if (current_position.x - x).abs() >= 0.5 || (current_position.y - y).abs() >= 0.5 {
            window.set_position(Position::Logical(LogicalPosition::new(x, y)))?;
        }
        Ok(FloatingBarOverlayLayout {
            controls_center_x,
            expands_upward,
            movable: true,
        })
    }

    /// Redimensionne le panneau. Sous Linux, les contraintes min = max suivent la nouvelle taille
    /// avant le redimensionnement, sans quoi GTK le bornerait à l'ancienne.
    fn set_fixed_size(
        window: &WebviewWindow<tauri::Wry>,
        size: LogicalSize<f64>,
    ) -> Result<(), Error> {
        #[cfg(target_os = "linux")]
        window.set_size_constraints(super::layout::fixed_size_constraints(
            size.width,
            size.height,
        ))?;
        window.set_size(Size::Logical(size))?;
        Ok(())
    }

    /// Position par défaut du panneau, en bas au centre de son écran ; `None` si aucun écran
    /// n'est connu.
    fn default_origin(
        window: &WebviewWindow<tauri::Wry>,
        width: f64,
        height: f64,
    ) -> Result<Option<(f64, f64)>, Error> {
        let pointer_monitor = current_state()
            .is_some_and(|state| state.dictation.is_some())
            .then(|| {
                window
                    .app_handle()
                    .cursor_position()
                    .ok()
                    .and_then(|cursor| {
                        window
                            .app_handle()
                            .monitor_from_point(cursor.x, cursor.y)
                            .ok()
                            .flatten()
                    })
            })
            .flatten();
        let preferred = pointer_monitor
            .or_else(|| window.current_monitor().ok().flatten())
            .or_else(|| window.app_handle().primary_monitor().ok().flatten());
        let Some(monitor) = pick_monitor(preferred, || {
            window.available_monitors().unwrap_or_default()
        }) else {
            return Ok(None);
        };
        let scale = monitor.scale_factor();
        let work_area = monitor.work_area();
        let origin = work_area.position.to_logical::<f64>(scale);
        let size = work_area.size.to_logical::<f64>(scale);
        Ok(Some(bottom_center_origin(
            origin.x,
            origin.y,
            size.width,
            size.height,
            width,
            height,
        )))
    }
}

#[cfg(not(target_os = "macos"))]
use cross_platform as platform;

pub fn set_app_handle(app: tauri::AppHandle<tauri::Wry>) {
    platform::set_app_handle(app);
}

pub fn current_state() -> Option<FloatingBarState> {
    platform::current_state()
}

pub fn show() -> Result<(), Error> {
    platform::show()
}

static SESSION_ID: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

pub fn session_id() -> Option<String> {
    SESSION_ID.lock().ok().and_then(|guard| guard.clone())
}

pub fn hide() -> Result<(), Error> {
    let hidden_session_id = session_id();
    platform::hide()?;
    if let Ok(mut session_id) = SESSION_ID.lock()
        && *session_id == hidden_session_id
    {
        *session_id = None;
    }
    Ok(())
}

pub fn update(state: FloatingBarState) -> Result<(), Error> {
    let next_session_id = state.session_id.clone();
    platform::update(state)?;
    if let Ok(mut session_id) = SESSION_ID.lock() {
        *session_id = next_session_id;
    }
    Ok(())
}

pub fn update_amplitude(amplitude: f64) -> Result<(), Error> {
    platform::update_amplitude(amplitude)
}

#[cfg(test)]
mod tests {
    use super::layout;

    // Panneau de dictée : ouvert (368 × 438) et replié (108 × 46).
    const DICTATION_EXPANDED: (f64, f64) = (368.0, 438.0);
    const DICTATION_COMPACT: (f64, f64) = (108.0, 46.0);

    #[test]
    fn dictation_sizes_have_no_hover_handle_reserve() {
        assert_eq!(layout::dictation_container_size(true), DICTATION_EXPANDED);
        assert_eq!(layout::dictation_container_size(false), DICTATION_COMPACT);
    }

    #[test]
    fn controls_dragged_near_vertical_edges_keep_the_panel_visible() {
        for anchor_y in [-100.0, 10.0, 1070.0, 1200.0] {
            for upwards in [false, true] {
                let (x, y, width, height) = layout::frame_at_controls(
                    (960.0, anchor_y),
                    DICTATION_EXPANDED,
                    (0.0, 0.0, 1920.0, 1080.0),
                    upwards,
                );
                assert!(x >= 0.0 && y >= 0.0);
                assert!(height >= layout::dictation_container_size(false).1);
                assert!(x + width <= 1920.0 && y + height <= 1080.0);
            }
        }
    }

    #[test]
    fn controls_keep_their_screen_position_through_expansion_and_collapse() {
        let work = (-1920.0, 40.0, 1920.0, 1040.0);
        for (anchor, upwards) in [
            ((-960.0, 1049.0), true),
            ((-960.0, 92.0), false),
            ((-64.0, 1049.0), true),
        ] {
            for size in [DICTATION_COMPACT, DICTATION_EXPANDED, DICTATION_COMPACT] {
                let frame = layout::frame_at_controls(anchor, size, work, upwards);
                assert_eq!(
                    frame.1 + layout::controls_center_y(frame.3, upwards),
                    anchor.1
                );
                assert!(frame.0 <= anchor.0 && frame.0 + frame.2 >= anchor.0);
                assert!(frame.0 >= work.0 && frame.0 + frame.2 <= work.0 + work.2);
                assert!(frame.1 >= work.1 && frame.1 + frame.3 <= work.1 + work.3);
            }
        }
    }

    #[test]
    fn short_displays_reduce_the_panel_instead_of_moving_the_controls() {
        let frame = layout::frame_at_controls(
            (150.0, 180.0),
            DICTATION_EXPANDED,
            (0.0, 0.0, 300.0, 320.0),
            true,
        );
        assert_eq!(frame, (0.0, 0.0, 300.0, 203.0));
        assert_eq!(frame.1 + layout::controls_center_y(frame.3, true), 180.0);
    }

    #[test]
    fn collapse_after_drag_uses_the_new_control_position() {
        let work = (0.0, 0.0, 1920.0, 1080.0);
        let expanded = layout::frame_at_controls((1856.0, 1049.0), DICTATION_EXPANDED, work, true);
        let controls_x = 1856.0 - expanded.0;
        let moved_anchor = (expanded.0 - 100.0 + controls_x, 1049.0);
        let collapsed = layout::frame_at_controls(moved_anchor, DICTATION_COMPACT, work, true);
        assert_eq!(collapsed.0 + collapsed.2 / 2.0, 1756.0);
    }

    // Issue 448 : la pastille s'ouvre en bas au centre de la zone de travail, à SCREEN_MARGIN
    // du bord, y compris sur un écran décalé.
    #[test]
    fn default_origin_is_bottom_center_on_offset_displays() {
        let (width, height) = layout::default_size();
        assert_eq!(
            layout::bottom_center_origin(-1920.0, 40.0, 1920.0, 1040.0, width, height),
            (
                -1920.0 + (1920.0 - layout::RECORDING_PILL_WIDTH) / 2.0,
                1034.0
            )
        );
        assert_eq!(1034.0 + height + layout::SCREEN_MARGIN, 40.0 + 1040.0);
    }

    // #319 : sous Wayland, ni écran courant (fenêtre jamais affichée) ni écran principal. Le
    // premier écran disponible doit servir, au lieu d'un échec « monitor not found ».
    #[test]
    fn panel_without_current_or_primary_monitor_uses_the_first_available_one() {
        assert_eq!(
            layout::pick_monitor(None, || vec!["HDMI-A-1", "eDP-1"]),
            Some("HDMI-A-1")
        );
    }

    #[test]
    fn preferred_monitor_wins_without_listing_the_others() {
        assert_eq!(
            layout::pick_monitor(Some("eDP-1"), || -> Vec<&str> {
                panic!("available monitors must not be listed")
            }),
            Some("eDP-1")
        );
    }

    fn meeting_state(
        status: super::FloatingBarStatus,
        elapsed: Option<u32>,
    ) -> super::FloatingBarState {
        super::FloatingBarState {
            dictation: None,
            amplitude: 0.0,
            title: String::new(),
            status,
            color_scheme: super::FloatingBarColorScheme::Dark,
            opacity: 1.0,
            live_caption_opacity: 1.0,
            live_caption_width: 360.0,
            live_caption_line_count: 3,
            live_caption_position: crate::window::live_caption::LiveCaptionPosition::BottomCenter,
            live_caption_minimized: false,
            live_caption_toggle_visible: true,
            transcript_bubbles: None,
            transcript_notice: None,
            layout: None,
            session_id: None,
            elapsed_seconds: elapsed,
            mic_muted: None,
        }
    }

    // Issue 448 : la fenêtre a exactement la taille de la pastille (38 px de haut, sans zone
    // réservée ni marge), et la transcription en direct ne l'agrandit plus en réunion.
    #[test]
    fn meeting_window_is_exactly_the_pill() {
        use super::FloatingBarStatus::{Error, Paused, Reconnecting, Recording};
        for status in [Recording, Reconnecting, Error] {
            let state = meeting_state(status, Some(767));
            assert!(!layout::is_expanded(&state));
            assert_eq!(
                layout::meeting_pill_size(&state),
                (layout::RECORDING_PILL_WIDTH, layout::COMPACT_HEIGHT)
            );
        }
        assert_eq!(layout::COMPACT_HEIGHT, 38.0);
        // Issue 353 : en pause, « En pause », « Reprendre » et « Terminer ».
        assert_eq!(
            layout::meeting_pill_size(&meeting_state(Paused, Some(767))),
            (
                layout::PAUSED_CONTROLS_WIDTH + layout::COMPACT_HORIZONTAL_PADDING * 2.0,
                layout::COMPACT_HEIGHT
            )
        );
    }

    #[test]
    fn pill_widens_once_the_duration_reaches_one_hour() {
        use super::FloatingBarStatus::Recording;
        let short = layout::meeting_pill_size(&meeting_state(Recording, Some(3599))).0;
        let long = layout::meeting_pill_size(&meeting_state(Recording, Some(3600))).0;
        assert_eq!(short, layout::RECORDING_PILL_WIDTH);
        assert_eq!(long, short + layout::LONG_DURATION_EXTRA_WIDTH);
        assert_eq!(
            layout::meeting_pill_size(&meeting_state(Recording, None)).0,
            short
        );
    }

    #[test]
    fn pill_resizes_around_its_center_and_stays_on_screen() {
        let work = (0.0, 0.0, 1920.0, 1080.0);
        assert_eq!(
            layout::frame_around_center((960.0, 1015.0), (240.0, 38.0), work),
            (840.0, 996.0, 240.0, 38.0)
        );
        assert_eq!(
            layout::frame_around_center((10.0, 1079.0), (276.0, 38.0), work),
            (0.0, 1042.0, 276.0, 38.0)
        );
    }

    #[test]
    fn no_known_monitor_is_not_an_error() {
        assert_eq!(layout::pick_monitor::<&str>(None, Vec::new), None);
    }

    // Issue 416 : Hyprland (et sway) ne laissent flotter qu'une fenêtre de taille fixe, min = max
    // et non nulle, dès son affichage. Chaque taille du panneau doit donc être verrouillée.
    #[test]
    fn every_panel_size_is_locked_so_tiling_compositors_float_it() {
        use super::FloatingBarStatus::{Paused, Recording};
        use tauri::{LogicalUnit, PixelUnit};

        let sizes = [
            layout::default_size(),
            layout::dictation_container_size(true),
            layout::dictation_container_size(false),
            layout::meeting_pill_size(&meeting_state(Recording, Some(4000))),
            layout::meeting_pill_size(&meeting_state(Paused, None)),
        ];
        for (width, height) in sizes {
            let constraints = layout::fixed_size_constraints(width, height);
            let logical = |value: f64| Some(PixelUnit::Logical(LogicalUnit::new(value)));
            assert!(width > 0.0 && height > 0.0);
            assert_eq!(constraints.min_width, logical(width));
            assert_eq!(constraints.max_width, logical(width));
            assert_eq!(constraints.min_height, logical(height));
            assert_eq!(constraints.max_height, logical(height));
        }
    }
}
