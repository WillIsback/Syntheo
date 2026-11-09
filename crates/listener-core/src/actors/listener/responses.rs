use std::time::{Duration, Instant};

use ractor::ActorRef;

use owhisper_interface::stream::StreamResponse;

use crate::{DegradedError, LiveTranscriptEngine, SessionDataEvent, SessionErrorEvent};

use super::{ListenerArgs, ListenerMsg, ListenerState};

pub(super) async fn stop_stream_task(
    shutdown_tx: &mut Option<tokio::sync::oneshot::Sender<()>>,
    rx_task: &mut tokio::task::JoinHandle<Vec<StreamResponse>>,
    timeout: Duration,
) -> Vec<StreamResponse> {
    let Some(shutdown_tx) = shutdown_tx.take() else {
        return Vec::new();
    };

    let _ = shutdown_tx.send(());
    match tokio::time::timeout(timeout, &mut *rx_task).await {
        Ok(Ok(responses)) => discard_final_stream_errors(responses),
        Ok(Err(error)) => {
            tracing::warn!(error.message = ?error, "listener_stream_task_join_failed");
            Vec::new()
        }
        Err(_) => {
            tracing::warn!("listener_stream_task_shutdown_timed_out");
            rx_task.abort();
            Vec::new()
        }
    }
}

fn discard_final_stream_errors(responses: Vec<StreamResponse>) -> Vec<StreamResponse> {
    responses
        .into_iter()
        .filter_map(|response| match response {
            StreamResponse::ErrorResponse {
                error_code,
                provider,
                ..
            } => {
                let error_code =
                    error_code.map_or_else(|| "unknown".to_string(), |code| code.to_string());
                tracing::warn!(
                    error.code = %error_code,
                    syntheo.stt.provider.name = %provider,
                    "stream_provider_error_during_shutdown"
                );
                None
            }
            response => Some(response),
        })
        .collect()
}

/// A reconnecting listener continues the session's transcript, so the audio the source replays
/// into the new stream cannot finalize the same words twice and segments carry on across the gap.
/// Identity inputs may have changed while no listener was attached, so they are re-applied.
pub(super) fn resume_transcript(args: &ListenerArgs, adapter_name: &str) -> LiveTranscriptEngine {
    let resumed = args
        .live_transcript
        .lock()
        .ok()
        .and_then(|mut shared| shared.take())
        .filter(|engine| engine.provider_name() == adapter_name);
    match resumed {
        Some(mut engine) => {
            if let Some(segment_delta) = engine.update_identities(
                &args.participant_human_ids,
                args.self_human_id.as_deref(),
                args.speaker_assignments.clone(),
                args.mic_isolated,
                args.session_started_at.elapsed().as_millis() as i64,
            ) {
                args.runtime
                    .emit_data(SessionDataEvent::TranscriptSegmentDelta {
                        session_id: args.session_id.clone(),
                        delta: Box::new(segment_delta),
                    });
            }
            engine
        }
        None => LiveTranscriptEngine::with_speaker_assignments(
            adapter_name,
            &args.participant_human_ids,
            args.self_human_id.as_deref(),
            args.speaker_assignments.clone(),
            args.mic_isolated,
            args.session_started_at.elapsed().as_millis() as i64,
        ),
    }
}

pub(super) fn stop_if_stalled(
    myself: &ActorRef<ListenerMsg>,
    state: &mut ListenerState,
    samples: usize,
) {
    let now = Instant::now();
    let Some(progress) = state.progress.as_mut() else {
        return;
    };
    if !progress.observe_audio(samples, now) {
        return;
    }
    let diagnostics = progress.diagnostics(now);
    tracing::warn!(
        reason = ?diagnostics.reason,
        active_audio_secs = diagnostics.active_audio_secs,
        unfinalized_audio_secs = diagnostics.unfinalized_audio_secs,
        secs_since_progress = diagnostics.secs_since_progress,
        secs_since_response = diagnostics.secs_since_response,
        "listen_stream_stalled_during_audio"
    );
    stop_with_degraded_error(myself, DegradedError::ConnectionTimeout);
}

pub(super) fn process_stream_response(
    state: &mut ListenerState,
    mut response: StreamResponse,
) -> Option<DegradedError> {
    if let Some(progress) = &mut state.progress {
        progress.observe_response(&response, Instant::now());
    }
    if let StreamResponse::ErrorResponse {
        error_code,
        error_message,
        provider,
    } = &response
    {
        let error_code_tag =
            error_code.map_or_else(|| "unknown".to_string(), |code| code.to_string());
        tracing::error!(
            error.code = %error_code_tag,
            error.message = %error_message,
            syntheo.stt.provider.name = %provider,
            "stream_provider_error"
        );
        state
            .args
            .runtime
            .emit_error(SessionErrorEvent::ConnectionError {
                session_id: state.args.session_id.clone(),
                error: format!(
                    "[{}] {} (code: {})",
                    provider,
                    error_message,
                    error_code
                        .map(|code| code.to_string())
                        .unwrap_or_else(|| "none".to_string())
                ),
            });
        return Some(classify_provider_error(
            *error_code,
            error_message,
            provider,
        ));
    }

    match state.args.mode {
        crate::actors::ChannelMode::MicOnly => response.remap_channel_index(0, 2),
        crate::actors::ChannelMode::SpeakerOnly => response.remap_channel_index(1, 2),
        crate::actors::ChannelMode::MicAndSpeaker => {}
    }

    if let Some(update) = state.transcript.process(&response) {
        if let Some(progress) = &mut state.progress {
            progress.observe_delta(&update.transcript_delta, Instant::now());
        }
        state
            .args
            .runtime
            .emit_data(SessionDataEvent::TranscriptDelta {
                session_id: state.args.session_id.clone(),
                delta: Box::new(update.transcript_delta),
            });
        if let Some(segment_delta) = update.segment_delta {
            state
                .args
                .runtime
                .emit_data(SessionDataEvent::TranscriptSegmentDelta {
                    session_id: state.args.session_id.clone(),
                    delta: Box::new(segment_delta),
                });
        }
    }

    None
}

pub(super) fn classify_provider_error(
    error_code: Option<i32>,
    error_message: &str,
    provider: &str,
) -> DegradedError {
    match error_code {
        Some(401) | Some(403) => DegradedError::AuthenticationFailed {
            provider: provider.to_string(),
        },
        Some(400) | Some(402) | Some(404) | Some(422) => DegradedError::ProviderConfiguration {
            provider: provider.to_string(),
            message: error_message.to_string(),
        },
        _ => DegradedError::StreamError {
            message: format!("{provider}: {error_message}"),
        },
    }
}

pub(super) fn stop_with_degraded_error(myself: &ActorRef<ListenerMsg>, error: DegradedError) {
    let reason = serde_json::to_string(&error).ok();
    myself.stop(reason);
}
