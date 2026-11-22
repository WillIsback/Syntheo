//! Module `syntheo-speech` (issue 681) : serveur de transcription sur le
//! poste, lancé par l'application et joignable seulement sur la boucle locale.
//! Il parle le protocole temps réel de NeMo-Speech.cpp, celui de l'adaptateur
//! `nvidia` de l'application. Le moteur est derrière un trait : A
//! (parakeet-rs) d'abord, B (NeMo-Speech.cpp) ensuite si le banc le retient.
//!
//! Sécurité (exigences de l'epic 631) : boucle locale seulement ; jeton
//! aléatoire par lancement, lu sur l'entrée standard, jamais sur la ligne de
//! commande ni dans un journal ; authentification dans les deux sens avant
//! l'audio ; requêtes de navigateur refusées ; aucune connexion sortante ;
//! journaux sans texte transcrit.

pub mod auth;
pub mod engine;
#[cfg(feature = "fake-engine")]
pub mod fake;
pub mod load;
#[cfg(feature = "parakeet")]
pub mod parakeet;
pub mod protocol;
pub mod segment;
pub mod server;
