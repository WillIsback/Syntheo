use super::devices::{OutputRoutingTracker, device_switch_updates_capture};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use syntheo_device_monitor::DeviceSwitch;

use futures_util::{StreamExt, stream};
use ractor::Actor;
use tokio::sync::mpsc;

use super::*;
use crate::{
    SessionDataEvent, SessionLifecycleEvent, SessionProgressEvent, actors::source::ListenerRouting,
};
use syntheo_audio::{CaptureConfig, CaptureEvent, CaptureFrame, CaptureStream, Error};

struct TestRuntime {
    progress_tx: mpsc::UnboundedSender<SessionProgressEvent>,
    error_tx: Option<mpsc::UnboundedSender<SessionErrorEvent>>,
}

impl syntheo_storage::StorageRuntime for TestRuntime {
    fn global_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(std::env::temp_dir())
    }

    fn vault_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(std::env::temp_dir())
    }
}

impl ListenerRuntime for TestRuntime {
    fn emit_lifecycle(&self, _event: SessionLifecycleEvent) {}

    fn emit_progress(&self, event: SessionProgressEvent) {
        let _ = self.progress_tx.send(event);
    }

    fn emit_error(&self, event: SessionErrorEvent) {
        if let Some(error_tx) = &self.error_tx {
            let _ = error_tx.send(event);
        }
    }

    fn emit_data(&self, _event: SessionDataEvent) {}
}

struct TestAudio {
    capture_tx: mpsc::UnboundedSender<Option<String>>,
    default_device_name_calls: AtomicUsize,
    end_immediately: bool,
    emit_frame: bool,
    partial_audio: bool,
    gap_only: bool,
    output_tx: Option<mpsc::UnboundedSender<bool>>,
}

impl AudioProvider for TestAudio {
    fn open_capture(&self, config: CaptureConfig) -> Result<CaptureStream, Error> {
        let _ = self.capture_tx.send(config.mic_device);
        if self.gap_only {
            let silence = Arc::from(vec![0.0; config.chunk_size]);
            return Ok(CaptureStream::with_events(
                stream::iter([Ok(CaptureEvent::Gap(CaptureFrame {
                    raw_mic: Arc::clone(&silence),
                    raw_speaker: silence,
                    aec_mic: None,
                }))])
                .chain(stream::pending()),
            ));
        }
        if self.partial_audio {
            let samples = (0..16_000)
                .map(|i| (i as f32 * 440.0 * std::f32::consts::TAU / 16_000.0).sin() * 0.25)
                .collect::<Vec<_>>();
            return Ok(CaptureStream::with_events(
                stream::iter([
                    Ok(CaptureEvent::ChannelFailed {
                        channel: CaptureChannel::Mic,
                        error: Error::MicOpenFailed,
                    }),
                    Ok(CaptureEvent::ChannelReady {
                        channel: CaptureChannel::Speaker,
                        device: None,
                    }),
                    Ok(CaptureEvent::Frame(CaptureFrame {
                        raw_mic: Arc::from(vec![0.0; samples.len()]),
                        raw_speaker: Arc::from(samples),
                        aec_mic: None,
                    })),
                ])
                .chain(stream::pending()),
            ));
        }
        if self.end_immediately {
            Ok(CaptureStream::new(stream::empty()))
        } else if self.emit_frame {
            let frame = CaptureFrame {
                raw_mic: Arc::from(vec![0.0; config.chunk_size]),
                raw_speaker: Arc::from(vec![0.0; config.chunk_size]),
                aec_mic: None,
            };
            let output_tx = self.output_tx.clone();
            Ok(
                CaptureStream::new(stream::iter([Ok(frame)]).chain(stream::pending()))
                    .with_output_change(move |enabled| {
                        if let Some(output_tx) = &output_tx {
                            let _ = output_tx.send(enabled);
                        }
                    }),
            )
        } else {
            Ok(CaptureStream::new(stream::pending()))
        }
    }

    fn open_speaker_capture(
        &self,
        _sample_rate: u32,
        _chunk_size: usize,
    ) -> Result<CaptureStream, Error> {
        unreachable!()
    }

    fn open_mic_capture(
        &self,
        _device: Option<String>,
        _sample_rate: u32,
        _chunk_size: usize,
    ) -> Result<CaptureStream, Error> {
        unreachable!()
    }

    fn default_device_name(&self) -> String {
        self.default_device_name_calls
            .fetch_add(1, Ordering::Relaxed);
        "system-default".to_string()
    }

    fn list_mic_devices(&self) -> Vec<String> {
        vec![]
    }

    fn play_silence(&self) -> std::sync::mpsc::Sender<()> {
        let (tx, _rx) = std::sync::mpsc::channel();
        tx
    }

    fn play_bytes(&self, _bytes: &'static [u8]) -> std::sync::mpsc::Sender<()> {
        let (tx, _rx) = std::sync::mpsc::channel();
        tx
    }

    fn probe_mic(&self, _device: Option<String>) -> Result<(), Error> {
        Ok(())
    }

    fn probe_speaker(&self) -> Result<(), Error> {
        Ok(())
    }
}

async fn assert_source_uses_mic_device(mic_device: Option<&str>) {
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel();
    let (capture_tx, mut capture_rx) = mpsc::unbounded_channel();
    let audio = Arc::new(TestAudio {
        capture_tx,
        default_device_name_calls: AtomicUsize::new(0),
        end_immediately: false,
        emit_frame: true,
        partial_audio: false,
        gap_only: false,
        output_tx: None,
    });
    let expected = mic_device.map(str::to_string);
    let (actor, handle) = Actor::spawn(
        None,
        SourceActor,
        SourceArgs {
            mic_device: expected.clone(),
            onboarding: false,
            runtime: Arc::new(TestRuntime {
                progress_tx,
                error_tx: None,
            }),
            audio: audio.clone(),
            session_id: "test-session".to_string(),
            listener_routing: ListenerRouting::Dropped,
            mutes: ChannelMutes::default(),
        },
    )
    .await
    .unwrap();

    let captured = tokio::time::timeout(std::time::Duration::from_secs(1), capture_rx.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(captured, expected);

    let ready_device = loop {
        let event = tokio::time::timeout(std::time::Duration::from_secs(1), progress_rx.recv())
            .await
            .unwrap()
            .unwrap();
        if let SessionProgressEvent::AudioReady { device, .. } = event {
            break device;
        }
    };
    assert_eq!(ready_device, expected);
    assert_eq!(audio.default_device_name_calls.load(Ordering::Relaxed), 0);

    actor.stop(None);
    let _ = handle.await;
}

#[tokio::test]
async fn opening_without_frames_never_reports_ready_and_surfaces_capture_failure() {
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel();
    let (error_tx, mut error_rx) = mpsc::unbounded_channel();
    let (capture_tx, _capture_rx) = mpsc::unbounded_channel();
    let (actor, handle) = Actor::spawn(
        None,
        SourceActor,
        SourceArgs {
            mic_device: None,
            onboarding: false,
            runtime: Arc::new(TestRuntime {
                progress_tx,
                error_tx: Some(error_tx),
            }),
            audio: Arc::new(TestAudio {
                capture_tx,
                default_device_name_calls: AtomicUsize::new(0),
                end_immediately: false,
                emit_frame: false,
                partial_audio: false,
                gap_only: true,
                output_tx: None,
            }),
            session_id: "no-frames".into(),
            listener_routing: ListenerRouting::Dropped,
            mutes: ChannelMutes::default(),
        },
    )
    .await
    .unwrap();
    assert!(matches!(
        progress_rx.recv().await,
        Some(SessionProgressEvent::AudioInitializing { .. })
    ));
    assert!(
        matches!(tokio::time::timeout(Duration::from_secs(6), error_rx.recv()).await.unwrap(), Some(SessionErrorEvent::AudioError { error, is_fatal: false, .. }) if error == "audio_capture_unavailable")
    );
    assert!(progress_rx.try_recv().is_err());
    actor.stop(None);
    handle.await.unwrap();
}

#[test]
fn bluetooth_handoff_device_switches_do_not_interrupt_capture() {
    assert!(device_switch_updates_capture(
        &DeviceSwitch::DefaultInputChanged,
        false
    ));
    assert!(device_switch_updates_capture(
        &DeviceSwitch::DefaultOutputChanged {
            headphone: Some(true)
        },
        false
    ));
    assert!(!device_switch_updates_capture(
        &DeviceSwitch::DefaultInputChanged,
        true
    ));
    assert!(!device_switch_updates_capture(
        &DeviceSwitch::DefaultOutputChanged {
            headphone: Some(true)
        },
        true
    ));
    assert!(!device_switch_updates_capture(
        &DeviceSwitch::DeviceListChanged,
        false
    ));
}

#[test]
fn output_routing_changes_are_debounced_across_two_polls() {
    let mut tracker = OutputRoutingTracker::new(true);

    assert!(!tracker.observe(true));
    assert!(!tracker.observe(false));
    assert!(tracker.observe(false));

    let mut tracker = OutputRoutingTracker::new(true);
    assert!(!tracker.observe(false));
    assert!(!tracker.observe(true));
    assert!(!tracker.observe(false));

    let mut tracker = OutputRoutingTracker::new(true);
    assert!(!tracker.observe(false));
    assert!(tracker.observe(false));
    assert!(!tracker.observe(false));
    assert!(!tracker.observe(true));
    assert!(tracker.observe(true));
}

#[tokio::test]
async fn output_change_updates_capture_without_reopening_the_microphone() {
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel();
    let (capture_tx, mut capture_rx) = mpsc::unbounded_channel();
    let (output_tx, mut output_rx) = mpsc::unbounded_channel();
    let (actor, handle) = Actor::spawn(
        None,
        SourceActor,
        SourceArgs {
            mic_device: Some("working mic".into()),
            onboarding: false,
            runtime: Arc::new(TestRuntime {
                progress_tx,
                error_tx: None,
            }),
            audio: Arc::new(TestAudio {
                capture_tx,
                default_device_name_calls: AtomicUsize::new(0),
                end_immediately: false,
                emit_frame: true,
                partial_audio: false,
                gap_only: false,
                output_tx: Some(output_tx),
            }),
            session_id: "output-change".into(),
            listener_routing: ListenerRouting::Dropped,
            mutes: ChannelMutes::default(),
        },
    )
    .await
    .unwrap();
    assert_eq!(capture_rx.recv().await.unwrap(), Some("working mic".into()));
    while !matches!(
        progress_rx.recv().await,
        Some(SessionProgressEvent::AudioReady { .. })
    ) {}
    actor.cast(SourceMsg::OutputChanged).unwrap();
    tokio::time::timeout(Duration::from_secs(1), output_rx.recv())
        .await
        .unwrap()
        .unwrap();
    let device = actor
        .call(SourceMsg::GetMicDevice, Some(Duration::from_secs(1)))
        .await
        .unwrap();
    assert!(
        matches!(device, ractor::rpc::CallResult::Success(Some(device)) if device == "working mic")
    );
    assert!(capture_rx.try_recv().is_err());
    actor.stop(None);
    handle.await.unwrap();
}

#[tokio::test]
async fn source_opens_requested_or_default_mic() {
    assert_source_uses_mic_device(None).await;
    assert_source_uses_mic_device(Some("external-mic")).await;
}

#[tokio::test]
async fn capture_stream_eof_reports_a_restartable_failure() {
    let (progress_tx, _progress_rx) = mpsc::unbounded_channel();
    let (error_tx, mut error_rx) = mpsc::unbounded_channel();
    let (capture_tx, _capture_rx) = mpsc::unbounded_channel();
    let audio = Arc::new(TestAudio {
        capture_tx,
        default_device_name_calls: AtomicUsize::new(0),
        end_immediately: true,
        emit_frame: false,
        partial_audio: false,
        gap_only: false,
        output_tx: None,
    });
    let (_actor, handle) = Actor::spawn(
        None,
        SourceActor,
        SourceArgs {
            mic_device: None,
            onboarding: false,
            runtime: Arc::new(TestRuntime {
                progress_tx,
                error_tx: Some(error_tx),
            }),
            audio,
            session_id: "finite-stream".to_string(),
            listener_routing: ListenerRouting::Dropped,
            mutes: ChannelMutes::default(),
        },
    )
    .await
    .unwrap();

    let event = tokio::time::timeout(std::time::Duration::from_secs(1), error_rx.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        event,
        SessionErrorEvent::AudioError {
            error,
            is_fatal: true,
            ..
        } if error == "capture stream ended unexpectedly"
    ));

    tokio::time::timeout(std::time::Duration::from_secs(1), handle)
        .await
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn microphone_failure_still_transcribes_system_audio() {
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel();
    let runtime: Arc<dyn ListenerRuntime> = Arc::new(TestRuntime {
        progress_tx,
        error_tx: None,
    });
    let (live_tx, mut live_rx) = mpsc::unbounded_channel();
    let (listener, listener_handle) = Actor::spawn(None, AudioListenerProbe(live_tx), ())
        .await
        .unwrap();
    let (capture_tx, _capture_rx) = mpsc::unbounded_channel();
    let (source, source_handle) = Actor::spawn(
        None,
        SourceActor,
        SourceArgs {
            mic_device: Some("unavailable mic".into()),
            onboarding: false,
            runtime,
            audio: Arc::new(TestAudio {
                capture_tx,
                default_device_name_calls: AtomicUsize::new(0),
                end_immediately: false,
                emit_frame: false,
                partial_audio: true,
                gap_only: false,
                output_tx: None,
            }),
            session_id: "partial-audio".into(),
            listener_routing: ListenerRouting::Attached(listener.clone()),
            mutes: ChannelMutes::default(),
        },
    )
    .await
    .unwrap();
    let (live_mic, live_speaker) = tokio::time::timeout(Duration::from_secs(3), live_rx.recv())
        .await
        .unwrap()
        .unwrap();
    let ready_device = loop {
        if let Some(SessionProgressEvent::AudioReady { device, .. }) = progress_rx.recv().await {
            break device;
        }
    };
    assert_eq!(ready_device, None);
    assert_eq!(live_mic.len(), 32_000);
    assert!(live_mic.iter().all(|byte| *byte == 0));
    let expected_speaker = (0..16_000)
        .map(|i| (i as f32 * 440.0 * std::f32::consts::TAU / 16_000.0).sin() * 0.25)
        .collect::<Vec<_>>();
    assert_eq!(
        live_speaker,
        syntheo_audio_utils::f32_to_i16_bytes(expected_speaker.into_iter())
    );
    let health = source
        .call(SourceMsg::GetCaptureHealth, Some(Duration::from_secs(1)))
        .await
        .unwrap();
    assert!(matches!(
        health,
        ractor::rpc::CallResult::Success(CaptureHealth {
            mic: Some(false),
            speaker: Some(true),
            unavailable: false,
        })
    ));
    source.stop(None);
    tokio::time::timeout(Duration::from_secs(3), source_handle)
        .await
        .unwrap()
        .unwrap();
    listener.stop(None);
    listener_handle.await.unwrap();
}

struct AudioListenerProbe(mpsc::UnboundedSender<(bytes::Bytes, bytes::Bytes)>);

#[ractor::async_trait]
impl Actor for AudioListenerProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: (),
    ) -> Result<(), ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        msg: Self::Msg,
        _state: &mut (),
    ) -> Result<(), ActorProcessingErr> {
        if let ListenerMsg::AudioDual(mic, speaker, reply) = msg {
            self.0.send((mic, speaker)).unwrap();
            let _ = reply.send(crate::actors::ListenerAudioResult::Accepted);
        }
        Ok(())
    }
}
