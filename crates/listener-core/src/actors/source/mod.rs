mod mutes;
mod pipeline;
mod stream;

pub use mutes::ChannelMutes;

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;

use ractor::{Actor, ActorName, ActorProcessingErr, ActorRef, RpcReplyPort};
use tokio_util::sync::CancellationToken;
use tracing::Instrument;

use crate::{
    ListenerRuntime, SessionErrorEvent, SessionProgressEvent,
    actors::session::session_span,
    actors::{ChannelMode, ListenerMsg},
};
use syntheo_audio::{AudioProvider, CaptureChannel, CaptureFrame};

use pipeline::Pipeline;
use stream::start_source_loop;

mod devices;

pub(crate) use devices::mic_isolated;
use devices::{DeviceChangeWatcher, capturing_mic_device, emit_channel_status, emit_mic_isolation};

pub enum SourceMsg {
    SetMicMute(bool),
    GetMicMute(RpcReplyPort<bool>),
    /// Coupe le son système sans arrêter la capture ni le STT (issue 447).
    SetSpeakerMute(bool),
    GetSpeakerMute(RpcReplyPort<bool>),
    GetMicDevice(RpcReplyPort<Option<String>>),
    GetMicIsolated(RpcReplyPort<bool>),
    GetCaptureHealth(RpcReplyPort<CaptureHealth>),
    PrepareListenerRefresh(RpcReplyPort<ListenerRefreshReplay>),
    SetListenerRouting(ListenerRouting),
    CaptureFramesReady,
    CaptureReady,
    CaptureUnavailable,
    ChannelReady(CaptureChannel, Option<String>),
    ChannelFailed(CaptureChannel, String),
    RetryCapture(Option<String>),
    InputChanged,
    OutputChanged,
    StreamFailed(String),
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct CaptureHealth {
    pub mic: Option<bool>,
    pub speaker: Option<bool>,
    pub unavailable: bool,
}

pub struct SourceFrame {
    pub capture: CaptureFrame,
    pub mic_muted: bool,
    pub speaker_muted: bool,
    pub captured: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ListenerRefreshReplay {
    pub duration_secs: f64,
    /// Every sample the previous listener never accepted is part of the replay:
    /// the outage lost no audio. False once that audio outgrew the replay cap.
    pub complete: bool,
}

impl ListenerRefreshReplay {
    /// No replay was prepared (no source, or the source did not answer).
    pub const NONE: Self = Self {
        duration_secs: 0.0,
        complete: false,
    };
}

#[derive(Clone)]
pub enum ListenerRouting {
    Buffering,
    Attached(ActorRef<ListenerMsg>),
    Dropped,
}

pub struct SourceArgs {
    pub mic_device: Option<String>,
    pub onboarding: bool,
    pub runtime: Arc<dyn ListenerRuntime>,
    pub audio: Arc<dyn AudioProvider>,
    pub session_id: String,
    pub listener_routing: ListenerRouting,
    /// Tenus par la session : une source relancée garde les canaux coupés.
    pub mutes: ChannelMutes,
}

pub struct SourceState {
    pub(super) runtime: Arc<dyn ListenerRuntime>,
    pub(super) audio: Arc<dyn AudioProvider>,
    pub(super) session_id: String,
    /// The user's explicit choice; `None` defers to the system default.
    pub(super) mic_device: Option<String>,
    /// The device the current stream actually opened. Differs from `mic_device` when a Bluetooth
    /// default input was swapped for a wired one.
    pub(super) active_mic_device: Option<String>,
    pub(super) onboarding: bool,
    pub(super) capture_mic_isolated: bool,
    pub(super) mutes: ChannelMutes,
    pub(super) run_task: Option<tokio::task::JoinHandle<()>>,
    pub(super) stream_cancel_token: Option<CancellationToken>,
    pub(super) capture_frames: Option<tokio::sync::mpsc::Receiver<SourceFrame>>,
    pub(super) capture_wake_pending: Arc<AtomicBool>,
    pub(super) capture_retry: Option<tokio::sync::mpsc::UnboundedSender<(Option<String>, bool)>>,
    pub(super) capture_output: Option<tokio::sync::mpsc::UnboundedSender<bool>>,
    capture_health: CaptureHealth,
    healthy_since: Option<std::time::Instant>,
    last_frame: Option<std::time::Instant>,
    pub(super) current_mode: ChannelMode,
    pub(super) pipeline: Pipeline,
    pub(super) listener_routing: ListenerRouting,
    _device_watcher: Option<DeviceChangeWatcher>,
    _silence_stream_tx: Option<std::sync::mpsc::Sender<()>>,
}

pub struct SourceActor;

const MAX_CAPTURE_FRAMES_PER_TICK: usize = 4;
const OUTPUT_ROUTING_POLL_INTERVAL: Duration = Duration::from_secs(2);
// Only the macOS backend reports which outputs are running; elsewhere the verdict can only move
// with the default output.
const POLLS_OUTPUT_ROUTING: bool = cfg!(target_os = "macos");

impl SourceActor {
    pub fn name(session_id: &str) -> ActorName {
        format!("source_{session_id}")
    }
}

#[ractor::async_trait]
impl Actor for SourceActor {
    type Msg = SourceMsg;
    type State = SourceState;
    type Arguments = SourceArgs;

    async fn pre_start(
        &self,
        myself: ActorRef<Self::Msg>,
        args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        let session_id = args.session_id.clone();
        let span = session_span(&session_id);

        async {
            args.runtime
                .emit_progress(SessionProgressEvent::AudioInitializing {
                    session_id: session_id.clone(),
                });

            let silence_stream_tx = Some(args.audio.play_silence());
            let mic_device = args.mic_device;
            tracing::info!(mic_device = ?mic_device);

            let pipeline = Pipeline::new(args.runtime.clone(), args.session_id.clone());

            let mut st = SourceState {
                runtime: args.runtime,
                audio: args.audio,
                session_id: args.session_id,
                mic_device,
                active_mic_device: None,
                onboarding: args.onboarding,
                capture_mic_isolated: false,
                mutes: args.mutes,
                run_task: None,
                stream_cancel_token: None,
                capture_frames: None,
                capture_wake_pending: Arc::new(AtomicBool::new(false)),
                _device_watcher: None,
                _silence_stream_tx: silence_stream_tx,
                capture_retry: None,
                capture_output: None,
                capture_health: CaptureHealth::default(),
                healthy_since: None,
                last_frame: None,
                current_mode: ChannelMode::MicAndSpeaker,
                pipeline,
                listener_routing: args.listener_routing,
            };

            // The watcher's baseline is the verdict the streams opened with, sampled after the
            // silence stream started, so it cannot read startup skew as a routing change.
            let capture = start_source_loop(&myself, &mut st).await?;
            st._device_watcher = Some(DeviceChangeWatcher::spawn(
                myself.clone(),
                capture.headphone_output,
            ));
            Ok(st)
        }
        .instrument(span)
        .await
    }

    async fn handle(
        &self,
        myself: ActorRef<Self::Msg>,
        msg: Self::Msg,
        st: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let span = session_span(&st.session_id);
        async {
            match msg {
                SourceMsg::SetMicMute(muted) => {
                    if st.mutes.set_mic(muted) {
                        st.runtime.emit_data(crate::SessionDataEvent::MicMuted {
                            session_id: st.session_id.clone(),
                            value: muted,
                        });
                    }
                }
                SourceMsg::GetMicMute(reply) => {
                    if !reply.is_closed() {
                        let _ = reply.send(st.mutes.mic());
                    }
                }
                SourceMsg::SetSpeakerMute(muted) => {
                    if st.mutes.set_speaker(muted) {
                        st.runtime.emit_data(crate::SessionDataEvent::SpeakerMuted {
                            session_id: st.session_id.clone(),
                            value: muted,
                        });
                    }
                }
                SourceMsg::GetSpeakerMute(reply) => {
                    if !reply.is_closed() {
                        let _ = reply.send(st.mutes.speaker());
                    }
                }
                SourceMsg::GetMicDevice(reply) => {
                    if !reply.is_closed() {
                        let _ = reply.send(capturing_mic_device(st));
                    }
                }
                SourceMsg::GetMicIsolated(reply) => {
                    let _ = reply.send(st.capture_mic_isolated);
                }
                SourceMsg::GetCaptureHealth(reply) => {
                    let _ = reply.send(st.capture_health);
                }
                SourceMsg::PrepareListenerRefresh(reply) => {
                    st.listener_routing = ListenerRouting::Buffering;
                    let replay = st.pipeline.prepare_listener_refresh();
                    if !reply.is_closed() {
                        let _ = reply.send(replay);
                    }
                }
                SourceMsg::SetListenerRouting(routing) => {
                    st.listener_routing = routing;
                    st.pipeline
                        .on_listener_routing_changed(&st.listener_routing);
                }
                SourceMsg::OutputChanged => {
                    if st.current_mode == ChannelMode::SpeakerOnly {
                        myself.stop(Some("device_change".into()));
                    } else if st.current_mode == ChannelMode::MicAndSpeaker {
                        let swapped = st.mic_device.as_ref().map_or(
                            stream::active_mic_device(None, st.audio.as_ref()).is_some(),
                            |requested| st.active_mic_device.as_ref() != Some(requested),
                        );
                        let capture = stream::capture_settings(swapped);
                        st.capture_mic_isolated = capture.mic_isolated;
                        if let Some(output) = &st.capture_output {
                            let _ = output.send(capture.enable_aec);
                        }
                        emit_mic_isolation(st);
                    }
                }
                SourceMsg::InputChanged => {
                    if st.mic_device.is_some() {
                        return Ok(());
                    }
                    st.capture_mic_isolated = mic_isolated(&st.mic_device, st.audio.as_ref());
                    if let Some(retry) = &st.capture_retry {
                        let _ = retry.send((
                            stream::active_mic_device(st.mic_device.clone(), st.audio.as_ref()),
                            true,
                        ));
                    }
                }
                SourceMsg::RetryCapture(device) => {
                    st.mic_device = device.clone();
                    st.capture_mic_isolated = mic_isolated(&st.mic_device, st.audio.as_ref());
                    if let Some(retry) = &st.capture_retry {
                        let _ = retry
                            .send((stream::active_mic_device(device, st.audio.as_ref()), false));
                    }
                }
                SourceMsg::CaptureReady => {
                    st.capture_health.unavailable = false;
                    st.runtime.emit_progress(SessionProgressEvent::AudioReady {
                        session_id: st.session_id.clone(),
                        device: capturing_mic_device(st),
                    });
                    emit_channel_status(st, "audio_capture_ready".into());
                }
                SourceMsg::CaptureUnavailable => {
                    st.healthy_since = None;
                    st.capture_health.unavailable = true;
                    emit_channel_status(st, "audio_capture_unavailable".into());
                }
                SourceMsg::ChannelReady(channel, device) => {
                    match channel {
                        CaptureChannel::Mic => st.capture_health.mic = Some(true),
                        CaptureChannel::Speaker => st.capture_health.speaker = Some(true),
                    }
                    if channel == CaptureChannel::Mic {
                        st.active_mic_device = device;
                        let swapped = st.mic_device.as_ref().map_or(
                            stream::active_mic_device(None, st.audio.as_ref()).is_some(),
                            |requested| st.active_mic_device.as_ref() != Some(requested),
                        );
                        st.capture_mic_isolated = stream::capture_settings(swapped).mic_isolated;
                        emit_mic_isolation(st);
                    }
                    if channel == CaptureChannel::Mic {
                        st.runtime.emit_progress(SessionProgressEvent::AudioReady {
                            session_id: st.session_id.clone(),
                            device: st.active_mic_device.clone(),
                        });
                    }
                    emit_channel_status(
                        st,
                        match channel {
                            CaptureChannel::Mic => "audio_mic_ready",
                            CaptureChannel::Speaker => "audio_speaker_ready",
                        }
                        .into(),
                    );
                }
                SourceMsg::ChannelFailed(channel, reason) => {
                    match channel {
                        CaptureChannel::Mic => st.capture_health.mic = Some(false),
                        CaptureChannel::Speaker => st.capture_health.speaker = Some(false),
                    }
                    tracing::warn!(?channel, %reason, "capture_channel_unavailable");
                    emit_channel_status(
                        st,
                        format!(
                            "{}: {reason}",
                            match channel {
                                CaptureChannel::Mic => "audio_mic_unavailable",
                                CaptureChannel::Speaker => "audio_speaker_unavailable",
                            }
                        ),
                    );
                }
                SourceMsg::CaptureFramesReady => {
                    st.capture_wake_pending.store(false, Ordering::Release);

                    for _ in 0..MAX_CAPTURE_FRAMES_PER_TICK {
                        let frame = st
                            .capture_frames
                            .as_mut()
                            .and_then(|frames| frames.try_recv().ok());
                        let Some(frame) = frame else {
                            break;
                        };
                        let now = std::time::Instant::now();
                        if !frame.captured {
                            st.healthy_since = None;
                            st.last_frame = None;
                        } else {
                            if st.last_frame.is_none_or(|last| {
                                now.duration_since(last) > Duration::from_secs(5)
                            }) {
                                st.healthy_since = Some(now);
                            }
                            st.last_frame = Some(now);
                            if st.healthy_since.is_some_and(|started| {
                                now.duration_since(started) >= Duration::from_secs(30)
                            }) {
                                if let Some(cell) = ractor::registry::where_is(
                                    crate::actors::session_supervisor_name(&st.session_id),
                                ) {
                                    let supervisor: ActorRef<crate::actors::SessionMsg> =
                                        cell.into();
                                    let _ =
                                        supervisor.cast(crate::actors::SessionMsg::SourceHealthy);
                                }
                                st.healthy_since = Some(now);
                            }
                        }
                        st.pipeline
                            .dispatch_frame(frame, st.current_mode, &st.listener_routing)
                            .await
                            .map_err(std::io::Error::other)?;
                    }

                    let has_queued_frames = st
                        .capture_frames
                        .as_ref()
                        .is_some_and(|frames| !frames.is_empty());
                    if has_queued_frames
                        && !st.capture_wake_pending.swap(true, Ordering::AcqRel)
                        && myself.cast(SourceMsg::CaptureFramesReady).is_err()
                    {
                        return Err(std::io::Error::other(
                            "failed to schedule queued capture frames",
                        )
                        .into());
                    }
                }
                SourceMsg::StreamFailed(reason) => {
                    tracing::warn!(%reason, "source_stream_failed_stopping");
                    st.runtime.emit_error(SessionErrorEvent::AudioError {
                        session_id: st.session_id.clone(),
                        error: reason.clone(),
                        device: st.active_mic_device.clone(),
                        is_fatal: true,
                    });
                    myself.stop(Some(reason));
                }
            }

            Ok(())
        }
        .instrument(span)
        .await
    }

    async fn post_stop(
        &self,
        _myself: ActorRef<Self::Msg>,
        st: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        // Drop the watcher before the capture stream so restoring the previous default
        // input cannot be observed as a device_change restart of this source.
        st._device_watcher.take();
        if let Some(cancel_token) = st.stream_cancel_token.take() {
            cancel_token.cancel();
        }
        st.capture_frames.take();
        st.capture_retry.take();
        st.capture_output.take();
        if let Some(task) = st.run_task.take() {
            task.abort();
        }

        Ok(())
    }
}

#[cfg(test)]
#[path = "mute_tests.rs"]
mod mute_tests;

#[cfg(test)]
mod tests;
