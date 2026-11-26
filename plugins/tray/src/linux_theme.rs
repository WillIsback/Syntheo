//! Fond de la zone de notification sous Linux (issue 739).
//!
//! Les icônes du tray sont blanches (icônes « modèle » de macOS). Sur un
//! panneau clair (KDE Breeze clair, XFCE…), elles disparaissent. Le schéma de
//! couleurs vient du portail freedesktop (`org.freedesktop.appearance`,
//! `color-scheme`), lu au démarrage puis suivi par le signal `SettingChanged`,
//! sans interrogation régulière.
//!
//! GNOME garde une barre supérieure sombre quel que soit le schéma : l'icône y
//! reste blanche. Sans portail (ou sans réponse), rien ne change.

use std::sync::atomic::{AtomicBool, Ordering};

static LIGHT_PANEL: AtomicBool = AtomicBool::new(false);

/// Schéma de couleurs du portail (`0` sans préférence, `1` sombre, `2` clair).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scheme {
    NoPreference,
    Dark,
    Light,
}

/// Bureaux dont le panneau reste sombre en schéma clair.
fn panel_stays_dark(desktop: &str) -> bool {
    desktop.split(':').any(|name| {
        matches!(
            name.trim().to_ascii_lowercase().as_str(),
            "gnome" | "ubuntu" | "unity"
        )
    })
}

/// Le panneau est-il clair ? `desktop` : `XDG_CURRENT_DESKTOP`.
pub fn panel_is_light(scheme: Scheme, desktop: &str) -> bool {
    scheme == Scheme::Light && !panel_stays_dark(desktop)
}

pub fn is_light() -> bool {
    LIGHT_PANEL.load(Ordering::SeqCst)
}

/// Enregistre le schéma ; renvoie `true` si le fond du panneau a changé.
fn apply(scheme: Scheme) -> bool {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let light = panel_is_light(scheme, &desktop);
    LIGHT_PANEL.swap(light, Ordering::SeqCst) != light
}

fn from_portal(scheme: ashpd::desktop::settings::ColorScheme) -> Scheme {
    use ashpd::desktop::settings::ColorScheme;
    match scheme {
        ColorScheme::PreferDark => Scheme::Dark,
        ColorScheme::PreferLight => Scheme::Light,
        ColorScheme::NoPreference => Scheme::NoPreference,
    }
}

/// Lit le schéma puis le suit ; `changed` est appelé à chaque changement du
/// fond du panneau, première lecture comprise. Rend la main si le portail
/// manque ou se ferme.
pub async fn watch(changed: impl Fn()) {
    use futures_util::StreamExt;

    let settings = match ashpd::desktop::settings::Settings::new().await {
        Ok(settings) => settings,
        Err(error) => {
            tracing::info!(%error, "tray_theme_portal_unavailable");
            return;
        }
    };
    match settings.color_scheme().await {
        Ok(scheme) => {
            if apply(from_portal(scheme)) {
                changed();
            }
        }
        Err(error) => tracing::info!(%error, "tray_theme_portal_unreadable"),
    }
    let mut updates = match settings.receive_color_scheme_changed().await {
        Ok(updates) => updates,
        Err(error) => {
            tracing::info!(%error, "tray_theme_portal_no_signal");
            return;
        }
    };
    while let Some(scheme) = updates.next().await {
        if apply(from_portal(scheme)) {
            tracing::info!(light = is_light(), "tray_theme_changed");
            changed();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Issue 739 : panneau clair seulement en schéma clair, hors GNOME (barre
    // supérieure toujours sombre).
    #[test]
    fn a_light_scheme_lightens_the_panel_except_on_gnome() {
        assert!(panel_is_light(Scheme::Light, "KDE"));
        assert!(panel_is_light(Scheme::Light, "XFCE"));
        assert!(panel_is_light(Scheme::Light, ""));
        assert!(!panel_is_light(Scheme::Light, "GNOME"));
        assert!(!panel_is_light(Scheme::Light, "ubuntu:GNOME"));
        assert!(!panel_is_light(Scheme::Dark, "KDE"));
        assert!(!panel_is_light(Scheme::NoPreference, "KDE"));
    }
}
