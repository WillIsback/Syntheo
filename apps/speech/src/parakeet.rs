//! Moteur A : parakeet-rs 0.4.4 (ONNX Runtime). Nemotron 3.5 en flux (tranches
//! de 560 ms, géométrie de l'export ONNX) et diarisation Nemotron-3 (Sortformer
//! v3, préréglage `low_latency` de NVIDIA, 1,04 s).
//!
//! - Le modèle ASR est chargé une fois et partagé par les sessions ; chaque
//!   session a son état de décodage. La diarisation est chargée par session.
//! - Découpage en énoncés : après le silence de fin d'énoncé demandé
//!   (`endpointing_ms`) sans nouveau mot, l'énoncé se ferme au mot suivant, ou
//!   après une tranche de grâce sans jeton ; un jeton qui continue le dernier
//!   mot (ponctuation émise en retard) le rejoint.
//! - Horodatage des mots : trame de l'encodeur (80 ms) où le premier jeton du
//!   mot est émis, rapportée au début de la tranche traitée.
//! - Intervenant d'un mot : segment de diarisation qui couvre son milieu, ou le
//!   dernier intervenant connu quand la diarisation n'a pas encore rattrapé.
//! - Non pris en charge par parakeet-rs : `speech_contexts` (mots favorisés) et
//!   `max_speaker_count`, ignorés.

use std::path::{Path, PathBuf};

use parakeet_rs::sortformer::{DiarizationConfig, Sortformer, SpeakerSegment, StreamingProfile};
use parakeet_rs::{ExecutionConfig, Nemotron, NemotronHandle};

use crate::engine::{Engine, EngineError, Recognizer};
use crate::protocol::{Event, SAMPLE_RATE, SessionConfig, Word};

/// Tranche de 560 ms de l'export ONNX.
const CHUNK: usize = 8960;
/// Une trame de l'encodeur : 80 ms.
const FRAME_SECONDS: f64 = 0.08;
/// Après le silence de fin d'énoncé, une tranche de grâce : le modèle émet
/// parfois la ponctuation ou la fin d'un mot une tranche plus tard.
const GRACE_SECONDS: f64 = 0.56;

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
        let diarizer = match (&self.diarizer, session.diarization) {
            (Some(path), true) => {
                let mut diarizer = Sortformer::with_config(
                    path,
                    Some(self.config.clone()),
                    DiarizationConfig::default(),
                )
                .map_err(|_| EngineError("diarization model failed to load"))?;
                diarizer
                    .set_profile(StreamingProfile::low_latency())
                    .map_err(|_| EngineError("diarization model failed to load"))?;
                Some(diarizer)
            }
            _ => None,
        };
        Ok(Box::new(ParakeetRecognizer {
            asr,
            diarizer,
            pending: Vec::new(),
            fed: 0,
            utterance: Utterance::default(),
            segments: Vec::new(),
            last_speaker: None,
            silence_limit: f64::from(session.endpointing_ms) / 1000.0,
            word_pending: false,
        }))
    }
}

/// Énoncé ouvert : mots en cours et instant du dernier mot.
#[derive(Default)]
struct Utterance {
    words: Vec<OpenWord>,
    last_word_at: f64,
}

struct OpenWord {
    text: String,
    start: f64,
    logprob_sum: f32,
    tokens: u32,
}

struct ParakeetRecognizer {
    asr: Nemotron,
    diarizer: Option<Sortformer>,
    /// Audio pas encore remis au modèle (moins d'une tranche).
    pending: Vec<f32>,
    /// Échantillons déjà remis.
    fed: u64,
    utterance: Utterance,
    segments: Vec<SpeakerSegment>,
    last_speaker: Option<u32>,
    silence_limit: f64,
    /// Le dernier jeton était un « ▁ » seul.
    word_pending: bool,
}

impl ParakeetRecognizer {
    fn seconds(&self) -> f64 {
        self.fed as f64 / f64::from(SAMPLE_RATE)
    }

    /// Une tranche complète : décodage, diarisation, découpage.
    fn chunk(&mut self, chunk: &[f32], events: &mut Vec<Event>) -> Result<(), EngineError> {
        let chunk_start = self.seconds();
        let tokens = self
            .asr
            .transcribe_chunk_with_tokens(chunk)
            .map_err(|_| EngineError("recognition failed"))?;
        if let Some(diarizer) = self.diarizer.as_mut() {
            let segments = diarizer
                .feed(chunk)
                .map_err(|_| EngineError("diarization failed"))?;
            self.segments.extend(segments);
        }
        self.fed += chunk.len() as u64;
        let mut delta = String::new();
        for token in tokens {
            // Étiquette de langue (`<fr-FR>`) en détection automatique.
            if token.text.starts_with('<') && token.text.ends_with('>') {
                continue;
            }
            let piece = token.text.replace('\u{2581}', " ");
            if piece.is_empty() {
                continue;
            }
            let at = chunk_start + token.local_frame as f64 * FRAME_SECONDS;
            let text = piece.trim_start();
            // Un jeton « ▁ » seul annonce un nouveau mot sans en porter les
            // lettres : le jeton suivant ouvre le mot.
            if text.is_empty() {
                self.word_pending = true;
                continue;
            }
            // La ponctuation se colle au mot précédent, même précédée d'un « ▁ »,
            // comme dans le texte du décodeur.
            let punctuation = !text.chars().any(char::is_alphanumeric);
            // Ponctuation arrivée après la fermeture de l'énoncé : elle ne peut
            // plus rejoindre son mot, déjà envoyé, et n'ouvre pas de phrase.
            if punctuation && self.utterance.words.is_empty() {
                continue;
            }
            let pending = std::mem::take(&mut self.word_pending);
            let starts_word = self.utterance.words.is_empty()
                || (!punctuation && (piece.starts_with(' ') || pending));
            // Un nouveau mot après le silence de fin d'énoncé ferme l'énoncé
            // ouvert ; un jeton qui continue le dernier mot (ponctuation,
            // fin de mot émise en retard) le rejoint.
            if starts_word
                && !self.utterance.words.is_empty()
                && chunk_start - self.utterance.last_word_at >= self.silence_limit
            {
                if !delta.is_empty() {
                    events.push(Event::Delta(std::mem::take(&mut delta)));
                }
                events.push(self.close_utterance());
            }
            if starts_word {
                self.utterance.words.push(OpenWord {
                    text: text.to_owned(),
                    start: at,
                    logprob_sum: token.logprob,
                    tokens: 1,
                });
            } else if let Some(word) = self.utterance.words.last_mut() {
                word.text.push_str(text);
                word.logprob_sum += token.logprob;
                word.tokens += 1;
            }
            // Le premier mot d'un énoncé ne commence pas par une espace.
            if starts_word && !(delta.is_empty() && self.utterance.words.len() == 1) {
                delta.push(' ');
            }
            delta.push_str(text);
            self.utterance.last_word_at = self.seconds();
        }
        if !delta.is_empty() {
            events.push(Event::Delta(delta));
        }
        // Sans aucun jeton pendant le silence et une tranche de grâce : fermé.
        if !self.utterance.words.is_empty()
            && self.seconds() - self.utterance.last_word_at >= self.silence_limit + GRACE_SECONDS
        {
            events.push(self.close_utterance());
        }
        Ok(())
    }

    fn speaker_at(&mut self, at: f64) -> Option<u32> {
        self.diarizer.as_ref()?;
        let sample = (at * f64::from(SAMPLE_RATE)) as u64;
        let found = self
            .segments
            .iter()
            .rev()
            .find(|s| s.start <= sample && sample < s.end)
            .map(|s| s.speaker_id as u32 + 1);
        if found.is_some() {
            self.last_speaker = found;
        }
        found.or(self.last_speaker)
    }

    fn close_utterance(&mut self) -> Event {
        let words = std::mem::take(&mut self.utterance.words);
        let ends: Vec<f64> = words
            .iter()
            .skip(1)
            .map(|w| w.start)
            .chain(std::iter::once(self.utterance.last_word_at))
            .collect();
        let words: Vec<Word> = words
            .into_iter()
            .zip(ends)
            .map(|(word, end)| {
                let end = end.max(word.start + FRAME_SECONDS);
                let speaker = self.speaker_at((word.start + end) / 2.0);
                Word {
                    confidence: f64::from((word.logprob_sum / word.tokens as f32).exp())
                        .clamp(0.0, 1.0),
                    word: word.text,
                    start: word.start,
                    end,
                    speaker,
                }
            })
            .collect();
        // Segments de diarisation déjà dépassés : plus utiles.
        if let Some(first) = words.first() {
            let keep_from = (first.start * f64::from(SAMPLE_RATE)) as u64;
            self.segments.retain(|s| s.end >= keep_from);
        }
        let transcript = words
            .iter()
            .map(|w| w.word.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        Event::Completed { transcript, words }
    }
}

impl Recognizer for ParakeetRecognizer {
    fn push(&mut self, samples: &[f32]) -> Result<Vec<Event>, EngineError> {
        self.pending.extend_from_slice(samples);
        let mut events = Vec::new();
        while self.pending.len() >= CHUNK {
            let chunk: Vec<f32> = self.pending.drain(..CHUNK).collect();
            self.chunk(&chunk, &mut events)?;
        }
        Ok(events)
    }

    fn finish(&mut self) -> Result<Vec<Event>, EngineError> {
        let mut events = Vec::new();
        // Dernière tranche complétée par du silence, puis une tranche de
        // silence pour vider le décodeur.
        if !self.pending.is_empty() {
            let mut last = std::mem::take(&mut self.pending);
            last.resize(CHUNK, 0.0);
            self.chunk(&last, &mut events)?;
        }
        self.chunk(&[0.0; CHUNK], &mut events)?;
        if let Some(diarizer) = self.diarizer.as_mut() {
            let segments = diarizer
                .flush()
                .map_err(|_| EngineError("diarization failed"))?;
            self.segments.extend(segments);
        }
        if !self.utterance.words.is_empty() {
            events.push(self.close_utterance());
        }
        Ok(events)
    }
}
