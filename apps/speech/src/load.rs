//! Suivi de charge pendant l'écoute (issue 686) : retard de chaque session,
//! RTF, et dégradation automatique de la diarisation. Au-delà de 2 s de
//! retard, la diarisation est espacée, puis coupée ; elle revient quand le
//! retard redescend sous 1 s assez longtemps. Les mesures sont publiées sur
//! la sortie standard pour l'application (des nombres et des états, jamais de
//! texte).

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::engine::DiarizationLevel;

/// Retard au-delà duquel la diarisation descend d'un niveau.
pub const DEGRADE_ABOVE: Duration = Duration::from_secs(2);
/// Retard sous lequel elle peut remonter.
pub const RECOVER_BELOW: Duration = Duration::from_secs(1);
/// Durée du dépassement avant de descendre.
const DEGRADE_AFTER: Duration = Duration::from_secs(2);
/// Durée sous le seuil bas avant de remonter (doublée après chaque rechute
/// rapide, jusqu'à `MAX_RECOVER_AFTER`).
const RECOVER_AFTER: Duration = Duration::from_secs(60);
const MAX_RECOVER_AFTER: Duration = Duration::from_secs(600);
/// Une descente moins de ce délai après une remontée est une rechute.
const RELAPSE_WITHIN: Duration = Duration::from_secs(120);
/// Pause minimale entre deux changements.
const COOLDOWN: Duration = Duration::from_secs(5);

/// Décide du niveau de diarisation d'une session d'après son retard.
#[derive(Debug)]
pub struct LoadController {
    level: DiarizationLevel,
    /// Niveau demandé par le client : jamais dépassé.
    ceiling: DiarizationLevel,
    above_since: Option<Instant>,
    below_since: Option<Instant>,
    changed_at: Option<Instant>,
    /// Dernière remontée, pour reconnaître une rechute.
    recovered_at: Option<Instant>,
    /// Attente avant de remonter, allongée à chaque rechute (anti-oscillation).
    recover_after: Duration,
}

impl LoadController {
    pub fn new(level: DiarizationLevel) -> Self {
        Self {
            level,
            ceiling: level,
            above_since: None,
            below_since: None,
            changed_at: None,
            recovered_at: None,
            recover_after: RECOVER_AFTER,
        }
    }

    pub fn level(&self) -> DiarizationLevel {
        self.level
    }

    /// Une mesure du retard ; rend le nouveau niveau s'il change.
    pub fn observe(&mut self, lag: Duration, now: Instant) -> Option<DiarizationLevel> {
        if lag > DEGRADE_ABOVE {
            self.below_since = None;
            let since = *self.above_since.get_or_insert(now);
            if now.duration_since(since) >= DEGRADE_AFTER && self.cooled(now) {
                let next = self.level.lower();
                if next != self.level {
                    if self
                        .recovered_at
                        .is_some_and(|at| now.duration_since(at) < RELAPSE_WITHIN)
                    {
                        self.recover_after = (self.recover_after * 2).min(MAX_RECOVER_AFTER);
                    }
                    return Some(self.change(next, now));
                }
            }
        } else if lag < RECOVER_BELOW {
            self.above_since = None;
            let since = *self.below_since.get_or_insert(now);
            if now.duration_since(since) >= self.recover_after
                && self.cooled(now)
                && self.level < self.ceiling
            {
                let next = self.level.higher().min(self.ceiling);
                self.recovered_at = Some(now);
                return Some(self.change(next, now));
            }
        } else {
            self.above_since = None;
            self.below_since = None;
        }
        None
    }

    fn cooled(&self, now: Instant) -> bool {
        self.changed_at
            .is_none_or(|at| now.duration_since(at) >= COOLDOWN)
    }

    fn change(&mut self, level: DiarizationLevel, now: Instant) -> DiarizationLevel {
        self.level = level;
        self.changed_at = Some(now);
        self.above_since = None;
        self.below_since = None;
        level
    }
}

/// Mesures d'une session.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SessionMetrics {
    pub lag_ms: u64,
    /// Temps de calcul / durée d'audio, moyenne glissante.
    pub rtf: f64,
    pub diarization: DiarizationLevel,
    pub audio_s: f64,
}

/// Mesures de toutes les sessions ouvertes.
#[derive(Debug, Default)]
pub struct Registry {
    sessions: Mutex<BTreeMap<u64, SessionMetrics>>,
    next: Mutex<u64>,
}

impl Registry {
    pub fn open(&self) -> u64 {
        let mut next = self.next.lock().unwrap_or_else(|e| e.into_inner());
        *next += 1;
        *next
    }

    pub fn update(&self, id: u64, metrics: SessionMetrics) {
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, metrics);
    }

    pub fn close(&self, id: u64) {
        self.sessions
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
    }

    /// Ligne JSON des mesures, ou `None` sans session ouverte.
    pub fn json_line(&self) -> Option<String> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        if sessions.is_empty() {
            return None;
        }
        let list: Vec<_> = sessions
            .values()
            .map(|m| {
                serde_json::json!({
                    "lag_ms": m.lag_ms,
                    "rtf": (m.rtf * 1000.0).round() / 1000.0,
                    "diarization": m.diarization.as_str(),
                    "audio_s": (m.audio_s * 10.0).round() / 10.0,
                })
            })
            .collect();
        Some(format!(
            "{}\n",
            serde_json::json!({"event": "metrics", "sessions": list})
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secs(s: f64) -> Duration {
        Duration::from_secs_f64(s)
    }

    #[test]
    fn degrades_step_by_step_then_recovers() {
        let t0 = Instant::now();
        let mut c = LoadController::new(DiarizationLevel::Full);
        // Dépassement bref : rien.
        assert_eq!(c.observe(secs(2.5), t0), None);
        assert_eq!(c.observe(secs(0.5), t0 + secs(1.0)), None);
        // Dépassement soutenu : espacée.
        assert_eq!(c.observe(secs(2.5), t0 + secs(2.0)), None);
        assert_eq!(
            c.observe(secs(2.5), t0 + secs(4.0)),
            Some(DiarizationLevel::Spaced)
        );
        // Pause entre deux changements.
        assert_eq!(c.observe(secs(3.0), t0 + secs(6.5)), None);
        assert_eq!(
            c.observe(secs(3.0), t0 + secs(9.5)),
            Some(DiarizationLevel::Off)
        );
        assert_eq!(c.observe(secs(3.0), t0 + secs(20.0)), None);
        // Retour sous 1 s, 60 s durant : un niveau à la fois.
        assert_eq!(c.observe(secs(0.4), t0 + secs(30.0)), None);
        assert_eq!(c.observe(secs(0.4), t0 + secs(60.0)), None);
        assert_eq!(
            c.observe(secs(0.4), t0 + secs(90.0)),
            Some(DiarizationLevel::Spaced)
        );
        assert_eq!(c.observe(secs(0.4), t0 + secs(91.0)), None);
        assert_eq!(
            c.observe(secs(0.4), t0 + secs(151.0)),
            Some(DiarizationLevel::Full)
        );
        assert_eq!(c.observe(secs(0.4), t0 + secs(400.0)), None);
    }

    // Revue de l'issue 686, constat 5 : sous une charge limite, une rechute
    // rapide après une remontée double l'attente avant la remontée suivante.
    #[test]
    fn a_quick_relapse_slows_the_next_recovery() {
        let t0 = Instant::now();
        let mut c = LoadController::new(DiarizationLevel::Full);
        c.observe(secs(2.5), t0);
        assert_eq!(
            c.observe(secs(2.5), t0 + secs(2.0)),
            Some(DiarizationLevel::Spaced)
        );
        c.observe(secs(0.5), t0 + secs(3.0));
        assert_eq!(
            c.observe(secs(0.5), t0 + secs(63.0)),
            Some(DiarizationLevel::Full)
        );
        // Rechute 10 s après la remontée.
        c.observe(secs(2.5), t0 + secs(70.0));
        assert_eq!(
            c.observe(secs(2.5), t0 + secs(72.0)),
            Some(DiarizationLevel::Spaced)
        );
        // 60 s sous le seuil ne suffisent plus : il en faut 120.
        c.observe(secs(0.5), t0 + secs(73.0));
        assert_eq!(c.observe(secs(0.5), t0 + secs(133.0)), None);
        assert_eq!(
            c.observe(secs(0.5), t0 + secs(193.0)),
            Some(DiarizationLevel::Full)
        );
    }

    #[test]
    fn never_exceeds_what_the_client_asked() {
        let t0 = Instant::now();
        let mut c = LoadController::new(DiarizationLevel::Off);
        assert_eq!(c.observe(secs(0.1), t0), None);
        assert_eq!(c.observe(secs(0.1), t0 + secs(100.0)), None);
        assert_eq!(c.level(), DiarizationLevel::Off);
    }

    #[test]
    fn metrics_line_has_numbers_only() {
        let registry = Registry::default();
        assert_eq!(registry.json_line(), None);
        let id = registry.open();
        registry.update(
            id,
            SessionMetrics {
                lag_ms: 420,
                rtf: 0.2345,
                diarization: DiarizationLevel::Spaced,
                audio_s: 12.34,
            },
        );
        let line = registry.json_line().unwrap();
        let value: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(value["event"], "metrics");
        assert_eq!(value["sessions"][0]["lag_ms"], 420);
        assert_eq!(value["sessions"][0]["diarization"], "spaced");
        registry.close(id);
        assert_eq!(registry.json_line(), None);
    }
}
