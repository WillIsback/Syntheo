use assert_fs::TempDir;
use assert_fs::fixture::PathChild;
use assert_fs::prelude::*;

use super::*;
use crate::test_fixtures::{UUID_1, UUID_2};

#[test]
fn move_session_to_folder() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child(UUID_1)
        .child("_meta.json")
        .write_str("{}")
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let result = core.move_session(UUID_1, "", "work").unwrap();

    temp.child("sessions")
        .child("work")
        .child(UUID_1)
        .assert(predicates::path::exists());
    assert_eq!(
        result,
        MoveSessionResult {
            session_id: UUID_1.into(),
            folder_id: "work".into(),
        }
    );
}

#[test]
fn move_session_to_root() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child("work")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child("work")
        .child(UUID_1)
        .child("_meta.json")
        .write_str("{}")
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let result = core.move_session(UUID_1, "work", "").unwrap();

    temp.child("sessions")
        .child(UUID_1)
        .assert(predicates::path::exists());
    assert_eq!(
        result,
        MoveSessionResult {
            session_id: UUID_1.into(),
            folder_id: "".into(),
        }
    );
}

#[test]
fn move_session_missing_source_errors() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let result = core.move_session(UUID_1, "", "work");

    assert!(matches!(result, Err(Error::Path(message)) if message == "session_source_missing"));
}

#[test]
fn move_session_existing_target_errors() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child(UUID_1)
        .child("_meta.json")
        .write_str("{}")
        .unwrap();
    temp.child("sessions")
        .child("work")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child("work")
        .child(UUID_1)
        .child("_meta.json")
        .write_str("{}")
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let result = core.move_session(UUID_1, "", "work");

    assert!(matches!(result, Err(Error::Path(message)) if message == "session_target_exists"));
}

#[test]
fn rename_folder_target_exists_errors() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child("old")
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child("new")
        .create_dir_all()
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let result = core.rename_folder("old", "new");

    assert!(matches!(result, Err(Error::Path(message)) if message == "folder_target_exists"));
}

#[test]
fn rename_folder_returns_updated_sessions() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child("old")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child("old")
        .child(UUID_1)
        .child("_meta.json")
        .write_str("{}")
        .unwrap();
    temp.child("sessions")
        .child("old")
        .child("nested")
        .child(UUID_2)
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child("old")
        .child("nested")
        .child(UUID_2)
        .child("_meta.json")
        .write_str("{}")
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let result = core.rename_folder("old", "new").unwrap();

    assert_eq!(
        result,
        RenameFolderResult {
            updates: vec![
                FolderSessionUpdate {
                    session_id: UUID_1.into(),
                    folder_id: "new".into(),
                },
                FolderSessionUpdate {
                    session_id: UUID_2.into(),
                    folder_id: "new/nested".into(),
                },
            ],
        }
    );
}

#[test]
fn delete_folder_with_sessions_errors() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child("work")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();
    temp.child("sessions")
        .child("work")
        .child(UUID_1)
        .child("_meta.json")
        .write_str("{}")
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let result = core.delete_folder("work");

    assert!(result.is_err());
    temp.child("sessions")
        .child("work")
        .assert(predicates::path::exists());
}

#[test]
fn create_folder_rejects_traversal() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let result = core.create_folder("../outside");

    assert!(
        matches!(result, Err(Error::Path(message)) if message == "folder_path_traversal_not_allowed")
    );
    temp.child("outside").assert(predicates::path::missing());
}

#[test]
fn delete_folder_rejects_traversal() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    temp.child("outside").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let result = core.delete_folder("../outside");

    assert!(
        matches!(result, Err(Error::Path(message)) if message == "folder_path_traversal_not_allowed")
    );
    temp.child("outside").assert(predicates::path::exists());
}

#[test]
fn delete_folder_rejects_root() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let result = core.delete_folder("");

    assert!(
        matches!(result, Err(Error::Path(message)) if message == "folder_delete_root_not_allowed")
    );
    temp.child("sessions").assert(predicates::path::exists());
}

#[test]
fn attachment_save_dedup_naming() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let first = core.attachment_save(UUID_1, b"hello", "file.txt").unwrap();
    let second = core.attachment_save(UUID_1, b"world", "file.txt").unwrap();

    assert_eq!(first.attachment_id, "file.txt");
    assert_eq!(second.attachment_id, "file 1.txt");
    temp.child("sessions")
        .child(UUID_1)
        .child("attachments")
        .child("file.txt")
        .assert(predicates::path::exists());
    temp.child("sessions")
        .child(UUID_1)
        .child("attachments")
        .child("file 1.txt")
        .assert(predicates::path::exists());
}

#[test]
fn attachment_save_removes_a_partial_candidate_after_write_failure() {
    let temp = TempDir::new().unwrap();
    let attachments_dir = temp.path().join("attachments");
    std::fs::create_dir_all(&attachments_dir).unwrap();

    let result = write_unique_file_with(&attachments_dir, "file.txt", b"partial", |file, bytes| {
        use std::io::Write;

        file.write_all(&bytes[..3])?;
        Err(std::io::Error::new(
            std::io::ErrorKind::StorageFull,
            "disk full",
        ))
    });

    assert!(matches!(
        result,
        Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::StorageFull
    ));
    assert!(!attachments_dir.join("file.txt").exists());
    let saved = write_unique_file(&attachments_dir, "file.txt", b"complete").unwrap();
    assert_eq!(saved.1, "file.txt");
}

#[test]
fn attachment_read_returns_saved_bytes() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    core.attachment_save(UUID_1, b"hello", "image.png").unwrap();

    let bytes = core.attachment_read(UUID_1, "image.png").unwrap();

    assert_eq!(bytes, b"hello");
}

#[cfg(unix)]
#[test]
fn attachment_read_refuses_a_symlink_leaving_the_attachments_dir() {
    let temp = TempDir::new().unwrap();
    let attachments = temp.child("sessions").child(UUID_1).child("attachments");
    attachments.create_dir_all().unwrap();
    temp.child("secret.txt").write_str("secret").unwrap();
    std::os::unix::fs::symlink(
        temp.child("secret.txt").path(),
        attachments.child("link.txt").path(),
    )
    .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert!(core.attachment_read(UUID_1, "link.txt").is_err());
}

#[cfg(unix)]
#[test]
fn attachment_read_follows_a_symlink_staying_in_the_attachments_dir() {
    let temp = TempDir::new().unwrap();
    let attachments = temp.child("sessions").child(UUID_1).child("attachments");
    attachments.child("real.txt").write_str("content").unwrap();
    std::os::unix::fs::symlink(
        attachments.child("real.txt").path(),
        attachments.child("alias.txt").path(),
    )
    .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert_eq!(
        core.attachment_read(UUID_1, "alias.txt").unwrap(),
        b"content"
    );
}

#[test]
fn attachment_remove_missing_noop() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions")
        .child(UUID_1)
        .create_dir_all()
        .unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    core.attachment_remove(UUID_1, "missing.txt").unwrap();
}

#[test]
fn attachment_save_rejects_invalid_session_id() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let result = core.attachment_save("../outside", b"hello", "file.txt");

    assert!(matches!(result, Err(Error::Path(message)) if message == "session_id_invalid"));
    temp.child("outside").assert(predicates::path::missing());
}

#[test]
fn sanitize_filename_rejects_empty() {
    assert!(sanitize_filename("").is_err());
}

#[test]
fn sanitize_filename_strips_directories() {
    let result = sanitize_filename("nested/path/file.txt").unwrap();
    assert_eq!(result, "file.txt");
}

#[test]
fn folder_attachment_save_and_read() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();

    let core = FsSyncCore::new(temp.path().to_path_buf());
    let saved = core
        .folder_attachment_save("CS 101", b"syllabus", "syllabus.txt")
        .unwrap();

    assert_eq!(saved.attachment_id, "syllabus.txt");
    temp.child("sessions")
        .child("CS 101")
        .child("materials")
        .child("syllabus.txt")
        .assert(predicates::path::exists());

    let bytes = core
        .folder_attachment_read("CS 101", "syllabus.txt")
        .unwrap();
    assert_eq!(bytes, b"syllabus");

    let listed = core.folder_attachment_list("CS 101").unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].attachment_id, "syllabus.txt");
}

#[test]
fn folder_attachment_save_rejects_root() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let result = core.folder_attachment_save("", b"hello", "file.txt");

    assert!(
        matches!(result, Err(Error::Path(message)) if message == "folder_materials_root_not_allowed")
    );
    temp.child("sessions")
        .child("materials")
        .assert(predicates::path::missing());
}

#[test]
fn folder_attachment_save_rejects_traversal() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let result = core.folder_attachment_save("../outside", b"hello", "file.txt");

    assert!(
        matches!(result, Err(Error::Path(message)) if message == "folder_path_traversal_not_allowed")
    );
    temp.child("outside").assert(predicates::path::missing());
}

#[test]
fn folder_attachment_remove_deletes_file() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());
    core.folder_attachment_save("CS 101", b"syllabus", "syllabus.txt")
        .unwrap();

    core.folder_attachment_remove("CS 101", "syllabus.txt")
        .unwrap();

    temp.child("sessions")
        .child("CS 101")
        .child("materials")
        .child("syllabus.txt")
        .assert(predicates::path::missing());
}

/// Coffre temporaire avec un dossier extérieur sentinelle.
#[cfg(unix)]
fn vault_with_outside_sentinel() -> (TempDir, std::path::PathBuf) {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(outside.join("nested")).unwrap();
    std::fs::write(outside.join("sentinel.txt"), "keep").unwrap();
    std::fs::write(outside.join("nested").join("sentinel.txt"), "keep").unwrap();
    (temp, outside)
}

#[cfg(unix)]
fn assert_sentinel_intact(outside: &std::path::Path) {
    assert_eq!(
        std::fs::read_to_string(outside.join("sentinel.txt")).unwrap(),
        "keep"
    );
    assert_eq!(
        std::fs::read_to_string(outside.join("nested").join("sentinel.txt")).unwrap(),
        "keep"
    );
}

#[cfg(unix)]
#[test]
fn delete_folder_removes_a_linked_folder_but_not_its_target() {
    let (temp, outside) = vault_with_outside_sentinel();
    std::os::unix::fs::symlink(&outside, temp.child("sessions").child("linked").path()).unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    core.delete_folder("linked").unwrap();

    assert!(std::fs::symlink_metadata(temp.child("sessions").child("linked").path()).is_err());
    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn delete_folder_does_not_descend_into_a_link_it_contains() {
    let (temp, outside) = vault_with_outside_sentinel();
    let work = temp.child("sessions").child("work");
    work.create_dir_all().unwrap();
    std::os::unix::fs::symlink(&outside, work.child("escape").path()).unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    core.delete_folder("work").unwrap();

    work.assert(predicates::path::missing());
    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn delete_session_dir_on_a_linked_session_keeps_the_target() {
    let (temp, outside) = vault_with_outside_sentinel();
    let link = temp.child("sessions").child(UUID_1);
    std::os::unix::fs::symlink(&outside, link.path()).unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert!(core.resolve_session_dir(UUID_1).is_err());
    crate::session::delete_session(&core.sessions_dir, UUID_1).unwrap();

    assert!(std::fs::symlink_metadata(link.path()).is_err());
    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn rename_folder_moves_the_link_not_its_target() {
    let (temp, outside) = vault_with_outside_sentinel();
    std::os::unix::fs::symlink(&outside, temp.child("sessions").child("old").path()).unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    core.rename_folder("old", "new").unwrap();

    let renamed = temp.child("sessions").child("new");
    assert!(
        std::fs::symlink_metadata(renamed.path())
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn move_session_moves_a_linked_session_without_touching_its_target() {
    let (temp, outside) = vault_with_outside_sentinel();
    std::os::unix::fs::symlink(&outside, temp.child("sessions").child(UUID_1).path()).unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    core.move_session(UUID_1, "", "work").unwrap();

    let moved = temp.child("sessions").child("work").child(UUID_1);
    assert!(
        std::fs::symlink_metadata(moved.path())
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn attachment_remove_removes_the_link_not_its_target() {
    let (temp, outside) = vault_with_outside_sentinel();
    let attachments = temp.child("sessions").child(UUID_1).child("attachments");
    attachments.create_dir_all().unwrap();
    std::os::unix::fs::symlink(
        outside.join("sentinel.txt"),
        attachments.child("link.txt").path(),
    )
    .unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    core.attachment_remove(UUID_1, "link.txt").unwrap();

    assert!(std::fs::symlink_metadata(attachments.child("link.txt").path()).is_err());
    assert_sentinel_intact(&outside);
}

/// Session réelle `outside/<dir>/<UUID_1>` avec un `_meta.json`.
#[cfg(unix)]
fn outside_session(outside: &std::path::Path, dir: &str) -> std::path::PathBuf {
    let session = outside.join(dir).join(UUID_1);
    std::fs::create_dir_all(&session).unwrap();
    std::fs::write(session.join("_meta.json"), "{}").unwrap();
    session
}

#[cfg(unix)]
#[test]
fn delete_folder_refuses_a_folder_reached_through_an_escaping_link() {
    let (temp, outside) = vault_with_outside_sentinel();
    std::os::unix::fs::symlink(&outside, temp.child("sessions").child("linked").path()).unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert!(core.delete_folder("linked/nested").is_err());

    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn rename_folder_refuses_a_source_reached_through_an_escaping_link() {
    let (temp, outside) = vault_with_outside_sentinel();
    std::os::unix::fs::symlink(&outside, temp.child("sessions").child("linked").path()).unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert!(core.rename_folder("linked/nested", "moved").is_err());

    temp.child("sessions")
        .child("moved")
        .assert(predicates::path::missing());
    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn rename_folder_refuses_a_target_under_an_escaping_link() {
    let (temp, outside) = vault_with_outside_sentinel();
    std::os::unix::fs::symlink(&outside, temp.child("sessions").child("linked").path()).unwrap();
    temp.child("sessions")
        .child("work")
        .create_dir_all()
        .unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert!(core.rename_folder("work", "linked/work").is_err());

    temp.child("sessions")
        .child("work")
        .assert(predicates::path::is_dir());
    assert!(!outside.join("work").exists());
}

#[cfg(unix)]
#[test]
fn move_session_refuses_to_leave_the_vault_through_a_link() {
    let (temp, outside) = vault_with_outside_sentinel();
    std::os::unix::fs::symlink(&outside, temp.child("sessions").child("linked").path()).unwrap();
    let session = temp.child("sessions").child(UUID_1);
    session.create_dir_all().unwrap();
    session.child("_meta.json").write_str("{}").unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert!(core.move_session(UUID_1, "", "linked").is_err());

    session.assert(predicates::path::is_dir());
    assert!(!outside.join(UUID_1).exists());
}

#[cfg(unix)]
#[test]
fn move_session_refuses_a_source_reached_through_an_escaping_link() {
    let (temp, outside) = vault_with_outside_sentinel();
    let external = outside_session(&outside, "work");
    std::os::unix::fs::symlink(
        outside.join("work"),
        temp.child("sessions").child("linked").path(),
    )
    .unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    assert!(core.move_session(UUID_1, "linked", "").is_err());

    assert!(external.join("_meta.json").exists());
}

#[cfg(unix)]
#[test]
fn delete_session_keeps_a_session_stored_behind_an_escaping_link() {
    let (temp, outside) = vault_with_outside_sentinel();
    let external = outside_session(&outside, "work");
    std::os::unix::fs::symlink(
        outside.join("work"),
        temp.child("sessions").child("linked").path(),
    )
    .unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    crate::session::delete_session(&core.sessions_dir, UUID_1).unwrap();

    assert!(external.join("_meta.json").exists());
    assert_sentinel_intact(&outside);
}

#[cfg(unix)]
#[test]
fn list_folders_only_shows_sessions_that_stay_inside_the_vault() {
    let (temp, outside) = vault_with_outside_sentinel();
    outside_session(&outside, "work");
    let sessions = temp.child("sessions");
    std::os::unix::fs::symlink(outside.join("work"), sessions.child("external").path()).unwrap();
    let kept = sessions.child("store").child(UUID_2);
    kept.create_dir_all().unwrap();
    kept.child("_meta.json").write_str("{}").unwrap();
    sessions.child("work").create_dir_all().unwrap();
    std::os::unix::fs::symlink(
        sessions.child("store").path(),
        sessions.child("work").child("old").path(),
    )
    .unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let listed = core.list_folders().unwrap();

    assert!(!listed.session_folder_map.contains_key(UUID_1));
    assert!(!listed.folders.contains_key("external"));
    assert!(listed.session_folder_map.contains_key(UUID_2));
    // La session listée derrière un lien resté dans le coffre est utilisable.
    let found = core.resolve_session_dir(UUID_2).unwrap();
    assert!(found.join("_meta.json").exists());
    core.attachment_save(UUID_2, b"x", "note.txt").unwrap();
    crate::session::delete_session(&core.sessions_dir, UUID_2).unwrap();
    kept.assert(predicates::path::missing());
}

#[test]
fn folder_attachment_list_missing_dir_is_empty() {
    let temp = TempDir::new().unwrap();
    temp.child("sessions").create_dir_all().unwrap();
    let core = FsSyncCore::new(temp.path().to_path_buf());

    let listed = core.folder_attachment_list("CS 101").unwrap();
    assert!(listed.is_empty());
}
