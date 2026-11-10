//! Ce que le listener émet pendant un import : les mots finalisés, gardés en
//! mémoire jusqu'à la fin du fichier, comme le ferait la transcription d'une
//! écoute en direct.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use syntheo_transcript::FinalizedWord;

use crate::{
    ListenerRuntime, LiveTranscriptDelta, SessionDataEvent, SessionErrorEvent,
    SessionLifecycleEvent, SessionProgressEvent,
};

/// Canal des mots d'un import : un seul flux où toutes les voix sont mêlées
/// (`ChannelProfile::MixedCapture`), comme une capture micro seule.
pub const FILE_STREAM_CHANNEL: i32 = 2;

#[derive(Default)]
pub(super) struct Collector {
    order: Vec<String>,
    words: HashMap<String, FinalizedWord>,
    transcribed_ms: i64,
    partial_text: String,
    last_activity: Option<Instant>,
    last_error: Option<String>,
}

impl Collector {
    pub(super) fn apply(&mut self, delta: &LiveTranscriptDelta, now: Instant) {
        for id in &delta.replaced_ids {
            self.words.remove(id);
        }
        for word in &delta.new_words {
            if self.words.insert(word.id.clone(), word.clone()).is_none() {
                self.order.push(word.id.clone());
            }
            self.transcribed_ms = self.transcribed_ms.max(word.end_ms);
        }
        self.partial_text = delta
            .partials
            .iter()
            .map(|word| word.text.as_str())
            .collect::<String>()
            .trim()
            .to_string();
        if !delta.is_empty() {
            self.last_activity = Some(now);
        }
    }

    /// Fin (en ms d'audio du fichier) de la dernière transcription finalisée.
    pub(super) fn transcribed_ms(&self) -> i64 {
        self.transcribed_ms
    }

    pub(super) fn last_activity(&self) -> Option<Instant> {
        self.last_activity
    }

    /// Texte des derniers mots, pour l'aperçu pendant l'import.
    pub(super) fn preview_text(&self) -> Option<String> {
        if !self.partial_text.is_empty() {
            return Some(self.partial_text.clone());
        }
        let tail = self
            .order
            .iter()
            .rev()
            .filter_map(|id| self.words.get(id))
            .take(12)
            .map(|word| word.text.trim())
            .collect::<Vec<_>>();
        (!tail.is_empty()).then(|| tail.into_iter().rev().collect::<Vec<_>>().join(" "))
    }

    pub(super) fn record_error(&mut self, error: String) {
        self.last_error = Some(error);
    }

    pub(super) fn last_error(&self) -> Option<String> {
        self.last_error.clone()
    }

    pub(super) fn finish(&mut self) -> Vec<FinalizedWord> {
        let mut words = std::mem::take(&mut self.order)
            .into_iter()
            .filter_map(|id| self.words.remove(&id))
            .collect::<Vec<_>>();
        words.sort_by_key(|word| word.start_ms);
        words
    }
}

/// Runtime du listener pendant un import : rien n'est écrit, rien n'est
/// annoncé à l'interface de capture, seuls les mots sont recueillis.
pub(super) struct FileStreamRuntime {
    pub(super) collector: Arc<Mutex<Collector>>,
}

impl syntheo_storage::StorageRuntime for FileStreamRuntime {
    fn global_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Err(syntheo_storage::Error::DataDirUnavailable)
    }

    fn vault_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Err(syntheo_storage::Error::DataDirUnavailable)
    }
}

impl ListenerRuntime for FileStreamRuntime {
    fn emit_lifecycle(&self, _event: SessionLifecycleEvent) {}

    fn emit_progress(&self, _event: SessionProgressEvent) {}

    fn emit_error(&self, event: SessionErrorEvent) {
        let SessionErrorEvent::ConnectionError { error, .. } = event else {
            return;
        };
        if let Ok(mut collector) = self.collector.lock() {
            collector.record_error(error);
        }
    }

    fn emit_data(&self, event: SessionDataEvent) {
        let SessionDataEvent::TranscriptDelta { delta, .. } = event else {
            return;
        };
        if let Ok(mut collector) = self.collector.lock() {
            collector.apply(&delta, Instant::now());
        }
    }
}

/// Réponse au format batch : l'import reprend ensuite le chemin d'un fichier
/// transcrit par lot (enregistrement, reprise, synthèse).
pub fn words_to_batch_response(
    words: &[FinalizedWord],
    duration_secs: f64,
    provider: &str,
) -> owhisper_interface::batch::Response {
    use owhisper_interface::batch::{Alternatives, Channel, Response, Results, Word};

    let batch_words = words
        .iter()
        .filter(|word| !word.text.trim().is_empty())
        .map(|word| Word {
            word: word.text.trim().to_string(),
            start: word.start_ms as f64 / 1000.0,
            end: word.end_ms as f64 / 1000.0,
            confidence: 1.0,
            channel: FILE_STREAM_CHANNEL,
            speaker: word
                .speaker_index
                .and_then(|speaker| usize::try_from(speaker).ok()),
            punctuated_word: Some(word.text.trim().to_string()),
        })
        .collect::<Vec<_>>();
    let transcript = batch_words
        .iter()
        .map(|word| word.word.as_str())
        .collect::<Vec<_>>()
        .join(" ");

    let empty = || Channel {
        alternatives: Vec::new(),
    };
    let mut channels = (0..FILE_STREAM_CHANNEL)
        .map(|_| empty())
        .collect::<Vec<_>>();
    channels.push(Channel {
        alternatives: vec![Alternatives {
            transcript,
            confidence: 1.0,
            words: batch_words,
        }],
    });

    Response {
        metadata: serde_json::json!({
            "duration": duration_secs,
            "provider": provider,
            "mode": "realtime_file_stream",
        }),
        results: Results { channels },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use syntheo_transcript::{PartialWord, WordState};

    fn word(id: &str, text: &str, start_ms: i64, speaker: Option<i32>) -> FinalizedWord {
        FinalizedWord {
            id: id.to_string(),
            text: text.to_string(),
            start_ms,
            end_ms: start_ms + 400,
            channel: FILE_STREAM_CHANNEL,
            state: WordState::Final,
            speaker_index: speaker,
        }
    }

    fn delta(new_words: Vec<FinalizedWord>, replaced_ids: Vec<&str>) -> LiveTranscriptDelta {
        LiveTranscriptDelta {
            new_words,
            replaced_ids: replaced_ids.into_iter().map(String::from).collect(),
            partials: Vec::new(),
        }
    }

    #[test]
    fn replaced_words_are_dropped_and_words_come_out_in_time_order() {
        let mut collector = Collector::default();
        let now = Instant::now();
        collector.apply(
            &delta(
                vec![
                    word("b", " world", 1_000, None),
                    word("a", " hello", 0, None),
                ],
                vec![],
            ),
            now,
        );
        collector.apply(
            &delta(vec![word("c", " monde", 1_000, None)], vec!["b"]),
            now,
        );

        assert_eq!(collector.transcribed_ms(), 1_400);
        let words = collector.finish();
        let texts = words
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>();
        assert_eq!(texts, vec![" hello", " monde"]);
    }

    #[test]
    fn preview_prefers_partials_then_the_last_final_words() {
        let mut collector = Collector::default();
        let now = Instant::now();
        collector.apply(&delta(vec![word("a", " bonjour", 0, None)], vec![]), now);
        assert_eq!(collector.preview_text().as_deref(), Some("bonjour"));

        let mut with_partial = delta(vec![], vec![]);
        with_partial.partials.push(PartialWord {
            text: " à tous".to_string(),
            start_ms: 500,
            end_ms: 900,
            channel: FILE_STREAM_CHANNEL,
            speaker_index: None,
        });
        collector.apply(&with_partial, now);
        assert_eq!(collector.preview_text().as_deref(), Some("à tous"));
    }

    #[test]
    fn batch_response_keeps_timing_speakers_and_the_mixed_channel() {
        let words = vec![
            word("a", " Bonjour", 1_200, Some(0)),
            word("b", " jury.", 1_700, Some(1)),
        ];

        let response = words_to_batch_response(&words, 12.5, "nvidia");

        assert_eq!(response.results.channels.len(), 3);
        assert!(response.results.channels[0].alternatives.is_empty());
        let alternative = &response.results.channels[2].alternatives[0];
        assert_eq!(alternative.transcript, "Bonjour jury.");
        assert_eq!(alternative.words[0].start, 1.2);
        assert_eq!(alternative.words[1].speaker, Some(1));
        assert_eq!(alternative.words[1].channel, FILE_STREAM_CHANNEL);
        assert_eq!(response.metadata["duration"], 12.5);
    }
}
