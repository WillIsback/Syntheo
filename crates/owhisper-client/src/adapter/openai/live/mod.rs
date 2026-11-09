use openai_transcription::realtime::{
    AudioConfig, AudioFormat, AudioFormatType, AudioInputConfig, ClientEvent, ServerEvent,
    SessionConfig, SessionInclude, SessionType, TranscriptionConfig, TurnDetectionConfig,
    TurnDetectionType,
};
use owhisper_interface::ListenParams;
use owhisper_interface::stream::StreamResponse;
use syntheo_ws_client::client::Message;

use super::OpenAIAdapter;
use crate::adapter::RealtimeSttAdapter;

mod state;

const VAD_THRESHOLD: f32 = 0.4;
const VAD_PREFIX_PADDING_MS: u32 = 300;
const VAD_SILENCE_DURATION_MS: u32 = 350;
const MAX_LIVE_ITEMS: usize = 64;
const MAX_BLOCKED_COMPLETED_ITEMS: usize = 16;
const MAX_ITEM_ID_BYTES: usize = 1_024;
const MAX_ITEM_TRANSCRIPT_BYTES: usize = 64 * 1_024;
const MAX_RETAINED_TRANSCRIPT_BYTES: usize = 512 * 1_024;

type CompletedLiveItem = (String, u64, u64);

struct LiveStateReset {
    completed: Vec<CompletedLiveItem>,
    reason: &'static str,
}

impl RealtimeSttAdapter for OpenAIAdapter {
    fn fork_session(&self) -> Self {
        let input_sample_rate = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .input_sample_rate;
        Self::for_live_sample_rate(input_sample_rate)
    }

    fn provider_name(&self) -> &'static str {
        "openai"
    }

    fn is_supported_languages(
        &self,
        languages: &[syntheo_language::Language],
        _model: Option<&str>,
    ) -> bool {
        OpenAIAdapter::is_supported_languages_live(languages)
    }

    fn supports_native_multichannel(&self) -> bool {
        false
    }

    fn build_ws_url(&self, api_base: &str, _params: &ListenParams, _channels: u8) -> url::Url {
        let (mut url, existing_params) = Self::build_ws_url_from_base(api_base);

        if !existing_params.is_empty() {
            url.query_pairs_mut().extend_pairs(&existing_params);
        }

        url
    }

    fn build_auth_header(&self, api_key: Option<&str>) -> Option<(&'static str, String)> {
        api_key.and_then(|key| crate::providers::Provider::OpenAI.build_auth_header(key))
    }

    fn keep_alive_message(&self) -> Option<Message> {
        None
    }

    fn audio_to_message(&self, audio: bytes::Bytes) -> Message {
        use base64::Engine;

        let input_sample_rate = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .input_sample_rate;
        let audio = resample_pcm16(
            &audio,
            input_sample_rate,
            crate::providers::Provider::OpenAI.default_live_sample_rate(),
        );
        let event = ClientEvent::InputAudioBufferAppend {
            event_id: None,
            audio: base64::engine::general_purpose::STANDARD.encode(audio),
        };
        Message::Text(serde_json::to_string(&event).unwrap().into())
    }

    fn initial_message(
        &self,
        _api_key: Option<&str>,
        params: &ListenParams,
        _channels: u8,
    ) -> Option<Message> {
        let default = crate::providers::Provider::OpenAI.default_live_model();
        let model = match params.model.as_deref() {
            Some(model) if crate::providers::is_meta_model(model) => default,
            Some(model) => model,
            None => default,
        };
        let uses_plural_hints = matches!(model, "gpt-live-transcribe" | "gpt-transcribe");
        let language_codes = params
            .languages
            .iter()
            .map(|language| language.iso639().code().to_string())
            .collect::<Vec<_>>();
        let sample_rate = crate::providers::Provider::OpenAI.default_live_sample_rate();

        self.live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .input_sample_rate = params.sample_rate;

        let event = ClientEvent::SessionUpdate {
            event_id: None,
            session: SessionConfig {
                session_type: SessionType::Transcription,
                audio: Some(AudioConfig {
                    input: Some(AudioInputConfig {
                        format: Some(AudioFormat {
                            format_type: AudioFormatType::AudioPcm,
                            rate: Some(sample_rate),
                        }),
                        transcription: Some(TranscriptionConfig {
                            model: model.to_string(),
                            language: (!uses_plural_hints)
                                .then(|| language_codes.first().cloned())
                                .flatten(),
                            languages: (uses_plural_hints && !language_codes.is_empty())
                                .then_some(language_codes),
                            keywords: (uses_plural_hints && !params.keywords.is_empty())
                                .then(|| params.keywords.clone()),
                            prompt: None,
                        }),
                        turn_detection: (model != "gpt-live-transcribe").then_some(
                            TurnDetectionConfig {
                                detection_type: TurnDetectionType::ServerVad,
                                create_response: None,
                                interrupt_response: None,
                                idle_timeout_ms: None,
                                eagerness: None,
                                threshold: Some(VAD_THRESHOLD),
                                prefix_padding_ms: Some(VAD_PREFIX_PADDING_MS),
                                silence_duration_ms: Some(VAD_SILENCE_DURATION_MS),
                            },
                        ),
                        noise_reduction: None,
                    }),
                }),
                include: (!uses_plural_hints)
                    .then_some(vec![SessionInclude::InputAudioTranscriptionLogprobs]),
            },
        };

        let json = serde_json::to_string(&event).ok()?;
        tracing::debug!(
            syntheo.payload.size_bytes = json.len() as u64,
            "openai_session_update_payload"
        );
        Some(Message::Text(json.into()))
    }

    fn finalize_message(&self) -> Message {
        let event = ClientEvent::InputAudioBufferCommit { event_id: None };
        Message::Text(serde_json::to_string(&event).unwrap().into())
    }

    fn parse_response(&self, raw: &str) -> Vec<StreamResponse> {
        let event: ServerEvent = match serde_json::from_str(raw) {
            Ok(event) => event,
            Err(_error) => {
                tracing::warn!(
                    error.type = "invalid_provider_payload",
                    syntheo.payload.size_bytes = raw.len() as u64,
                    "openai_json_parse_failed"
                );
                return vec![];
            }
        };

        match event {
            ServerEvent::SessionCreated { .. } => {
                tracing::debug!("openai_session_created");
                vec![]
            }
            ServerEvent::SessionUpdated { .. } => {
                tracing::debug!("openai_session_updated");
                vec![]
            }
            ServerEvent::InputAudioBufferCommitted { item_id, .. } => {
                tracing::debug!("openai_audio_buffer_committed");
                Self::finish_state_update(self.ensure_item(&item_id))
            }
            ServerEvent::InputAudioBufferCleared { .. } => {
                tracing::debug!("openai_audio_buffer_cleared");
                vec![]
            }
            ServerEvent::InputAudioBufferSpeechStarted {
                item_id,
                audio_start_ms,
                ..
            } => {
                tracing::debug!(
                    syntheo.stt.audio_start_ms = audio_start_ms,
                    "openai_speech_started"
                );
                Self::finish_state_update(self.record_item_start(&item_id, audio_start_ms))
            }
            ServerEvent::InputAudioBufferSpeechStopped {
                item_id,
                audio_end_ms,
                ..
            } => {
                tracing::debug!(
                    syntheo.stt.audio_end_ms = audio_end_ms,
                    "openai_speech_stopped"
                );
                Self::finish_state_update(self.record_item_end(&item_id, audio_end_ms))
            }
            ServerEvent::InputAudioBufferTimeoutTriggered {
                item_id,
                audio_start_ms,
                audio_end_ms,
                ..
            } => {
                tracing::debug!(
                    syntheo.stt.audio_start_ms = audio_start_ms,
                    syntheo.stt.audio_end_ms = audio_end_ms,
                    "openai_audio_buffer_timeout_triggered"
                );
                Self::finish_state_update(self.record_item_span(
                    &item_id,
                    audio_start_ms,
                    audio_end_ms,
                ))
            }
            ServerEvent::ConversationItemInputAudioTranscriptionCompleted {
                item_id,
                content_index,
                transcript,
                ..
            } => {
                tracing::debug!(
                    syntheo.stt.content_index = content_index,
                    syntheo.transcript.char_count = transcript.chars().count() as u64,
                    "openai_transcription_completed"
                );
                match self.complete_items(&item_id, &transcript) {
                    Ok(completed) => Self::completed_responses(completed),
                    Err(reset) => Self::reset_responses(reset),
                }
            }
            ServerEvent::ConversationItemInputAudioTranscriptionDelta {
                item_id,
                content_index,
                delta,
                obfuscation: _,
                ..
            } => {
                tracing::debug!(
                    syntheo.stt.content_index = content_index.unwrap_or_default(),
                    syntheo.transcript.char_count = delta.chars().count() as u64,
                    "openai_transcription_delta"
                );
                match self.append_item_delta(&item_id, &delta) {
                    Ok((transcript, start_ms, end_ms)) => {
                        Self::build_transcript_response(&transcript, false, false, start_ms, end_ms)
                    }
                    Err(reset) => Self::reset_responses(reset),
                }
            }
            ServerEvent::ConversationItemInputAudioTranscriptionFailed {
                item_id, error, ..
            } => {
                let completed = self.discard_item(&item_id);
                let error_type = error.error_type.as_deref().unwrap_or("unknown_error");
                let message = error.message.as_deref().unwrap_or("unknown error");
                crate::log_provider_failure("openai", error_type, None, message);
                completed
                    .into_iter()
                    .flat_map(|(transcript, start_ms, end_ms)| {
                        Self::build_transcript_response(&transcript, true, true, start_ms, end_ms)
                    })
                    .collect()
            }
            ServerEvent::ConversationItemInputAudioTranscriptionSegment { .. } => vec![],
            ServerEvent::Error { error, .. } => {
                let error_type = error.error_type.as_deref().unwrap_or("unknown_error");
                let provider_code = error.code.as_deref().unwrap_or("unknown_code");
                let message = error.message.as_deref().unwrap_or("unknown error");
                let error_code = openai_error_status(error_type, error.code.as_deref());
                crate::log_provider_failure("openai", error_type, Some(provider_code), message);
                vec![StreamResponse::ErrorResponse {
                    error_code,
                    error_message: format!("{error_type}: {message}"),
                    provider: "openai".to_string(),
                }]
            }
            ServerEvent::Unknown => {
                tracing::debug!(
                    syntheo.payload.size_bytes = raw.len() as u64,
                    "openai_unknown_event"
                );
                vec![]
            }
        }
    }
}

fn openai_error_status(error_type: &str, provider_code: Option<&str>) -> Option<i32> {
    provider_code
        .and_then(openai_error_value_status)
        .or_else(|| openai_error_value_status(error_type))
}

fn openai_error_value_status(value: &str) -> Option<i32> {
    match value {
        "authentication_error" | "invalid_api_key" => Some(401),
        "insufficient_quota" | "billing_hard_limit_reached" => Some(402),
        "permission_denied" | "permission_error" => Some(403),
        "model_not_found" => Some(404),
        "rate_limit_error" | "rate_limit_exceeded" => Some(429),
        "server_error" => Some(500),
        "invalid_request_error"
        | "invalid_value"
        | "missing_required_parameter"
        | "unknown_parameter" => Some(400),
        _ => None,
    }
}

fn resample_pcm16(audio: &[u8], input_rate: u32, output_rate: u32) -> Vec<u8> {
    if input_rate == 0 || input_rate == output_rate {
        return audio.to_vec();
    }

    let samples = audio
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect::<Vec<_>>();
    if samples.is_empty() {
        return vec![];
    }

    let output_len = ((samples.len() as u64 * output_rate as u64 + input_rate as u64 / 2)
        / input_rate as u64) as usize;
    let mut output = Vec::with_capacity(output_len * 2);

    for output_index in 0..output_len {
        let position = output_index as u64 * input_rate as u64;
        let left_index = ((position / output_rate as u64) as usize).min(samples.len() - 1);
        let right_index = (left_index + 1).min(samples.len() - 1);
        let remainder = (position % output_rate as u64) as i64;
        let denominator = output_rate as i64;
        let left = samples[left_index] as i64;
        let right = samples[right_index] as i64;
        let sample = (left * (denominator - remainder) + right * remainder) / denominator;
        output.extend_from_slice(&(sample as i16).to_le_bytes());
    }

    output
}

#[cfg(test)]
mod tests;
