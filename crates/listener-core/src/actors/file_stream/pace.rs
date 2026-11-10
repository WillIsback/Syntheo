//! Rythme d'envoi d'un fichier dans le flux temps réel (issue 463).
//!
//! Un micro ne peut pas aller plus vite que le temps réel ; un fichier, si.
//! L'envoi accélère tant que le serveur suit (sa transcription finalisée reste
//! à moins de `max_lead` de l'audio envoyé), sans jamais dépasser `max_speed`,
//! et ne descend jamais sous le temps réel : un silence, qui ne produit aucun
//! mot, avance comme pendant une écoute en direct.

use std::time::Duration;

/// Plafond prudent : un serveur sur site partagé ne doit pas être saturé.
pub const DEFAULT_MAX_SPEED: f64 = 4.0;
/// Bien en deçà des 90 s d'audio non finalisé qui déclenchent la reconnexion
/// du listener (`MAX_UNFINALIZED_AUDIO_SAMPLES`).
pub const DEFAULT_MAX_LEAD: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FileStreamPace {
    /// Jamais plus de `max_speed` fois le temps réel.
    pub max_speed: f64,
    /// Avance maximale de l'envoi sur la dernière transcription finalisée.
    pub max_lead: Duration,
}

impl Default for FileStreamPace {
    fn default() -> Self {
        Self {
            max_speed: DEFAULT_MAX_SPEED,
            max_lead: DEFAULT_MAX_LEAD,
        }
    }
}

impl FileStreamPace {
    /// Rythme d'une écoute en direct : le repli quand le serveur refuse
    /// l'accélération.
    pub fn realtime(self) -> Self {
        Self {
            max_speed: 1.0,
            ..self
        }
    }

    pub fn is_accelerated(&self) -> bool {
        self.max_speed > 1.0
    }

    /// Position (en échantillons) que l'envoi peut atteindre `elapsed` après le
    /// début de la connexion, partie de `start`. `transcribed` est la fin de la
    /// dernière transcription finalisée.
    pub(super) fn allowed_position(
        &self,
        start: usize,
        elapsed: Duration,
        transcribed: usize,
        sample_rate: u32,
    ) -> usize {
        let realtime = start + samples_for(elapsed.as_secs_f64(), sample_rate);
        let fast = start + samples_for(elapsed.as_secs_f64() * self.max_speed, sample_rate);
        let lead = transcribed.max(start) + samples_for(self.max_lead.as_secs_f64(), sample_rate);
        realtime.max(fast.min(lead))
    }
}

/// Où reprendre après une coupure : un peu avant la fin de la dernière
/// transcription finalisée (le moteur écarte les mots déjà livrés), sans
/// rejouer plus de `max_replay` échantillons ni dépasser l'audio déjà envoyé.
pub(super) fn resume_position(
    transcribed: usize,
    sent: usize,
    overlap: usize,
    max_replay: usize,
) -> usize {
    transcribed
        .saturating_sub(overlap)
        .max(sent.saturating_sub(max_replay))
        .min(sent)
}

/// Attente avant une nouvelle tentative : 1, 2, 4… fois `base`, plafonnée.
pub(super) fn retry_delay(failures: u32, base: Duration, max: Duration) -> Duration {
    let factor = 1u32 << failures.saturating_sub(1).min(16);
    base.saturating_mul(factor).min(max)
}

pub(super) fn samples_for(secs: f64, sample_rate: u32) -> usize {
    if !secs.is_finite() || secs <= 0.0 {
        return 0;
    }
    (secs * f64::from(sample_rate)) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 16_000;

    #[test]
    fn sends_faster_than_realtime_while_the_server_keeps_up() {
        let pace = FileStreamPace::default();
        let allowed = pace.allowed_position(0, Duration::from_secs(2), 6 * RATE as usize, RATE);
        assert_eq!(allowed, 8 * RATE as usize, "4x for 2 s");
    }

    #[test]
    fn lead_over_the_transcript_caps_the_acceleration() {
        let pace = FileStreamPace::default();
        let allowed = pace.allowed_position(0, Duration::from_secs(10), RATE as usize, RATE);
        assert_eq!(allowed, 21 * RATE as usize, "transcript at 1 s + 20 s lead");
    }

    #[test]
    fn never_slower_than_realtime_even_without_words() {
        let pace = FileStreamPace::default();
        let allowed = pace.allowed_position(0, Duration::from_secs(60), 0, RATE);
        assert_eq!(allowed, 60 * RATE as usize);
    }

    #[test]
    fn realtime_fallback_stays_at_realtime() {
        let pace = FileStreamPace::default().realtime();
        assert!(!pace.is_accelerated());
        let allowed = pace.allowed_position(
            RATE as usize,
            Duration::from_secs(3),
            100 * RATE as usize,
            RATE,
        );
        assert_eq!(allowed, 4 * RATE as usize);
    }

    #[test]
    fn resume_replays_a_little_before_the_transcript_end() {
        assert_eq!(resume_position(10_000, 50_000, 1_000, 30_000), 20_000);
        assert_eq!(resume_position(40_000, 50_000, 1_000, 30_000), 39_000);
        assert_eq!(resume_position(0, 0, 1_000, 30_000), 0);
        assert_eq!(resume_position(60_000, 50_000, 1_000, 30_000), 50_000);
    }

    #[test]
    fn retry_delay_doubles_and_is_capped() {
        let base = Duration::from_secs(1);
        let max = Duration::from_secs(8);
        assert_eq!(retry_delay(1, base, max), Duration::from_secs(1));
        assert_eq!(retry_delay(2, base, max), Duration::from_secs(2));
        assert_eq!(retry_delay(3, base, max), Duration::from_secs(4));
        assert_eq!(retry_delay(9, base, max), max);
    }
}
