use super::listener_retry::{
    listener_retry_base_delay, listener_retry_delay, should_retry_listener_failure,
};
use crate::actors::ListenerInitError;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Instant, SystemTime};

use ractor::ActorStatus;
use syntheo_audio::{AudioProvider, CaptureConfig, CaptureStream};
use syntheo_supervisor::RestartTracker;

use super::*;
use crate::{
    ListenerRuntime, SessionDataEvent, SessionErrorEvent, SessionProgressEvent, TranscriptionMode,
    actors::SessionParams,
};

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
    fn emit_lifecycle(&self, _event: crate::SessionLifecycleEvent) {}

    fn emit_progress(&self, _event: SessionProgressEvent) {}

    fn emit_error(&self, _event: SessionErrorEvent) {}

    fn emit_data(&self, _event: SessionDataEvent) {}
}

impl AudioProvider for TestRuntime {
    fn open_capture(&self, _config: CaptureConfig) -> Result<CaptureStream, syntheo_audio::Error> {
        Ok(CaptureStream::new(futures_util::stream::pending()))
    }
    fn open_speaker_capture(
        &self,
        _sample_rate: u32,
        _chunk_size: usize,
    ) -> Result<CaptureStream, syntheo_audio::Error> {
        Ok(CaptureStream::new(futures_util::stream::pending()))
    }
    fn open_mic_capture(
        &self,
        _device: Option<String>,
        _sample_rate: u32,
        _chunk_size: usize,
    ) -> Result<CaptureStream, syntheo_audio::Error> {
        unimplemented!()
    }
    fn default_device_name(&self) -> String {
        "test".to_string()
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
    fn probe_mic(&self, _device: Option<String>) -> Result<(), syntheo_audio::Error> {
        Ok(())
    }
    fn probe_speaker(&self) -> Result<(), syntheo_audio::Error> {
        Ok(())
    }
}

struct StopProbe {
    label: &'static str,
    tx: tokio::sync::mpsc::UnboundedSender<&'static str>,
}

#[ractor::async_trait]
impl Actor for StopProbe {
    type Msg = ();
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn post_stop(
        &self,
        _myself: ActorRef<Self::Msg>,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let _ = self.tx.send(self.label);
        Ok(())
    }
}

struct SessionRetryProbe(tokio::sync::mpsc::UnboundedSender<()>);

#[ractor::async_trait]
impl Actor for SessionRetryProbe {
    type Msg = SessionMsg;
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
        if matches!(message, SessionMsg::RetryListener) {
            let _ = self.0.send(());
        }
        Ok(())
    }
}

struct RecordingRuntime {
    lifecycle_events: std::sync::Mutex<Vec<crate::SessionLifecycleEvent>>,
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
    fn emit_lifecycle(&self, event: crate::SessionLifecycleEvent) {
        self.lifecycle_events.lock().unwrap().push(event);
    }

    fn emit_progress(&self, _event: SessionProgressEvent) {}

    fn emit_error(&self, _event: SessionErrorEvent) {}

    fn emit_data(&self, _event: SessionDataEvent) {}
}

pub(super) fn test_ctx() -> SessionContext {
    SessionContext {
        runtime: Arc::new(TestRuntime),
        audio: Arc::new(TestRuntime),
        requested_transcription_mode: crate::TranscriptionMode::Live,
        params: SessionParams {
            retain_audio: None,
            session_id: "session".to_string(),
            languages: vec![],
            onboarding: false,
            transcription_mode: crate::TranscriptionMode::Live,
            model: "test-model".to_string(),
            base_url: "http://localhost:1234".to_string(),
            api_key: "test-key".to_string(),
            keywords: vec![],
            mic_device: None,
            participant_human_ids: vec![],
            self_human_id: None,
            speaker_assignments: vec![],
        },
        app_dir: std::env::temp_dir(),
        started_at_instant: Instant::now(),
        started_at_system: SystemTime::now(),
        live_transcript: Default::default(),
        mutes: Default::default(),
    }
}

pub(super) fn test_state(ctx: SessionContext) -> SessionState {
    SessionState {
        ctx,
        source_cell: None,
        listener_cell: None,
        source_restarts: RestartTracker::new(),
        mode: SessionModeState::new(TranscriptionMode::Live, TranscriptionMode::Live),
        listener_retry_attempt: 0,
        listener_mic_isolated: false,
        shutting_down: false,
    }
}

fn test_update(
    languages: Vec<syntheo_language::Language>,
    participant_human_ids: Vec<&str>,
    self_human_id: Option<&str>,
) -> SessionConfigUpdate {
    SessionConfigUpdate {
        session_id: "session".to_string(),
        languages,
        participant_human_ids: participant_human_ids
            .into_iter()
            .map(ToString::to_string)
            .collect(),
        self_human_id: self_human_id.map(ToString::to_string),
        speaker_assignments: vec![],
    }
}

#[test]
fn config_update_keeps_stream_for_participant_and_speaker_changes() {
    let mut ctx = test_ctx();
    ctx.params.participant_human_ids = vec!["self".to_string(), "remote-a".to_string()];
    ctx.params.self_human_id = Some("self".to_string());
    let state = test_state(ctx);
    let mut update = test_update(vec![], vec!["self", "remote-a"], Some("self"));
    update.speaker_assignments = vec![syntheo_transcript::IdentityAssignment {
        human_id: "remote-a".to_string(),
        scope: syntheo_transcript::IdentityScope::ChannelSpeaker {
            channel: syntheo_transcript::ChannelProfile::RemoteParty,
            speaker_index: 0,
        },
    }];
    assert!(
        !update_requires_listener_refresh(&state.ctx.params, &update),
        "speaker assignments"
    );

    let mut ctx = test_ctx();
    ctx.params.participant_human_ids = vec!["self".to_string()];
    ctx.params.self_human_id = Some("self".to_string());
    let state = test_state(ctx);
    let update = test_update(vec![], vec!["self", "remote-a", "remote-b"], Some("self"));
    assert!(
        !update_requires_listener_refresh(&state.ctx.params, &update),
        "calendar attendance"
    );

    let mut ctx = test_ctx();
    ctx.params.participant_human_ids = vec!["self".to_string(), "remote-a".to_string()];
    ctx.params.self_human_id = Some("self".to_string());
    let state = test_state(ctx);
    let update = test_update(vec![], vec!["self", "remote-b"], Some("self"));
    assert!(
        !update_requires_listener_refresh(&state.ctx.params, &update),
        "same speaker count"
    );
}

#[test]
fn config_update_refreshes_when_languages_change() {
    let mut ctx = test_ctx();
    ctx.params.languages = vec![syntheo_language::ISO639::En.into()];
    let state = test_state(ctx);
    let update = test_update(
        vec![
            syntheo_language::ISO639::En.into(),
            syntheo_language::ISO639::Ko.into(),
        ],
        vec![],
        None,
    );

    assert!(update_requires_listener_refresh(&state.ctx.params, &update));
}

#[test]
fn transient_listener_failures_retry_with_capped_backoff() {
    assert!(should_retry_listener_failure(
        &DegradedError::ConnectionTimeout
    ));
    assert_eq!(listener_retry_base_delay(0), Duration::from_secs(1));
    assert_eq!(listener_retry_base_delay(1), Duration::from_secs(2));
    assert_eq!(listener_retry_base_delay(4), Duration::from_secs(20));
    assert_eq!(listener_retry_base_delay(20), Duration::from_secs(30));
}

/// Une coupure isolée du flux (fermeture côté serveur ou proxy, rechargement
/// de Caddy) doit être réparée vite : chaque seconde de reconnexion est une
/// seconde affichée « en pause » et perdue pour la transcription.
#[test]
fn first_listener_reconnect_is_fast() {
    let first = listener_retry_delay(0, None, "session-a");
    assert!(first >= Duration::from_secs(1));
    assert!(first <= Duration::from_millis(1_200));
}

#[test]
fn listener_retry_delay_adds_jitter_and_honors_retry_after() {
    let normal = listener_retry_delay(1, None, "session-a");
    assert!(normal >= Duration::from_secs(2));
    assert!(normal <= Duration::from_millis(2_400));

    let rate_limited = listener_retry_delay(0, Some(Duration::from_secs(60)), "session-a");
    assert!(rate_limited >= Duration::from_secs(30));
    assert!(rate_limited <= Duration::from_secs(36));
}

#[test]
fn permanent_listener_failures_do_not_retry() {
    assert!(!should_retry_listener_failure(
        &DegradedError::AuthenticationFailed {
            provider: "test".to_string(),
        }
    ));
    let degraded = DegradedError::ProviderConfiguration {
        provider: "test".to_string(),
        message: "invalid endpoint".to_string(),
    };
    assert!(!should_retry_listener_failure(&degraded));

    let error = ractor::SpawnErr::StartupFailed(Box::new(ListenerInitError {
        message: "listener failed".to_string(),
        degraded: Some(degraded),
        retry_after: Some(Duration::from_secs(7)),
    }));
    assert_eq!(listener_retry_after(&error), Some(Duration::from_secs(7)));
    assert!(matches!(
        classify_listener_spawn_failure(&test_state(test_ctx()), &error),
        DegradedError::ProviderConfiguration { .. }
    ));
}

#[tokio::test]
async fn stalled_remote_listeners_schedule_reconnection_without_stopping_recording() {
    for base_url in ["https://api.example.com/stt", "http://192.168.1.87:8000/v1"] {
        let runtime = Arc::new(RecordingRuntime {
            lifecycle_events: std::sync::Mutex::new(vec![]),
        });
        let mut ctx = test_ctx();
        ctx.runtime = runtime.clone();
        ctx.params.base_url = base_url.to_string();
        let mut state = test_state(ctx);
        let (retry_tx, mut retry_rx) = tokio::sync::mpsc::unbounded_channel();
        let (supervisor, supervisor_handle) = Actor::spawn(None, SessionRetryProbe(retry_tx), ())
            .await
            .unwrap();

        handle_listener_failure(
            &supervisor,
            &mut state,
            DegradedError::ConnectionTimeout,
            None,
        )
        .await;

        tokio::time::timeout(Duration::from_secs(3), retry_rx.recv())
            .await
            .expect("stalled streams should schedule a reconnect")
            .unwrap();
        assert!(!state.shutting_down);
        assert!(state.mode.should_retry_listener());
        assert!(matches!(
            runtime.lifecycle_events.lock().unwrap().last(),
            Some(crate::SessionLifecycleEvent::Active {
                requested_transcription_mode: TranscriptionMode::Live,
                current_transcription_mode: TranscriptionMode::Batch,
                error: Some(DegradedError::ConnectionTimeout),
                ..
            })
        ));

        supervisor.stop(None);
        supervisor_handle.await.unwrap();
    }
}

#[tokio::test]
async fn shutdown_children_waits_in_source_then_listener_order() {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let (source_ref, _) = Actor::spawn(
        None,
        StopProbe {
            label: "source",
            tx: tx.clone(),
        },
        (),
    )
    .await
    .unwrap();
    let (listener_ref, _) = Actor::spawn(
        None,
        StopProbe {
            label: "listener",
            tx,
        },
        (),
    )
    .await
    .unwrap();

    let mut state = SessionState {
        ctx: test_ctx(),
        source_cell: Some(source_ref.get_cell()),
        listener_cell: Some(listener_ref.get_cell()),
        source_restarts: RestartTracker::new(),
        mode: SessionModeState::new(TranscriptionMode::Live, TranscriptionMode::Live),
        listener_retry_attempt: 0,
        listener_mic_isolated: false,
        shutting_down: false,
    };

    children::shutdown_children(&mut state, "test_shutdown").await;

    let first = tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
        .await
        .unwrap()
        .unwrap();
    let second = tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
        .await
        .unwrap()
        .unwrap();

    assert_eq!([first, second], ["source", "listener"]);
    assert_eq!(source_ref.get_status(), ActorStatus::Stopped);
    assert_eq!(listener_ref.get_status(), ActorStatus::Stopped);
}
