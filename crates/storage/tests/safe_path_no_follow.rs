//! Ouverture des fichiers du coffre sans suivre de lien (issue 428).
//!
//! Coffre temporaire (`vault/sessions`) et fichier sentinelle extérieur : un
//! lien qui sort du coffre ne doit jamais faire lire, créer ni modifier la
//! sentinelle, y compris s'il est glissé entre le contrôle et l'ouverture.
#![cfg(unix)]

use std::fs::{self, OpenOptions};
use std::io::Read;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

use storage::safe_path::{
    SYMLINK_NOT_ALLOWED, UnsafePath, copy_no_follow, open_no_follow, open_under_base,
    resolve_under_base, write_no_follow,
};

struct Vault {
    _temp: tempfile::TempDir,
    sessions: PathBuf,
    sentinel: PathBuf,
}

fn vault() -> Vault {
    let temp = tempfile::tempdir().unwrap();
    let sessions = temp.path().join("vault").join("sessions");
    fs::create_dir_all(sessions.join("work")).unwrap();
    let outside = temp.path().join("outside");
    fs::create_dir_all(&outside).unwrap();
    let sentinel = outside.join("sentinel.txt");
    fs::write(&sentinel, "keep").unwrap();
    Vault {
        _temp: temp,
        sessions,
        sentinel,
    }
}

fn read_all(base: &Path, relative: &str) -> Result<String, UnsafePath> {
    let mut file = open_under_base(base, relative, OpenOptions::new().read(true))?;
    let mut text = String::new();
    file.read_to_string(&mut text).unwrap();
    Ok(text)
}

fn is_symlink_refusal(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::InvalidInput && error.to_string() == SYMLINK_NOT_ALLOWED
}

/// Remplace `path` par un lien vers `target`, comme le ferait un processus
/// concurrent entre le contrôle et l'ouverture.
fn swap_for_link(path: &Path, target: &Path) {
    if fs::symlink_metadata(path).is_ok() {
        fs::remove_file(path).unwrap();
    }
    symlink(target, path).unwrap();
}

#[test]
fn a_regular_file_is_read_written_and_copied() {
    let vault = vault();
    let note = vault.sessions.join("work").join("note.md");
    fs::write(&note, "a longer original content").unwrap();

    assert_eq!(
        read_all(&vault.sessions, "work/note.md").unwrap(),
        "a longer original content"
    );

    let resolved = resolve_under_base(&vault.sessions, "work/note.md").unwrap();
    write_no_follow(&resolved, "short").unwrap();
    assert_eq!(fs::read_to_string(&note).unwrap(), "short");

    let created = resolve_under_base(&vault.sessions, "work/new/created.md").unwrap();
    fs::create_dir_all(created.parent().unwrap()).unwrap();
    write_no_follow(&created, "new").unwrap();
    assert_eq!(fs::read_to_string(&created).unwrap(), "new");

    let copy = resolve_under_base(&vault.sessions, "work/copy.md").unwrap();
    copy_no_follow(&note, &copy).unwrap();
    assert_eq!(fs::read_to_string(&copy).unwrap(), "short");
}

#[test]
fn a_link_leaving_the_vault_is_refused() {
    let vault = vault();
    symlink(
        &vault.sentinel,
        vault.sessions.join("work").join("escape.md"),
    )
    .unwrap();

    assert!(matches!(
        read_all(&vault.sessions, "work/escape.md"),
        Err(UnsafePath::OutsideBase)
    ));
    assert!(matches!(
        resolve_under_base(&vault.sessions, "work/escape.md"),
        Err(UnsafePath::OutsideBase)
    ));
    // Ouvert directement, le lien est refusé par le noyau.
    let error = write_no_follow(&vault.sessions.join("work").join("escape.md"), "x").unwrap_err();
    assert!(is_symlink_refusal(&error), "{error}");
    assert_eq!(fs::read_to_string(&vault.sentinel).unwrap(), "keep");
}

#[test]
fn a_link_staying_inside_sessions_is_followed() {
    let vault = vault();
    fs::create_dir_all(vault.sessions.join("archive")).unwrap();
    fs::write(vault.sessions.join("archive").join("note.md"), "archived").unwrap();
    symlink(
        vault.sessions.join("archive").join("note.md"),
        vault.sessions.join("work").join("alias.md"),
    )
    .unwrap();
    symlink(
        vault.sessions.join("archive"),
        vault.sessions.join("work").join("old"),
    )
    .unwrap();

    assert_eq!(
        read_all(&vault.sessions, "work/alias.md").unwrap(),
        "archived"
    );
    assert_eq!(
        read_all(&vault.sessions, "work/old/note.md").unwrap(),
        "archived"
    );

    // Le chemin canonique désigne la cible : l'écriture la modifie et garde
    // le lien de l'utilisateur.
    let resolved = resolve_under_base(&vault.sessions, "work/alias.md").unwrap();
    assert_eq!(
        resolved,
        vault
            .sessions
            .canonicalize()
            .unwrap()
            .join("archive")
            .join("note.md")
    );
    write_no_follow(&resolved, "updated").unwrap();
    assert_eq!(
        fs::read_to_string(vault.sessions.join("archive").join("note.md")).unwrap(),
        "updated"
    );
    assert!(
        fs::symlink_metadata(vault.sessions.join("work").join("alias.md"))
            .unwrap()
            .file_type()
            .is_symlink()
    );
}

#[test]
fn a_link_swapped_in_after_the_check_is_refused_on_write() {
    let vault = vault();
    let note = vault.sessions.join("work").join("note.md");
    fs::write(&note, "original").unwrap();

    let resolved = resolve_under_base(&vault.sessions, "work/note.md").unwrap();
    swap_for_link(&note, &vault.sentinel);

    let error = write_no_follow(&resolved, "pirate").unwrap_err();
    assert!(is_symlink_refusal(&error), "{error}");
    let error = copy_no_follow(&vault.sentinel, &resolved).unwrap_err();
    assert!(is_symlink_refusal(&error), "{error}");
    assert_eq!(fs::read_to_string(&vault.sentinel).unwrap(), "keep");
}

#[test]
fn a_link_swapped_in_after_the_check_is_refused_on_read() {
    let vault = vault();
    let note = vault.sessions.join("work").join("note.md");
    fs::write(&note, "original").unwrap();

    let resolved = resolve_under_base(&vault.sessions, "work/note.md").unwrap();
    swap_for_link(&note, &vault.sentinel);

    let error = open_no_follow(&resolved, OpenOptions::new().read(true)).unwrap_err();
    assert!(is_symlink_refusal(&error), "{error}");
}

#[test]
fn a_dangling_link_swapped_in_after_the_check_is_not_created() {
    let vault = vault();
    let missing = vault.sentinel.with_file_name("created.txt");

    // Nom libre au moment du contrôle, lien cassé au moment de l'écriture.
    let resolved = resolve_under_base(&vault.sessions, "work/new.md").unwrap();
    swap_for_link(&vault.sessions.join("work").join("new.md"), &missing);

    let error = write_no_follow(&resolved, "pirate").unwrap_err();
    assert!(is_symlink_refusal(&error), "{error}");
    assert!(fs::symlink_metadata(&missing).is_err());
}
