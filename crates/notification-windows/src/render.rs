//! Rendu Win32 de l'overlay : alpha par pixel via `UpdateLayeredWindow`.
//!
//! 1. [`paint_surface`] peint l'ombre, la carte arrondie bordée et les boutons
//!    dans un tampon BGRA prémultiplié (anticrénelé, sans GDI).
//! 2. Le tampon est copié dans une section DIB 32 bits où GDI dessine le texte
//!    (ClearType sur fond opaque) et l'icône.
//! 3. [`finalize`] rétablit le canal alpha effacé par GDI, puis
//!    `UpdateLayeredWindow(ULW_ALPHA)` compose la fenêtre avec le bureau.
//!
//! Ce mode remplace `SetLayeredWindowAttributes(LWA_ALPHA)` : avec un alpha
//! global, DWM n'arrondissait pas les coins (`DWMWCP_ROUND` sans effet).

use std::cell::Cell;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{COLORREF, ERROR_SUCCESS, HWND, POINT, RECT, SIZE};
use windows::Win32::Graphics::Gdi::{
    AC_SRC_ALPHA, AC_SRC_OVER, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BLENDFUNCTION,
    CLEARTYPE_QUALITY, CLIP_DEFAULT_PRECIS, CreateCompatibleDC, CreateDIBSection, CreateFontW,
    DEFAULT_CHARSET, DEFAULT_PITCH, DIB_RGB_COLORS, DRAW_TEXT_FORMAT, DT_CENTER, DT_END_ELLIPSIS,
    DT_LEFT, DT_RIGHT, DT_SINGLELINE, DT_TOP, DT_VCENTER, DT_WORDBREAK, DeleteDC, DeleteObject,
    DrawTextW, FONT_WEIGHT, FW_MEDIUM, FW_NORMAL, FW_SEMIBOLD, GdiFlush, GetDC, GetTextFaceW, HDC,
    HFONT, OUT_DEFAULT_PRECIS, ReleaseDC, SelectObject, SetBkMode, SetTextColor, TRANSPARENT,
};
use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
use windows::Win32::UI::WindowsAndMessaging::{
    DI_NORMAL, DrawIconEx, HICON, ULW_ALPHA, UpdateLayeredWindow,
};
use windows::core::{PCWSTR, w};

use crate::layout::{
    BODY_FONT_SIZE, BUTTON_FONT_SIZE, EXPANDED_TITLE_FONT_SIZE, FOOTER_FONT_SIZE,
    NotificationLayout, Rect, TITLE_FONT_SIZE,
};
use crate::raster::finalize;
use crate::surface::{SurfaceState, paint_surface};
use crate::theme::{ActionStyle, Palette, Rgb};

/// Contenu d'une image de l'overlay.
pub(crate) struct Frame<'a> {
    pub layout: &'a NotificationLayout,
    pub icon: Option<HICON>,
    pub title: &'a str,
    pub body: String,
    pub expanded: bool,
    pub action: Option<(&'a str, ActionStyle)>,
    pub action_menu: bool,
    pub collapse_label: Option<&'a str>,
    pub footer: Option<(&'a str, &'a str)>,
    pub hovered: bool,
    pub progress: Option<f64>,
    pub dark: bool,
}

/// Ce qui change d'une image à l'autre : on ne redessine que si la clé change.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FrameKey {
    size: (i32, i32),
    dpi: u32,
    dark: bool,
    hovered: bool,
    expanded: bool,
    body: String,
    progress_px: Option<i32>,
}

impl Frame<'_> {
    pub fn key(&self) -> FrameKey {
        FrameKey {
            size: self.layout.window_size(),
            dpi: self.layout.dpi,
            dark: self.dark,
            hovered: self.hovered,
            expanded: self.expanded,
            body: self.body.clone(),
            progress_px: self
                .progress
                .zip(self.layout.progress)
                .map(|(ratio, rect)| ((rect.width as f64) * ratio.clamp(0.0, 1.0)).round() as i32),
        }
    }
}

pub(crate) fn render(hwnd: HWND, frame: &Frame) {
    let palette = Palette::for_dark_mode(frame.dark);
    let shapes = paint_surface(
        frame.layout,
        &palette,
        &SurfaceState {
            action: frame.action.map(|(_, style)| style),
            action_menu: frame.action_menu,
            collapse: frame.collapse_label.is_some(),
            footer: frame.footer.is_some(),
            hovered: frame.hovered,
            progress: frame.progress,
        },
    );
    if shapes.width <= 0 || shapes.height <= 0 {
        return;
    }
    unsafe {
        let screen = GetDC(None);
        let dc = CreateCompatibleDC(Some(screen));
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: shapes.width,
                // Hauteur négative : DIB descendant, ligne 0 en haut comme le Canvas.
                biHeight: -shapes.height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits = std::ptr::null_mut();
        if let Ok(bitmap) = CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0)
            && !bits.is_null()
        {
            let previous = SelectObject(dc, bitmap.into());
            let pixels = std::slice::from_raw_parts_mut(bits.cast::<u32>(), shapes.pixels.len());
            pixels.copy_from_slice(&shapes.pixels);
            draw_content(dc, frame, &palette);
            let _ = GdiFlush();
            finalize(&shapes.pixels, pixels);
            let size = SIZE {
                cx: shapes.width,
                cy: shapes.height,
            };
            let source = POINT::default();
            let blend = BLENDFUNCTION {
                BlendOp: AC_SRC_OVER as u8,
                BlendFlags: 0,
                SourceConstantAlpha: 255,
                AlphaFormat: AC_SRC_ALPHA as u8,
            };
            let _ = UpdateLayeredWindow(
                hwnd,
                Some(screen),
                None,
                Some(&size),
                Some(dc),
                Some(&source),
                COLORREF(0),
                Some(&blend),
                ULW_ALPHA,
            );
            let _ = SelectObject(dc, previous);
            let _ = DeleteObject(bitmap.into());
        }
        let _ = DeleteDC(dc);
        let _ = ReleaseDC(None, screen);
    }
}

fn draw_content(dc: HDC, frame: &Frame, palette: &Palette) {
    let layout = frame.layout;
    let (dx, dy) = layout.card_origin();
    let place = |rect: Rect| rect.offset(dx, dy);
    let dpi = layout.dpi;
    let fonts = Fonts {
        title: create_font(
            if frame.expanded {
                EXPANDED_TITLE_FONT_SIZE
            } else {
                TITLE_FONT_SIZE
            },
            FW_SEMIBOLD,
            dpi,
        ),
        body: create_font(BODY_FONT_SIZE, FW_NORMAL, dpi),
        button: create_font(BUTTON_FONT_SIZE, button_weight(), dpi),
        footer: create_font(FOOTER_FONT_SIZE, FW_NORMAL, dpi),
    };
    unsafe {
        SetBkMode(dc, TRANSPARENT);
        if let (Some(icon), Some(rect)) = (frame.icon, layout.icon) {
            let rect = place(rect);
            let _ = DrawIconEx(
                dc,
                rect.x,
                rect.y,
                icon,
                rect.width,
                rect.height,
                0,
                None,
                DI_NORMAL,
            );
        }
        let previous = SelectObject(dc, fonts.title.into());
        text(
            dc,
            place(layout.title),
            frame.title,
            palette.ink,
            DT_LEFT | DT_SINGLELINE | DT_END_ELLIPSIS | DT_VCENTER,
        );

        let _ = SelectObject(dc, fonts.body.into());
        if frame.expanded {
            text(
                dc,
                place(layout.message),
                &frame.body,
                palette.ink,
                DT_LEFT | DT_TOP | DT_WORDBREAK | DT_END_ELLIPSIS,
            );
        } else {
            text(
                dc,
                place(layout.message),
                &frame.body,
                palette.muted_ink,
                DT_LEFT | DT_SINGLELINE | DT_END_ELLIPSIS | DT_VCENTER,
            );
        }

        let _ = SelectObject(dc, fonts.button.into());
        if let (Some((label, style)), Some(action)) = (frame.action, layout.action) {
            let caret = (frame.action_menu && !frame.expanded)
                .then(|| layout.action_caret())
                .flatten();
            let padding = layout.scale(10);
            let label_rect = Rect {
                x: action.x + padding,
                width: caret
                    .map(|caret| caret.x)
                    .unwrap_or(action.right() - padding)
                    - action.x
                    - padding,
                ..action
            };
            let ink = style.ink(palette);
            centered(dc, place(label_rect), label, ink);
            if let Some(caret) = caret {
                centered(dc, place(caret), "▾", ink);
            }
        }
        if let (Some(label), Some(collapse)) = (frame.collapse_label, layout.collapse) {
            centered(dc, place(collapse), label, palette.ink);
        }

        if let (Some((footer_text, footer_label)), Some(link), Some(text_rect)) =
            (frame.footer, layout.footer_action, layout.footer_text)
        {
            let _ = SelectObject(dc, fonts.footer.into());
            text(
                dc,
                place(text_rect),
                footer_text,
                palette.muted_ink,
                DT_LEFT | DT_SINGLELINE | DT_END_ELLIPSIS | DT_VCENTER,
            );
            let _ = SelectObject(dc, fonts.button.into());
            text(
                dc,
                place(link),
                footer_label,
                palette.primary,
                DT_RIGHT | DT_SINGLELINE | DT_END_ELLIPSIS | DT_VCENTER,
            );
        }

        if frame.hovered {
            let _ = SelectObject(dc, fonts.body.into());
            centered(dc, place(layout.close), "×", palette.muted_ink);
        }
        let _ = SelectObject(dc, previous);
    }
}

fn centered(dc: HDC, rect: Rect, label: &str, color: Rgb) {
    text(
        dc,
        rect,
        label,
        color,
        DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS,
    );
}

fn text(dc: HDC, rect: Rect, label: &str, color: Rgb, format: DRAW_TEXT_FORMAT) {
    let mut wide: Vec<u16> = label.encode_utf16().collect();
    if wide.is_empty() || rect.width <= 0 || rect.height <= 0 {
        return;
    }
    let mut bounds = RECT {
        left: rect.x,
        top: rect.y,
        right: rect.right(),
        bottom: rect.bottom(),
    };
    unsafe {
        SetTextColor(dc, COLORREF(color.colorref()));
        let _ = DrawTextW(dc, &mut wide, &mut bounds, format);
    }
}

struct Fonts {
    title: HFONT,
    body: HFONT,
    button: HFONT,
    footer: HFONT,
}

impl Drop for Fonts {
    fn drop(&mut self) {
        for font in [self.title, self.body, self.button, self.footer] {
            unsafe {
                let _ = DeleteObject(font.into());
            }
        }
    }
}

const VARIABLE_FACE: &str = "Segoe UI Variable Text";

/// Segoe UI Variable (Windows 11) si elle est installée, sinon Segoe UI
/// (Windows 10). GDI substituerait sinon une police quelconque sans le dire.
fn has_variable_font() -> bool {
    static VARIABLE: OnceLock<bool> = OnceLock::new();
    *VARIABLE.get_or_init(variable_font_installed)
}

fn font_face() -> PCWSTR {
    if has_variable_font() {
        w!("Segoe UI Variable Text")
    } else {
        w!("Segoe UI")
    }
}

/// La variable gère la graisse 500 ; Segoe UI n'a pas de « Medium » et
/// retomberait sur le normal, d'où le semi-gras.
fn button_weight() -> FONT_WEIGHT {
    if has_variable_font() {
        FW_MEDIUM
    } else {
        FW_SEMIBOLD
    }
}

fn variable_font_installed() -> bool {
    unsafe {
        let dc = CreateCompatibleDC(None);
        let font = create_font_face(w!("Segoe UI Variable Text"), 12, FW_NORMAL, 96);
        let previous = SelectObject(dc, font.into());
        let mut name = [0u16; 64];
        let copied = GetTextFaceW(dc, Some(&mut name));
        let _ = SelectObject(dc, previous);
        let _ = DeleteObject(font.into());
        let _ = DeleteDC(dc);
        let end = name.iter().position(|&c| c == 0).unwrap_or(name.len());
        copied > 0 && String::from_utf16_lossy(&name[..end]).eq_ignore_ascii_case(VARIABLE_FACE)
    }
}

fn create_font(size: i32, weight: FONT_WEIGHT, dpi: u32) -> HFONT {
    create_font_face(font_face(), size, weight, dpi)
}

fn create_font_face(face: PCWSTR, size: i32, weight: FONT_WEIGHT, dpi: u32) -> HFONT {
    unsafe {
        CreateFontW(
            -((size * dpi as i32 + 48) / 96),
            0,
            0,
            0,
            weight.0 as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            CLEARTYPE_QUALITY,
            DEFAULT_PITCH.0 as u32,
            face,
        )
    }
}

/// Mode sombre de Windows (Paramètres › Personnalisation › Couleurs, « mode
/// des applications »). Le réglage de thème de Syntheo vaut « système » par
/// défaut ; un choix clair ou sombre forcé dans l'application n'est pas
/// transmis au natif. Relu au plus toutes les deux secondes.
pub(crate) fn system_prefers_dark() -> bool {
    const REFRESH: Duration = Duration::from_secs(2);
    thread_local! {
        static CACHE: Cell<Option<(Instant, bool)>> = const { Cell::new(None) };
    }
    CACHE.with(|cache| {
        let now = Instant::now();
        if let Some((read_at, dark)) = cache.get()
            && now.duration_since(read_at) < REFRESH
        {
            return dark;
        }
        let dark = read_apps_use_dark_theme();
        cache.set(Some((now, dark)));
        dark
    })
}

fn read_apps_use_dark_theme() -> bool {
    let mut value: u32 = 1;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("AppsUseLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some((&mut value as *mut u32).cast()),
            Some(&mut size),
        )
    };
    status == ERROR_SUCCESS && value == 0
}
