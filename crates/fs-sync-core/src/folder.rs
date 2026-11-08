use std::path::{Path, PathBuf};

use syntheo_storage::session_tree::{Visit, walk_session_tree};

use crate::path::{get_parent_folder_path, is_uuid};
use crate::types::{FolderInfo, FolderSessionUpdate, ListFoldersResult};

/// Racine du parcours et préfixe des chemins relatifs qu'il rend.
fn walk_root(sessions_dir: &Path, current_path: &str) -> PathBuf {
    if current_path.is_empty() {
        sessions_dir.to_path_buf()
    } else {
        sessions_dir.join(current_path)
    }
}

fn join_folder_path(current_path: &str, relative: &str) -> String {
    if current_path.is_empty() {
        relative.to_string()
    } else {
        format!("{current_path}/{relative}")
    }
}

/// Liste les sessions et les dossiers qui en contiennent.
///
/// Utilise le parcours partagé `session_tree` : un dossier lié n'est listé que
/// si sa cible reste dans le coffre, comme pour la recherche d'une session et
/// les suppressions (issues 426 et 427).
pub fn scan_directory_recursive(
    sessions_dir: &Path,
    current_path: &str,
    result: &mut ListFoldersResult,
) {
    let root = walk_root(sessions_dir, current_path);
    let mut session_folders = Vec::new();
    let _ = walk_session_tree(sessions_dir, &root, |dir| {
        if dir.path.join("_meta.json").exists() {
            let parent = get_parent_folder_path(dir.relative)
                .map(|parent| join_folder_path(current_path, &parent))
                .unwrap_or_else(|| current_path.to_string());
            result
                .session_folder_map
                .insert(dir.name.to_string(), parent);
            if let Some(parent) = get_parent_folder_path(dir.relative) {
                session_folders.push(parent);
            }
            Visit::Skip
        } else if is_uuid(dir.name) {
            Visit::Skip
        } else {
            Visit::Descend
        }
    });

    for relative in session_folders {
        let mut folder = Some(relative);
        while let Some(current) = folder {
            let entry_path = join_folder_path(current_path, &current);
            folder = get_parent_folder_path(&current);
            if result.folders.contains_key(&entry_path) {
                continue;
            }
            let name = current.rsplit('/').next().unwrap_or(&current).to_string();
            result.folders.insert(
                entry_path.clone(),
                FolderInfo {
                    name,
                    parent_folder_id: get_parent_folder_path(&entry_path),
                },
            );
        }
    }
}

pub fn collect_session_updates(
    sessions_dir: &Path,
    current_path: &str,
    result: &mut Vec<FolderSessionUpdate>,
) {
    let root = walk_root(sessions_dir, current_path);
    let _ = walk_session_tree(sessions_dir, &root, |dir| {
        if !is_uuid(dir.name) {
            return Visit::Descend;
        }
        if dir.path.join("_meta.json").exists() {
            let entry_path = join_folder_path(current_path, dir.relative);
            result.push(FolderSessionUpdate {
                session_id: dir.name.to_string(),
                folder_id: get_parent_folder_path(&entry_path).unwrap_or_default(),
            });
        }
        Visit::Skip
    });
}

/// Vrai si `folder` contient une session, dossiers liés restés dans le coffre
/// compris.
pub fn contains_sessions(sessions_dir: &Path, folder: &Path) -> std::io::Result<bool> {
    let mut found = false;
    walk_session_tree(sessions_dir, folder, |dir| {
        if !is_uuid(dir.name) {
            Visit::Descend
        } else if dir.path.join("_meta.json").exists() {
            found = true;
            Visit::Stop
        } else {
            Visit::Skip
        }
    })?;
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::{TestEnv, UUID_1, UUID_2};
    use std::collections::HashMap;

    #[test]
    fn scan_directory_detects_sessions_with_meta() {
        let env = TestEnv::builder()
            .session(UUID_1)
            .done()
            .session(UUID_2)
            .no_meta()
            .done()
            .build();

        let mut result = ListFoldersResult {
            folders: HashMap::new(),
            session_folder_map: HashMap::new(),
        };
        scan_directory_recursive(env.path(), "", &mut result);

        assert_eq!(result.session_folder_map.len(), 1);
        assert!(result.session_folder_map.contains_key(UUID_1));
        assert!(!result.session_folder_map.contains_key(UUID_2));
    }

    #[test]
    fn scan_directory_tracks_folders_with_sessions() {
        let env = TestEnv::builder()
            .folder("work")
            .session(UUID_1)
            .done_folder()
            .done()
            .build();

        let mut result = ListFoldersResult {
            folders: HashMap::new(),
            session_folder_map: HashMap::new(),
        };
        scan_directory_recursive(env.path(), "", &mut result);

        assert!(result.folders.contains_key("work"));
        assert_eq!(result.folders["work"].name, "work");
    }

    #[test]
    fn collect_session_updates_tracks_nested_sessions() {
        let env = TestEnv::builder()
            .folder("work")
            .session(UUID_1)
            .done_folder()
            .done()
            .folder("work/project")
            .session(UUID_2)
            .done_folder()
            .done()
            .build();

        let mut updates = Vec::new();
        collect_session_updates(env.path(), "work", &mut updates);
        updates.sort_by(|a, b| a.session_id.cmp(&b.session_id));

        assert_eq!(
            updates,
            vec![
                FolderSessionUpdate {
                    session_id: UUID_1.into(),
                    folder_id: "work".into(),
                },
                FolderSessionUpdate {
                    session_id: UUID_2.into(),
                    folder_id: "work/project".into(),
                }
            ]
        );
    }
}
