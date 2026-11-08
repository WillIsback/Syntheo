use std::path::{Path, PathBuf};

use syntheo_storage::safe_path::UnsafePath;
use syntheo_storage::session_tree;

use crate::path::is_uuid;
use crate::{Error, Result};

/// Retrouve le dossier d'une session. Même recherche que la liste des
/// dossiers et que la capture (`session_tree::find_session_dir`) : les liens
/// restés dans le coffre sont suivis, ceux qui en sortent sont ignorés.
pub fn find_session_dir(sessions_base: &Path, session_id: &str) -> Result<PathBuf> {
    if !is_uuid(session_id) {
        return Err(Error::Path("session_id_invalid".into()));
    }
    Ok(session_tree::find_session_dir(sessions_base, session_id)?)
}

/// Supprime le dossier d'une session.
///
/// Si le nom de la session désigne un lien qui sort du coffre, la recherche
/// l'écarte et seul ce lien est supprimé, jamais sa cible (issue 426). Une
/// session rangée dans un dossier lié hors du coffre n'est pas retrouvée :
/// elle n'est pas touchée.
pub fn delete_session(sessions_base: &Path, session_id: &str) -> Result<()> {
    if !is_uuid(session_id) {
        return Err(Error::Path("session_id_invalid".into()));
    }
    let session_dir = match session_tree::find_session_dir(sessions_base, session_id) {
        Ok(dir) => dir,
        Err(UnsafePath::OutsideBase) => sessions_base.join(session_id),
        Err(error) => return Err(error.into()),
    };
    delete_session_dir(sessions_base, &session_dir)
}

/// Supprime récursivement `session_dir` si son emplacement réel reste sous
/// `sessions_base` (voir `session_tree::resolve_session_entry`). Un lien est
/// supprimé lui-même : on ne descend jamais dans sa cible.
pub fn delete_session_dir(sessions_base: &Path, session_dir: &Path) -> Result<()> {
    match std::fs::symlink_metadata(session_dir) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
        Ok(_) => {}
    }
    let resolved = session_tree::resolve_session_entry(sessions_base, session_dir)?;
    std::fs::remove_dir_all(resolved)?;
    Ok(())
}

pub fn list_uuid_files(dir: &Path, ext: &str) -> Vec<(String, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            if path.extension().and_then(|e| e.to_str()) != Some(ext) {
                return None;
            }
            let stem = path.file_stem()?.to_str()?;
            if !is_uuid(stem) {
                return None;
            }
            Some((stem.to_string(), path))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::{TestEnv, UUID_1, UUID_2};
    use assert_fs::TempDir;
    use assert_fs::prelude::*;
    use predicates::prelude::*;

    #[test]
    fn find_session_at_root() {
        let env = TestEnv::builder()
            .folder("sessions")
            .session(UUID_1)
            .done_folder()
            .done()
            .build();

        let result = find_session_dir(&env.path().join("sessions"), UUID_1).unwrap();
        assert_eq!(result, env.folder_session_path("sessions", UUID_1));
    }

    #[test]
    fn find_session_in_nested_folder() {
        let env = TestEnv::builder()
            .folder("sessions")
            .done()
            .folder("sessions/work")
            .done()
            .folder("sessions/work/project")
            .session(UUID_1)
            .done_folder()
            .done()
            .build();

        let result = find_session_dir(&env.path().join("sessions"), UUID_1).unwrap();
        assert_eq!(
            result,
            env.path().join("sessions/work/project").join(UUID_1)
        );
    }

    #[test]
    fn find_session_fallback_when_not_found() {
        let temp = TempDir::new().unwrap();
        let sessions = temp.child("sessions");
        sessions.create_dir_all().unwrap();

        let result = find_session_dir(sessions.path(), UUID_1).unwrap();
        assert_eq!(result, sessions.path().join(UUID_1));
    }

    #[test]
    fn find_session_rejects_non_uuid_session_id() {
        let temp = TempDir::new().unwrap();
        let sessions = temp.child("sessions");
        sessions.create_dir_all().unwrap();

        let result = find_session_dir(sessions.path(), "../outside");

        assert!(matches!(result, Err(Error::Path(message)) if message == "session_id_invalid"));
    }

    #[test]
    fn delete_session_dir_removes_directory() {
        let env = TestEnv::builder().session(UUID_1).done().build();

        delete_session_dir(env.path(), &env.session_path(UUID_1)).unwrap();
        env.child(UUID_1).assert(predicate::path::missing());
    }

    #[test]
    fn delete_session_dir_noop_if_missing() {
        let temp = TempDir::new().unwrap();
        let missing = temp.path().join(UUID_1);

        let result = delete_session_dir(temp.path(), &missing);
        assert!(result.is_ok());
    }

    #[test]
    fn list_uuid_files_nonexistent_dir_returns_empty() {
        let temp = TempDir::new().unwrap();
        let nonexistent = temp.path().join("does_not_exist");

        let result = list_uuid_files(&nonexistent, "md");

        assert!(result.is_empty());
    }

    #[test]
    fn list_uuid_files_returns_only_uuid_files_with_extension() {
        let env = TestEnv::builder()
            .file(&format!("{UUID_1}.md"), "content1")
            .file(&format!("{UUID_2}.md"), "content2")
            .file("not-a-uuid.md", "skip")
            .file(&format!("{UUID_1}.txt"), "skip")
            .folder(UUID_1)
            .done()
            .build();

        let result = list_uuid_files(env.path(), "md");

        assert_eq!(result.len(), 2);
        let ids: Vec<_> = result.iter().map(|(id, _)| id.as_str()).collect();
        assert!(ids.contains(&UUID_1));
        assert!(ids.contains(&UUID_2));
    }
}
