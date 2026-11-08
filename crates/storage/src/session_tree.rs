//! Parcours partagé de l'arborescence des sessions du coffre.
//!
//! Une seule règle pour les liens symboliques (issues 426 et 427) : un lien
//! n'est suivi que si sa cible, une fois résolue, reste dans le dossier des
//! sessions. Les liens qui en sortent, ou qui sont cassés, sont ignorés.
//! La liste des dossiers, la recherche d'une session (fs-sync et capture) et
//! les suppressions s'appuient sur ce module : une session listée peut donc
//! être ouverte, écrite et supprimée, et une session hors du coffre n'est ni
//! listée ni retrouvée.
//!
//! Les suppressions et les déplacements passent par
//! [`resolve_session_entry`] : l'emplacement réel de l'entrée, sans suivre
//! son dernier composant, doit rester sous le dossier des sessions. Supprimer
//! un lien efface donc le lien lui-même, jamais le contenu de sa cible, et on
//! ne descend jamais dans un dossier hors du coffre pour effacer son contenu.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use crate::safe_path::UnsafePath;

/// Suite à donner au parcours après la visite d'un dossier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visit {
    /// Entrer dans ce dossier.
    Descend,
    /// Ne pas entrer dans ce dossier.
    Skip,
    /// Arrêter tout le parcours.
    Stop,
}

/// Dossier rencontré par [`walk_session_tree`].
#[derive(Debug)]
pub struct TreeDir<'a> {
    /// Nom de l'entrée.
    pub name: &'a str,
    /// Chemin tel qu'il est vu depuis la racine du parcours (liens non résolus).
    pub path: &'a Path,
    /// Chemin relatif à la racine du parcours, séparé par `/`.
    pub relative: &'a str,
}

/// Dossier des sessions canonique, s'il existe et reste dans le coffre.
///
/// Le coffre est le dossier parent de `sessions_dir`. Un dossier des sessions
/// lié hors du coffre est refusé, comme le fait déjà l'écriture
/// (`resolve_path_inside_base`, qui part du coffre).
pub fn sessions_root(sessions_dir: &Path) -> std::io::Result<Option<PathBuf>> {
    let canonical = match sessions_dir.canonicalize() {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let Some(vault) = sessions_dir.parent().filter(|p| !p.as_os_str().is_empty()) else {
        return Ok(Some(canonical));
    };
    if canonical.starts_with(vault.canonicalize()?) {
        Ok(Some(canonical))
    } else {
        Ok(None)
    }
}

/// Parcourt en profondeur les dossiers placés sous `root`, qui doit se trouver
/// dans `sessions_dir`.
///
/// Un lien symbolique n'est suivi que si sa cible est un dossier qui reste
/// dans le dossier des sessions. Chaque dossier réel n'est visité qu'une fois,
/// ce qui coupe les cycles. Les dossiers illisibles sont ignorés, comme les
/// fichiers et les liens cassés.
pub fn walk_session_tree(
    sessions_dir: &Path,
    root: &Path,
    mut visit: impl FnMut(&TreeDir<'_>) -> Visit,
) -> std::io::Result<()> {
    let Some(boundary) = sessions_root(sessions_dir)? else {
        return Ok(());
    };
    let root_canonical = match root.canonicalize() {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if !root_canonical.starts_with(&boundary) {
        return Ok(());
    }

    let mut visited = HashSet::from([root_canonical.clone()]);
    let mut stack = vec![(root.to_path_buf(), root_canonical, String::new())];
    while let Some((dir, canonical, relative)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut children = Vec::new();
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            let child_canonical = if file_type.is_dir() {
                canonical.join(name)
            } else if file_type.is_symlink() {
                match linked_dir_inside(&entry.path(), &boundary) {
                    Some(target) => target,
                    None => continue,
                }
            } else {
                continue;
            };
            if !visited.insert(child_canonical.clone()) {
                continue;
            }
            let child_relative = if relative.is_empty() {
                name.to_string()
            } else {
                format!("{relative}/{name}")
            };
            let child_path = entry.path();
            match visit(&TreeDir {
                name,
                path: &child_path,
                relative: &child_relative,
            }) {
                Visit::Descend => children.push((child_path, child_canonical, child_relative)),
                Visit::Skip => {}
                Visit::Stop => return Ok(()),
            }
        }
        stack.extend(children.into_iter().rev());
    }
    Ok(())
}

/// Cible canonique d'un lien, si c'est un dossier resté dans `boundary`.
fn linked_dir_inside(link: &Path, boundary: &Path) -> Option<PathBuf> {
    let target = link.canonicalize().ok()?;
    (target.is_dir() && target.starts_with(boundary)).then_some(target)
}

/// Retrouve le dossier d'une session sous `sessions_dir`, dossiers liés
/// compris dans les limites décrites en tête de module.
///
/// Ne descend pas dans un dossier nommé par un UUID (une autre session).
/// Sans résultat, renvoie `sessions_dir/<session_id>`, où une nouvelle session
/// sera créée. Si ce nom est déjà pris par une entrée que le parcours a
/// écartée (lien qui sort du coffre, lien cassé, fichier), la session est
/// refusée avec [`UnsafePath::OutsideBase`] : elle n'est pas listée, elle ne
/// doit donc pas non plus être ouverte ni écrite.
pub fn find_session_dir(sessions_dir: &Path, session_id: &str) -> Result<PathBuf, UnsafePath> {
    if uuid::Uuid::try_parse(session_id).is_err() {
        return Err(UnsafePath::Invalid);
    }

    let mut found = None;
    walk_session_tree(sessions_dir, sessions_dir, |dir| {
        if dir.name == session_id {
            found = Some(dir.path.to_path_buf());
            Visit::Stop
        } else if uuid::Uuid::try_parse(dir.name).is_ok() {
            Visit::Skip
        } else {
            Visit::Descend
        }
    })?;
    if let Some(found) = found {
        return Ok(found);
    }

    let fallback = sessions_dir.join(session_id);
    match std::fs::symlink_metadata(&fallback) {
        Ok(_) => Err(UnsafePath::OutsideBase),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(fallback),
        Err(error) => Err(error.into()),
    }
}

/// Emplacement réel de l'entrée `path` avant une suppression, un renommage ou
/// un déplacement, sans suivre son dernier composant.
///
/// Tous les composants parents sont résolus (liens compris) ; ceux qui
/// n'existent pas encore sont ajoutés tels quels. Le résultat doit se trouver
/// strictement sous le dossier des sessions canonique. Sinon l'opération
/// toucherait un dossier hors du coffre, ou le dossier des sessions lui-même,
/// et elle est refusée avec [`UnsafePath::OutsideBase`].
///
/// Si `path` est un lien, le résultat désigne le lien : `remove_dir_all` et
/// `rename` agissent alors sur le lien, pas sur sa cible.
pub fn resolve_session_entry(sessions_dir: &Path, path: &Path) -> Result<PathBuf, UnsafePath> {
    let boundary = sessions_root(sessions_dir)?.ok_or(UnsafePath::OutsideBase)?;
    let name = match path.components().next_back() {
        Some(Component::Normal(name)) => name,
        _ => return Err(UnsafePath::Invalid),
    };
    let parent = path.parent().ok_or(UnsafePath::Invalid)?;

    let mut existing = parent;
    let mut missing = Vec::new();
    while std::fs::symlink_metadata(existing).is_err() {
        match existing.components().next_back() {
            Some(Component::Normal(segment)) => missing.push(segment),
            _ => return Err(UnsafePath::Invalid),
        }
        existing = existing.parent().ok_or(UnsafePath::Invalid)?;
    }

    let mut resolved = existing.canonicalize()?;
    resolved.extend(missing.into_iter().rev());
    resolved.push(name);
    if resolved == boundary || !resolved.starts_with(&boundary) {
        return Err(UnsafePath::OutsideBase);
    }
    Ok(resolved)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::symlink;

    const ID: &str = "550e8400-e29b-41d4-a716-446655440000";

    /// Coffre temporaire (`vault/sessions`) et dossier sentinelle extérieur.
    fn vault() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let sessions = temp.path().join("vault").join("sessions");
        fs::create_dir_all(&sessions).unwrap();
        let outside = temp.path().join("outside");
        fs::create_dir_all(outside.join("nested")).unwrap();
        fs::write(outside.join("nested").join("sentinel.txt"), "keep").unwrap();
        (temp, sessions, outside)
    }

    fn relatives(sessions: &Path) -> Vec<String> {
        let mut seen = Vec::new();
        walk_session_tree(sessions, sessions, |dir| {
            seen.push(dir.relative.to_string());
            Visit::Descend
        })
        .unwrap();
        seen.sort();
        seen
    }

    #[test]
    fn walk_follows_links_that_stay_inside_and_ignores_the_others() {
        let (_temp, sessions, outside) = vault();
        fs::create_dir_all(sessions.join("real").join("inner")).unwrap();
        symlink(sessions.join("real"), sessions.join("alias")).unwrap();
        symlink(&outside, sessions.join("escape")).unwrap();
        symlink(sessions.join("missing"), sessions.join("dangling")).unwrap();

        let seen = relatives(&sessions);

        // `real` et `alias` mènent au même dossier : une seule visite.
        assert!(seen.contains(&"real".to_string()) ^ seen.contains(&"alias".to_string()));
        assert!(!seen.iter().any(|path| path.starts_with("escape")));
        assert!(!seen.iter().any(|path| path.starts_with("dangling")));
        assert_eq!(seen.len(), 2);
    }

    #[test]
    fn walk_stops_on_link_cycles() {
        let (_temp, sessions, _outside) = vault();
        fs::create_dir_all(sessions.join("a")).unwrap();
        symlink(&sessions, sessions.join("a").join("loop")).unwrap();
        symlink(sessions.join("a"), sessions.join("a").join("self")).unwrap();

        assert_eq!(relatives(&sessions), vec!["a".to_string()]);
    }

    #[test]
    fn walk_ignores_a_sessions_dir_linked_outside_the_vault() {
        let temp = tempfile::tempdir().unwrap();
        let vault = temp.path().join("vault");
        let elsewhere = temp.path().join("elsewhere");
        fs::create_dir_all(elsewhere.join("work")).unwrap();
        fs::create_dir_all(&vault).unwrap();
        symlink(&elsewhere, vault.join("sessions")).unwrap();

        assert!(relatives(&vault.join("sessions")).is_empty());
    }

    #[test]
    fn find_session_dir_follows_a_link_that_stays_inside() {
        let (_temp, sessions, _outside) = vault();
        fs::create_dir_all(sessions.join("archive").join(ID)).unwrap();
        fs::create_dir_all(sessions.join("work")).unwrap();
        symlink(sessions.join("archive"), sessions.join("work").join("old")).unwrap();
        fs::remove_dir_all(sessions.join("archive")).unwrap();
        fs::create_dir_all(sessions.join("store").join(ID)).unwrap();
        symlink(sessions.join("store"), sessions.join("work").join("old2")).unwrap();

        let found = find_session_dir(&sessions, ID).unwrap();

        assert!(
            found == sessions.join("store").join(ID)
                || found == sessions.join("work").join("old2").join(ID)
        );
    }

    #[test]
    fn find_session_dir_ignores_a_folder_linked_outside_the_vault() {
        let (_temp, sessions, outside) = vault();
        fs::create_dir_all(outside.join("work").join(ID)).unwrap();
        symlink(outside.join("work"), sessions.join("work")).unwrap();

        // Rangée hors du coffre : introuvable, une nouvelle session irait à la racine.
        assert_eq!(find_session_dir(&sessions, ID).unwrap(), sessions.join(ID));
    }

    #[test]
    fn find_session_dir_refuses_a_session_linked_outside_the_vault() {
        let (_temp, sessions, outside) = vault();
        fs::create_dir_all(outside.join(ID)).unwrap();
        symlink(outside.join(ID), sessions.join(ID)).unwrap();

        assert!(matches!(
            find_session_dir(&sessions, ID),
            Err(UnsafePath::OutsideBase)
        ));
    }

    #[test]
    fn find_session_dir_refuses_ids_that_are_not_uuids() {
        let (_temp, sessions, _outside) = vault();
        assert!(matches!(
            find_session_dir(&sessions, "../outside"),
            Err(UnsafePath::Invalid)
        ));
    }

    #[test]
    fn resolve_session_entry_keeps_the_last_component_unresolved() {
        let (_temp, sessions, outside) = vault();
        symlink(&outside, sessions.join("linked")).unwrap();
        let root = sessions.canonicalize().unwrap();

        assert_eq!(
            resolve_session_entry(&sessions, &sessions.join("linked")).unwrap(),
            root.join("linked")
        );
        assert_eq!(
            resolve_session_entry(&sessions, &sessions.join("new").join("deep")).unwrap(),
            root.join("new").join("deep")
        );
    }

    #[test]
    fn resolve_session_entry_refuses_entries_reached_through_an_escaping_link() {
        let (_temp, sessions, outside) = vault();
        symlink(&outside, sessions.join("linked")).unwrap();

        for path in [
            sessions.join("linked").join("nested"),
            sessions.join("linked").join("missing").join("deep"),
            sessions.clone(),
        ] {
            assert!(
                matches!(
                    resolve_session_entry(&sessions, &path),
                    Err(UnsafePath::OutsideBase)
                ),
                "{path:?}"
            );
        }
    }

    #[test]
    fn resolve_session_entry_accepts_a_link_staying_inside() {
        let (_temp, sessions, _outside) = vault();
        fs::create_dir_all(sessions.join("real").join("sub")).unwrap();
        symlink(sessions.join("real"), sessions.join("alias")).unwrap();
        let root = sessions.canonicalize().unwrap();

        assert_eq!(
            resolve_session_entry(&sessions, &sessions.join("alias").join("sub")).unwrap(),
            root.join("real").join("sub")
        );
    }
}
