//! Formes de l'overlay (carte, ombre, boutons, barre de progression) peintes
//! dans un [`Canvas`] avant que GDI n'ajoute le texte et l'icône.

#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use crate::layout::{NotificationLayout, Rect};
use crate::raster::{Canvas, Shadow};
use crate::theme::{ActionStyle, Palette};

/// État visuel d'une notification, indépendant de Win32.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SurfaceState {
    pub action: Option<ActionStyle>,
    pub action_menu: bool,
    pub collapse: bool,
    pub footer: bool,
    pub hovered: bool,
    /// Part restante du délai de fermeture, entre 0 et 1.
    pub progress: Option<f64>,
}

/// Opacité du séparateur entre l'action et son menu « ▾ ».
const CARET_DIVIDER_OPACITY: f32 = 0.35;

pub fn paint_surface(
    layout: &NotificationLayout,
    palette: &Palette,
    state: &SurfaceState,
) -> Canvas {
    let (width, height) = layout.window_size();
    let mut canvas = Canvas::new(width, height);
    let card = layout.card_rect();
    let (dx, dy) = layout.card_origin();
    let radius = layout.corner_radius();
    let border = layout.border_width();
    let place = |rect: Rect| rect.offset(dx, dy);

    canvas.fill_shadow(
        card,
        radius,
        Shadow {
            offset_y: layout.shadow_offset_y(),
            blur: layout.shadow_blur(),
            opacity: palette.shadow_opacity,
        },
    );
    canvas.fill_bordered_rect(card, radius, palette.surface, palette.border, border);

    if state.footer && layout.footer_action.is_some() {
        let band_top = layout.scale(crate::layout::COMPACT_HEIGHT);
        canvas.fill_rounded_rect(
            place(Rect {
                x: layout.scale(crate::layout::COMPACT_PADDING),
                y: band_top,
                width: layout.width - 2 * layout.scale(crate::layout::COMPACT_PADDING),
                height: border,
            }),
            0.0,
            palette.border,
            1.0,
        );
    }

    if let (Some(style), Some(action)) = (state.action, layout.action) {
        let rect = place(action);
        let button_radius = layout.button_radius();
        match style.outline(palette) {
            Some(outline) => {
                canvas.fill_bordered_rect(rect, button_radius, style.fill(palette), outline, border)
            }
            None => canvas.fill_rounded_rect(rect, button_radius, style.fill(palette), 1.0),
        }
        if state.action_menu
            && !state.collapse
            && let Some(caret) = layout.action_caret()
        {
            let divider_height = (caret.height / 2).max(1);
            canvas.fill_rounded_rect(
                place(Rect {
                    x: caret.x,
                    y: caret.y + (caret.height - divider_height) / 2,
                    width: border,
                    height: divider_height,
                }),
                0.0,
                style.ink(palette),
                CARET_DIVIDER_OPACITY,
            );
        }
    }

    if state.collapse
        && let Some(collapse) = layout.collapse
    {
        canvas.fill_rounded_rect(
            place(collapse),
            layout.button_radius(),
            palette.secondary,
            1.0,
        );
    }

    if let (Some(ratio), Some(progress)) = (state.progress, layout.progress) {
        let track = place(progress);
        let track_radius = track.height as f32 / 2.0;
        canvas.fill_rounded_rect(track, track_radius, palette.secondary, 1.0);
        let filled = ((track.width as f64) * ratio.clamp(0.0, 1.0)).round() as i32;
        if filled > 0 {
            canvas.fill_rounded_rect(
                Rect {
                    width: filled,
                    ..track
                },
                track_radius,
                palette.primary,
                1.0,
            );
        }
    }

    if state.hovered {
        let close = place(layout.close);
        canvas.fill_bordered_rect(
            close,
            close.width.min(close.height) as f32 / 2.0,
            palette.surface,
            palette.control_border,
            border,
        );
    }

    canvas
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::raster::rounded_rect_coverage;
    use std::time::Duration;
    use syntheo_notification_interface::Notification;

    fn layout(dpi: u32) -> NotificationLayout {
        let notification = Notification::builder()
            .title("Réunion")
            .message("Bientôt")
            .timeout(Duration::from_secs(8))
            .build();
        NotificationLayout::compact(&notification).at_dpi(dpi)
    }

    fn state() -> SurfaceState {
        SurfaceState {
            action: Some(ActionStyle::Primary),
            action_menu: false,
            collapse: false,
            footer: false,
            hovered: false,
            progress: Some(0.5),
        }
    }

    fn argb(alpha: u8, color: crate::theme::Rgb) -> u32 {
        (u32::from(alpha) << 24)
            | (u32::from(color.0) << 16)
            | (u32::from(color.1) << 8)
            | u32::from(color.2)
    }

    #[test]
    fn card_is_opaque_inside_rounded_at_the_corners_and_bordered() {
        for (dpi, palette) in [(96, Palette::LIGHT), (144, Palette::DARK)] {
            let layout = layout(dpi);
            let canvas = paint_surface(&layout, &palette, &state());
            let card = layout.card_rect();
            assert_eq!(
                canvas.pixel(card.x + layout.scale(30), card.y + layout.scale(10)),
                argb(255, palette.surface)
            );
            assert_eq!(
                canvas.pixel(card.x + card.width / 2, card.y),
                argb(255, palette.border)
            );
            // Coin de la carte : hors de l'arrondi, seule l'ombre est visible.
            assert!(rounded_rect_coverage(card, layout.corner_radius(), card.x, card.y) == 0.0);
            assert!(canvas.alpha(card.x, card.y) < 255);
            assert_eq!(canvas.alpha(0, 0), 0);
        }
    }

    #[test]
    fn action_button_is_rounded_and_filled_with_its_style() {
        let layout = layout(96);
        let palette = Palette::LIGHT;
        let canvas = paint_surface(&layout, &palette, &state());
        let action = layout.action.unwrap().offset(10, 10);
        assert_eq!(
            canvas.pixel(action.x + action.width / 2, action.y + action.height / 2),
            argb(255, palette.primary)
        );
        // L'angle du bouton laisse voir le fond de la carte.
        assert_eq!(canvas.pixel(action.x, action.y), argb(255, palette.surface));

        let destructive = paint_surface(
            &layout,
            &palette,
            &SurfaceState {
                action: Some(ActionStyle::Destructive),
                ..state()
            },
        );
        assert_eq!(
            destructive.pixel(action.x + 20, action.y + action.height / 2),
            argb(255, palette.destructive)
        );
    }

    #[test]
    fn progress_fills_from_the_left_in_the_primary_colour() {
        let layout = layout(96);
        let palette = Palette::LIGHT;
        let canvas = paint_surface(&layout, &palette, &state());
        let progress = layout.progress.unwrap().offset(10, 10);
        let y = progress.y + 1;
        assert_eq!(
            canvas.pixel(progress.x + progress.width / 4, y),
            argb(255, palette.primary)
        );
        assert_eq!(
            canvas.pixel(progress.x + progress.width * 3 / 4, y),
            argb(255, palette.secondary)
        );
    }

    #[test]
    fn close_button_only_appears_on_hover() {
        let layout = layout(96);
        let palette = Palette::LIGHT;
        let close = layout.close.offset(10, 10);
        let edge = (close.x + close.width / 2, close.y);
        let idle = paint_surface(&layout, &palette, &state());
        let hovered = paint_surface(
            &layout,
            &palette,
            &SurfaceState {
                hovered: true,
                ..state()
            },
        );
        assert_eq!(idle.pixel(edge.0, edge.1), argb(255, palette.surface));
        assert_ne!(hovered.pixel(edge.0, edge.1), argb(255, palette.surface));
    }
}
