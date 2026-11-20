//! Délai du chien de garde du flux temps réel, croissant tant que les
//! reconnexions ne produisent rien (issue 571).
//!
//! Sur un fond sonore sans parole, l'énergie dépasse le seuil d'« audio
//! actif » alors que le serveur n'a rien à transcrire : le chien de garde
//! coupait toutes les ~30 s. Une reconnexion rejoue l'audio sur une
//! connexion neuve ; si celle-ci ne produit rien non plus, le serveur n'a
//! rien à dire sur cet audio, il n'est pas bloqué. Chaque arrêt sans progrès
//! double donc le délai de la connexion suivante (30, 60, 120, 240 s, plafond
//! 300 s) ; tout progrès le ramène à 30 s.
//!
//! L'état vit dans la session (`SessionContext`) et traverse les
//! redémarrages du listener, comme la transcription en cours.

use std::sync::{Arc, Mutex};
use std::time::Duration;

pub(crate) const BASE_PROGRESS_TIMEOUT: Duration = Duration::from_secs(30);
pub(crate) const MAX_PROGRESS_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug)]
pub struct StallBackoff {
    base: Duration,
    max: Duration,
    current: Duration,
}

pub type SharedStallBackoff = Arc<Mutex<StallBackoff>>;

impl Default for StallBackoff {
    fn default() -> Self {
        Self::new(BASE_PROGRESS_TIMEOUT, MAX_PROGRESS_TIMEOUT)
    }
}

impl StallBackoff {
    pub(crate) fn new(base: Duration, max: Duration) -> Self {
        Self {
            base,
            max,
            current: base,
        }
    }

    /// Délai sans progrès au bout duquel la connexion est jugée bloquée.
    pub(crate) fn progress_timeout(&self) -> Duration {
        self.current
    }

    /// Arrêt par le chien de garde sans aucun progrès : la connexion suivante
    /// attend deux fois plus longtemps, dans la limite du plafond.
    pub(crate) fn record_stall(&mut self) {
        self.current = self.current.saturating_mul(2).min(self.max);
    }

    /// Le serveur a produit du texte : retour au délai de base.
    pub(crate) fn record_progress(&mut self) {
        self.current = self.base;
    }
}
