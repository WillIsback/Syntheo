use super::*;
use std::path::PathBuf;
use syntheo_audio::{CaptureConfig, CaptureStream};

struct Runtime(PathBuf, std::sync::Mutex<Vec<(String, String)>>);
impl syntheo_storage::StorageRuntime for Runtime {
    fn global_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(self.0.clone())
    }
    fn vault_base(&self) -> Result<PathBuf, syntheo_storage::Error> {
        Ok(self.0.clone())
    }
}
impl ListenerRuntime for Runtime {
    fn emit_lifecycle(&self, _: SessionLifecycleEvent) {}
    fn emit_progress(&self, _: crate::SessionProgressEvent) {}
    fn emit_error(&self, event: crate::SessionErrorEvent) {
        if let crate::SessionErrorEvent::AudioError {
            session_id, error, ..
        } = event
        {
            self.1.lock().unwrap().push((session_id, error));
        }
    }
    fn emit_data(&self, _: crate::SessionDataEvent) {}
}
impl AudioProvider for Runtime {
    fn open_capture(&self, _: CaptureConfig) -> Result<CaptureStream, syntheo_audio::Error> {
        unreachable!()
    }
    fn open_speaker_capture(
        &self,
        _: u32,
        _: usize,
    ) -> Result<CaptureStream, syntheo_audio::Error> {
        unreachable!()
    }
    fn open_mic_capture(
        &self,
        _: Option<String>,
        _: u32,
        _: usize,
    ) -> Result<CaptureStream, syntheo_audio::Error> {
        unreachable!()
    }
    fn default_device_name(&self) -> String {
        "test".into()
    }
    fn list_mic_devices(&self) -> Vec<String> {
        vec![]
    }
    fn play_silence(&self) -> std::sync::mpsc::Sender<()> {
        unreachable!()
    }
    fn play_bytes(&self, _: &'static [u8]) -> std::sync::mpsc::Sender<()> {
        unreachable!()
    }
    fn probe_mic(&self, _: Option<String>) -> Result<(), syntheo_audio::Error> {
        Ok(())
    }
    fn probe_speaker(&self) -> Result<(), syntheo_audio::Error> {
        Ok(())
    }
}

#[tokio::test]
async fn stopped_session_failure_starts_cleanup_after_a_clean_startup() {
    let dir = tempfile::tempdir().unwrap();
    let runtime = Arc::new(Runtime(dir.path().to_path_buf(), Default::default()));
    let args = || RootArgs {
        runtime: runtime.clone(),
        audio: runtime.clone(),
    };
    let (root, task) = Actor::spawn(None, RootActor, args()).await.unwrap();
    let mut state = RootActor.pre_start(root.clone(), args()).await.unwrap();
    assert!(!state.cleanup_retry_scheduled);

    let session = dir
        .path()
        .join("sessions")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&session).unwrap();
    std::fs::write(session.join(".delete-audio-on-stop"), b"").unwrap();
    std::fs::write(session.join("audio.mp3"), b"private audio").unwrap();
    RootActor
        .handle_supervisor_evt(
            root.clone(),
            SupervisionEvent::ActorFailed(
                root.get_cell(),
                std::io::Error::other("cleanup failed").into(),
            ),
            &mut state,
        )
        .await
        .unwrap();
    assert!(state.cleanup_retry_scheduled);
    RootActor
        .handle(root.clone(), RootMsg::RetryCleanup, &mut state)
        .await
        .unwrap();
    assert!(!state.cleanup_retry_scheduled);
    assert!(!session.join("audio.mp3").exists());
    root.stop(None);
    task.await.unwrap();
}

#[tokio::test]
async fn cleanup_retries_failed_deletions_but_preserves_active_capture_audio() {
    let dir = tempfile::tempdir().unwrap();
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = dir.path().join("sessions").join(&session_id);
    std::fs::create_dir_all(&session).unwrap();
    std::fs::write(session.join(".delete-audio-on-stop"), b"").unwrap();
    let recovery = session.join("audio-recovery");
    std::fs::write(&recovery, b"blocked directory").unwrap();
    let runtime = Arc::new(Runtime(dir.path().to_path_buf(), Default::default()));
    let (retry, failed) =
        cleanup_interrupted_audio(runtime.clone(), HashSet::new(), HashMap::new()).await;
    assert!(retry);
    assert!(failed.contains_key(&session_id));
    assert!(
        runtime
            .1
            .lock()
            .unwrap()
            .iter()
            .any(|(id, error)| id == &session_id && error.starts_with("audio_deletion_failed:"))
    );
    std::fs::remove_file(&recovery).unwrap();
    std::fs::create_dir(&recovery).unwrap();
    std::fs::write(recovery.join("private.part"), b"private audio").unwrap();
    let (retry, failed) =
        cleanup_interrupted_audio(runtime.clone(), HashSet::from([session_id.clone()]), failed)
            .await;
    assert!(retry);
    assert!(recovery.join("private.part").exists());
    assert!(
        runtime
            .1
            .lock()
            .unwrap()
            .last()
            .unwrap()
            .1
            .starts_with("audio_deletion_failed:")
    );
    let (retry, failed) = cleanup_interrupted_audio(runtime.clone(), HashSet::new(), failed).await;
    assert!(!retry);
    assert!(failed.is_empty());
    assert!(!recovery.exists());
    assert!(!session.join(".delete-audio-on-stop").exists());
    assert!(
        runtime
            .1
            .lock()
            .unwrap()
            .iter()
            .any(|(id, error)| id == &session_id && error == "audio_deletion_completed")
    );
}

#[tokio::test]
async fn retained_recovery_failures_retry_without_reporting_audio_deletion() {
    let dir = tempfile::tempdir().unwrap();
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = dir.path().join("sessions").join(&session_id);
    std::fs::create_dir_all(&session).unwrap();
    std::fs::write(session.join("audio.mp3"), b"retained").unwrap();
    let recovery = session.join("audio-recovery");
    std::fs::write(&recovery, b"blocked directory").unwrap();
    let runtime = Arc::new(Runtime(dir.path().to_path_buf(), Default::default()));
    let (retry, failed) =
        cleanup_interrupted_audio(runtime.clone(), HashSet::new(), HashMap::new()).await;
    assert!(retry);
    assert_eq!(failed.get(&session_id), Some(&false));
    assert!(
        runtime
            .1
            .lock()
            .unwrap()
            .iter()
            .any(|(id, error)| id == &session_id && error.starts_with("audio_recovery_failed:"))
    );
    std::fs::remove_file(&recovery).unwrap();
    let (retry, failed) = cleanup_interrupted_audio(runtime.clone(), HashSet::new(), failed).await;
    assert!(!retry);
    assert!(failed.is_empty());
    assert_eq!(
        std::fs::read(session.join("audio.mp3")).unwrap(),
        b"retained"
    );
    let events = runtime.1.lock().unwrap();
    assert!(
        events
            .iter()
            .any(|(id, error)| id == &session_id && error == "audio_recovery_completed")
    );
    assert!(
        !events
            .iter()
            .any(|(id, error)| id == &session_id && error.starts_with("audio_deletion"))
    );
}

#[cfg(unix)]
#[tokio::test]
async fn unreadable_cleanup_paths_do_not_clear_prior_failures() {
    let dir = tempfile::tempdir().unwrap();
    let sessions = dir.path().join("sessions");
    std::os::unix::fs::symlink(&sessions, &sessions).unwrap();
    let runtime = Arc::new(Runtime(dir.path().to_path_buf(), Default::default()));
    let (retry, failed) = cleanup_interrupted_audio(
        runtime.clone(),
        HashSet::new(),
        HashMap::from([("session".to_string(), true)]),
    )
    .await;
    assert!(retry);
    assert!(failed.contains_key("session"));
    assert!(
        runtime
            .1
            .lock()
            .unwrap()
            .iter()
            .all(|(_, error)| error.starts_with("audio_deletion_failed:"))
    );
}

#[tokio::test]
async fn root_remains_available_when_startup_cleanup_fails() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("sessions"), b"unreadable directory").unwrap();
    let runtime = Arc::new(Runtime(dir.path().to_path_buf(), Default::default()));
    let (root, task) = Actor::spawn(
        None,
        RootActor,
        RootArgs {
            runtime: runtime.clone(),
            audio: runtime,
        },
    )
    .await
    .unwrap();
    let state = root
        .call(RootMsg::GetState, Some(std::time::Duration::from_secs(1)))
        .await
        .unwrap();
    assert!(matches!(state, ractor::rpc::CallResult::Success(_)));
    root.stop(None);
    task.await.unwrap();
}
