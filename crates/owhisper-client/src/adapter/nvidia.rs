use super::{
    LanguageQuality, LanguageSupport, RealtimeSttAdapter,
    parsing::WordBuilder,
    segment::{self, SegmentState},
};
use owhisper_interface::{ListenParams, stream::StreamResponse};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use syntheo_ws_client::client::Message;

// Realtime protocol of NVIDIA NeMo-Speech.cpp (`nemo-speech serve`, v0.3.0,
// `server/http/http_server.cpp`): a WebSocket on
// `/v1/audio/transcriptions/realtime` authenticated by `Authorization: Bearer`,
// one flat `session.update` before the audio, binary PCM16 frames, and a single
// `input_audio_buffer.commit` that ends the stream. A commit is not a flush: it
// finishes the recognition stream and resets it (timestamps restart at zero, the
// diarizer forgets its speakers), so the client commits only once, at the end.

/// Boost score for `speech_contexts`. The served Nemotron streaming model is a
/// cache-aware RNNT, whose typical request scores are 2–3 (NeMo-Speech.cpp ASR
/// configuration, "Word boosting"); the server caps them at 5 by default.
pub(super) const WORD_BOOST: f64 = 2.0;

/// Trailing silence, in milliseconds, that closes an utterance. The server only
/// honours it when it runs with `--endpointing`; otherwise it emits one final
/// result when the stream is committed. Its 800 ms default split a speaker's
/// sentence at an ordinary pause on a French meeting recording; 1200 ms merged
/// up to ten seconds of three voices into one result.
const ENDPOINTING_MS: u32 = 1000;

const SAMPLE_RATE: u32 = 16_000;

/// Locales accepted by the multilingual Nemotron model: a bare tag such as `fr`
/// is answered in another language, so each ISO-639 code maps to one region. A
/// language that already carries a region is used verbatim; anything unknown
/// falls back to the bare tag.
const LOCALES: &[(&str, &str)] = &[
    ("ar", "ar-AR"),
    ("bg", "bg-BG"),
    ("cs", "cs-CZ"),
    ("da", "da-DK"),
    ("de", "de-DE"),
    ("el", "el-GR"),
    ("en", "en-US"),
    ("es", "es-ES"),
    ("et", "et-EE"),
    ("fi", "fi-FI"),
    ("fr", "fr-FR"),
    ("he", "he-IL"),
    ("hi", "hi-IN"),
    ("hr", "hr-HR"),
    ("hu", "hu-HU"),
    ("it", "it-IT"),
    ("ja", "ja-JP"),
    ("ko", "ko-KR"),
    ("lt", "lt-LT"),
    ("lv", "lv-LV"),
    ("mt", "mt-MT"),
    ("nb", "nb-NO"),
    ("nl", "nl-NL"),
    ("nn", "nn-NO"),
    ("pl", "pl-PL"),
    ("pt", "pt-BR"),
    ("ro", "ro-RO"),
    ("ru", "ru-RU"),
    ("sk", "sk-SK"),
    ("sl", "sl-SI"),
    ("sv", "sv-SE"),
    ("th", "th-TH"),
    ("tr", "tr-TR"),
    ("uk", "uk-UA"),
    ("vi", "vi-VN"),
    ("zh", "zh-CN"),
];

const MAX_SEGMENT_BYTES: usize = 1024 * 1024;

/// Language sent to the server: the first selected one, as a locale, or
/// `auto` without any, so that the multilingual model detects it (Profile ›
/// Main language › Automatic detection sends no language, issue #569).
pub(super) fn requested_language(params: &ListenParams) -> String {
    params
        .languages
        .first()
        .map(localized_language)
        .unwrap_or_else(|| "auto".to_string())
}

/// In automatic detection, the model may open a transcript with the detected
/// locale as a tag (`<fr-FR>`): it is not speech and is left out.
pub(super) fn strip_language_tag(text: &str) -> &str {
    let trimmed = text.trim_start();
    let Some(rest) = trimmed.strip_prefix('<') else {
        return text;
    };
    let Some(end) = rest.find('>') else {
        return text;
    };
    let tag = &rest[..end];
    let (language, region) = tag.split_once(['-', '_']).unwrap_or((tag, ""));
    let is_language = (2..=3).contains(&language.len())
        && language.chars().all(|c| c.is_ascii_alphabetic())
        && (region.is_empty()
            || (region.len() == 2 && region.chars().all(|c| c.is_ascii_alphabetic())));
    if is_language {
        rest[end + 1..].trim_start()
    } else {
        text
    }
}

pub(super) fn localized_language(lang: &syntheo_language::Language) -> String {
    if lang.region().is_some() {
        return lang.bcp47_code();
    }
    let code = lang.iso639().code();
    if code == "auto" {
        return "auto".to_string();
    }
    LOCALES
        .iter()
        .find(|(iso, _)| *iso == code)
        .map(|(_, locale)| (*locale).to_string())
        .unwrap_or_else(|| lang.bcp47_code())
}

/// The flat `session` object of the one `session.update` the server accepts
/// (`transcription_session.update` is rejected as an unsupported event type).
/// `model` is not sent: the server serves the single model it loaded.
fn session_config(params: &ListenParams) -> Value {
    let language = requested_language(params);
    let diarization = params.num_speakers != Some(1);
    let mut session = json!({
        "language": language,
        "sample_rate": SAMPLE_RATE,
        "automatic_punctuation": true,
        "word_timestamps": true,
        "speaker_diarization": diarization,
        "endpointing_ms": ENDPOINTING_MS,
    });
    // `max_speaker_count` is an upper bound on the voices to tell apart.
    if let Some(max) = params.max_speakers.filter(|max| diarization && *max > 0) {
        session["max_speaker_count"] = json!(max);
    }
    let phrases: Vec<&str> = params
        .keywords
        .iter()
        .map(|keyword| keyword.trim())
        .filter(|keyword| !keyword.is_empty())
        .collect();
    if !phrases.is_empty() {
        session["speech_contexts"] = json!([{ "phrases": phrases, "boost": WORD_BOOST }]);
    }
    session
}

/// Words of a `.completed` event: `start`/`end` in seconds from the start of the
/// stream, `speaker` 1-based (absent without diarization), mapped to the
/// 0-based speaker index the transcript uses.
pub(super) fn completed_words(words: &[Value]) -> Vec<owhisper_interface::stream::Word> {
    words
        .iter()
        .filter_map(|word| {
            let start = word["start"].as_f64()?;
            let text = strip_language_tag(word["word"].as_str()?);
            if text.is_empty() {
                return None;
            }
            Some(
                WordBuilder::new(text)
                    .start(start)
                    .end(word["end"].as_f64().unwrap_or(start))
                    .confidence(word["confidence"].as_f64().unwrap_or(1.0))
                    .speaker(
                        word["speaker"]
                            .as_i64()
                            .filter(|speaker| *speaker >= 1)
                            .and_then(|speaker| i32::try_from(speaker - 1).ok()),
                    )
                    .build(),
            )
        })
        .collect()
}

#[derive(Clone, Default)]
pub struct NvidiaAdapter {
    state: Arc<Mutex<SegmentState>>,
}
impl NvidiaAdapter {
    pub fn language_support_live(
        languages: &[syntheo_language::Language],
        _model: Option<&str>,
    ) -> LanguageSupport {
        // The model loaded by the server determines language coverage.
        if languages.len() <= 1 {
            LanguageSupport::Supported {
                quality: LanguageQuality::NoData,
            }
        } else {
            LanguageSupport::NotSupported
        }
    }
}
impl RealtimeSttAdapter for NvidiaAdapter {
    fn fork_session(&self) -> Self {
        Self::default()
    }
    fn provider_name(&self) -> &'static str {
        "nvidia"
    }
    fn required_sample_rate(&self) -> Option<u32> {
        Some(SAMPLE_RATE)
    }
    fn is_supported_languages(
        &self,
        languages: &[syntheo_language::Language],
        model: Option<&str>,
    ) -> bool {
        Self::language_support_live(languages, model).is_supported()
    }
    fn supports_native_multichannel(&self) -> bool {
        false
    }
    fn build_ws_url(&self, base: &str, _: &ListenParams, _: u8) -> url::Url {
        let mut url = segment::ws_url(
            base,
            "http://localhost:9000",
            "/v1/audio/transcriptions/realtime",
        );
        if url.query() == Some("") {
            url.set_query(None);
        }
        url
    }
    fn build_auth_header(&self, key: Option<&str>) -> Option<(&'static str, String)> {
        key.filter(|key| !key.is_empty())
            .map(|key| ("Authorization", format!("Bearer {key}")))
    }
    fn keep_alive_message(&self) -> Option<Message> {
        None
    }
    fn finalize_message(&self) -> Message {
        segment::message(json!({"type":"input_audio_buffer.commit"}))
    }
    fn initial_message(&self, _: Option<&str>, params: &ListenParams, _: u8) -> Option<Message> {
        Some(segment::message(json!({
            "type": "session.update",
            "session": session_config(params),
        })))
    }
    fn audio_to_message(&self, audio: bytes::Bytes) -> Message {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .audio(audio.len(), SAMPLE_RATE);
        Message::Binary(audio)
    }
    fn parse_response(&self, raw: &str) -> Vec<StreamResponse> {
        let Ok(value) = serde_json::from_str::<Value>(raw) else {
            return vec![];
        };
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match value["type"].as_str().unwrap_or("") {
            "error" => vec![segment::error("nvidia", &value["error"])],
            "conversation.item.input_audio_transcription.delta" => {
                let Some(delta) = value["delta"].as_str() else {
                    return vec![];
                };
                if delta.is_empty() {
                    return vec![];
                }
                if state.text.len() + delta.len() > MAX_SEGMENT_BYTES {
                    return vec![segment::error(
                        "nvidia",
                        &json!({"message":"Unterminated transcript segment exceeds the size limit"}),
                    )];
                }
                // Each delta carries only the text added to the open utterance,
                // while the consumer expects the whole utterance in every partial.
                state.text.push_str(delta);
                let text = strip_language_tag(&state.text).to_string();
                if text.trim().is_empty() {
                    return vec![];
                }
                let end = state.end(SAMPLE_RATE);
                vec![state.response(&text, end, false)]
            }
            "conversation.item.input_audio_transcription.completed" => {
                let Some(text) = value["transcript"].as_str().map(strip_language_tag) else {
                    return vec![];
                };
                // With endpointing, the commit closing the stream answers with an
                // empty result when the last utterance was already final.
                if text.trim().is_empty() {
                    state.text.clear();
                    return vec![];
                }
                let end = state.end(SAMPLE_RATE);
                let mut response = state.response(text, end, true);
                let words = value["words"]
                    .as_array()
                    .map(|words| completed_words(words))
                    .unwrap_or_default();
                if let StreamResponse::TranscriptResponse {
                    start,
                    duration,
                    channel,
                    ..
                } = &mut response
                    && let (Some(first), Some(last)) = (words.first(), words.last())
                {
                    *start = first.start;
                    *duration = last.end - first.start;
                    state.cursor = last.end;
                    channel.alternatives[0].words = words;
                }
                vec![response]
            }
            // Answer to the final commit: every result has been delivered.
            "input_audio_buffer.committed" => {
                state.text.clear();
                vec![segment::finished(state.end(SAMPLE_RATE))]
            }
            _ => vec![],
        }
    }
}
