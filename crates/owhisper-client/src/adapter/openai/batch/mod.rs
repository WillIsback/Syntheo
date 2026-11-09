use std::path::Path;

use futures_util::StreamExt;
use openai_transcription::batch::{
    CreateTranscriptionOptions, CreateTranscriptionResponse, TimestampGranularity,
};
use owhisper_interface::ListenParams;
use owhisper_interface::batch::Response as BatchResponse;
use reqwest::multipart::{Form, Part};

use crate::adapter::http::AudioBody;
use crate::adapter::{
    BatchFuture, BatchSttAdapter, ClientWithMiddleware, StreamingBatchStream,
    append_path_if_missing,
};
use crate::error::Error;

use super::OpenAIAdapter;

mod response;
mod sse;

use response::convert_response;
use sse::OpenAISseParserState;

const OPENAI_PROGRESS_CAP: f64 = 0.99;
const MAX_SSE_FRAME_BYTES: usize = 8 * 1_024 * 1_024;
const MAX_SSE_DELIMITER_BYTES: usize = 4;
const SSE_READ_AHEAD_BYTES: usize = 64 * 1_024;

impl BatchSttAdapter for OpenAIAdapter {
    fn provider_name(&self) -> &'static str {
        "openai"
    }

    fn is_supported_languages(
        &self,
        languages: &[syntheo_language::Language],
        _model: Option<&str>,
    ) -> bool {
        OpenAIAdapter::is_supported_languages_batch(languages)
    }

    fn transcribe_file<'a, P: AsRef<Path> + Send + 'a>(
        &'a self,
        client: &'a ClientWithMiddleware,
        api_base: &'a str,
        api_key: &'a str,
        params: &'a ListenParams,
        file_path: P,
    ) -> BatchFuture<'a> {
        let audio = AudioBody::Path(file_path.as_ref().to_path_buf());
        Box::pin(do_transcribe_file(client, api_base, api_key, params, audio))
    }

    fn transcribe_bytes<'a>(
        &'a self,
        client: &'a ClientWithMiddleware,
        api_base: &'a str,
        api_key: &'a str,
        params: &'a ListenParams,
        audio: Vec<u8>,
        file_name: String,
    ) -> BatchFuture<'a> {
        let audio = AudioBody::Bytes {
            data: audio,
            file_name,
        };
        Box::pin(do_transcribe_file(client, api_base, api_key, params, audio))
    }
}

impl OpenAIAdapter {
    pub async fn transcribe_file_streaming(
        api_base: &str,
        api_key: &str,
        params: &ListenParams,
        file_path: impl AsRef<Path>,
    ) -> Result<StreamingBatchStream, Error> {
        let file_path = file_path.as_ref().to_path_buf();
        let file_part = build_file_part(AudioBody::Path(file_path)).await?;

        let model =
            OpenAIAdapter::resolve_batch_model(params.model.as_deref()).ok_or_else(|| {
                Error::AudioProcessing(
                    "streaming transcription requires an OpenAI model".to_string(),
                )
            })?;
        let options = build_transcription_options(params, model, false, true);
        let form = build_multipart_form(file_part, options)?;
        let url = transcription_url(api_base)?;

        let response = reqwest::Client::new()
            .post(url.to_string())
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            return Err(Error::UnexpectedStatus {
                status,
                body: crate::adapter::http::error_body(response).await,
            });
        }

        let byte_stream = response.bytes_stream();
        let event_stream = futures_util::stream::unfold(
            OpenAISseParserState::new(byte_stream),
            |mut state| async move {
                loop {
                    if let Some(event) = state.pending_events.pop_front() {
                        return Some((event, state));
                    }
                    state.fill_pending_event();
                    if let Some(event) = state.pending_events.pop_front() {
                        return Some((event, state));
                    }
                    if state.terminated {
                        return None;
                    }
                    if state.stream_finished {
                        state.finish();
                        if let Some(event) = state.pending_events.pop_front() {
                            return Some((event, state));
                        }
                        return None;
                    }

                    match state.stream.next().await {
                        Some(Ok(chunk)) => {
                            state.push_chunk(chunk);
                        }
                        Some(Err(error)) => {
                            return Some((
                                Err(Error::WebSocket(format!("stream error: {:?}", error))),
                                state,
                            ));
                        }
                        None => {
                            state.stream_finished = true;
                        }
                    }
                }
            },
        );

        Ok(Box::pin(event_stream))
    }
}

async fn do_transcribe_file(
    client: &ClientWithMiddleware,
    api_base: &str,
    api_key: &str,
    params: &ListenParams,
    audio: AudioBody,
) -> Result<BatchResponse, Error> {
    let Some(model) = OpenAIAdapter::resolve_batch_model(params.model.as_deref()) else {
        return transcribe_custom_model(client, api_base, api_key, params, audio).await;
    };
    let file_part = build_file_part(audio).await?;
    let options = build_transcription_options(params, model, true, false);
    let form = build_multipart_form(file_part, options)?;
    let url = transcription_url(api_base)?;

    let response = client
        .post(url.to_string())
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await?;

    let status = response.status();
    if status.is_success() {
        let openai_response: CreateTranscriptionResponse = response.json().await?;
        Ok(convert_response(openai_response))
    } else {
        Err(Error::UnexpectedStatus {
            status,
            body: crate::adapter::http::error_body(response).await,
        })
    }
}

async fn build_file_part(audio: AudioBody) -> Result<Part, Error> {
    audio.to_part().await
}

/// On-prem servers (vLLM, speaches, faster-whisper-server) serve models the
/// OpenAI SDK types do not know; they get the generic multipart request with
/// the configured model name.
async fn transcribe_custom_model(
    client: &ClientWithMiddleware,
    api_base: &str,
    api_key: &str,
    params: &ListenParams,
    audio: AudioBody,
) -> Result<BatchResponse, Error> {
    let model = params.model.as_deref().unwrap_or_default();
    crate::adapter::openai_compatible_batch::transcribe(
        client,
        api_base,
        api_key,
        params,
        audio,
        crate::adapter::openai_compatible_batch::OpenAICompatibleBatchConfig {
            provider: "openai",
            default_model: model,
            transcription_path: "audio/transcriptions",
            response_format: Some("verbose_json"),
            timestamp_field: Some("timestamp_granularities[]"),
            include_language: true,
        },
    )
    .await
}

fn build_transcription_options(
    params: &ListenParams,
    model: openai_transcription::batch::AudioModel,
    use_response_format: bool,
    enable_streaming: bool,
) -> CreateTranscriptionOptions {
    let mut options =
        CreateTranscriptionOptions::for_model(model, use_response_format, enable_streaming);

    if let CreateTranscriptionOptions::Whisper(options) = &mut options
        && options.response_format.is_some()
    {
        options
            .timestamp_granularities
            .push(TimestampGranularity::Word);
    }

    if model == openai_transcription::batch::AudioModel::GptTranscribe {
        for language in &params.languages {
            options.push_language(language.iso639().code().to_string());
        }
        for keyword in &params.keywords {
            options.push_keyword(keyword);
        }
    } else if let Some(language) = params.languages.first() {
        options.push_language(language.iso639().code().to_string());
    }

    options
}

fn build_multipart_form(
    file_part: Part,
    options: CreateTranscriptionOptions,
) -> Result<Form, Error> {
    let mut form = Form::new().part("file", file_part);

    for field in options
        .multipart_text_fields()
        .map_err(|e| Error::AudioProcessing(e.to_string()))?
    {
        form = form.text(field.name, field.value);
    }

    Ok(form)
}

fn transcription_url(api_base: &str) -> Result<url::Url, Error> {
    if api_base.trim().is_empty() {
        return Err(Error::AudioProcessing(
            "no transcription endpoint configured".to_string(),
        ));
    }
    let mut url: url::Url = api_base
        .parse()
        .map_err(|e: url::ParseError| Error::AudioProcessing(format!("invalid api_base: {e}")))?;
    append_path_if_missing(&mut url, "audio/transcriptions");
    Ok(url)
}

#[cfg(test)]
mod tests;
