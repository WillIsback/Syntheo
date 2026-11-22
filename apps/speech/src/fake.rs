//! Moteur factice, pour les tests seulement (feature `fake-engine`, absente
//! du module livré) : un delta par seconde d'audio, un énoncé fermé au commit
//! avec deux intervenants (ou aucun sans diarisation). Langue acceptée :
//! `fr-FR`.
//!
//! Avec un coût simulé (`--fake-cost`, issue 686) : chaque seconde d'audio
//! coûte un temps de calcul qui dépend du niveau de diarisation, sous un
//! verrou commun aux sessions (comme des cœurs partagés), et un énoncé est
//! fermé toutes les deux secondes d'audio, pour mesurer le retard des finals.

use std::sync::Mutex;
use std::time::Duration;

use crate::engine::{DiarizationLevel, Engine, EngineError, Recognizer};
use crate::protocol::{Event, SessionConfig, Word};

/// Secondes de calcul par seconde d'audio, selon la diarisation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FakeCost {
    pub full: f64,
    pub spaced: f64,
    pub off: f64,
}

impl FakeCost {
    /// `complète,espacée,coupée`, par exemple `0.6,0.4,0.2`.
    pub fn parse(text: &str) -> Option<Self> {
        let mut parts = text.split(',').map(|p| p.trim().parse::<f64>().ok());
        let cost = Self {
            full: parts.next()??,
            spaced: parts.next()??,
            off: parts.next()??,
        };
        (parts.next().is_none()
            && [cost.full, cost.spaced, cost.off]
                .iter()
                .all(|c| (0.0..10.0).contains(c)))
        .then_some(cost)
    }

    fn of(&self, level: DiarizationLevel) -> f64 {
        match level {
            DiarizationLevel::Full => self.full,
            DiarizationLevel::Spaced => self.spaced,
            DiarizationLevel::Off => self.off,
        }
    }
}

/// Le calcul simulé de toutes les sessions passe par ce verrou.
static SHARED_CPU: Mutex<()> = Mutex::new(());

#[derive(Default)]
pub struct FakeEngine {
    pub cost: Option<FakeCost>,
}

struct FakeRecognizer {
    samples: usize,
    diarization: DiarizationLevel,
    cost: Option<FakeCost>,
    /// Échantillons déjà fermés en énoncés (coût simulé seulement).
    closed: usize,
}

impl Engine for FakeEngine {
    fn open(&self, config: &SessionConfig) -> Result<Box<dyn Recognizer>, EngineError> {
        if config.language != "fr-FR" {
            return Err(EngineError("unsupported language"));
        }
        Ok(Box::new(FakeRecognizer {
            samples: 0,
            diarization: if config.diarization {
                DiarizationLevel::Full
            } else {
                DiarizationLevel::Off
            },
            cost: self.cost,
            closed: 0,
        }))
    }
}

impl FakeRecognizer {
    fn utterance(&self, start: f64, end: f64) -> Event {
        let speaker = |n| (self.diarization != DiarizationLevel::Off).then_some(n);
        Event::Completed {
            transcript: "Bonjour toi".into(),
            words: vec![
                Word {
                    word: "Bonjour".into(),
                    start,
                    end: start + 0.4,
                    confidence: 0.9,
                    speaker: speaker(1),
                },
                Word {
                    word: "toi".into(),
                    start: end - 0.3,
                    end,
                    confidence: 1.0,
                    speaker: speaker(2),
                },
            ],
        }
    }
}

impl Recognizer for FakeRecognizer {
    fn push(&mut self, samples: &[f32]) -> Result<Vec<Event>, EngineError> {
        let before = self.samples / 16_000;
        self.samples += samples.len();
        let after = self.samples / 16_000;
        let mut events: Vec<Event> = (before..after)
            .map(|i| {
                Event::Delta(if i == 0 {
                    "Bonjour".into()
                } else {
                    " toi".into()
                })
            })
            .collect();
        if let Some(cost) = self.cost {
            let seconds = samples.len() as f64 / 16_000.0;
            let _cpu = SHARED_CPU.lock().unwrap_or_else(|e| e.into_inner());
            std::thread::sleep(Duration::from_secs_f64(seconds * cost.of(self.diarization)));
            drop(_cpu);
            while self.samples - self.closed >= 32_000 {
                let start = self.closed as f64 / 16_000.0;
                self.closed += 32_000;
                events.push(self.utterance(start, self.closed as f64 / 16_000.0));
            }
        }
        Ok(events)
    }

    fn finish(&mut self) -> Result<Vec<Event>, EngineError> {
        if self.cost.is_some() {
            let start = self.closed as f64 / 16_000.0;
            let end = self.samples as f64 / 16_000.0;
            return Ok(if end - start > 0.5 {
                vec![self.utterance(start, end)]
            } else {
                Vec::new()
            });
        }
        let speaker = |n| (self.diarization != DiarizationLevel::Off).then_some(n);
        Ok(vec![Event::Completed {
            transcript: "Bonjour toi".into(),
            words: vec![
                Word {
                    word: "Bonjour".into(),
                    start: 0.5,
                    end: 0.9,
                    confidence: 0.9,
                    speaker: speaker(1),
                },
                Word {
                    word: "toi".into(),
                    start: 1.2,
                    end: 1.5,
                    confidence: 1.0,
                    speaker: speaker(2),
                },
            ],
        }])
    }

    fn diarization(&self) -> DiarizationLevel {
        self.diarization
    }

    fn set_diarization(&mut self, level: DiarizationLevel) {
        self.diarization = level;
    }
}

#[cfg(test)]
mod tests {
    use super::FakeCost;

    #[test]
    fn parses_the_simulated_cost() {
        assert_eq!(
            FakeCost::parse("0.6, 0.4,0.2"),
            Some(FakeCost {
                full: 0.6,
                spaced: 0.4,
                off: 0.2
            })
        );
        assert_eq!(FakeCost::parse("0.6,0.4"), None);
        assert_eq!(FakeCost::parse("a,b,c"), None);
        assert_eq!(FakeCost::parse("0.1,0.1,0.1,0.1"), None);
    }
}
