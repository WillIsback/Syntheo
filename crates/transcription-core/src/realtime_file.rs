//! Import d'un fichier par le flux temps réel (issue 463).
//!
//! Le fichier choisi est décodé en mémoire par le décodeur de l'import par lot,
//! confié au listener d'une écoute en direct (`listener::actors::file_stream`),
//! puis rendu au format batch : l'interface reprend alors le chemin habituel
//! d'un import (progression, enregistrement, reprise, synthèse). Rien n'est
//! écrit sur le disque.
//!
//! Avec le protocole NVIDIA NeMo-Speech.cpp, le fichier décodé part d'abord
//! d'une seule requête à l'API REST du serveur, bien plus rapide que le flux
//! (issue #568) ; le flux temps réel ne sert qu'en repli, si cette requête
//! échoue.

use std::sync::Arc;

use owhisper_interface::batch_stream::BatchStreamEvent;

use crate::listener::actors::SAMPLE_RATE;
use crate::listener::actors::file_stream::{
    FileStreamError, FileStreamObserver, FileStreamOptions, FileStreamParams, FileStreamProgress,
    RestFileError, SpeakerBounds, file_stream_provider_name, rest_file_transcription,
    stream_file_transcription, supports_file_stream, supports_rest_file_transcription,
    words_to_batch_response,
};
use crate::listener2::{
    BatchEvent, BatchFailure, BatchParams, BatchRunMode, BatchRunOutput, BatchRuntime,
    run_batch_job,
};

pub async fn run_realtime_file_batch(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
) -> crate::listener2::Result<BatchRunOutput> {
    run_realtime_file_batch_with(runtime, params, FileStreamOptions::default()).await
}

pub async fn run_realtime_file_batch_with(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
    options: FileStreamOptions,
) -> crate::listener2::Result<BatchRunOutput> {
    let session_id = params.session_id.clone();
    run_batch_job(
        runtime.clone(),
        session_id,
        transcribe(runtime, params, options),
    )
    .await
}

async fn transcribe(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
    options: FileStreamOptions,
) -> crate::listener2::Result<BatchRunOutput> {
    let session_id = params.session_id.clone();
    let model = params.model.clone().unwrap_or_default();
    let provider = file_stream_provider_name(&params.base_url, &model, &params.languages);
    if !supports_file_stream(&params.base_url, &model, &params.languages) {
        return Err(BatchFailure::BatchCapabilityUnsupported { provider }.into());
    }

    let stream_params = FileStreamParams {
        session_id: session_id.clone(),
        model,
        base_url: params.base_url.clone(),
        api_key: params.api_key.clone(),
        languages: params.languages.clone(),
        keywords: params.keywords.clone(),
        participant_human_ids: Vec::new(),
        self_human_id: None,
    };

    let speakers = SpeakerBounds {
        num_speakers: params.num_speakers,
        max_speakers: params.max_speakers,
    };
    let use_rest =
        supports_rest_file_transcription(&params.base_url, &stream_params.model, &params.languages);

    let samples = tokio::task::spawn_blocking(move || params.decode_pcm16_mono(SAMPLE_RATE))
        .await
        .map_err(|_| BatchFailure::AudioMetadataJoinFailed)?
        .map_err(|error| {
            tracing::warn!(error.type = "audio_decode_failed", "realtime_file_decode_failed");
            BatchFailure::AudioMetadataReadFailed {
                message: format!("Syntheo couldn't read this file: {error}"),
            }
        })?;
    if samples.is_empty() {
        return Err(BatchFailure::AudioMetadataReadFailed {
            message: "This recording has no audio to transcribe.".to_string(),
        }
        .into());
    }

    let observer = Arc::new(BatchProgressObserver {
        runtime: runtime.clone(),
        session_id: session_id.clone(),
    });
    observer.on_progress(FileStreamProgress {
        fraction: 0.0,
        preview: None,
    });

    if use_rest {
        match rest_file_transcription(&stream_params, speakers, &samples, observer.as_ref()).await {
            Ok((words, duration_secs)) => {
                tracing::info!(words = words.len(), "realtime_file_transcribed_by_rest");
                return Ok(BatchRunOutput {
                    session_id,
                    mode: BatchRunMode::Direct,
                    response: words_to_batch_response(&words, duration_secs, &provider),
                });
            }
            Err(RestFileError::Cancelled) => {
                return Err(stream_failure(&provider, FileStreamError::Cancelled).into());
            }
            Err(RestFileError::Failed(message)) => {
                tracing::warn!(
                    error.message = %message,
                    "realtime_file_rest_failed_falling_back_to_stream"
                );
                observer.on_progress(FileStreamProgress {
                    fraction: 0.0,
                    preview: None,
                });
            }
        }
    }

    match stream_file_transcription(stream_params, samples.into(), options, observer).await {
        Ok(output) => {
            tracing::info!(
                reconnections = output.reconnections,
                realtime_fallback = output.realtime_fallback,
                words = output.words.len(),
                "realtime_file_transcribed"
            );
            Ok(BatchRunOutput {
                session_id,
                mode: BatchRunMode::Streamed,
                response: words_to_batch_response(&output.words, output.duration_secs, &provider),
            })
        }
        Err(error) => Err(stream_failure(&provider, error).into()),
    }
}

fn stream_failure(provider: &str, error: FileStreamError) -> BatchFailure {
    match error {
        FileStreamError::Unsupported => BatchFailure::BatchCapabilityUnsupported {
            provider: provider.to_string(),
        },
        error => BatchFailure::RealtimeStreamFailed {
            provider: provider.to_string(),
            message: error.to_string(),
        },
    }
}

/// Progression de l'envoi, au format d'un lot progressif.
struct BatchProgressObserver {
    runtime: Arc<dyn BatchRuntime>,
    session_id: String,
}

impl FileStreamObserver for BatchProgressObserver {
    fn on_progress(&self, progress: FileStreamProgress) {
        self.runtime.emit(BatchEvent::BatchResponseStreamed {
            session_id: self.session_id.clone(),
            event: BatchStreamEvent::Progress {
                percentage: progress.fraction,
                partial_text: progress.preview,
            },
        });
    }

    fn is_cancelled(&self) -> bool {
        self.runtime.is_cancelled()
    }
}

#[cfg(test)]
mod tests;
