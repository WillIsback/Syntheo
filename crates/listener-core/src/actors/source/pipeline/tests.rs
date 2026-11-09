use std::path::PathBuf;
use std::sync::Arc;

use ractor::{Actor, ActorProcessingErr, ActorRef};

use syntheo_audio::CaptureFrame;

use super::*;
use crate::actors::ListenerAudioResult;
use crate::{
    ListenerRuntime, SessionDataEvent, SessionErrorEvent, SessionLifecycleEvent,
    SessionProgressEvent,
};
use syntheo_audio_utils::f32_to_i16_bytes;

struct TestRuntime;

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

    fn emit_progress(&self, _event: SessionProgressEvent) {}

    fn emit_error(&self, _event: SessionErrorEvent) {}

    fn emit_data(&self, _event: SessionDataEvent) {}
}

#[derive(Default)]
struct DropoutRuntime(std::sync::Mutex<Vec<f32>>);

impl syntheo_storage::StorageRuntime for DropoutRuntime {
    fn global_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(std::env::temp_dir())
    }

    fn vault_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(std::env::temp_dir())
    }
}

impl ListenerRuntime for DropoutRuntime {
    fn emit_lifecycle(&self, _event: SessionLifecycleEvent) {}

    fn emit_progress(&self, _event: SessionProgressEvent) {}

    fn emit_error(&self, _event: SessionErrorEvent) {}

    fn emit_data(&self, event: SessionDataEvent) {
        if let SessionDataEvent::MicDropouts { ratio, .. } = event {
            self.0.lock().unwrap().push(ratio);
        }
    }
}

#[allow(clippy::enum_variant_names)]
enum ProbeEvent {
    ListenerSingle,
    ListenerDual,
    ListenerControl,
    ListenerStopped,
}

struct ListenerProbe(tokio::sync::mpsc::UnboundedSender<ProbeEvent>);

struct OrderingListenerProbe(tokio::sync::mpsc::UnboundedSender<i16>);

#[ractor::async_trait]
impl Actor for ListenerProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            ListenerMsg::AudioSingle(bytes, reply) => {
                let _ = bytes.len();
                let _ = self.0.send(ProbeEvent::ListenerSingle);
                let _ = reply.send(ListenerAudioResult::Accepted);
            }
            ListenerMsg::AudioDual(mic, spk, reply) => {
                let _ = (mic.len(), spk.len());
                let _ = self.0.send(ProbeEvent::ListenerDual);
                let _ = reply.send(ListenerAudioResult::Accepted);
            }
            _ => {}
        }
        Ok(())
    }
}

#[ractor::async_trait]
impl Actor for OrderingListenerProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        if let ListenerMsg::AudioSingle(bytes, reply) = message {
            let value = i16::from_le_bytes([bytes[0], bytes[1]]);
            let _ = self.0.send(value);
            let _ = reply.send(ListenerAudioResult::Accepted);
        }
        Ok(())
    }
}

struct BackpressuredListenerProbe(tokio::sync::mpsc::UnboundedSender<ProbeEvent>);

struct StuckListenerProbe;

#[ractor::async_trait]
impl Actor for BackpressuredListenerProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            ListenerMsg::AudioSingle(_, reply) | ListenerMsg::AudioDual(_, _, reply) => {
                let _ = reply.send(ListenerAudioResult::Backpressured);
            }
            ListenerMsg::StreamEnded => {
                let _ = self.0.send(ProbeEvent::ListenerControl);
            }
            _ => {}
        }
        Ok(())
    }

    async fn post_stop(
        &self,
        _myself: ActorRef<Self::Msg>,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let _ = self.0.send(ProbeEvent::ListenerStopped);
        Ok(())
    }
}

#[ractor::async_trait]
impl Actor for StuckListenerProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            ListenerMsg::AudioSingle(_, reply) | ListenerMsg::AudioDual(_, _, reply) => {
                let reply = reply;
                std::future::pending::<()>().await;
                drop(reply);
            }
            _ => {}
        }
        Ok(())
    }
}

fn test_pipeline() -> Pipeline {
    Pipeline::new(Arc::new(TestRuntime), "session".to_string())
}

fn capture_frame() -> CaptureFrame {
    CaptureFrame {
        raw_mic: Arc::from([0.25_f32, -0.25, 0.5, -0.5]),
        raw_speaker: Arc::from([0.75_f32, -0.75, 1.0, -1.0]),
        aec_mic: Some(Arc::from([0.1_f32, -0.1, 0.2, -0.2])),
    }
}

fn source_frame(mic_muted: bool) -> SourceFrame {
    SourceFrame {
        captured: true,
        capture: capture_frame(),
        mic_muted,
        speaker_muted: false,
    }
}

fn source_frame_with_speaker_value(value: f32) -> SourceFrame {
    SourceFrame {
        captured: true,
        capture: CaptureFrame {
            raw_mic: Arc::from([0.0_f32; 4]),
            raw_speaker: Arc::from([value; 4]),
            aec_mic: None,
        },
        mic_muted: false,
        speaker_muted: false,
    }
}

#[tokio::test]
async fn buffered_audio_is_delivered_before_new_audio() {
    let mut pipeline = test_pipeline();

    for value in [0.1, 0.2] {
        pipeline
            .dispatch_frame(
                source_frame_with_speaker_value(value),
                ChannelMode::SpeakerOnly,
                &ListenerRouting::Buffering,
            )
            .await
            .unwrap();
    }

    let (probe_tx, mut probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (listener_ref, handle) = Actor::spawn(None, OrderingListenerProbe(probe_tx), ())
        .await
        .unwrap();
    let routing = ListenerRouting::Attached(listener_ref);
    pipeline.on_listener_routing_changed(&routing);
    pipeline
        .dispatch_frame(
            source_frame_with_speaker_value(0.3),
            ChannelMode::SpeakerOnly,
            &routing,
        )
        .await
        .unwrap();

    let mut values = Vec::new();
    for _ in 0..3 {
        values.push(
            tokio::time::timeout(std::time::Duration::from_secs(1), probe_rx.recv())
                .await
                .unwrap()
                .unwrap(),
        );
    }
    assert!(values[0] < values[1] && values[1] < values[2]);

    handle.abort();
}

#[tokio::test]
async fn listener_reconnect_replays_old_audio_before_new_audio() {
    let mut pipeline = test_pipeline();
    let (old_probe_tx, _old_probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (old_listener, old_handle) =
        Actor::spawn(None, BackpressuredListenerProbe(old_probe_tx), ())
            .await
            .unwrap();
    let old_routing = ListenerRouting::Attached(old_listener);

    for value in [0.1, 0.2] {
        pipeline
            .dispatch_frame(
                source_frame_with_speaker_value(value),
                ChannelMode::SpeakerOnly,
                &old_routing,
            )
            .await
            .unwrap();
    }
    tokio::task::yield_now().await;

    let replay = pipeline.prepare_listener_refresh();
    assert!(replay.duration_secs > 0.0);

    let (new_probe_tx, mut new_probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (new_listener, new_handle) = Actor::spawn(None, OrderingListenerProbe(new_probe_tx), ())
        .await
        .unwrap();
    let new_routing = ListenerRouting::Attached(new_listener);
    pipeline.on_listener_routing_changed(&new_routing);
    pipeline
        .dispatch_frame(
            source_frame_with_speaker_value(0.3),
            ChannelMode::SpeakerOnly,
            &new_routing,
        )
        .await
        .unwrap();

    let mut values = Vec::new();
    for _ in 0..3 {
        values.push(
            tokio::time::timeout(std::time::Duration::from_secs(1), new_probe_rx.recv())
                .await
                .unwrap()
                .unwrap(),
        );
    }
    assert!(values[0] < values[1] && values[1] < values[2]);

    old_handle.abort();
    new_handle.abort();
}

#[tokio::test]
async fn listener_backpressure_stays_bounded_without_blocking_control_messages() {
    let mut pipeline = test_pipeline();
    let (probe_tx, mut probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (listener_ref, handle) = Actor::spawn(None, BackpressuredListenerProbe(probe_tx), ())
        .await
        .unwrap();
    let routing = ListenerRouting::Attached(listener_ref.clone());

    for _ in 0..(LISTENER_DISPATCH_CAPACITY + MAX_BUFFER_CHUNKS + 100) {
        pipeline
            .dispatch_frame(source_frame(false), ChannelMode::MicAndSpeaker, &routing)
            .await
            .unwrap();
    }

    assert_eq!(pipeline.audio_buffer.len(), MAX_BUFFER_CHUNKS);

    listener_ref.cast(ListenerMsg::StreamEnded).unwrap();
    let event = tokio::time::timeout(std::time::Duration::from_secs(1), probe_rx.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(event, ProbeEvent::ListenerControl));

    handle.abort();
}

#[tokio::test]
async fn listener_ack_timeout_terminates_stuck_actor() {
    let mut pipeline = test_pipeline();
    let (listener_ref, handle) = Actor::spawn(None, StuckListenerProbe, ()).await.unwrap();
    let routing = ListenerRouting::Attached(listener_ref);

    pipeline
        .dispatch_frame(source_frame(false), ChannelMode::MicAndSpeaker, &routing)
        .await
        .unwrap();

    tokio::time::timeout(LISTENER_AUDIO_ACK_TIMEOUT + Duration::from_secs(1), handle)
        .await
        .expect("stuck listener should be terminated after its acknowledgement timeout")
        .unwrap();
}

#[tokio::test]
async fn repeated_listener_backpressure_terminates_actor_and_preserves_replay() {
    let mut pipeline = test_pipeline();
    let (probe_tx, mut probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (listener_ref, handle) = Actor::spawn(None, BackpressuredListenerProbe(probe_tx), ())
        .await
        .unwrap();
    let routing = ListenerRouting::Attached(listener_ref);

    pipeline
        .dispatch_frame(source_frame(false), ChannelMode::MicAndSpeaker, &routing)
        .await
        .unwrap();

    tokio::time::timeout(
        LISTENER_BACKPRESSURE_TIMEOUT + Duration::from_secs(1),
        handle,
    )
    .await
    .expect("listener should be terminated after sustained backpressure")
    .unwrap();

    let event = tokio::time::timeout(Duration::from_secs(1), probe_rx.recv())
        .await
        .expect("listener post_stop should complete")
        .expect("listener post_stop event");
    assert!(matches!(event, ProbeEvent::ListenerStopped));

    let replay = pipeline.prepare_listener_refresh();
    assert!(replay.duration_secs > 0.0);
    assert_eq!(pipeline.audio_buffer.len(), 1);
}

#[tokio::test]
async fn dropped_listener_clears_backlog_and_stops_future_buffering() {
    let mut pipeline = test_pipeline();

    pipeline
        .dispatch_frame(
            source_frame(false),
            ChannelMode::MicAndSpeaker,
            &ListenerRouting::Buffering,
        )
        .await
        .unwrap();
    assert_eq!(pipeline.audio_buffer.len(), 1);

    pipeline.on_listener_routing_changed(&ListenerRouting::Dropped);
    assert!(pipeline.audio_buffer.is_empty());

    let (probe_tx, mut probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (listener_ref, handle) = Actor::spawn(None, ListenerProbe(probe_tx), ())
        .await
        .unwrap();

    pipeline.on_listener_routing_changed(&ListenerRouting::Attached(listener_ref));

    pipeline
        .dispatch_frame(
            source_frame(false),
            ChannelMode::MicAndSpeaker,
            &ListenerRouting::Dropped,
        )
        .await
        .unwrap();

    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(200), probe_rx.recv())
            .await
            .is_err()
    );

    handle.abort();
}

/// A listener whose `post_stop` takes a while, like one finalizing its stream.
struct SlowStoppingListenerProbe(tokio::sync::mpsc::UnboundedSender<ProbeEvent>);

#[ractor::async_trait]
impl Actor for SlowStoppingListenerProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        if let ListenerMsg::AudioSingle(_, reply) | ListenerMsg::AudioDual(_, _, reply) = message {
            let _ = reply.send(ListenerAudioResult::Accepted);
        }
        Ok(())
    }

    async fn post_stop(
        &self,
        _myself: ActorRef<Self::Msg>,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        tokio::time::sleep(Duration::from_millis(300)).await;
        let _ = self.0.send(ProbeEvent::ListenerStopped);
        Ok(())
    }
}

/// 120 ms of speaker audio whose samples all carry `value`.
fn speech_frame(value: f32) -> SourceFrame {
    SourceFrame {
        captured: true,
        capture: CaptureFrame {
            raw_mic: Arc::from(vec![0.0_f32; 1920]),
            raw_speaker: Arc::from(vec![value; 1920]),
            aec_mic: None,
        },
        mic_muted: false,
        speaker_muted: false,
    }
}

fn frame_value(index: usize) -> f32 {
    index as f32 / 1_000.0
}

fn frame_sample(index: usize) -> i16 {
    let bytes = f32_to_i16_bytes([frame_value(index)].into_iter());
    i16::from_le_bytes([bytes[0], bytes[1]])
}

// Issue #271 : une écoute qui s'arrête (plafond de 90 s sans finalisation)
// valide son texte provisoire dans `post_stop`. L'audio envoyé pendant cet
// arrêt échouait en `SendErr` et l'acteur était alors tué, ce qui
// interrompait `post_stop` et perdait ce texte.
#[tokio::test]
async fn audio_sent_to_a_stopping_listener_does_not_interrupt_its_shutdown() {
    let mut pipeline = test_pipeline();
    let (probe_tx, mut probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (listener, handle) = Actor::spawn(None, SlowStoppingListenerProbe(probe_tx), ())
        .await
        .unwrap();
    let routing = ListenerRouting::Attached(listener.clone());
    pipeline
        .dispatch_frame(speech_frame(0.1), ChannelMode::SpeakerOnly, &routing)
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(20)).await;

    listener.stop(Some("unfinalized_cap".to_string()));
    tokio::time::sleep(Duration::from_millis(20)).await;
    for index in 0..10 {
        pipeline
            .dispatch_frame(
                speech_frame(frame_value(index)),
                ChannelMode::SpeakerOnly,
                &routing,
            )
            .await
            .unwrap();
    }

    let event = tokio::time::timeout(Duration::from_secs(2), probe_rx.recv())
        .await
        .expect("the stopping listener must finish its post_stop");
    assert!(matches!(event, Some(ProbeEvent::ListenerStopped)));
    handle.await.unwrap();
}

// Issue #271 : l'audio capturé entre l'arrêt d'une écoute et sa reconnexion
// est conservé en mémoire (borné) et rejoué au nouveau flux, au lieu de ne
// rejouer que les 5 dernières secondes.
#[tokio::test]
async fn listener_reconnect_replays_all_audio_the_old_listener_never_accepted() {
    let mut pipeline = test_pipeline();
    let (old_tx, mut old_rx) = tokio::sync::mpsc::unbounded_channel();
    let (old_listener, old_handle) = Actor::spawn(None, OrderingListenerProbe(old_tx), ())
        .await
        .unwrap();
    let old_routing = ListenerRouting::Attached(old_listener.clone());
    for index in 1..=10 {
        pipeline
            .dispatch_frame(
                speech_frame(frame_value(index)),
                ChannelMode::SpeakerOnly,
                &old_routing,
            )
            .await
            .unwrap();
    }
    for _ in 1..=10 {
        tokio::time::timeout(Duration::from_secs(1), old_rx.recv())
            .await
            .unwrap()
            .unwrap();
    }

    // The listener stops; audio keeps arriving while it shuts down, then
    // while the session waits to reconnect (batch fallback drops routing).
    old_listener.stop(None);
    old_handle.await.unwrap();
    for index in 11..=30 {
        pipeline
            .dispatch_frame(
                speech_frame(frame_value(index)),
                ChannelMode::SpeakerOnly,
                &old_routing,
            )
            .await
            .unwrap();
    }
    tokio::time::sleep(Duration::from_millis(20)).await;
    pipeline.on_listener_routing_changed(&ListenerRouting::Dropped);
    for index in 31..=80 {
        pipeline
            .dispatch_frame(
                speech_frame(frame_value(index)),
                ChannelMode::SpeakerOnly,
                &ListenerRouting::Dropped,
            )
            .await
            .unwrap();
    }

    // 70 undelivered frames (8.4 s) plus the 1.2 s already delivered.
    let replay = pipeline.prepare_listener_refresh();
    assert!(
        (replay.duration_secs - 9.6).abs() < 1e-6,
        "replayed {:.2} s instead of every undelivered frame",
        replay.duration_secs
    );

    let (new_tx, mut new_rx) = tokio::sync::mpsc::unbounded_channel();
    let (new_listener, new_handle) = Actor::spawn(None, OrderingListenerProbe(new_tx), ())
        .await
        .unwrap();
    let new_routing = ListenerRouting::Attached(new_listener);
    pipeline.on_listener_routing_changed(&new_routing);
    // Live frames keep coming; each one also drains part of the backlog.
    let mut received = Vec::new();
    for index in 81..=160 {
        pipeline
            .dispatch_frame(
                speech_frame(frame_value(index)),
                ChannelMode::SpeakerOnly,
                &new_routing,
            )
            .await
            .unwrap();
        while let Ok(Some(sample)) =
            tokio::time::timeout(Duration::from_millis(5), new_rx.recv()).await
        {
            received.push(sample);
        }
    }
    assert!(
        received.len() >= 81,
        "only {} frames delivered",
        received.len()
    );
    assert_eq!(
        received[..81],
        (1..=81).map(frame_sample).collect::<Vec<_>>(),
        "every frame is replayed once, in order, before live audio"
    );
    new_handle.abort();
}

/// Delivers 1.2 s to a listener, then captures `outage_frames` of 120 ms
/// while no listener accepts audio, and prepares the reconnection replay.
async fn replay_after_outage(outage_frames: usize) -> ListenerRefreshReplay {
    let mut pipeline = test_pipeline();
    let (old_tx, mut old_rx) = tokio::sync::mpsc::unbounded_channel();
    let (old_listener, old_handle) = Actor::spawn(None, OrderingListenerProbe(old_tx), ())
        .await
        .unwrap();
    let old_routing = ListenerRouting::Attached(old_listener.clone());
    for index in 1..=10 {
        pipeline
            .dispatch_frame(
                speech_frame(frame_value(index)),
                ChannelMode::SpeakerOnly,
                &old_routing,
            )
            .await
            .unwrap();
    }
    for _ in 1..=10 {
        tokio::time::timeout(Duration::from_secs(1), old_rx.recv())
            .await
            .unwrap()
            .unwrap();
    }
    old_listener.stop(None);
    old_handle.await.unwrap();
    pipeline.on_listener_routing_changed(&ListenerRouting::Dropped);
    for index in 0..outage_frames {
        pipeline
            .dispatch_frame(
                speech_frame(frame_value(11 + index)),
                ChannelMode::SpeakerOnly,
                &ListenerRouting::Dropped,
            )
            .await
            .unwrap();
    }
    pipeline.prepare_listener_refresh()
}

// Issue #446 : une coupure d'environ 1 s est entièrement rejouée au
// nouveau flux ; elle ne doit pas être signalée comme une perte.
#[tokio::test]
async fn short_outage_is_fully_replayed_and_reports_no_loss() {
    let replay = replay_after_outage(9).await;
    assert!(replay.complete, "a 1.08 s outage fits in the replay");
    // The 1.08 s outage plus the 1.2 s of context available.
    assert!((replay.duration_secs - 2.28).abs() < 1e-6);
}

// Issue #446 : au-delà du plafond de rejeu, le début de la coupure est
// perdu ; la reconnexion doit le signaler.
#[tokio::test]
async fn outage_longer_than_the_replay_cap_reports_a_loss() {
    let replay = replay_after_outage(150).await;
    assert!(!replay.complete, "18 s of outage outgrow the 15 s replay");
    assert!(replay.duration_secs <= MAX_REPLAY_SECS as f64);
}

#[tokio::test]
async fn outage_just_under_the_replay_cap_is_still_complete() {
    // 14.4 s of outage: the context shrinks, the outage itself is replayed.
    let replay = replay_after_outage(120).await;
    assert!(replay.complete);
}

#[test]
fn replay_stays_bounded_in_memory_and_within_the_buffer() {
    assert!(MAX_REPLAY_SECS * SAMPLE_RATE as usize <= MAX_BUFFER_CHUNKS * 1920 / 2);
    let mut history = ReplayHistory::new(SAMPLE_RATE as usize * MAX_REPLAY_SECS);
    for _ in 0..1_000 {
        history.push(BufferedAudio::new(
            Arc::from(vec![0.0_f32; 1920]),
            Arc::from(vec![0.0_f32; 1920]),
            ChannelMode::MicAndSpeaker,
            0,
        ));
    }
    assert!(history.duration_secs() <= MAX_REPLAY_SECS as f64);
}

#[test]
fn select_tracks_picks_mic_by_availability_mute_and_mode() {
    for (mic_muted, aec_mic, mode, expected_mic, label) in [
        (
            false,
            true,
            ChannelMode::MicAndSpeaker,
            vec![0.1, -0.1, 0.2, -0.2],
            "prefers aec mic",
        ),
        (
            false,
            false,
            ChannelMode::MicAndSpeaker,
            vec![0.25, -0.25, 0.5, -0.5],
            "falls back to raw mic",
        ),
        (
            true,
            true,
            ChannelMode::MicAndSpeaker,
            vec![0.0, 0.0, 0.0, 0.0],
            "zeroes muted mic",
        ),
        (
            false,
            true,
            ChannelMode::SpeakerOnly,
            vec![0.0, 0.0, 0.0, 0.0],
            "zeroes mic for speaker only",
        ),
    ] {
        let mut frame = source_frame(mic_muted);
        if !aec_mic {
            frame.capture.aec_mic = None;
        }

        let (mic, speaker) = Pipeline::select_tracks(frame, mode);
        assert_eq!(mic, expected_mic, "case: {label}");
        assert_eq!(&*speaker, &[0.75, -0.75, 1.0, -1.0], "case: {label}");
    }
}

// Issue 447 : le son système coupé part en silence vers le STT, le micro garde sa voie
// (l'annulation d'écho, en amont, garde la vraie référence : le son coupé ne revient pas
// par le micro).
#[test]
fn select_tracks_silences_the_muted_speaker_and_keeps_the_mic() {
    for (mic_muted, speaker_muted, mode, expected_mic, expected_speaker, label) in [
        (
            false,
            true,
            ChannelMode::MicAndSpeaker,
            vec![0.1, -0.1, 0.2, -0.2],
            vec![0.0; 4],
            "speaker muted keeps the aec mic",
        ),
        (
            true,
            true,
            ChannelMode::MicAndSpeaker,
            vec![0.0; 4],
            vec![0.0; 4],
            "both channels muted",
        ),
        (
            true,
            false,
            ChannelMode::MicAndSpeaker,
            vec![0.0; 4],
            vec![0.75, -0.75, 1.0, -1.0],
            "mic muted keeps the speaker",
        ),
        (
            false,
            true,
            ChannelMode::SpeakerOnly,
            vec![0.0; 4],
            vec![0.0; 4],
            "speaker only",
        ),
    ] {
        let mut frame = source_frame(mic_muted);
        frame.speaker_muted = speaker_muted;

        let (mic, speaker) = Pipeline::select_tracks(frame, mode);
        assert_eq!(mic, expected_mic, "case: {label}");
        assert_eq!(&*speaker, expected_speaker.as_slice(), "case: {label}");
    }
}

#[tokio::test]
async fn muted_speaker_reaches_the_listener_as_silence_with_the_same_length() {
    let mut pipeline = test_pipeline();
    let mut frame = speech_frame(0.5);
    frame.speaker_muted = true;
    pipeline
        .dispatch_frame(
            frame,
            ChannelMode::MicAndSpeaker,
            &ListenerRouting::Buffering,
        )
        .await
        .unwrap();

    let item = pipeline.audio_buffer.pop().expect("buffered item");
    assert_eq!(item.spk.len(), 1920, "the stream keeps its cadence");
    assert!(item.spk.iter().all(|sample| *sample == 0.0));
    assert_eq!(pipeline.captured_samples, 1920);
}

fn feed_window(monitor: &mut DropoutMonitor, zero_ratio: f32) {
    let chunk = 1_600;
    let zeros = (chunk as f32 * zero_ratio) as usize;
    let mut frame = vec![0.01_f32; chunk];
    frame[..zeros].fill(0.0);
    for _ in 0..DROPOUT_WINDOW_SAMPLES.div_ceil(chunk) {
        monitor.observe(&frame);
    }
}

#[test]
fn dropout_monitor_reports_gated_mic_once_until_reset() {
    let runtime = Arc::new(DropoutRuntime::default());
    let mut monitor = DropoutMonitor::new(runtime.clone(), "session".to_string());

    feed_window(&mut monitor, 0.3);
    feed_window(&mut monitor, 0.3);

    let reported = runtime.0.lock().unwrap().clone();
    assert_eq!(reported.len(), 1);
    assert!((reported[0] - 0.3).abs() < 0.01, "ratio {}", reported[0]);

    monitor.reset();
    feed_window(&mut monitor, 0.5);

    assert_eq!(runtime.0.lock().unwrap().len(), 2);
}

#[test]
fn dropout_monitor_ignores_healthy_or_not_yet_started_mic() {
    let runtime = Arc::new(DropoutRuntime::default());
    let mut monitor = DropoutMonitor::new(runtime.clone(), "session".to_string());

    feed_window(&mut monitor, 0.1);
    feed_window(&mut monitor, 0.0);

    assert!(runtime.0.lock().unwrap().is_empty());

    let runtime = Arc::new(DropoutRuntime::default());
    let mut monitor = DropoutMonitor::new(runtime.clone(), "session".to_string());

    for _ in 0..20 {
        monitor.observe(&[0.0; 1_600]);
    }
    feed_window(&mut monitor, 0.0);

    assert!(runtime.0.lock().unwrap().is_empty());
}
