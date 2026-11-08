pub mod actors;
mod events;
mod live_transcript;
mod runtime;

pub use events::*;
pub use live_transcript::*;
pub use runtime::*;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum State {
    Active,
    Inactive,
    Finalizing,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub state: State,
    pub active_session_id: Option<String>,
    pub finalizing_session_ids: Vec<String>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum TranscriptionMode {
    #[default]
    Live,
    Batch,
}

/// Voix tolérées en plus des participants connus : un invité absent de la liste
/// de l'événement (lien transféré, collègue dans la salle).
pub(crate) const UNLISTED_SPEAKER_MARGIN: u32 = 1;

/// Nombre MAXIMAL de locuteurs annoncé au fournisseur pour chaque flux d'une
/// session, jamais un nombre exact : la liste des participants ne dit pas qui
/// prend la parole, seulement qui peut la prendre.
///
/// `participant_human_ids` liste les participants de la réunion (table
/// `session_participants`, sans l'utilisateur) et `self_human_id` l'utilisateur.
/// Sans au moins une autre personne que l'utilisateur, aucune borne n'est
/// transmise : le fournisseur garde son comportement par défaut.
///
/// La même borne vaut pour chaque flux. Le flux unique d'une capture micro seule
/// peut porter toute la salle ; le micro d'une capture micro + système, quand il
/// n'est pas isolé (haut-parleurs), reprend aussi les voix diffusées et celles
/// des personnes présentes ; Syntheo ne sait pas qui est dans la salle et qui
/// est à distance. Le flux système, qui ne contient pas l'utilisateur, dispose
/// ainsi d'une voix de marge supplémentaire. Un micro isolé (casque) reste
/// borné à une voix par `mic_num_speakers`.
pub(crate) fn max_speakers_per_stream(
    participant_human_ids: &[String],
    self_human_id: Option<&str>,
) -> Option<u32> {
    let self_human_id = self_human_id.filter(|id| !id.is_empty());
    let mut voices: std::collections::BTreeSet<&str> = participant_human_ids
        .iter()
        .map(String::as_str)
        .filter(|id| !id.is_empty())
        .collect();
    // Sans identité connue, l'utilisateur est supposé absent de la liste : le
    // compter en plus évite de sous-estimer.
    let unidentified_self = match self_human_id {
        Some(id) => {
            voices.insert(id);
            0
        }
        None => 1,
    };
    let known_voices = u32::try_from(voices.len())
        .unwrap_or(u32::MAX)
        .saturating_add(unidentified_self);

    (known_voices >= 2).then(|| known_voices.saturating_add(UNLISTED_SPEAKER_MARGIN))
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(tag = "type")]
pub enum DegradedError {
    #[serde(rename = "authentication_failed")]
    AuthenticationFailed { provider: String },
    #[serde(rename = "upstream_unavailable")]
    UpstreamUnavailable { message: String },
    #[serde(rename = "connection_timeout")]
    ConnectionTimeout,
    #[serde(rename = "provider_configuration")]
    ProviderConfiguration { provider: String, message: String },
    #[serde(rename = "stream_error")]
    StreamError { message: String },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(tag = "type")]
pub enum StartSessionError {
    #[serde(rename = "session_already_running")]
    SessionAlreadyRunning,
    #[serde(rename = "failed_to_resolve_sessions_dir")]
    FailedToResolveSessionsDir,
    #[serde(rename = "failed_to_start_session")]
    FailedToStartSession,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn max_speakers_counts_participants_and_user_plus_margin() {
        assert_eq!(
            max_speakers_per_stream(&ids(&["remote-a"]), Some("self")),
            Some(2 + UNLISTED_SPEAKER_MARGIN)
        );
        assert_eq!(
            max_speakers_per_stream(&ids(&["remote-a", "remote-b", "remote-c"]), Some("self")),
            Some(4 + UNLISTED_SPEAKER_MARGIN)
        );
    }

    #[test]
    fn max_speakers_ignores_duplicates_blank_ids_and_a_listed_user() {
        assert_eq!(
            max_speakers_per_stream(
                &ids(&["remote-a", "self", "remote-b", "remote-a", ""]),
                Some("self")
            ),
            Some(3 + UNLISTED_SPEAKER_MARGIN)
        );
    }

    #[test]
    fn max_speakers_assumes_an_unidentified_user_is_not_listed() {
        // Sans identité de l'utilisateur, il est compté en plus de la liste pour
        // ne jamais sous-estimer.
        assert_eq!(
            max_speakers_per_stream(&ids(&["remote-a", "remote-b"]), None),
            Some(3 + UNLISTED_SPEAKER_MARGIN)
        );
    }

    #[test]
    fn max_speakers_stays_open_without_another_participant() {
        assert_eq!(max_speakers_per_stream(&[], Some("self")), None);
        assert_eq!(max_speakers_per_stream(&[], None), None);
        assert_eq!(max_speakers_per_stream(&ids(&["self"]), Some("self")), None);
        assert_eq!(max_speakers_per_stream(&ids(&["", ""]), Some("self")), None);
    }
}
