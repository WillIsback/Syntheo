//! Hôte du programme compagnon de transcription sur le poste `syntheo-speech`
//! (issues 683 et 684) : compagnon livré avec l'application et modèles
//! téléchargés à la demande, vérifiés contre des empreintes compilées avant
//! chaque lancement ; lancement sur la boucle locale avec un jeton par
//! lancement, supervision et arrêt.

pub mod commissioning;
pub mod companion;
pub mod host;
pub mod models;
pub mod verify;

pub use companion::Companion;
pub use host::{HostError, SpeechHost};
pub use verify::{Verified, VerifyError};
