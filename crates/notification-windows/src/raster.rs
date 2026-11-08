//! Tramage logiciel des formes de l'overlay (coins arrondis, bordure, ombre).
//!
//! Une fenêtre layered à alpha global ne reçoit pas l'arrondi DWM de
//! Windows 11 : les coins arrondis, l'anticrénelage et l'ombre sont donc peints
//! ici, pixel par pixel, dans un tampon BGRA prémultiplié (le format attendu par
//! `UpdateLayeredWindow` avec `AC_SRC_ALPHA`). GDI ne dessine ensuite que le
//! texte et l'icône par-dessus, puis [`finalize`] rétablit le canal alpha que
//! GDI efface. Ce module ne dépend pas de Windows et se teste sous Linux.

#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use crate::layout::Rect;
use crate::theme::Rgb;

/// Ombre portée sous la carte, façon élévation légère.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Shadow {
    pub offset_y: f32,
    pub blur: f32,
    pub opacity: f32,
}

/// Tampon de pixels `0xAARRGGBB` prémultipliés, ligne 0 en haut.
#[derive(Debug, Clone)]
pub struct Canvas {
    pub width: i32,
    pub height: i32,
    pub pixels: Vec<u32>,
}

impl Canvas {
    pub fn new(width: i32, height: i32) -> Self {
        let width = width.max(0);
        let height = height.max(0);
        Self {
            width,
            height,
            pixels: vec![0; (width as usize) * (height as usize)],
        }
    }

    #[cfg(test)]
    pub fn pixel(&self, x: i32, y: i32) -> u32 {
        self.pixels[(y * self.width + x) as usize]
    }

    #[cfg(test)]
    pub fn alpha(&self, x: i32, y: i32) -> u8 {
        (self.pixel(x, y) >> 24) as u8
    }

    /// Remplit un rectangle arrondi anticrénelé (composition « source over »).
    pub fn fill_rounded_rect(&mut self, rect: Rect, radius: f32, color: Rgb, opacity: f32) {
        if rect.width <= 0 || rect.height <= 0 || opacity <= 0.0 {
            return;
        }
        let x0 = rect.x.max(0);
        let y0 = rect.y.max(0);
        let x1 = rect.right().min(self.width);
        let y1 = rect.bottom().min(self.height);
        for y in y0..y1 {
            for x in x0..x1 {
                let coverage = rounded_rect_coverage(rect, radius, x, y) * opacity;
                if coverage > 0.0 {
                    self.blend(x, y, color, coverage);
                }
            }
        }
    }

    /// Rectangle arrondi bordé : la bordure est le liseré entre la forme
    /// extérieure et la forme intérieure, comme une `border` CSS.
    pub fn fill_bordered_rect(
        &mut self,
        rect: Rect,
        radius: f32,
        fill: Rgb,
        border: Rgb,
        border_width: i32,
    ) {
        self.fill_rounded_rect(rect, radius, border, 1.0);
        let inner = inset(rect, border_width);
        let inner_radius = (radius - border_width as f32).max(0.0);
        self.fill_rounded_rect(inner, inner_radius, fill, 1.0);
    }

    /// Ombre douce d'un rectangle arrondi, décalée vers le bas. L'opacité
    /// décroît jusqu'à zéro à `blur` pixels du bord de la forme décalée.
    pub fn fill_shadow(&mut self, rect: Rect, radius: f32, shadow: Shadow) {
        if shadow.blur <= 0.0 || shadow.opacity <= 0.0 {
            return;
        }
        for y in 0..self.height {
            for x in 0..self.width {
                let distance = rounded_rect_distance(
                    rect,
                    radius,
                    x as f32 + 0.5,
                    y as f32 + 0.5 - shadow.offset_y,
                );
                let alpha = shadow_falloff(distance, shadow.blur) * shadow.opacity;
                if alpha > 0.0 {
                    self.blend(x, y, Rgb(0, 0, 0), alpha);
                }
            }
        }
    }

    fn blend(&mut self, x: i32, y: i32, color: Rgb, alpha: f32) {
        let index = (y * self.width + x) as usize;
        let dst = self.pixels[index];
        let alpha = alpha.clamp(0.0, 1.0);
        let keep = 1.0 - alpha;
        let channel = |shift: u32, src: u8| -> u32 {
            let dst = ((dst >> shift) & 0xff) as f32;
            ((f32::from(src) * alpha + dst * keep).round() as u32).min(255)
        };
        let a = channel(24, 255);
        let r = channel(16, color.0);
        let g = channel(8, color.1);
        let b = channel(0, color.2);
        self.pixels[index] = (a << 24) | (r << 16) | (g << 8) | b;
    }
}

pub fn inset(rect: Rect, by: i32) -> Rect {
    Rect {
        x: rect.x + by,
        y: rect.y + by,
        width: (rect.width - 2 * by).max(0),
        height: (rect.height - 2 * by).max(0),
    }
}

/// Distance signée du point `(px, py)` au rectangle arrondi : négative à
/// l'intérieur, positive à l'extérieur.
pub fn rounded_rect_distance(rect: Rect, radius: f32, px: f32, py: f32) -> f32 {
    let half_w = rect.width as f32 / 2.0;
    let half_h = rect.height as f32 / 2.0;
    let radius = radius.clamp(0.0, half_w.min(half_h));
    let cx = rect.x as f32 + half_w;
    let cy = rect.y as f32 + half_h;
    let qx = (px - cx).abs() - (half_w - radius);
    let qy = (py - cy).abs() - (half_h - radius);
    let outside = qx.max(0.0).hypot(qy.max(0.0));
    outside + qx.max(qy).min(0.0) - radius
}

/// Part du pixel `(x, y)` couverte par la forme, entre 0 et 1.
pub fn rounded_rect_coverage(rect: Rect, radius: f32, x: i32, y: i32) -> f32 {
    let distance = rounded_rect_distance(rect, radius, x as f32 + 0.5, y as f32 + 0.5);
    (0.5 - distance).clamp(0.0, 1.0)
}

fn shadow_falloff(distance: f32, blur: f32) -> f32 {
    if distance <= 0.0 {
        return 1.0;
    }
    let t = 1.0 - (distance / blur).min(1.0);
    t * t
}

/// Recompose le tampon après le passage de GDI. GDI remet l'alpha à zéro sur
/// les pixels qu'il touche : là où la forme peinte est opaque, on garde la
/// couleur dessinée par GDI et on force l'alpha à 255 ; ailleurs (bords
/// anticrénelés, ombre, transparence), on rétablit la forme peinte, ce qui
/// efface aussi tout débordement de texte hors de la carte.
pub fn finalize(shapes: &[u32], drawn: &mut [u32]) {
    for (shape, pixel) in shapes.iter().zip(drawn.iter_mut()) {
        if shape >> 24 == 0xff {
            *pixel |= 0xff00_0000;
        } else {
            *pixel = *shape;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CARD: Rect = Rect {
        x: 10,
        y: 10,
        width: 100,
        height: 60,
    };

    #[test]
    fn coverage_is_full_inside_and_empty_beyond_the_rounded_corner() {
        assert_eq!(rounded_rect_coverage(CARD, 14.0, 60, 40), 1.0);
        assert_eq!(rounded_rect_coverage(CARD, 14.0, 10, 10), 0.0);
        assert_eq!(rounded_rect_coverage(CARD, 0.0, 10, 10), 1.0);
        let edge = rounded_rect_coverage(CARD, 14.0, 10, 40);
        assert!(edge > 0.4 && edge <= 1.0);
        assert_eq!(rounded_rect_coverage(CARD, 14.0, 9, 40), 0.0);
    }

    #[test]
    fn rounded_corner_is_antialiased_with_partial_pixels() {
        let mut canvas = Canvas::new(120, 80);
        canvas.fill_rounded_rect(CARD, 14.0, Rgb(255, 255, 255), 1.0);
        let partial = (0..14)
            .flat_map(|d| [(CARD.x + d, CARD.y + 3), (CARD.x + 3, CARD.y + d)])
            .filter(|&(x, y)| {
                let a = canvas.alpha(x, y);
                a > 0 && a < 255
            })
            .count();
        assert!(partial > 0);
        assert_eq!(canvas.alpha(CARD.x, CARD.y), 0);
        assert_eq!(canvas.alpha(CARD.x + 50, CARD.y), 255);
    }

    #[test]
    fn bordered_rect_draws_the_border_then_the_fill() {
        let mut canvas = Canvas::new(120, 80);
        let fill = Rgb(0xfb, 0xfa, 0xf5);
        let border = Rgb(0xe4, 0xe3, 0xd8);
        canvas.fill_bordered_rect(CARD, 14.0, fill, border, 1);
        assert_eq!(canvas.pixel(CARD.x + 50, CARD.y), 0xffe4_e3d8);
        assert_eq!(canvas.pixel(CARD.x + 50, CARD.y + 1), 0xfffb_faf5);
        assert_eq!(canvas.pixel(CARD.x + 50, CARD.y + 30), 0xfffb_faf5);
    }

    #[test]
    fn premultiplied_blend_keeps_color_channels_under_alpha() {
        let mut canvas = Canvas::new(4, 4);
        canvas.fill_rounded_rect(
            Rect {
                x: 0,
                y: 0,
                width: 4,
                height: 4,
            },
            0.0,
            Rgb(200, 100, 50),
            0.5,
        );
        let pixel = canvas.pixel(1, 1);
        let a = pixel >> 24;
        assert_eq!(a, 128);
        for shift in [0, 8, 16] {
            assert!((pixel >> shift) & 0xff <= a);
        }
    }

    #[test]
    fn shadow_fades_to_zero_before_the_window_edge() {
        let mut canvas = Canvas::new(120, 80);
        let shadow = Shadow {
            offset_y: 2.0,
            blur: 7.0,
            opacity: 0.4,
        };
        canvas.fill_shadow(CARD, 14.0, shadow);
        for x in 0..canvas.width {
            assert_eq!(canvas.alpha(x, 0), 0);
            assert_eq!(canvas.alpha(x, canvas.height - 1), 0);
        }
        for y in 0..canvas.height {
            assert_eq!(canvas.alpha(0, y), 0);
            assert_eq!(canvas.alpha(canvas.width - 1, y), 0);
        }
        assert!(canvas.alpha(60, CARD.bottom() + 2) > canvas.alpha(60, CARD.y - 2));
        assert_eq!(canvas.alpha(60, 40), 102);
    }

    #[test]
    fn finalize_restores_alpha_inside_and_shapes_outside() {
        let shapes = [0xff11_2233, 0x8000_0000, 0x0000_0000];
        let mut drawn = [0x0044_5566, 0x0099_9999, 0x00ab_cdef];
        finalize(&shapes, &mut drawn);
        assert_eq!(drawn, [0xff44_5566, 0x8000_0000, 0x0000_0000]);
    }

    #[test]
    fn shapes_are_clipped_to_the_canvas() {
        let mut canvas = Canvas::new(10, 10);
        canvas.fill_rounded_rect(
            Rect {
                x: -5,
                y: -5,
                width: 30,
                height: 30,
            },
            4.0,
            Rgb(1, 2, 3),
            1.0,
        );
        assert_eq!(canvas.pixels.len(), 100);
        assert_eq!(canvas.alpha(0, 0), 255);
    }
}
