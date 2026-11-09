//! Couper le micro ou le son système pendant l'écoute (issue 447) : la capture et le STT
//! continuent, l'état survit à une reconnexion du STT et à une relance de la source.

use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use futures_util::stream;
use ractor::{Actor, ActorProcessingErr, ActorRef, call_t};
use tokio::sync::mpsc;

use super::{ChannelMutes, ListenerRouting, SourceActor, SourceArgs, SourceMsg};
use crate::{
    ListenerRuntime, SessionDataEvent, SessionErrorEvent, SessionLifecycleEvent,
    SessionProgressEvent, actors::ListenerMsg,
};
use syntheo_audio::{AudioProvider, CaptureConfig, CaptureFrame, CaptureStream, Error};

const CHUNK: usize = 1_600;

#[derive(Default)]
struct RecordingRuntime(Mutex<Vec<(&'static str, bool)>>);

impl RecordingRuntime {
    fn mute_events(&self) -> Vec<(&'static str, bool)> {
        self.0.lock().unwrap().clone()
    }
}

impl syntheo_storage::StorageRuntime for RecordingRuntime {
    fn global_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(std::env::temp_dir())
    }

    fn vault_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(std::env::temp_dir())
    }
}

impl ListenerRuntime for RecordingRuntime {
    fn emit_lifecycle(&self, _event: SessionLifecycleEvent) {}
    fn emit_progress(&self, _event: SessionProgressEvent) {}
    fn emit_error(&self, _event: SessionErrorEvent) {}

    fn emit_data(&self, event: SessionDataEvent) {
        let entry = match event {
            SessionDataEvent::MicMuted { value, .. } => ("mic", value),
            SessionDataEvent::SpeakerMuted { value, .. } => ("speaker", value),
            _ => return,
        };
        self.0.lock().unwrap().push(entry);
    }
}

/// Capture pilotée par le test : chaque trame envoyée sur `frames` sort du flux. Compte les
/// ouvertures de capture : une relance de la session en ouvrirait une seconde.
struct ScriptedAudio {
    opens: AtomicUsize,
    frames: Mutex<Option<mpsc::UnboundedReceiver<CaptureFrame>>>,
}

impl ScriptedAudio {
    fn new() -> (Arc<Self>, mpsc::UnboundedSender<CaptureFrame>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let audio = Arc::new(Self {
            opens: AtomicUsize::new(0),
            frames: Mutex::new(Some(rx)),
        });
        (audio, tx)
    }
}

impl AudioProvider for ScriptedAudio {
    fn open_capture(&self, _config: CaptureConfig) -> Result<CaptureStream, Error> {
        self.opens.fetch_add(1, Ordering::SeqCst);
        let Some(rx) = self.frames.lock().unwrap().take() else {
            return Ok(CaptureStream::new(stream::pending()));
        };
        Ok(CaptureStream::new(stream::unfold(rx, |mut rx| async {
            rx.recv().await.map(|frame| (Ok(frame), rx))
        })))
    }

    fn open_speaker_capture(&self, _rate: u32, _chunk: usize) -> Result<CaptureStream, Error> {
        unreachable!()
    }

    fn open_mic_capture(
        &self,
        _device: Option<String>,
        _rate: u32,
        _chunk: usize,
    ) -> Result<CaptureStream, Error> {
        unreachable!()
    }

    fn default_device_name(&self) -> String {
        "system-default".to_string()
    }

    fn list_mic_devices(&self) -> Vec<String> {
        vec![]
    }

    fn play_silence(&self) -> std::sync::mpsc::Sender<()> {
        std::sync::mpsc::channel().0
    }

    fn play_bytes(&self, _bytes: &'static [u8]) -> std::sync::mpsc::Sender<()> {
        std::sync::mpsc::channel().0
    }

    fn probe_mic(&self, _device: Option<String>) -> Result<(), Error> {
        Ok(())
    }

    fn probe_speaker(&self) -> Result<(), Error> {
        Ok(())
    }
}

fn loud_frame() -> CaptureFrame {
    CaptureFrame {
        raw_mic: Arc::from(vec![0.25; CHUNK]),
        raw_speaker: Arc::from(vec![0.5; CHUNK]),
        aec_mic: None,
    }
}

type Delivered = (bytes::Bytes, bytes::Bytes);

struct ListenerProbe(mpsc::UnboundedSender<Delivered>);

#[ractor::async_trait]
impl Actor for ListenerProbe {
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
            let _ = self.0.send((mic, speaker));
            let _ = reply.send(crate::actors::ListenerAudioResult::Accepted);
        }
        Ok(())
    }
}

async fn spawn_listener() -> (ActorRef<ListenerMsg>, mpsc::UnboundedReceiver<Delivered>) {
    let (tx, rx) = mpsc::unbounded_channel();
    let (listener, _) = Actor::spawn(None, ListenerProbe(tx), ()).await.unwrap();
    (listener, rx)
}

/// Trame reçue par l'écouteur après l'envoi d'une trame sonore. L'appel à la source d'abord :
/// ses messages précédents (les bascules) sont traités avant que la trame soit lue.
async fn deliver(
    source: &ActorRef<SourceMsg>,
    frames: &mpsc::UnboundedSender<CaptureFrame>,
    delivered: &mut mpsc::UnboundedReceiver<Delivered>,
) -> Delivered {
    call_t!(source, SourceMsg::GetMicMute, 1000).unwrap();
    frames.send(loud_frame()).unwrap();
    tokio::time::timeout(Duration::from_secs(3), delivered.recv())
        .await
        .unwrap()
        .unwrap()
}

fn is_silent(bytes: &[u8]) -> bool {
    bytes.iter().all(|byte| *byte == 0)
}

async fn spawn_source(
    runtime: Arc<RecordingRuntime>,
    audio: Arc<ScriptedAudio>,
    routing: ListenerRouting,
    mutes: ChannelMutes,
    session_id: &str,
) -> (ActorRef<SourceMsg>, ractor::concurrency::JoinHandle<()>) {
    Actor::spawn(
        None,
        SourceActor,
        SourceArgs {
            mic_device: None,
            onboarding: false,
            runtime,
            audio,
            session_id: session_id.to_string(),
            listener_routing: routing,
            mutes,
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn each_channel_mutes_on_its_own_without_restarting_the_capture() {
    let runtime = Arc::new(RecordingRuntime::default());
    let (audio, frames) = ScriptedAudio::new();
    let (listener, mut delivered) = spawn_listener().await;
    let (source, handle) = spawn_source(
        runtime.clone(),
        audio.clone(),
        ListenerRouting::Attached(listener.clone()),
        ChannelMutes::default(),
        "mute-each-channel",
    )
    .await;

    // Le micro passe par le masque de voix (VAD) : seul le son système se lit dans les octets,
    // la voie du micro est vérifiée par `select_tracks` (pipeline.rs).
    let (_, speaker) = deliver(&source, &frames, &mut delivered).await;
    assert!(!is_silent(&speaker));

    source.cast(SourceMsg::SetSpeakerMute(true)).unwrap();
    assert!(call_t!(source, SourceMsg::GetSpeakerMute, 1000).unwrap());
    assert!(!call_t!(source, SourceMsg::GetMicMute, 1000).unwrap());
    let (_, speaker) = deliver(&source, &frames, &mut delivered).await;
    assert!(is_silent(&speaker));

    source.cast(SourceMsg::SetSpeakerMute(false)).unwrap();
    source.cast(SourceMsg::SetMicMute(true)).unwrap();
    source.cast(SourceMsg::SetMicMute(true)).unwrap();
    let (mic, speaker) = deliver(&source, &frames, &mut delivered).await;
    assert!(is_silent(&mic));
    assert!(!is_silent(&speaker), "the others are still transcribed");

    source.cast(SourceMsg::SetSpeakerMute(true)).unwrap();
    let (mic, speaker) = deliver(&source, &frames, &mut delivered).await;
    assert!(is_silent(&mic) && is_silent(&speaker));

    // Un événement par changement réel, et une seule capture ouverte : ni relance de la
    // session ni réouverture des périphériques.
    assert_eq!(
        runtime.mute_events(),
        vec![
            ("speaker", true),
            ("speaker", false),
            ("mic", true),
            ("speaker", true)
        ]
    );
    assert_eq!(audio.opens.load(Ordering::SeqCst), 1);
    assert_eq!(source.get_status(), ractor::ActorStatus::Running);

    source.stop(None);
    handle.await.unwrap();
    listener.stop(None);
}

#[tokio::test]
async fn muted_channels_survive_an_stt_reconnection_and_a_source_restart() {
    let runtime = Arc::new(RecordingRuntime::default());
    let (audio, frames) = ScriptedAudio::new();
    let mutes = ChannelMutes::default();
    let (first_listener, mut first_delivered) = spawn_listener().await;
    let (source, handle) = spawn_source(
        runtime.clone(),
        audio.clone(),
        ListenerRouting::Attached(first_listener.clone()),
        mutes.clone(),
        "mute-reconnection",
    )
    .await;
    deliver(&source, &frames, &mut first_delivered).await;

    source.cast(SourceMsg::SetMicMute(true)).unwrap();
    source.cast(SourceMsg::SetSpeakerMute(true)).unwrap();
    assert!(call_t!(source, SourceMsg::GetSpeakerMute, 1000).unwrap());

    // Reconnexion du STT, comme le superviseur la fait : la source prépare le rejeu, puis
    // s'attache au nouvel écouteur. Elle-même ne change pas.
    call_t!(source, SourceMsg::PrepareListenerRefresh, 1000).unwrap();
    first_listener.stop(None);
    let (next_listener, mut next_delivered) = spawn_listener().await;
    source
        .cast(SourceMsg::SetListenerRouting(ListenerRouting::Attached(
            next_listener.clone(),
        )))
        .unwrap();

    assert!(call_t!(source, SourceMsg::GetMicMute, 1000).unwrap());
    assert!(call_t!(source, SourceMsg::GetSpeakerMute, 1000).unwrap());
    // Le rejeu d'avant la coupure passe d'abord ; la trame en direct arrive en dernier.
    frames.send(loud_frame()).unwrap();
    let mut live = None;
    while let Ok(Some(item)) =
        tokio::time::timeout(Duration::from_millis(500), next_delivered.recv()).await
    {
        live = Some(item);
    }
    let (mic, speaker) = live.expect("live frame after the reconnection");
    assert!(is_silent(&mic) && is_silent(&speaker));
    assert_eq!(audio.opens.load(Ordering::SeqCst), 1);

    // Relance de la source (panne de capture) : la nouvelle reçoit les drapeaux de la session.
    source.stop(None);
    handle.await.unwrap();
    let (restarted_audio, _frames) = ScriptedAudio::new();
    let (restarted, restarted_handle) = spawn_source(
        runtime,
        restarted_audio,
        ListenerRouting::Dropped,
        mutes,
        "mute-reconnection",
    )
    .await;
    assert!(call_t!(restarted, SourceMsg::GetMicMute, 1000).unwrap());
    assert!(call_t!(restarted, SourceMsg::GetSpeakerMute, 1000).unwrap());

    restarted.stop(None);
    restarted_handle.await.unwrap();
    next_listener.stop(None);
}
