//! Garantie, au point d'accès, qu'un chemin construit à partir d'un composant
//! variable reste sous son dossier de base.

use std::path::{Component, Path, PathBuf};

/// Raison pour laquelle [`join_under_base`] refuse un chemin.
#[derive(Debug, thiserror::Error)]
pub enum UnsafePath {
    /// Le chemin relatif est vide, absolu, porte un préfixe Windows, un `..`
    /// ou un octet nul.
    #[error("path_traversal_not_allowed")]
    Invalid,
    /// Une fois les liens symboliques résolus, le chemin sort de la base.
    #[error("path_outside_base")]
    OutsideBase,
    /// La résolution du chemin a échoué (lien cassé, droits, etc.).
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl From<UnsafePath> for std::io::Error {
    fn from(error: UnsafePath) -> Self {
        match error {
            UnsafePath::Io(error) => error,
            other => std::io::Error::new(std::io::ErrorKind::InvalidInput, other.to_string()),
        }
    }
}

/// Joint `relative` sous `base` et garantit que le résultat y reste.
///
/// Refuse, quelle que soit la plateforme : un chemin vide, absolu (`/x`, `\x`,
/// `\\serveur\partage`), un préfixe de lecteur Windows (`C:`), tout segment
/// `..` (séparé par `/` ou `\`) et l'octet nul.
///
/// Si une partie du chemin existe déjà, son ancêtre existant le plus proche est
/// résolu avec `canonicalize` et doit rester sous la base canonique : un lien
/// symbolique qui pointe hors de la base est refusé, y compris s'il est cassé.
/// Si la base n'existe pas encore, seule la vérification lexicale s'applique.
///
/// Renvoie `base.join(relative)` tel quel (non canonique), pour que les
/// appelants gardent les chemins qu'ils affichent ou comparent.
pub fn join_under_base(base: &Path, relative: impl AsRef<Path>) -> Result<PathBuf, UnsafePath> {
    let relative = relative.as_ref();
    check_relative(relative)?;

    let candidate = base.join(relative);
    let canonical_base = match base.canonicalize() {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidate),
        Err(error) => return Err(error.into()),
    };

    let mut existing = candidate.as_path();
    while std::fs::symlink_metadata(existing).is_err() {
        existing = existing.parent().ok_or(UnsafePath::OutsideBase)?;
    }

    if !existing.canonicalize()?.starts_with(&canonical_base) {
        return Err(UnsafePath::OutsideBase);
    }

    Ok(candidate)
}

fn check_relative(relative: &Path) -> Result<(), UnsafePath> {
    let text = relative.to_string_lossy();
    if text.is_empty() || text.contains('\0') || text.starts_with(['/', '\\']) {
        return Err(UnsafePath::Invalid);
    }

    let first_segment = text.split(['/', '\\']).next().unwrap_or_default();
    if is_windows_drive(first_segment) || text.split(['/', '\\']).any(|segment| segment == "..") {
        return Err(UnsafePath::Invalid);
    }

    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return Err(UnsafePath::Invalid);
    }

    Ok(())
}

fn is_windows_drive(segment: &str) -> bool {
    let bytes = segment.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn rejected(base: &Path, relative: &str) -> bool {
        matches!(join_under_base(base, relative), Err(UnsafePath::Invalid))
    }

    #[test]
    fn accepts_plain_and_nested_children() {
        let temp = tempdir().unwrap();
        let base = temp.path();
        fs::write(base.join("note.txt"), "x").unwrap();

        assert_eq!(
            join_under_base(base, "note.txt").unwrap(),
            base.join("note.txt")
        );
        assert_eq!(
            join_under_base(base, "a/b/new.txt").unwrap(),
            base.join("a/b/new.txt")
        );
        assert_eq!(
            join_under_base(base, "./note.txt").unwrap(),
            base.join("./note.txt")
        );
    }

    #[test]
    fn rejects_parent_segments() {
        let temp = tempdir().unwrap();
        assert!(rejected(temp.path(), ".."));
        assert!(rejected(temp.path(), "../outside.txt"));
        assert!(rejected(temp.path(), "a/../../outside.txt"));
        assert!(rejected(temp.path(), "a/.."));
    }

    #[test]
    fn rejects_backslash_traversal_on_every_platform() {
        let temp = tempdir().unwrap();
        assert!(rejected(temp.path(), r"..\outside.txt"));
        assert!(rejected(temp.path(), r"a\..\..\outside.txt"));
        assert!(rejected(temp.path(), r"\outside.txt"));
        assert!(rejected(temp.path(), r"\\server\share\file"));
    }

    #[test]
    fn rejects_absolute_paths() {
        let temp = tempdir().unwrap();
        assert!(rejected(temp.path(), "/etc/passwd"));
        let absolute = temp.path().join("note.txt");
        assert!(matches!(
            join_under_base(temp.path(), &absolute),
            Err(UnsafePath::Invalid)
        ));
    }

    #[test]
    fn rejects_windows_drive_prefixes() {
        let temp = tempdir().unwrap();
        assert!(rejected(temp.path(), r"C:\Windows\win.ini"));
        assert!(rejected(temp.path(), "C:/Windows/win.ini"));
        assert!(rejected(temp.path(), "c:relative.txt"));
    }

    #[test]
    fn rejects_empty_and_nul() {
        let temp = tempdir().unwrap();
        assert!(rejected(temp.path(), ""));
        assert!(rejected(temp.path(), "a\0b"));
    }

    #[test]
    fn missing_base_falls_back_to_lexical_check() {
        let temp = tempdir().unwrap();
        let base = temp.path().join("missing");

        assert_eq!(
            join_under_base(&base, "file.txt").unwrap(),
            base.join("file.txt")
        );
        assert!(rejected(&base, "../file.txt"));
    }

    #[test]
    fn io_error_conversion_keeps_the_reason() {
        let error = std::io::Error::from(UnsafePath::OutsideBase);
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
        assert_eq!(error.to_string(), "path_outside_base");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_leaving_the_base() {
        let temp = tempdir().unwrap();
        let base = temp.path().join("base");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&base).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.txt"), "secret").unwrap();
        std::os::unix::fs::symlink(&outside, base.join("dir-link")).unwrap();
        std::os::unix::fs::symlink(outside.join("secret.txt"), base.join("file-link")).unwrap();

        for relative in ["dir-link/secret.txt", "dir-link/new.txt", "file-link"] {
            assert!(
                matches!(
                    join_under_base(&base, relative),
                    Err(UnsafePath::OutsideBase)
                ),
                "{relative}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_dangling_symlink() {
        let temp = tempdir().unwrap();
        let base = temp.path().join("base");
        fs::create_dir_all(&base).unwrap();
        std::os::unix::fs::symlink(temp.path().join("nowhere"), base.join("dangling")).unwrap();

        assert!(matches!(
            join_under_base(&base, "dangling"),
            Err(UnsafePath::Io(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn accepts_symlink_staying_inside_the_base() {
        let temp = tempdir().unwrap();
        let base = temp.path().join("base");
        fs::create_dir_all(base.join("real")).unwrap();
        std::os::unix::fs::symlink(base.join("real"), base.join("alias")).unwrap();

        assert_eq!(
            join_under_base(&base, "alias/file.txt").unwrap(),
            base.join("alias/file.txt")
        );
    }

    #[cfg(unix)]
    #[test]
    fn accepts_base_reached_through_a_symlink() {
        let temp = tempdir().unwrap();
        let real = temp.path().join("real");
        fs::create_dir_all(&real).unwrap();
        fs::write(real.join("note.txt"), "x").unwrap();
        let alias = temp.path().join("alias");
        std::os::unix::fs::symlink(&real, &alias).unwrap();

        assert_eq!(
            join_under_base(&alias, "note.txt").unwrap(),
            alias.join("note.txt")
        );
    }
}
