use super::*;
use assert_fs::TempDir;
use std::time::SystemTime;

struct NoopRuntime;
impl AudioImportRuntime for NoopRuntime {
    fn emit(&self, _event: AudioImportEvent) {}
}

const KNOWN_SESSION_ID: &str = "11111111-1111-4111-8111-111111111111";
const ORPHAN_SESSION_ID: &str = "22222222-2222-4222-8222-222222222222";
const META_SESSION_ID: &str = "33333333-3333-4333-8333-333333333333";
const FRESH_ORPHAN_SESSION_ID: &str = "44444444-4444-4444-8444-444444444444";

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .try_into()
        .unwrap()
}

fn write_audio(path: &Path) {
    std::fs::write(path, b"audio").unwrap();
}

#[test]
fn copy_duplicates_primary_audio_without_artifacts() {
    let temp = TempDir::new().unwrap();
    let source_dir = temp.path().join("source");
    let target_dir = temp.path().join("target");
    std::fs::create_dir_all(&source_dir).unwrap();
    write_audio(&source_dir.join("audio.wav"));
    write_audio(&source_dir.join("audio_mic.wav"));

    assert!(copy(&source_dir, &target_dir).unwrap());
    assert_eq!(
        std::fs::read(source_dir.join("audio.wav")).unwrap(),
        std::fs::read(target_dir.join("audio.wav")).unwrap()
    );
    assert!(!target_dir.join("audio_mic.wav").exists());
    assert!(source_dir.join("audio.wav").exists());
}

#[test]
fn copy_without_source_audio_returns_false() {
    let temp = TempDir::new().unwrap();
    let source_dir = temp.path().join("source");
    let target_dir = temp.path().join("target");
    std::fs::create_dir_all(&source_dir).unwrap();

    assert!(!copy(&source_dir, &target_dir).unwrap());
    assert!(!target_dir.exists() || path(&target_dir).is_none());
}

#[test]
fn copy_refuses_when_target_already_has_audio() {
    let temp = TempDir::new().unwrap();
    let source_dir = temp.path().join("source");
    let target_dir = temp.path().join("target");
    std::fs::create_dir_all(&source_dir).unwrap();
    std::fs::create_dir_all(&target_dir).unwrap();
    write_audio(&source_dir.join("audio.mp3"));
    write_audio(&target_dir.join("audio.wav"));

    let error = copy(&source_dir, &target_dir).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
    assert_eq!(error.to_string(), "audio_target_exists");
}

#[test]
fn test_delete_removes_audio_artifacts() {
    let temp = TempDir::new().unwrap();
    let session_dir = temp.path();
    for artifact in AUDIO_ARTIFACTS {
        write_audio(&session_dir.join(artifact));
    }
    let note_path = session_dir.join("note.md");
    std::fs::write(&note_path, b"keep").unwrap();

    assert!(delete(session_dir).unwrap());

    for artifact in AUDIO_ARTIFACTS {
        assert!(!session_dir.join(artifact).exists());
    }
    assert!(note_path.exists());
}

#[test]
fn deleting_audio_also_removes_pending_recovery_and_derived_files() {
    let temp = TempDir::new().unwrap();
    let recovery = temp.path().join("audio-recovery");
    std::fs::create_dir_all(recovery.join("upload")).unwrap();
    write_audio(&recovery.join("chunk.mp3"));
    write_audio(&recovery.join("upload").join("channel.wav"));
    std::fs::write(temp.path().join(".delete-audio-on-stop"), b"").unwrap();
    assert!(delete(temp.path()).unwrap());
    assert!(!recovery.exists());
    assert!(!temp.path().join(".delete-audio-on-stop").exists());
    assert!(!delete(temp.path()).unwrap());
}

#[test]
fn retention_deletes_recovery_even_when_the_archive_cannot_be_removed() {
    let temp = TempDir::new().unwrap();
    let recovery = temp.path().join("audio-recovery");
    std::fs::create_dir_all(&recovery).unwrap();
    write_audio(&recovery.join("chunk.mp3"));
    std::fs::create_dir(temp.path().join("audio.mp3")).unwrap();
    std::fs::write(temp.path().join(".delete-audio-on-stop"), b"").unwrap();
    assert!(delete(temp.path()).is_err());
    assert!(!recovery.exists());
    assert!(temp.path().join(".delete-audio-on-stop").exists());
}

#[test]
fn orphan_expiry_observes_recent_writes_inside_an_old_recovery_directory() {
    let temp = TempDir::new().unwrap();
    let dir = temp.path().join(ORPHAN_SESSION_ID);
    let recovery = dir.join("audio-recovery");
    std::fs::create_dir_all(&recovery).unwrap();
    let chunk = recovery.join("recording.part");
    write_audio(&chunk);
    let created_ms = now_ms();
    let recent = UNIX_EPOCH + Duration::from_millis(created_ms + 100_000);
    std::fs::File::options()
        .write(true)
        .open(&chunk)
        .unwrap()
        .set_times(std::fs::FileTimes::new().set_modified(recent))
        .unwrap();
    assert!(!orphan_audio_expired(&dir, created_ms + 50_000).unwrap());
    assert!(orphan_audio_expired(&dir, created_ms + 150_000).unwrap());
}

#[test]
fn metadata_hashes_the_selected_final_audio_file() {
    let temp = TempDir::new().unwrap();
    std::fs::write(temp.path().join("audio.mp3"), b"abc").unwrap();

    let metadata = metadata(temp.path()).unwrap().unwrap();

    assert_eq!(
        metadata,
        AudioFileMetadata {
            filename: "audio.mp3".to_string(),
            content_type: "audio/mpeg".to_string(),
            size_bytes: 3,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".to_string(),
        }
    );
}

#[test]
fn metadata_falls_back_to_supported_final_audio_formats() {
    let cases = [("audio.wav", "audio/wav"), ("audio.ogg", "audio/ogg")];

    for (filename, content_type) in cases {
        let temp = TempDir::new().unwrap();
        std::fs::write(temp.path().join(filename), b"audio").unwrap();

        let metadata = metadata(temp.path()).unwrap().unwrap();

        assert_eq!(metadata.filename, filename);
        assert_eq!(metadata.content_type, content_type);
    }
}

#[test]
fn metadata_ignores_audio_artifacts() {
    let temp = TempDir::new().unwrap();
    for artifact in [
        "audio.mp3.tmp",
        "audio.wav.tmp",
        "audio_mic.wav",
        "audio_spk.wav",
    ] {
        write_audio(&temp.path().join(artifact));
    }

    assert_eq!(metadata(temp.path()).unwrap(), None);
}

#[test]
fn delete_without_final_audio_returns_false() {
    let temp = TempDir::new().unwrap();
    write_audio(&temp.path().join("audio.mp3.tmp"));

    assert!(!delete(temp.path()).unwrap());
    assert!(!temp.path().join("audio.mp3.tmp").exists());
}

#[test]
fn delete_preserves_primary_audio_when_auxiliary_deletion_fails() {
    let temp = TempDir::new().unwrap();
    let primary_path = temp.path().join("audio.mp3");
    let auxiliary_path = temp.path().join("audio.mp3.tmp");
    write_audio(&primary_path);
    write_audio(&auxiliary_path);

    let result = delete_with(temp.path(), |path| {
        if path == auxiliary_path {
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "blocked auxiliary deletion",
            ));
        }
        std::fs::remove_file(path)
    });

    assert_eq!(
        result.unwrap_err().kind(),
        std::io::ErrorKind::PermissionDenied
    );
    assert!(primary_path.exists());
}

#[test]
fn test_delete_orphaned_expired_removes_nested_orphan_audio() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path();
    let orphan_dir = sessions_dir.join("folder").join(ORPHAN_SESSION_ID);
    let known_dir = sessions_dir.join(KNOWN_SESSION_ID);
    let meta_dir = sessions_dir.join(META_SESSION_ID);
    std::fs::create_dir_all(&orphan_dir).unwrap();
    std::fs::create_dir_all(&known_dir).unwrap();
    std::fs::create_dir_all(&meta_dir).unwrap();
    write_audio(&orphan_dir.join("audio.wav"));
    write_audio(&orphan_dir.join("audio_mic.wav"));
    write_audio(&known_dir.join("audio.wav"));
    write_audio(&meta_dir.join("audio.wav"));
    std::fs::write(meta_dir.join("_meta.json"), b"{}").unwrap();

    let deleted =
        delete_orphaned_expired(sessions_dir, &[KNOWN_SESSION_ID.to_string()], 0, now_ms())
            .unwrap();

    assert_eq!(deleted, vec![ORPHAN_SESSION_ID.to_string()]);
    assert!(!orphan_dir.join("audio.wav").exists());
    assert!(!orphan_dir.join("audio_mic.wav").exists());
    assert!(known_dir.join("audio.wav").exists());
    assert!(meta_dir.join("audio.wav").exists());
}

#[cfg(unix)]
#[test]
fn delete_orphaned_expired_ignores_symlinked_session_dirs() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path().join("sessions");
    let outside_dir = temp.path().join("outside");
    std::fs::create_dir_all(&sessions_dir).unwrap();
    std::fs::create_dir_all(&outside_dir).unwrap();
    write_audio(&outside_dir.join("audio.wav"));
    std::os::unix::fs::symlink(&outside_dir, sessions_dir.join(ORPHAN_SESSION_ID)).unwrap();

    let deleted = delete_orphaned_expired(&sessions_dir, &[], 0, now_ms()).unwrap();

    assert!(deleted.is_empty());
    assert!(outside_dir.join("audio.wav").exists());
}

#[cfg(unix)]
#[test]
fn copy_refuses_a_dangling_symlink_in_the_target_session() {
    let temp = TempDir::new().unwrap();
    let source_dir = temp.path().join("source");
    let target_dir = temp.path().join("target");
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(&source_dir).unwrap();
    std::fs::create_dir_all(&target_dir).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    write_audio(&source_dir.join("audio.mp3"));
    let sentinel = outside.join("stolen.mp3");
    std::os::unix::fs::symlink(&sentinel, target_dir.join("audio.mp3")).unwrap();

    let error = copy(&source_dir, &target_dir).unwrap_err();

    assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
    assert!(!sentinel.exists());
}

#[cfg(unix)]
#[test]
fn copy_does_not_overwrite_a_file_reached_through_a_symlink() {
    let temp = TempDir::new().unwrap();
    let source_dir = temp.path().join("source");
    let target_dir = temp.path().join("target");
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(&source_dir).unwrap();
    std::fs::create_dir_all(&target_dir).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    write_audio(&source_dir.join("audio.mp3"));
    std::fs::write(outside.join("keep.mp3"), b"sentinel").unwrap();
    std::os::unix::fs::symlink(outside.join("keep.mp3"), target_dir.join("audio.mp3")).unwrap();

    assert!(copy(&source_dir, &target_dir).is_err());
    assert_eq!(
        std::fs::read(outside.join("keep.mp3")).unwrap(),
        b"sentinel"
    );
}

#[cfg(unix)]
#[test]
fn delete_removes_symlinks_but_not_their_targets() {
    let temp = TempDir::new().unwrap();
    let session_dir = temp.path().join("session");
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(&session_dir).unwrap();
    std::fs::create_dir_all(outside.join("recovery")).unwrap();
    std::fs::write(outside.join("audio.mp3"), b"sentinel").unwrap();
    std::fs::write(outside.join("recovery").join("chunk.mp3"), b"sentinel").unwrap();
    std::os::unix::fs::symlink(outside.join("audio.mp3"), session_dir.join("audio.mp3")).unwrap();
    std::os::unix::fs::symlink(outside.join("audio.mp3"), session_dir.join("audio_mic.wav"))
        .unwrap();
    std::os::unix::fs::symlink(outside.join("recovery"), session_dir.join("audio-recovery"))
        .unwrap();

    assert!(delete(&session_dir).unwrap());

    assert!(std::fs::symlink_metadata(session_dir.join("audio.mp3")).is_err());
    assert!(std::fs::symlink_metadata(session_dir.join("audio-recovery")).is_err());
    assert_eq!(
        std::fs::read(outside.join("audio.mp3")).unwrap(),
        b"sentinel"
    );
    assert!(outside.join("recovery").join("chunk.mp3").exists());
}

#[test]
fn test_delete_orphaned_expired_keeps_fresh_orphan_audio() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path();
    let orphan_dir = sessions_dir.join(FRESH_ORPHAN_SESSION_ID);
    std::fs::create_dir_all(&orphan_dir).unwrap();
    write_audio(&orphan_dir.join("audio.wav"));

    let deleted = delete_orphaned_expired(sessions_dir, &[], u64::MAX, now_ms()).unwrap();

    assert!(deleted.is_empty());
    assert!(orphan_dir.join("audio.wav").exists());
}

#[test]
fn import_returns_the_source_path_without_copying() {
    let temp = TempDir::new().unwrap();
    let source_path = temp.path().join("meeting.m4a");
    std::fs::write(&source_path, b"audio content").unwrap();

    let runtime = NoopRuntime;
    let imported = import_to_session(&runtime, "session", &source_path).unwrap();

    assert_eq!(imported, source_path);
    assert_eq!(std::fs::read(&source_path).unwrap(), b"audio content");
    assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 1);
}

#[test]
fn import_rejects_missing_and_empty_sources() {
    let temp = TempDir::new().unwrap();
    let runtime = NoopRuntime;

    let missing = temp.path().join("missing.mp3");
    assert!(import_to_session(&runtime, "session", &missing).is_err());

    let empty = temp.path().join("empty.mp3");
    std::fs::write(&empty, b"").unwrap();
    assert!(import_to_session(&runtime, "session", &empty).is_err());
}
