//! Sonde de la transcription sur le poste (issue 682) : caractéristiques
//! statiques, micro-banc sans modèle, prédiction du RTF par moteur et
//! décision « proposer, proposer en profil dégradé, ne pas proposer ».
//! Rien n'est téléchargé.

pub mod bench;
pub mod hardware;
pub mod predict;

pub use bench::BenchResult;
pub use hardware::{Gpu, Hardware, PowerPlan};
pub use predict::{Engine, Probe, Profile, ProfileRtfs, Refusal, Verdict};
