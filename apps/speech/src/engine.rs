//! Moteur de transcription derrière un trait : A (parakeet-rs) d'abord, B
//! (NeMo-Speech.cpp par son interface C) ensuite si le banc de l'issue 680 le
//! retient. Le serveur ne connaît que ce trait.

use crate::protocol::{Event, SessionConfig};

/// Erreur d'un moteur. Son message est fixe et ne contient jamais de texte
/// transcrit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineError(pub &'static str);

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}

/// Moteur chargé une fois au lancement, partagé par les sessions.
pub trait Engine: Send + Sync + 'static {
    /// Ouvre un flux de reconnaissance pour une session.
    fn open(&self, config: &SessionConfig) -> Result<Box<dyn Recognizer>, EngineError>;
}

/// Niveau de diarisation d'une session (issue 686) : complète, espacée
/// (tranches plus longues, moins de calcul), ou coupée (sans intervenant).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum DiarizationLevel {
    Off,
    Spaced,
    Full,
}

impl DiarizationLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Spaced => "spaced",
            Self::Full => "full",
        }
    }

    /// Niveau inférieur (vers « coupée »).
    pub fn lower(self) -> Self {
        match self {
            Self::Full => Self::Spaced,
            _ => Self::Off,
        }
    }

    /// Niveau supérieur (vers « complète »).
    pub fn higher(self) -> Self {
        match self {
            Self::Off => Self::Spaced,
            _ => Self::Full,
        }
    }
}

/// Flux de reconnaissance d'une session, appelé depuis un fil bloquant.
pub trait Recognizer: Send {
    /// Audio 16 kHz mono en flottants ; rend les événements prêts.
    fn push(&mut self, samples: &[f32]) -> Result<Vec<Event>, EngineError>;
    /// Fin du flux (commit) : vide les tampons et ferme l'énoncé ouvert.
    fn finish(&mut self) -> Result<Vec<Event>, EngineError>;
    /// Niveau de diarisation en cours.
    fn diarization(&self) -> DiarizationLevel {
        DiarizationLevel::Off
    }
    /// Change le niveau de diarisation (dégradation sous charge, retour).
    fn set_diarization(&mut self, _level: DiarizationLevel) {}
}
