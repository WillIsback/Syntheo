mod adapters;
#[cfg(test)]
mod progress_tests;
mod stream;

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use bytes::Bytes;
use ractor::{Actor, ActorName, ActorProcessingErr, ActorRef, RpcReplyPort, SupervisionEvent};
use tokio::time::error::Elapsed;
use tracing::Instrument;

use owhisper_interface::stream::StreamResponse;
use owhisper_interface::{ControlMessage, MixedMessage};
use syntheo_transcript::IdentityAssignment;

use super::session::{SharedLiveTranscript, session_span};
use crate::{
    DegradedError, ListenerRuntime, LiveTranscriptEngine, SessionDataEvent, SessionProgressEvent,
};

use adapters::spawn_rx_task;

mod responses;

use responses::{
    process_stream_response, resume_transcript, stop_if_stalled, stop_stream_task,
    stop_with_degraded_error,
};

pub(super) const LISTEN_STREAM_TIMEOUT: Duration = Duration::from_secs(15 * 60);
pub(super) const FINALIZE_STREAM_TIMEOUT: Duration = Duration::from_secs(5);
const STREAM_TASK_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(7);

pub enum ListenerMsg {
    AudioSingle(Bytes, RpcReplyPort<ListenerAudioResult>),
    AudioDual(Bytes, Bytes, RpcReplyPort<ListenerAudioResult>),
    UpdateConfig(ListenerConfigUpdate),
    StreamResponse(StreamResponse, RpcReplyPort<()>),
    StreamError(String),
    StreamEnded,
    StreamTimeout(Elapsed),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListenerAudioResult {
    Accepted,
    Backpressured,
    Closed,
    ModeMismatch,
}

#[derive(Clone)]
pub struct ListenerConfigUpdate {
    pub languages: Vec<syntheo_language::Language>,
    pub participant_human_ids: Vec<String>,
    pub self_human_id: Option<String>,
    pub speaker_assignments: Vec<IdentityAssignment>,
}

#[derive(Clone)]
pub struct ListenerArgs {
    pub runtime: Arc<dyn ListenerRuntime>,
    pub languages: Vec<syntheo_language::Language>,
    pub onboarding: bool,
    pub model: String,
    pub base_url: String,
    pub api_key: String,
    pub keywords: Vec<String>,
    pub transcription_mode: crate::TranscriptionMode,
    pub mode: crate::actors::ChannelMode,
    pub session_started_at: Instant,
    pub session_started_at_unix: SystemTime,
    pub stream_offset_secs: Option<f64>,
    /// This listener reconnects after an outage and receives every sample the
    /// previous one never accepted: the outage lost no audio.
    pub gap_replayed: bool,
    pub session_id: String,
    pub participant_human_ids: Vec<String>,
    pub self_human_id: Option<String>,
    pub speaker_assignments: Vec<IdentityAssignment>,
    pub live_transcript: SharedLiveTranscript,
    /// The mic-isolation verdict the streams opened with: every playing output is a headphone
    /// and the mic was not swapped away from the user's Bluetooth headset.
    pub mic_isolated: bool,
}

pub struct ListenerState {
    pub args: ListenerArgs,
    transcript: LiveTranscriptEngine,
    tx: ChannelSender,
    rx_task: tokio::task::JoinHandle<Vec<StreamResponse>>,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    progress: Option<stream::StreamProgress>,
}

pub(super) enum ChannelSender {
    Single(tokio::sync::mpsc::Sender<MixedMessage<Bytes, ControlMessage>>),
    Dual(tokio::sync::mpsc::Sender<MixedMessage<(Bytes, Bytes), ControlMessage>>),
}

pub struct ListenerActor;

impl ListenerActor {
    pub fn name(session_id: &str) -> ActorName {
        format!("listener_actor_{session_id}")
    }
}

#[derive(Debug)]
pub(super) struct ListenerInitError {
    pub(super) message: String,
    pub(super) degraded: Option<DegradedError>,
    pub(super) retry_after: Option<Duration>,
}

impl std::fmt::Display for ListenerInitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ListenerInitError {}

pub(super) fn actor_error(msg: impl Into<String>) -> ActorProcessingErr {
    Box::new(ListenerInitError {
        message: msg.into(),
        degraded: None,
        retry_after: None,
    })
}

pub(super) fn actor_error_with_degraded(
    msg: impl Into<String>,
    degraded: DegradedError,
) -> ActorProcessingErr {
    actor_error_with_degraded_retry(msg, degraded, None)
}

pub(super) fn actor_error_with_degraded_retry(
    msg: impl Into<String>,
    degraded: DegradedError,
    retry_after: Option<Duration>,
) -> ActorProcessingErr {
    Box::new(ListenerInitError {
        message: msg.into(),
        degraded: Some(degraded),
        retry_after,
    })
}

#[ractor::async_trait]
impl Actor for ListenerActor {
    type Msg = ListenerMsg;
    type State = ListenerState;
    type Arguments = ListenerArgs;

    async fn pre_start(
        &self,
        myself: ActorRef<Self::Msg>,
        args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        let session_id = args.session_id.clone();
        let span = session_span(&session_id);

        async {
            args.runtime
                .emit_progress(SessionProgressEvent::Connecting {
                    session_id: session_id.clone(),
                });

            let (tx, rx_task, shutdown_tx, adapter_name) =
                spawn_rx_task(args.clone(), myself).await?;

            args.runtime.emit_progress(SessionProgressEvent::Connected {
                session_id: session_id.clone(),
                adapter: adapter_name.clone(),
                gap_replayed: args.gap_replayed,
            });

            let transcript = resume_transcript(&args, &adapter_name);

            let state = ListenerState {
                args,
                transcript,
                tx,
                rx_task,
                shutdown_tx: Some(shutdown_tx),
                progress: (!matches!(adapter_name.as_str(), "soniqo" | "apple-speech"))
                    .then(|| stream::StreamProgress::new(Instant::now())),
            };

            Ok(state)
        }
        .instrument(span)
        .await
    }

    async fn post_stop(
        &self,
        _myself: ActorRef<Self::Msg>,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let final_responses = stop_stream_task(
            &mut state.shutdown_tx,
            &mut state.rx_task,
            STREAM_TASK_SHUTDOWN_TIMEOUT,
        )
        .await;

        for response in final_responses {
            let _ = process_stream_response(state, response);
        }

        if let Some(update) = state.transcript.checkpoint() {
            if !update.transcript_delta.is_empty() {
                state
                    .args
                    .runtime
                    .emit_data(SessionDataEvent::TranscriptDelta {
                        session_id: state.args.session_id.clone(),
                        delta: Box::new(update.transcript_delta),
                    });
            }
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
        if let Ok(mut shared) = state.args.live_transcript.lock() {
            *shared = Some(std::mem::take(&mut state.transcript));
        }

        Ok(())
    }

    async fn handle(
        &self,
        myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let span = session_span(&state.args.session_id);
        let _guard = span.enter();

        match message {
            ListenerMsg::AudioSingle(audio, reply) => {
                let active_samples = stream::active_audio_samples(&audio);
                let result = match &state.tx {
                    ChannelSender::Single(tx) => match tx.try_send(MixedMessage::Audio(audio)) {
                        Ok(()) => ListenerAudioResult::Accepted,
                        Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                            ListenerAudioResult::Backpressured
                        }
                        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
                            ListenerAudioResult::Closed
                        }
                    },
                    ChannelSender::Dual(_) => ListenerAudioResult::ModeMismatch,
                };
                let _ = reply.send(result);
                if result == ListenerAudioResult::Accepted {
                    stop_if_stalled(&myself, state, active_samples);
                }
                if matches!(
                    result,
                    ListenerAudioResult::Closed | ListenerAudioResult::ModeMismatch
                ) {
                    stop_with_degraded_error(
                        &myself,
                        DegradedError::StreamError {
                            message: "listener audio channel unavailable".to_string(),
                        },
                    );
                }
            }

            ListenerMsg::AudioDual(mic, spk, reply) => {
                let active_samples =
                    stream::active_audio_samples(&mic).max(stream::active_audio_samples(&spk));
                let result = match &state.tx {
                    ChannelSender::Dual(tx) => match tx.try_send(MixedMessage::Audio((mic, spk))) {
                        Ok(()) => ListenerAudioResult::Accepted,
                        Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                            ListenerAudioResult::Backpressured
                        }
                        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
                            ListenerAudioResult::Closed
                        }
                    },
                    ChannelSender::Single(_) => ListenerAudioResult::ModeMismatch,
                };
                let _ = reply.send(result);
                if result == ListenerAudioResult::Accepted {
                    stop_if_stalled(&myself, state, active_samples);
                }
                if matches!(
                    result,
                    ListenerAudioResult::Closed | ListenerAudioResult::ModeMismatch
                ) {
                    stop_with_degraded_error(
                        &myself,
                        DegradedError::StreamError {
                            message: "listener audio channel unavailable".to_string(),
                        },
                    );
                }
            }

            ListenerMsg::UpdateConfig(update) => {
                state.args.languages = update.languages;
                state.args.participant_human_ids = update.participant_human_ids;
                state.args.self_human_id = update.self_human_id;
                state.args.speaker_assignments = update.speaker_assignments;
                if let Some(segment_delta) = state.transcript.update_identities(
                    &state.args.participant_human_ids,
                    state.args.self_human_id.as_deref(),
                    state.args.speaker_assignments.clone(),
                    state.args.mic_isolated,
                    state.args.session_started_at.elapsed().as_millis() as i64,
                ) {
                    state
                        .args
                        .runtime
                        .emit_data(SessionDataEvent::TranscriptSegmentDelta {
                            session_id: state.args.session_id.clone(),
                            delta: Box::new(segment_delta),
                        });
                }
            }

            ListenerMsg::StreamResponse(response, reply) => {
                let degraded = process_stream_response(state, response);
                let _ = reply.send(());
                if let Some(degraded) = degraded {
                    stop_with_degraded_error(&myself, degraded);
                }
            }

            ListenerMsg::StreamError(error) => {
                tracing::info!("listen_stream_error: {}", error);
                stop_with_degraded_error(&myself, DegradedError::StreamError { message: error });
            }

            ListenerMsg::StreamEnded => {
                tracing::info!("listen_stream_ended");
                stop_with_degraded_error(
                    &myself,
                    DegradedError::UpstreamUnavailable {
                        message: "stream ended".to_string(),
                    },
                );
            }

            ListenerMsg::StreamTimeout(elapsed) => {
                tracing::info!("listen_stream_timeout: {}", elapsed);
                stop_with_degraded_error(&myself, DegradedError::ConnectionTimeout);
            }
        }
        Ok(())
    }

    async fn handle_supervisor_evt(
        &self,
        myself: ActorRef<Self::Msg>,
        message: SupervisionEvent,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let span = session_span(&state.args.session_id);
        let _guard = span.enter();
        tracing::info!("supervisor_event: {:?}", message);

        match message {
            SupervisionEvent::ActorStarted(_) | SupervisionEvent::ProcessGroupChanged(_) => {}
            SupervisionEvent::ActorTerminated(_, _, _) => {}
            SupervisionEvent::ActorFailed(_cell, _) => {
                myself.stop(None);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
