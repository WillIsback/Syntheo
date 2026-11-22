//! Hôte du module de transcription sur le poste `syntheo-speech` (issue
//! 684) : vérification des empreintes avant chaque lancement, lancement sur la
//! boucle locale avec un jeton par lancement, supervision et arrêt.

pub mod host;
pub mod verify;

pub use host::{HostError, SpeechHost};
pub use verify::{Verified, VerifyError};
