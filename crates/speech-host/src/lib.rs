//! Hôte du module de transcription sur le poste `syntheo-speech` (issues 683
//! et 684) : manifeste signé et empreintes vérifiés avant chaque lancement,
//! lancement sur la boucle locale avec un jeton par lancement, supervision et
//! arrêt.

pub mod host;
pub mod install;
pub mod manifest;
pub mod verify;

/// Signature de manifestes pour les essais (feature `test-signing`, jamais
/// dans l'application).
#[cfg(any(test, feature = "test-signing"))]
pub mod test_signing;

pub use host::{HostError, SpeechHost};
pub use verify::{Verified, VerifyError};
