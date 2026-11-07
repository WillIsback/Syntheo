#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

//! Géométrie de l'overlay, en pixels logiques (96 ppp) puis mise à l'échelle.
//!
//! Les rectangles de [`NotificationLayout`] sont relatifs à la carte. La
//! fenêtre Win32 est plus grande de [`SHADOW_MARGIN`] de chaque côté pour
//! laisser la place à l'ombre ; [`NotificationLayout::card_origin`] donne le
//! décalage entre les deux repères.
//!
//! Maquette compacte (96 ppp) :
//!
//! ```text
//!  <------------------------------- 360 ------------------------------->
//! +---------------------------------------------------------------------+  ^
//! |(x) 4,4 20x20, au survol                                             |  |
//! |  +------+  Titre             14 px semi-gras      +---------------+ |  |
//! |  | 28px |  54,16  168x20                          | Action  (|v)  | | 72
//! |  +------+  Message           12 px, encre douce   | 234,20 112x32 | |  |
//! |  14,22     54,37  168x18                          +---------------+ |  |
//! |  ================== progression 14,66 332x3 ======================  |  |
//! +---------------------------------------------------------------------+  v
//! | Pied : texte 14,77                              lien 258,77 88x22   | 34
//! +---------------------------------------------------------------------+
//!  rayon de la carte 14 (--radius-xl), boutons 8 (--radius-md), bordure 1,
//!  ombre décalée de 2 et floue sur 7, dans une marge de 10 autour de la carte.
//! ```

use syntheo_notification_interface::{Notification, PrimaryAction};

pub const NOTIFICATION_WIDTH: i32 = 360;
pub const COMPACT_HEIGHT: i32 = 72;
pub const COMPACT_FOOTER_HEIGHT: i32 = 34;
pub const EXPANDED_HEIGHT: i32 = 380;
pub const RIGHT_MARGIN: i32 = 24;
pub const TOP_MARGIN: i32 = 15;
/// Écart entre deux cartes, au moins [`SHADOW_MARGIN`] : l'ombre d'une fenêtre ne recouvre pas la voisine.
pub const NOTIFICATION_SPACING: i32 = 12;
pub const MAX_NOTIFICATIONS: usize = 5;

/// Marge intérieure horizontale de la carte compacte.
pub const COMPACT_PADDING: i32 = 14;
/// Marge intérieure de la carte dépliée.
pub const EXPANDED_PADDING: i32 = 16;
/// Écart entre l'icône, le texte et le bouton.
pub const CONTENT_GAP: i32 = 12;
pub const CLOSE_BUTTON_SIZE: i32 = 20;
pub const CLOSE_BUTTON_INSET: i32 = 4;
pub const ICON_SIZE: i32 = 28;
pub const ACTION_BUTTON_WIDTH: i32 = 112;
pub const ACTION_BUTTON_HEIGHT: i32 = 32;
/// Segment « ▾ » à droite du bouton quand l'action a un menu.
pub const ACTION_CARET_WIDTH: i32 = 28;
pub const EXPANDED_ACTION_HEIGHT: i32 = 36;
pub const COLLAPSE_BUTTON_WIDTH: i32 = 96;
pub const COLLAPSE_BUTTON_HEIGHT: i32 = 26;
pub const FOOTER_ACTION_WIDTH: i32 = 88;
pub const FOOTER_ACTION_HEIGHT: i32 = 22;
pub const PROGRESS_HEIGHT: i32 = 3;
pub const PROGRESS_BOTTOM_GAP: i32 = 3;

/// `--radius-xl` de l'application (`--radius` 10 px + 4), comme macOS (14).
pub const CORNER_RADIUS: i32 = 14;
/// `--radius-md` (`--radius` 10 px − 2) des boutons.
pub const BUTTON_RADIUS: i32 = 8;
pub const BORDER_WIDTH: i32 = 1;
pub const SHADOW_MARGIN: i32 = 10;
pub const SHADOW_OFFSET_Y: i32 = 2;
/// Flou de l'ombre : `SHADOW_OFFSET_Y + SHADOW_BLUR < SHADOW_MARGIN`, pour que
/// l'ombre s'éteigne avant le bord de la fenêtre.
pub const SHADOW_BLUR: i32 = 7;

/// Tailles de police (px à 96 ppp), alignées sur `Fonts` de `notification-macos`.
pub const TITLE_FONT_SIZE: i32 = 14;
pub const EXPANDED_TITLE_FONT_SIZE: i32 = 15;
pub const BODY_FONT_SIZE: i32 = 12;
pub const BUTTON_FONT_SIZE: i32 = 12;
pub const FOOTER_FONT_SIZE: i32 = 11;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl Rect {
    pub fn contains(self, x: i32, y: i32) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.width && y < self.y + self.height
    }

    pub fn right(self) -> i32 {
        self.x + self.width
    }

    pub fn bottom(self) -> i32 {
        self.y + self.height
    }

    pub fn offset(self, dx: i32, dy: i32) -> Self {
        Self {
            x: self.x + dx,
            y: self.y + dy,
            ..self
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HitTarget {
    Close,
    Action,
    Options,
    Footer,
    Collapse,
    Body,
    /// Marge d'ombre autour de la carte : le clic est ignoré.
    Outside,
}

#[derive(Debug, Clone)]
pub struct NotificationLayout {
    pub dpi: u32,
    pub width: i32,
    pub height: i32,
    pub close: Rect,
    pub icon: Option<Rect>,
    pub title: Rect,
    pub message: Rect,
    pub action: Option<Rect>,
    pub footer_action: Option<Rect>,
    pub footer_text: Option<Rect>,
    pub collapse: Option<Rect>,
    pub progress: Option<Rect>,
}

impl NotificationLayout {
    pub fn compact(notification: &Notification) -> Self {
        let has_footer = notification.footer.is_some();
        let height = if has_footer {
            COMPACT_HEIGHT + COMPACT_FOOTER_HEIGHT
        } else {
            COMPACT_HEIGHT
        };
        let has_icon = !matches!(
            notification.icon,
            Some(syntheo_notification_interface::NotificationIcon::Hidden)
        );
        let icon = has_icon.then_some(Rect {
            x: COMPACT_PADDING,
            y: (COMPACT_HEIGHT - ICON_SIZE) / 2,
            width: ICON_SIZE,
            height: ICON_SIZE,
        });
        let text_x = icon
            .map(|rect| rect.right() + CONTENT_GAP)
            .unwrap_or(COMPACT_PADDING);
        let action = match notification.primary_action() {
            PrimaryAction::Accept { .. } | PrimaryAction::Options(_) => Some(Rect {
                x: NOTIFICATION_WIDTH - ACTION_BUTTON_WIDTH - COMPACT_PADDING,
                y: (COMPACT_HEIGHT - ACTION_BUTTON_HEIGHT) / 2,
                width: ACTION_BUTTON_WIDTH,
                height: ACTION_BUTTON_HEIGHT,
            }),
        };
        let text_right = action
            .map(|rect| rect.x - CONTENT_GAP)
            .unwrap_or(NOTIFICATION_WIDTH - COMPACT_PADDING);
        let text_width = (text_right - text_x).max(48);
        let footer_action = has_footer.then_some(Rect {
            x: NOTIFICATION_WIDTH - FOOTER_ACTION_WIDTH - COMPACT_PADDING,
            y: COMPACT_HEIGHT + (COMPACT_FOOTER_HEIGHT - FOOTER_ACTION_HEIGHT) / 2,
            width: FOOTER_ACTION_WIDTH,
            height: FOOTER_ACTION_HEIGHT,
        });
        let footer_text = footer_action.map(|rect| Rect {
            x: COMPACT_PADDING,
            y: rect.y,
            width: rect.x - CONTENT_GAP / 2 - COMPACT_PADDING,
            height: rect.height,
        });

        Self {
            dpi: 96,
            width: NOTIFICATION_WIDTH,
            height,
            close: close_button(),
            icon,
            title: Rect {
                x: text_x,
                y: 16,
                width: text_width,
                height: 20,
            },
            message: Rect {
                x: text_x,
                y: 37,
                width: text_width,
                height: 18,
            },
            action,
            footer_action,
            footer_text,
            collapse: None,
            progress: notification
                .timeout
                .filter(|timeout| !timeout.is_zero())
                .map(|_| Rect {
                    x: COMPACT_PADDING,
                    y: height - PROGRESS_HEIGHT - PROGRESS_BOTTOM_GAP,
                    width: NOTIFICATION_WIDTH - 2 * COMPACT_PADDING,
                    height: PROGRESS_HEIGHT,
                }),
        }
    }

    pub fn expanded(_notification: &Notification) -> Self {
        let collapse = Rect {
            x: NOTIFICATION_WIDTH - EXPANDED_PADDING - COLLAPSE_BUTTON_WIDTH,
            y: 14,
            width: COLLAPSE_BUTTON_WIDTH,
            height: COLLAPSE_BUTTON_HEIGHT,
        };
        Self {
            dpi: 96,
            width: NOTIFICATION_WIDTH,
            height: EXPANDED_HEIGHT,
            close: close_button(),
            icon: None,
            title: Rect {
                x: EXPANDED_PADDING,
                y: 16,
                width: collapse.x - CONTENT_GAP / 2 - EXPANDED_PADDING,
                height: 22,
            },
            message: Rect {
                x: EXPANDED_PADDING,
                y: 50,
                width: NOTIFICATION_WIDTH - 2 * EXPANDED_PADDING,
                height: 240,
            },
            action: Some(Rect {
                x: EXPANDED_PADDING,
                y: EXPANDED_HEIGHT - EXPANDED_PADDING - EXPANDED_ACTION_HEIGHT,
                width: NOTIFICATION_WIDTH - 2 * EXPANDED_PADDING,
                height: EXPANDED_ACTION_HEIGHT,
            }),
            footer_action: None,
            footer_text: None,
            collapse: Some(collapse),
            progress: None,
        }
    }

    pub fn for_state(notification: &Notification, expanded: bool) -> Self {
        if expanded {
            Self::expanded(notification)
        } else {
            Self::compact(notification)
        }
    }

    pub fn at_dpi(mut self, dpi: u32) -> Self {
        self.dpi = dpi.max(96);
        self.width = self.scale(self.width);
        self.height = self.scale(self.height);
        self.close = self.scale_rect(self.close);
        self.icon = self.icon.map(|rect| self.scale_rect(rect));
        self.title = self.scale_rect(self.title);
        self.message = self.scale_rect(self.message);
        self.action = self.action.map(|rect| self.scale_rect(rect));
        self.footer_action = self.footer_action.map(|rect| self.scale_rect(rect));
        self.footer_text = self.footer_text.map(|rect| self.scale_rect(rect));
        self.collapse = self.collapse.map(|rect| self.scale_rect(rect));
        self.progress = self.progress.map(|rect| self.scale_rect(rect));
        self
    }

    pub fn scale(&self, value: i32) -> i32 {
        ((i64::from(value) * i64::from(self.dpi) + 48) / 96) as i32
    }

    fn scale_rect(&self, rect: Rect) -> Rect {
        let x = self.scale(rect.x);
        let y = self.scale(rect.y);
        Rect {
            x,
            y,
            width: self.scale(rect.right()) - x,
            height: self.scale(rect.bottom()) - y,
        }
    }

    /// Marge d'ombre autour de la carte, en pixels physiques.
    pub fn shadow_margin(&self) -> i32 {
        self.scale(SHADOW_MARGIN)
    }

    /// Position de la carte dans la fenêtre (coin haut gauche).
    pub fn card_origin(&self) -> (i32, i32) {
        let margin = self.shadow_margin();
        (margin, margin)
    }

    /// Rectangle de la carte dans le repère de la fenêtre.
    pub fn card_rect(&self) -> Rect {
        let (x, y) = self.card_origin();
        Rect {
            x,
            y,
            width: self.width,
            height: self.height,
        }
    }

    /// Taille de la fenêtre Win32 : la carte plus la marge d'ombre.
    pub fn window_size(&self) -> (i32, i32) {
        let margin = self.shadow_margin();
        (self.width + 2 * margin, self.height + 2 * margin)
    }

    /// Coin haut gauche de la fenêtre pour une carte placée en `(x, y)`.
    pub fn window_origin(&self, card_x: i32, card_y: i32) -> (i32, i32) {
        let margin = self.shadow_margin();
        (card_x - margin, card_y - margin)
    }

    pub fn corner_radius(&self) -> f32 {
        self.scale_f(CORNER_RADIUS)
    }

    pub fn button_radius(&self) -> f32 {
        self.scale_f(BUTTON_RADIUS)
    }

    pub fn border_width(&self) -> i32 {
        self.scale(BORDER_WIDTH).max(1)
    }

    pub fn shadow_offset_y(&self) -> f32 {
        self.scale_f(SHADOW_OFFSET_Y)
    }

    pub fn shadow_blur(&self) -> f32 {
        self.scale_f(SHADOW_BLUR)
    }

    /// Segment du menu « ▾ » à droite du bouton d'action.
    pub fn action_caret(&self) -> Option<Rect> {
        self.action.map(|action| {
            let width = self.scale(ACTION_CARET_WIDTH);
            Rect {
                x: action.right() - width,
                width,
                ..action
            }
        })
    }

    fn scale_f(&self, value: i32) -> f32 {
        value as f32 * self.dpi as f32 / 96.0
    }

    /// Cible d'un point exprimé dans le repère de la carte.
    pub fn hit_test(&self, x: i32, y: i32) -> HitTarget {
        if x < 0 || y < 0 || x >= self.width || y >= self.height {
            return HitTarget::Outside;
        }
        if self.close.contains(x, y) {
            return HitTarget::Close;
        }
        if self.collapse.is_some_and(|rect| rect.contains(x, y)) {
            return HitTarget::Collapse;
        }
        if self.action.is_some_and(|rect| rect.contains(x, y)) {
            return HitTarget::Action;
        }
        if self.footer_action.is_some_and(|rect| rect.contains(x, y)) {
            return HitTarget::Footer;
        }
        HitTarget::Body
    }

    pub fn action_hit(&self, notification: &Notification, x: i32, y: i32) -> HitTarget {
        match self.hit_test(x, y) {
            HitTarget::Action
                if notification.has_action_menu()
                    && self.collapse.is_none()
                    && self.action_caret().is_some_and(|caret| x >= caret.x) =>
            {
                HitTarget::Options
            }
            HitTarget::Action if notification.has_options() && self.collapse.is_none() => {
                HitTarget::Options
            }
            target => target,
        }
    }

    /// Cible d'un clic reçu par la fenêtre (repère fenêtre, ombre comprise).
    pub fn window_hit(&self, notification: &Notification, x: i32, y: i32) -> HitTarget {
        let (card_x, card_y) = self.card_origin();
        self.action_hit(notification, x - card_x, y - card_y)
    }
}

fn close_button() -> Rect {
    Rect {
        x: CLOSE_BUTTON_INSET,
        y: CLOSE_BUTTON_INSET,
        width: CLOSE_BUTTON_SIZE,
        height: CLOSE_BUTTON_SIZE,
    }
}

pub fn try_expand(
    layouts: &mut [NotificationLayout],
    index: usize,
    notification: &Notification,
    work_height: i32,
) -> bool {
    let mut expanded = layouts.to_vec();
    expanded[index] = NotificationLayout::expanded(notification).at_dpi(layouts[index].dpi);
    if fit_stack(&mut expanded, work_height) != 0 {
        return false;
    }
    layouts.clone_from_slice(&expanded);
    true
}

pub fn fit_stack(layouts: &mut [NotificationLayout], work_height: i32) -> usize {
    let minimum_height = |layout: &NotificationLayout| {
        if layout.collapse.is_some() {
            // Keep one body line above the bottom action when space is limited.
            layout.scale(148)
        } else {
            layout.height
        }
    };
    let mut first = 0;
    while first < layouts.len() {
        let visible = &layouts[first..];
        let margin = visible
            .iter()
            .map(|layout| layout.scale(TOP_MARGIN))
            .max()
            .unwrap_or(0);
        let spacing = visible
            .iter()
            .map(|layout| layout.scale(NOTIFICATION_SPACING))
            .max()
            .unwrap_or(0);
        let minimum = visible.iter().map(minimum_height).sum::<i32>()
            + spacing * (visible.len() as i32 - 1)
            + margin;
        if minimum <= work_height {
            let expanded_count = visible
                .iter()
                .filter(|layout| layout.collapse.is_some())
                .count() as i32;
            let extra = (work_height - minimum) / expanded_count.max(1);
            for layout in &mut layouts[first..] {
                if layout.collapse.is_some() {
                    layout.height = layout.height.min(minimum_height(layout) + extra);
                    let action_y =
                        layout.height - layout.scale(EXPANDED_PADDING + EXPANDED_ACTION_HEIGHT);
                    if let Some(action) = &mut layout.action {
                        action.y = action_y;
                    }
                    layout.message.height = layout
                        .message
                        .height
                        .min(action_y - layout.scale(CONTENT_GAP) - layout.message.y);
                }
            }
            return first;
        }
        first += 1;
    }
    first
}

/// Origine de la carte (pas de la fenêtre) dans la pile en haut à droite.
pub fn stacked_origin(
    work_x: i32,
    work_y: i32,
    work_width: i32,
    occupied: i32,
    layout: &NotificationLayout,
) -> (i32, i32) {
    (
        work_x + work_width - layout.width - layout.scale(RIGHT_MARGIN),
        work_y + layout.scale(TOP_MARGIN) + occupied,
    )
}

#[cfg(test)]
#[path = "layout_tests.rs"]
mod tests;
