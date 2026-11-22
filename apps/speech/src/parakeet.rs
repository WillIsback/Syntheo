//! Moteur A : parakeet-rs 0.4.4 (ONNX Runtime). Nemotron 3.5 en flux (tranches
//! de 560 ms, géométrie de l'export ONNX) et diarisation Nemotron-3 (Sortformer
//! v3, préréglage `low_latency` de NVIDIA, 1,04 s).
//!
//! - Le modèle ASR est chargé une fois et partagé par les sessions ; chaque
//!   session a son état de décodage. La diarisation est chargée par session.
//! - Découpage en énoncés, horodatage des mots et intervenants : module
//!   `segment`, indépendant du modèle et testé sans lui. Taille de tranche lue
//!   dans le modèle.
//! - Un échec de la diarisation dégrade la session en « sans intervenant » ;
//!   la transcription continue.
//! - Non pris en charge par parakeet-rs : `speech_contexts` (mots favorisés) et
//!   `max_speaker_count`, ignorés.

use std::path::{Path, PathBuf};

use parakeet_rs::sortformer::{DiarizationConfig, Sortformer, SpeakerSegment, StreamingProfile};
use parakeet_rs::{ExecutionConfig, Nemotron, NemotronHandle};

use crate::engine::{DiarizationLevel, Engine, EngineError, Recognizer};
use crate::protocol::{Event, SAMPLE_RATE, SessionConfig};
use crate::segment::{Segmenter, Token};

pub struct ParakeetEngine {
    asr: NemotronHandle,
    diarizer: Option<PathBuf>,
    config: ExecutionConfig,
}

impl ParakeetEngine {
    /// `models` contient `nemotron/` (encoder.onnx, decoder_joint.onnx,
    /// tokenizer.model) et, si présent, `diar/nemotron3_diar_v3.onnx`.
    /// `threads` : fils ONNX Runtime par session.
    pub fn load(models: &Path, threads: usize) -> Result<Self, EngineError> {
        let environment = parakeet_rs::ort::init()
            .with_name("syntheo-speech")
            .build()
            .map_err(|_| EngineError("onnx runtime failed to start"))?;
        let config = ExecutionConfig::new()
            .with_environment(environment)
            .with_intra_threads(threads.max(1))
            .with_inter_threads(1);
        let asr = NemotronHandle::from_pretrained(models.join("nemotron"), Some(config.clone()))
            .map_err(|_| EngineError("speech model failed to load"))?;
        let diarizer = models.join("diar").join("nemotron3_diar_v3.onnx");
        Ok(Self {
            asr,
            diarizer: diarizer.is_file().then_some(diarizer),
            config,
        })
    }
}

impl ParakeetEngine {
    /// Configuration ONNX Runtime du moteur : un seul environnement par
    /// processus, à réutiliser pour tout autre modèle (essais).
    pub fn execution_config(&self) -> ExecutionConfig {
        self.config.clone()
    }
}

impl Engine for ParakeetEngine {
    fn open(&self, session: &SessionConfig) -> Result<Box<dyn Recognizer>, EngineError> {
        let mut asr = Nemotron::from_shared(&self.asr);
        if asr.mode() == parakeet_rs::NemotronMode::Multilingual {
            asr.set_target_lang(&session.language)
                .map_err(|_| EngineError("unsupported language"))?;
        }
        let diarizer_source = match (&self.diarizer, session.diarization) {
            (Some(path), true) => Some((path.clone(), self.config.clone())),
            _ => None,
        };
        // Un échec de la diarisation dégrade la session en « sans
        // intervenant » : la transcription continue.
        let diarizer = diarizer_source
            .as_ref()
            .and_then(|source| load_diarizer(source, DiarizationLevel::Full));
        // Taille de tranche lue dans le modèle (géométrie de l'export ONNX).
        let chunk = asr.chunk_samples();
        if chunk == 0 {
            return Err(EngineError("speech model has no streaming geometry"));
        }
        let level = if diarizer.is_some() {
            DiarizationLevel::Full
        } else {
            DiarizationLevel::Off
        };
        Ok(Box::new(ParakeetRecognizer {
            asr,
            diarizer,
            diarizer_source,
            level,
            diarizer_offset: 0,
            chunk,
            pending: Vec::new(),
            fed: 0,
            received: 0,
            segmenter: Segmenter::new(
                f64::from(session.endpointing_ms) / 1000.0,
                chunk as f64 / f64::from(SAMPLE_RATE),
            ),
            speakers: Speakers::default(),
        }))
    }
}

/// Segments de diarisation reçus, et dernier intervenant connu.
#[derive(Default)]
struct Speakers {
    segments: Vec<SpeakerSegment>,
    last: Option<u32>,
    enabled: bool,
    /// Génération du diarizer : à chaque changement de niveau, le diarizer
    /// repart de zéro et renumérote les voix dans l'ordre où il les entend.
    /// Les étiquettes d'une nouvelle génération sont donc distinctes des
    /// précédentes (discontinuité signalée) : l'application ne fusionne pas
    /// deux personnes, au prix de scinder parfois la même.
    generation: u32,
}

/// Voix distinguées par le diarizer (Sortformer : 4).
const SPEAKERS_PER_GENERATION: u32 = 4;

impl Speakers {
    /// Intervenant à l'instant `at` : segment qui le couvre, ou le dernier
    /// connu quand la diarisation n'a pas encore rattrapé ; `None` sans
    /// diarisation.
    fn at(&mut self, at: f64) -> Option<u32> {
        if !self.enabled {
            return None;
        }
        let sample = (at * f64::from(SAMPLE_RATE)) as u64;
        let found = self
            .segments
            .iter()
            .rev()
            .find(|s| s.start <= sample && sample < s.end)
            .map(|s| s.speaker_id as u32 + 1 + self.generation * SPEAKERS_PER_GENERATION);
        if found.is_some() {
            self.last = found;
        }
        found.or(self.last)
    }

    /// Oublie les segments finis avant `before` (secondes).
    fn forget_before(&mut self, before: f64) {
        let sample = (before * f64::from(SAMPLE_RATE)) as u64;
        self.segments.retain(|s| s.end >= sample);
    }
}

/// Profil de diarisation d'un niveau : `low_latency` de NVIDIA (1,04 s) en
/// complet ; en espacé, des tranches trois fois plus longues (2,2 s) : trois
/// fois moins de passes sur le cache des intervenants (issue 686).
fn diarization_profile(level: DiarizationLevel) -> StreamingProfile {
    match level {
        DiarizationLevel::Spaced => StreamingProfile {
            chunk_len: 27,
            ..StreamingProfile::low_latency()
        },
        _ => StreamingProfile::low_latency(),
    }
}

fn load_diarizer(
    source: &(PathBuf, ExecutionConfig),
    level: DiarizationLevel,
) -> Option<Sortformer> {
    Sortformer::with_config(
        &source.0,
        Some(source.1.clone()),
        DiarizationConfig::default(),
    )
    .and_then(|mut diarizer| {
        diarizer.set_profile(diarization_profile(level))?;
        Ok(diarizer)
    })
    .map_err(|_| crate::server::log("diarization unavailable; session without speakers"))
    .ok()
}

struct ParakeetRecognizer {
    asr: Nemotron,
    diarizer: Option<Sortformer>,
    /// Modèle et configuration de la diarisation, si la session la demande :
    /// pour la recharger quand la charge redescend.
    diarizer_source: Option<(PathBuf, ExecutionConfig)>,
    level: DiarizationLevel,
    /// Le diarizer repart de zéro à chaque changement de profil : décalage
    /// (en échantillons) de ses segments dans le flux.
    diarizer_offset: u64,
    /// Échantillons par tranche, lus dans le modèle.
    chunk: usize,
    /// Audio pas encore remis au modèle (moins d'une tranche).
    pending: Vec<f32>,
    /// Échantillons remis au modèle, silence de fin compris.
    fed: u64,
    /// Échantillons réellement reçus du client.
    received: u64,
    segmenter: Segmenter,
    speakers: Speakers,
}

impl ParakeetRecognizer {
    fn seconds(samples: u64) -> f64 {
        samples as f64 / f64::from(SAMPLE_RATE)
    }

    /// Une tranche complète : décodage, diarisation, découpage.
    fn decode(&mut self, chunk: &[f32]) -> Result<Vec<Event>, EngineError> {
        let start = Self::seconds(self.fed);
        let tokens = self
            .asr
            .transcribe_chunk_with_tokens(chunk)
            .map_err(|_| EngineError("recognition failed"))?;
        self.speakers.enabled = self.diarizer.is_some();
        if let Some(diarizer) = self.diarizer.as_mut() {
            match diarizer.feed(chunk) {
                Ok(segments) => {
                    let offset = self.diarizer_offset;
                    self.speakers
                        .segments
                        .extend(segments.into_iter().map(|mut s| {
                            s.start += offset;
                            s.end += offset;
                            s
                        }));
                }
                Err(_) => {
                    // La transcription continue, sans intervenant.
                    crate::server::log("diarization failed: continuing without speakers");
                    self.diarizer = None;
                    self.diarizer_source = None;
                    self.level = DiarizationLevel::Off;
                    self.speakers.enabled = false;
                }
            }
        }
        self.fed += chunk.len() as u64;
        let end = Self::seconds(self.fed);
        let tokens: Vec<Token> = tokens
            .into_iter()
            .map(|t| Token {
                text: t.text,
                frame: t.local_frame,
                logprob: t.logprob,
            })
            .collect();
        let speakers = &mut self.speakers;
        let events = self
            .segmenter
            .chunk(start, end, &tokens, &mut |at| speakers.at(at));
        if events.iter().any(|e| matches!(e, Event::Completed { .. })) {
            speakers.forget_before(start - 2.0);
        }
        Ok(events)
    }
}

impl Recognizer for ParakeetRecognizer {
    fn push(&mut self, samples: &[f32]) -> Result<Vec<Event>, EngineError> {
        self.received += samples.len() as u64;
        self.pending.extend_from_slice(samples);
        let mut events = Vec::new();
        while self.pending.len() >= self.chunk {
            let chunk: Vec<f32> = self.pending.drain(..self.chunk).collect();
            events.extend(self.decode(&chunk)?);
        }
        Ok(events)
    }

    fn finish(&mut self) -> Result<Vec<Event>, EngineError> {
        let mut events = Vec::new();
        // Dernière tranche complétée par du silence, puis une tranche de
        // silence pour vider le décodeur.
        if !self.pending.is_empty() {
            let mut last = std::mem::take(&mut self.pending);
            last.resize(self.chunk, 0.0);
            events.extend(self.decode(&last)?);
        }
        events.extend(self.decode(&vec![0.0; self.chunk])?);
        if let Some(diarizer) = self.diarizer.as_mut()
            && let Ok(segments) = diarizer.flush()
        {
            let offset = self.diarizer_offset;
            self.speakers
                .segments
                .extend(segments.into_iter().map(|mut s| {
                    s.start += offset;
                    s.end += offset;
                    s
                }));
        }
        let audio_end = Self::seconds(self.received);
        let speakers = &mut self.speakers;
        events.extend(self.segmenter.finish(audio_end, &mut |at| speakers.at(at)));
        Ok(events)
    }

    fn diarization(&self) -> DiarizationLevel {
        self.level
    }

    /// Change de profil (l'état du diarizer repart de zéro, ses segments sont
    /// décalés de l'audio déjà remis) ; coupée : le diarizer est libéré ;
    /// au retour, il est rechargé depuis son modèle.
    fn set_diarization(&mut self, level: DiarizationLevel) {
        // Même niveau : rien à changer (pas de remise à zéro du diarizer).
        if level == self.level {
            return;
        }
        let Some(source) = self.diarizer_source.as_ref() else {
            return;
        };
        if level == DiarizationLevel::Off {
            self.diarizer = None;
            self.level = DiarizationLevel::Off;
            return;
        }
        let ok = match self.diarizer.as_mut() {
            Some(diarizer) => diarizer.set_profile(diarization_profile(level)).is_ok(),
            None => {
                self.diarizer = load_diarizer(source, level);
                self.diarizer.is_some()
            }
        };
        if ok {
            self.level = level;
            self.diarizer_offset = self.fed;
            // Nouvel état du diarizer : nouvelle génération d'étiquettes,
            // et plus de « dernier intervenant » hérité de l'ancienne.
            self.speakers.generation += 1;
            self.speakers.last = None;
        } else {
            self.diarizer = None;
            self.level = DiarizationLevel::Off;
        }
    }
}
