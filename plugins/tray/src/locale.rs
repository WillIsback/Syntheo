//! Libellés du menu natif (zone de notification, barre de menus macOS et
//! boîtes de dialogue natives) en français et en anglais.
//!
//! L'interface est traduite par Lingui côté application ; le menu natif est
//! construit ici, avant même que la fenêtre ne charge. L'application envoie
//! donc sa langue d'affichage (`set_native_menu_locale`) et le menu est
//! reconstruit. Le français reste la langue par défaut.

use std::sync::atomic::{AtomicU8, Ordering};

use tauri_plugin_store2::Store2PluginExt;

const STORE_KEY: &str = "native_menu_locale";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeLocale {
    Fr,
    En,
}

static CURRENT: AtomicU8 = AtomicU8::new(NativeLocale::Fr as u8);

impl NativeLocale {
    /// Même règle que `resolveDisplayLocale` côté application : l'anglais
    /// (`en`, `en-US`…) donne l'anglais, tout le reste retombe sur le français.
    pub fn from_tag(tag: &str) -> Self {
        let primary = tag.trim().split(['-', '_']).next().unwrap_or_default();
        if primary.eq_ignore_ascii_case("en") {
            Self::En
        } else {
            Self::Fr
        }
    }

    pub fn tag(self) -> &'static str {
        match self {
            Self::Fr => "fr",
            Self::En => "en",
        }
    }

    pub fn current() -> Self {
        match CURRENT.load(Ordering::SeqCst) {
            value if value == Self::En as u8 => Self::En,
            _ => Self::Fr,
        }
    }

    pub fn make_current(self) {
        CURRENT.store(self as u8, Ordering::SeqCst);
    }
}

/// Recharge la langue mémorisée au lancement précédent, pour que la zone de
/// notification s'affiche dans la bonne langue avant que l'interface charge.
pub fn restore_persisted_locale(app: &tauri::AppHandle<tauri::Wry>) {
    let result = app
        .store2()
        .scoped_store::<String>(crate::PLUGIN_NAME)
        .and_then(|store| store.get::<String>(STORE_KEY.to_string()));

    match result {
        Ok(Some(tag)) => NativeLocale::from_tag(&tag).make_current(),
        Ok(None) => {}
        Err(error) => tracing::warn!(%error, "failed to load native menu locale"),
    }
}

pub fn persist_locale(app: &tauri::AppHandle<tauri::Wry>, locale: NativeLocale) {
    let result = app
        .store2()
        .scoped_store::<String>(crate::PLUGIN_NAME)
        .and_then(|store| store.set(STORE_KEY.to_string(), locale.tag()));

    if let Err(error) = result {
        tracing::warn!(%error, "failed to persist native menu locale");
    }
}

struct Translations {
    fr: &'static str,
    en: &'static str,
}

/// Chaque entrée doit fournir ses deux traductions : la macro ne compile pas
/// sinon. Jetons remplacés par `Label::fill` : `{app}`, `{version}`, `{commit}`.
macro_rules! labels {
    ($($key:ident => { fr: $fr:literal, en: $en:literal $(,)? }),* $(,)?) => {
        // Les libellés de la barre de menus ne servent que sous macOS.
        #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum Label {
            $($key),*
        }

        impl Label {
            #[cfg(test)]
            pub const ALL: &'static [Label] = &[$(Label::$key),*];

            fn translations(self) -> Translations {
                match self {
                    $(Label::$key => Translations { fr: $fr, en: $en }),*
                }
            }
        }
    };
}

labels! {
    // Zone de notification
    TrayOpen => { fr: "Ouvrir {app}", en: "Open {app}" },
    TrayStart => { fr: "Démarrer une réunion", en: "Start a Meeting" },
    TraySettings => { fr: "Paramètres", en: "Settings" },
    TrayShowEvents => { fr: "Afficher les prochaines réunions", en: "Show Upcoming Meetings" },
    TrayHide => { fr: "Masquer la fenêtre", en: "Hide Window" },
    TrayQuitCompletely => { fr: "Quitter complètement…", en: "Quit Completely…" },
    AgendaToday => { fr: "Aujourd’hui", en: "Today" },
    AgendaTomorrow => { fr: "Demain", en: "Tomorrow" },
    // Boîtes de dialogue natives
    QuitCompletelyTitle => { fr: "Quitter complètement {app} ?", en: "Quit {app} completely?" },
    QuitCompletelyMessage => {
        fr: "{app} ne tournera plus en arrière-plan.",
        en: "{app} will no longer run in the background.",
    },
    AboutTitle => { fr: "À propos de {app}", en: "About {app}" },
    AboutMessage => {
        fr: "- Application : {app}\n- Version : {version}\n- SHA :\n  {commit}",
        en: "- Application: {app}\n- Version: {version}\n- SHA:\n  {commit}",
    },
    Quit => { fr: "Quitter", en: "Quit" },
    Cancel => { fr: "Annuler", en: "Cancel" },
    Copy => { fr: "Copier", en: "Copy" },
    // Barre de menus macOS
    AppNew => { fr: "Nouvelle note", en: "New Note" },
    Services => { fr: "Services", en: "Services" },
    HideApp => { fr: "Masquer {app}", en: "Hide {app}" },
    HideOthers => { fr: "Masquer les autres", en: "Hide Others" },
    ShowAll => { fr: "Tout afficher", en: "Show All" },
    MenuFile => { fr: "Fichier", en: "File" },
    CloseWindow => { fr: "Fermer", en: "Close Window" },
    MenuEdit => { fr: "Modifier", en: "Edit" },
    Undo => { fr: "Annuler", en: "Undo" },
    Redo => { fr: "Rétablir", en: "Redo" },
    Cut => { fr: "Couper", en: "Cut" },
    Paste => { fr: "Coller", en: "Paste" },
    SelectAll => { fr: "Tout sélectionner", en: "Select All" },
    MenuView => { fr: "Afficher", en: "View" },
    Fullscreen => { fr: "Plein écran", en: "Toggle Full Screen" },
    MenuWindow => { fr: "Fenêtre", en: "Window" },
    Minimize => { fr: "Placer dans le Dock", en: "Minimize" },
    Zoom => { fr: "Réduire/agrandir", en: "Zoom" },
    MenuHelp => { fr: "Aide", en: "Help" },
    HelpReportBug => { fr: "Signaler un bug", en: "Report a Bug" },
    HelpSuggestFeature => { fr: "Suggérer une fonctionnalité", en: "Suggest a Feature" },
}

impl Label {
    pub fn text_in(self, locale: NativeLocale) -> &'static str {
        let translations = self.translations();
        match locale {
            NativeLocale::Fr => translations.fr,
            NativeLocale::En => translations.en,
        }
    }

    /// Libellé dans la langue courante du menu natif.
    pub fn text(self) -> &'static str {
        self.text_in(NativeLocale::current())
    }

    /// Libellé dans la langue courante, jetons `{nom}` remplacés.
    pub fn fill(self, values: &[(&str, &str)]) -> String {
        fill_template(self.text(), values)
    }
}

pub fn fill_template(template: &str, values: &[(&str, &str)]) -> String {
    values
        .iter()
        .fold(template.to_string(), |text, (name, value)| {
            text.replace(&format!("{{{name}}}"), value)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(text: &str) -> Vec<&str> {
        let mut tokens: Vec<&str> = text
            .split('{')
            .skip(1)
            .filter_map(|rest| rest.split_once('}').map(|(token, _)| token))
            .collect();
        tokens.sort_unstable();
        tokens
    }

    #[test]
    fn every_label_has_both_translations_with_the_same_tokens() {
        for label in Label::ALL {
            let fr = label.text_in(NativeLocale::Fr);
            let en = label.text_in(NativeLocale::En);
            assert!(
                !fr.trim().is_empty(),
                "{label:?} : traduction française vide"
            );
            assert!(
                !en.trim().is_empty(),
                "{label:?} : traduction anglaise vide"
            );
            assert_eq!(tokens(fr), tokens(en), "{label:?} : jetons différents");
        }
    }

    #[test]
    fn resolves_tags_like_the_app_and_defaults_to_french() {
        assert_eq!(NativeLocale::from_tag("en"), NativeLocale::En);
        assert_eq!(NativeLocale::from_tag("en-US"), NativeLocale::En);
        assert_eq!(NativeLocale::from_tag("EN_gb"), NativeLocale::En);
        assert_eq!(NativeLocale::from_tag("fr"), NativeLocale::Fr);
        assert_eq!(NativeLocale::from_tag("de"), NativeLocale::Fr);
        assert_eq!(NativeLocale::from_tag(""), NativeLocale::Fr);
        assert_eq!(NativeLocale::from_tag("n'importe quoi"), NativeLocale::Fr);
    }

    #[test]
    fn tags_round_trip() {
        for locale in [NativeLocale::Fr, NativeLocale::En] {
            assert_eq!(NativeLocale::from_tag(locale.tag()), locale);
        }
    }

    #[test]
    fn fills_tokens_in_the_chosen_language() {
        let values = [
            ("app", "Syntheo"),
            ("version", "0.6.1"),
            ("commit", "abc123"),
        ];
        assert_eq!(
            fill_template(Label::AboutTitle.text_in(NativeLocale::Fr), &values),
            "À propos de Syntheo"
        );
        assert_eq!(
            fill_template(Label::AboutTitle.text_in(NativeLocale::En), &values),
            "About Syntheo"
        );
        assert_eq!(
            fill_template(Label::AboutMessage.text_in(NativeLocale::Fr), &values),
            "- Application : Syntheo\n- Version : 0.6.1\n- SHA :\n  abc123"
        );
        assert_eq!(
            fill_template(
                Label::QuitCompletelyTitle.text_in(NativeLocale::En),
                &values
            ),
            "Quit Syntheo completely?"
        );
    }
}
