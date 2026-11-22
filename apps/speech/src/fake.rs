//! Moteur factice, pour les tests seulement (feature `fake-engine`, absente
//! du module livré) : un delta par seconde d'audio, un énoncé fermé au commit
//! avec deux intervenants (ou aucun sans diarisation). Langue acceptée :
//! `fr-FR`.

use crate::engine::{Engine, EngineError, Recognizer};
use crate::protocol::{Event, SessionConfig, Word};

pub struct FakeEngine;

struct FakeRecognizer {
    samples: usize,
    diarization: bool,
}

impl Engine for FakeEngine {
    fn open(&self, config: &SessionConfig) -> Result<Box<dyn Recognizer>, EngineError> {
        if config.language != "fr-FR" {
            return Err(EngineError("unsupported language"));
        }
        Ok(Box::new(FakeRecognizer {
            samples: 0,
            diarization: config.diarization,
        }))
    }
}

impl Recognizer for FakeRecognizer {
    fn push(&mut self, samples: &[f32]) -> Result<Vec<Event>, EngineError> {
        let before = self.samples / 16_000;
        self.samples += samples.len();
        let after = self.samples / 16_000;
        Ok((before..after)
            .map(|i| {
                Event::Delta(if i == 0 {
                    "Bonjour".into()
                } else {
                    " toi".into()
                })
            })
            .collect())
    }

    fn finish(&mut self) -> Result<Vec<Event>, EngineError> {
        let speaker = |n| self.diarization.then_some(n);
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
}
