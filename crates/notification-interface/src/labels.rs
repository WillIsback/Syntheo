use std::sync::LazyLock;
use std::time::Duration;

/// Repère remplacé par le nombre de minutes dans `starting_in_other`.
pub const MINUTES_PLACEHOLDER: &str = "{minutes}";
/// Repère remplacé par le décompte « m:ss » dans `begins_in`.
pub const TIME_PLACEHOLDER: &str = "{time}";

/// Libellés des surfaces natives, traduits par Lingui côté application et
/// envoyés avec chaque notification (issue 408, même approche que les libellés
/// du planning de la barre système). Les délais restent calculés en Rust :
/// seuls les gabarits de texte viennent de l'application. Sans libellés, les
/// textes anglais historiques s'appliquent.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationLabels {
    /// Bouton qui ouvre la liste d'options.
    pub options: String,
    /// Rappel de réunion sans décompte connu.
    pub starting_soon: String,
    /// Rappel de réunion dont l'heure de début est passée.
    pub started: String,
    pub starting_in_one: String,
    /// Gabarit avec `{minutes}`.
    pub starting_in_other: String,
    /// Gabarit avec `{time}` (« m:ss »).
    pub begins_in: String,
    /// Bouton qui replie la vue dépliée (issue 412).
    pub show_less: String,
    /// Intitulés des détails d'événement de la vue dépliée, deux-points compris
    /// (« Quoi : » en français) ; la valeur suit après une espace.
    pub what: String,
    /// Intitulé de la liste des participants (macOS seulement).
    pub who: String,
    /// Intitulé du lieu (« Where: »).
    pub location: String,
    pub invitee_time_zone: String,
    /// Bouton de la vue dépliée quand l'application ne donne pas de libellé.
    pub accept: String,
    /// Dernière entrée du menu d'options.
    pub create_new_note: String,
}

impl Default for NotificationLabels {
    fn default() -> Self {
        Self {
            options: "Options".to_string(),
            starting_soon: "Starting soon".to_string(),
            started: "Started".to_string(),
            starting_in_one: "Starting in 1 minute".to_string(),
            starting_in_other: format!("Starting in {MINUTES_PLACEHOLDER} minutes"),
            begins_in: format!("Begins in {TIME_PLACEHOLDER}"),
            show_less: "Show less".to_string(),
            what: "What:".to_string(),
            who: "Who:".to_string(),
            location: "Where:".to_string(),
            invitee_time_zone: "Invitee Time Zone:".to_string(),
            accept: "Accept".to_string(),
            create_new_note: "Create New Note...".to_string(),
        }
    }
}

static ENGLISH: LazyLock<NotificationLabels> = LazyLock::new(NotificationLabels::default);

impl NotificationLabels {
    /// Libellés anglais historiques, utilisés quand l'application n'en fournit pas.
    pub fn english() -> &'static Self {
        &ENGLISH
    }

    /// « Commence dans N minutes », arrondi à la minute supérieure (au moins 1).
    pub fn compact_schedule(&self, remaining: Duration) -> String {
        let minutes = (remaining.as_secs_f64() / 60.0).ceil().max(1.0) as u64;
        if minutes == 1 {
            self.starting_in_one.clone()
        } else {
            self.starting_in_other
                .replace(MINUTES_PLACEHOLDER, &minutes.to_string())
        }
    }

    /// Décompte « m:ss » de la vue dépliée, ou « commencé » à zéro.
    pub fn expanded_schedule(&self, remaining: Duration) -> String {
        if remaining.is_zero() {
            return self.started.clone();
        }
        let total_seconds = remaining.as_secs();
        let time = format!("{}:{:02}", total_seconds / 60, total_seconds % 60);
        self.begins_in.replace(TIME_PLACEHOLDER, &time)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn french() -> NotificationLabels {
        NotificationLabels {
            options: "Options".to_string(),
            starting_soon: "Démarrage imminent".to_string(),
            started: "En cours".to_string(),
            starting_in_one: "Démarrage dans 1 minute".to_string(),
            starting_in_other: "Démarrage dans {minutes} minutes".to_string(),
            begins_in: "Début dans {time}".to_string(),
            show_less: "Afficher moins".to_string(),
            what: "Quoi :".to_string(),
            who: "Qui :".to_string(),
            location: "Où :".to_string(),
            invitee_time_zone: "Fuseau horaire de l'invité :".to_string(),
            accept: "Accepter".to_string(),
            create_new_note: "Créer une note…".to_string(),
        }
    }

    #[test]
    fn english_defaults_keep_the_historical_expanded_view_copy() {
        let labels = NotificationLabels::english();
        assert_eq!(labels.show_less, "Show less");
        assert_eq!(labels.what, "What:");
        assert_eq!(labels.who, "Who:");
        assert_eq!(labels.location, "Where:");
        assert_eq!(labels.invitee_time_zone, "Invitee Time Zone:");
        assert_eq!(labels.accept, "Accept");
        assert_eq!(labels.create_new_note, "Create New Note...");
    }

    #[test]
    fn english_defaults_keep_the_historical_copy() {
        let labels = NotificationLabels::english();
        assert_eq!(
            labels.compact_schedule(Duration::from_secs(90)),
            "Starting in 2 minutes"
        );
        assert_eq!(
            labels.compact_schedule(Duration::from_secs(30)),
            "Starting in 1 minute"
        );
        assert_eq!(
            labels.expanded_schedule(Duration::from_secs(75)),
            "Begins in 1:15"
        );
        assert_eq!(labels.expanded_schedule(Duration::ZERO), "Started");
    }

    #[test]
    fn translated_templates_receive_the_computed_values() {
        let labels = french();
        assert_eq!(
            labels.compact_schedule(Duration::from_secs(241)),
            "Démarrage dans 5 minutes"
        );
        assert_eq!(
            labels.compact_schedule(Duration::from_secs(1)),
            "Démarrage dans 1 minute"
        );
        assert_eq!(
            labels.expanded_schedule(Duration::from_secs(605)),
            "Début dans 10:05"
        );
        assert_eq!(labels.expanded_schedule(Duration::ZERO), "En cours");
    }
}
