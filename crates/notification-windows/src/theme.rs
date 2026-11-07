//! Couleurs de l'overlay Windows, recopiées des jetons de la palette « Thé vert ».
//!
//! Le rendu GDI ne peut pas lire les variables CSS de l'application : les
//! valeurs ci-dessous sont reprises à la main de
//! `packages/design-system/src/tokens.css` (`:root` pour le clair, `.dark` pour
//! le sombre). Si un jeton change là-bas, mettre à jour la ligne correspondante.
//!
//! | Rôle overlay        | Jeton CSS                 | Clair     | Sombre    |
//! |---------------------|---------------------------|-----------|-----------|
//! | `surface`           | `--app-floating-panel`    | `#fbfaf5` | `#232821` |
//! | `border`            | `--app-floating-border`   | `#e4e3d8` | `#3d443a` |
//! | `ink`               | `--foreground`            | `#262a24` | `#ece9df` |
//! | `muted_ink`         | `--muted-foreground`      | `#5c6357` | `#a7ad9f` |
//! | `primary`           | `--primary`               | `#316745` | `#7dbf95` |
//! | `primary_ink`       | `--primary-foreground`    | `#fbfaf5` | `#13251a` |
//! | `secondary`         | `--secondary`             | `#efeee6` | `#2c322a` |
//! | `control_border`    | `--input`                 | `#d8d7cb` | `#3d443a` |
//! | `destructive`       | `--destructive`           | `#b23a3f` | `#e0676b` |
//! | `destructive_ink`   | `--destructive-foreground`| `#ffffff` | `#2c1112` |
//!
//! Les palettes « Glycine » et « Laque et encre » ne sont pas transmises au
//! natif : l'overlay reste en Thé vert, la palette par défaut.

#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb(pub u8, pub u8, pub u8);

impl Rgb {
    pub const fn hex(value: u32) -> Self {
        Self((value >> 16) as u8, (value >> 8) as u8, value as u8)
    }

    /// Valeur `COLORREF` de GDI (0x00BBGGRR).
    pub fn colorref(self) -> u32 {
        u32::from(self.0) | (u32::from(self.1) << 8) | (u32::from(self.2) << 16)
    }

    #[cfg(test)]
    /// Luminance relative WCAG 2.x.
    pub fn luminance(self) -> f64 {
        fn channel(value: u8) -> f64 {
            let c = f64::from(value) / 255.0;
            if c <= 0.04045 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            }
        }
        0.2126 * channel(self.0) + 0.7152 * channel(self.1) + 0.0722 * channel(self.2)
    }

    #[cfg(test)]
    pub fn contrast(self, other: Self) -> f64 {
        let (a, b) = (self.luminance(), other.luminance());
        (a.max(b) + 0.05) / (a.min(b) + 0.05)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Palette {
    pub surface: Rgb,
    pub border: Rgb,
    pub ink: Rgb,
    pub muted_ink: Rgb,
    pub primary: Rgb,
    pub primary_ink: Rgb,
    pub secondary: Rgb,
    pub control_border: Rgb,
    pub destructive: Rgb,
    pub destructive_ink: Rgb,
    /// Opacité maximale de l'ombre portée (noire), plus forte en sombre pour
    /// rester visible sur un bureau foncé.
    pub shadow_opacity: f32,
}

impl Palette {
    pub const LIGHT: Self = Self {
        surface: Rgb::hex(0xfbfaf5),
        border: Rgb::hex(0xe4e3d8),
        ink: Rgb::hex(0x262a24),
        muted_ink: Rgb::hex(0x5c6357),
        primary: Rgb::hex(0x316745),
        primary_ink: Rgb::hex(0xfbfaf5),
        secondary: Rgb::hex(0xefeee6),
        control_border: Rgb::hex(0xd8d7cb),
        destructive: Rgb::hex(0xb23a3f),
        destructive_ink: Rgb::hex(0xffffff),
        shadow_opacity: 0.16,
    };

    pub const DARK: Self = Self {
        surface: Rgb::hex(0x232821),
        border: Rgb::hex(0x3d443a),
        ink: Rgb::hex(0xece9df),
        muted_ink: Rgb::hex(0xa7ad9f),
        primary: Rgb::hex(0x7dbf95),
        primary_ink: Rgb::hex(0x13251a),
        secondary: Rgb::hex(0x2c322a),
        control_border: Rgb::hex(0x3d443a),
        destructive: Rgb::hex(0xe0676b),
        destructive_ink: Rgb::hex(0x2c1112),
        shadow_opacity: 0.42,
    };

    pub fn for_dark_mode(dark: bool) -> Self {
        if dark { Self::DARK } else { Self::LIGHT }
    }
}

/// Style du bouton d'action principal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionStyle {
    /// Action par défaut (rejoindre, démarrer) : fond vert plein.
    Primary,
    /// Liste d'options : fond neutre bordé, comme un bouton secondaire.
    Secondary,
    /// Action destructive (arrêter) : fond rouge.
    Destructive,
}

impl ActionStyle {
    pub fn fill(self, palette: &Palette) -> Rgb {
        match self {
            Self::Primary => palette.primary,
            Self::Secondary => palette.secondary,
            Self::Destructive => palette.destructive,
        }
    }

    pub fn ink(self, palette: &Palette) -> Rgb {
        match self {
            Self::Primary => palette.primary_ink,
            Self::Secondary => palette.ink,
            Self::Destructive => palette.destructive_ink,
        }
    }

    pub fn outline(self, palette: &Palette) -> Option<Rgb> {
        matches!(self, Self::Secondary).then_some(palette.control_border)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STYLES: [ActionStyle; 3] = [
        ActionStyle::Primary,
        ActionStyle::Secondary,
        ActionStyle::Destructive,
    ];

    #[test]
    fn hex_and_colorref_follow_gdi_byte_order() {
        let green = Rgb::hex(0x316745);
        assert_eq!(green, Rgb(0x31, 0x67, 0x45));
        assert_eq!(green.colorref(), 0x0045_6731);
    }

    #[test]
    fn text_on_every_surface_keeps_wcag_aa_contrast() {
        for palette in [Palette::LIGHT, Palette::DARK] {
            assert!(palette.ink.contrast(palette.surface) >= 4.5);
            assert!(palette.muted_ink.contrast(palette.surface) >= 4.5);
            assert!(palette.primary.contrast(palette.surface) >= 3.0);
            for style in STYLES {
                let ratio = style.ink(&palette).contrast(style.fill(&palette));
                assert!(ratio >= 4.5, "{style:?}: {ratio:.2}");
            }
        }
    }

    #[test]
    fn dark_mode_selects_the_dark_tokens() {
        assert_eq!(Palette::for_dark_mode(true), Palette::DARK);
        assert_eq!(Palette::for_dark_mode(false), Palette::LIGHT);
        assert!(Palette::DARK.surface.luminance() < Palette::LIGHT.surface.luminance());
    }

    #[test]
    fn only_the_secondary_button_is_outlined() {
        let palette = Palette::LIGHT;
        assert_eq!(
            ActionStyle::Secondary.outline(&palette),
            Some(palette.control_border)
        );
        assert_eq!(ActionStyle::Primary.outline(&palette), None);
        assert_eq!(ActionStyle::Destructive.outline(&palette), None);
    }
}
