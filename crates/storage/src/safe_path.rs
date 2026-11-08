//! Garantie, au point d'accès, qu'un chemin construit à partir d'un composant
//! variable reste sous son dossier de base.

use std::fs::{File, OpenOptions};
use std::io::Write;
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
/// appelants gardent les chemins qu'ils affichent ou comparent. Pour ouvrir le
/// fichier, préférer [`resolve_under_base`] puis [`open_no_follow`] (ou
/// [`open_under_base`]) : le contrôle et l'ouverture portent alors sur le même
/// objet.
pub fn join_under_base(base: &Path, relative: impl AsRef<Path>) -> Result<PathBuf, UnsafePath> {
    let relative = relative.as_ref();
    resolve_under_base(base, relative)?;
    Ok(base.join(relative))
}

/// Comme [`join_under_base`], mais renvoie le chemin **canonique** : la partie
/// existante du chemin est résolue (liens compris), la partie manquante est
/// ajoutée telle quelle.
///
/// Un lien qui reste sous la base est donc remplacé par sa cible. Ouvrir ce
/// chemin avec [`open_no_follow`] suit le cas autorisé (la cible a déjà été
/// résolue) et refuse un lien glissé après le contrôle (TOCTOU, issue 428).
/// Si la base n'existe pas encore, renvoie `base.join(relative)` (contrôle
/// lexical seulement).
pub fn resolve_under_base(base: &Path, relative: impl AsRef<Path>) -> Result<PathBuf, UnsafePath> {
    let relative = relative.as_ref();
    check_relative(relative)?;

    let canonical_base = match base.canonicalize() {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(base.join(relative));
        }
        Err(error) => return Err(error.into()),
    };

    // `check_relative` n'admet que des segments normaux et `.` : on retire les
    // `.` pour que `parent` et `file_name` remontent segment par segment.
    let mut candidate = base.to_path_buf();
    candidate.extend(
        relative
            .components()
            .filter(|component| matches!(component, Component::Normal(_))),
    );

    // `symlink_metadata` voit aussi un lien cassé, que `canonicalize` refuse.
    let mut existing = candidate.as_path();
    let mut missing = Vec::new();
    while std::fs::symlink_metadata(existing).is_err() {
        missing.push(existing.file_name().ok_or(UnsafePath::OutsideBase)?);
        existing = existing.parent().ok_or(UnsafePath::OutsideBase)?;
    }

    let mut resolved = existing.canonicalize()?;
    if !resolved.starts_with(&canonical_base) {
        return Err(UnsafePath::OutsideBase);
    }
    resolved.extend(missing.into_iter().rev());
    Ok(resolved)
}

/// Résout `relative` sous `base` ([`resolve_under_base`]) puis ouvre le
/// chemin canonique sans suivre de lien ([`open_no_follow`]).
pub fn open_under_base(
    base: &Path,
    relative: impl AsRef<Path>,
    options: &OpenOptions,
) -> Result<File, UnsafePath> {
    let resolved = resolve_under_base(base, relative)?;
    Ok(open_no_follow(&resolved, options)?)
}

/// Message de l'erreur renvoyée quand le dernier composant est un lien.
pub const SYMLINK_NOT_ALLOWED: &str = "symlink_not_allowed";

/// Ouvre `path` sans suivre son dernier composant s'il est un lien
/// symbolique (issue 428).
///
/// À appeler sur un chemin déjà contrôlé et canonique (voir
/// [`resolve_under_base`]) : si un processus concurrent remplace le fichier
/// par un lien entre le contrôle et l'ouverture, l'ouverture échoue avec
/// [`std::io::ErrorKind::InvalidInput`] et le message [`SYMLINK_NOT_ALLOWED`],
/// au lieu d'agir sur la cible du lien. Un lien cassé est refusé de la même
/// façon, même avec `create(true)`.
///
/// - Unix : `O_NOFOLLOW`. Le noyau refuse lui-même le lien, au moment de
///   l'ouverture.
/// - Windows : `FILE_FLAG_OPEN_REPARSE_POINT` ouvre le point d'analyse
///   lui-même ; le type du handle ouvert est ensuite contrôlé et un lien
///   symbolique ou une jonction est refusé avant toute lecture ou écriture.
///   Les autres points d'analyse (fichiers OneDrive à la demande,
///   déduplication) ne sont pas des liens : ils sont rouverts normalement pour
///   que le pilote les matérialise. Le seul cas restant est un fichier de ce
///   type remplacé par un lien entre les deux ouvertures. Créer un lien
///   symbolique y demande en outre un privilège ou le mode développeur.
///
/// Seul le dernier composant est protégé : les dossiers parents sont résolus
/// normalement. Ils ont été canonisés par le contrôle ; les remplacer exige les
/// mêmes droits que ceux de l'utilisateur sur son coffre.
///
/// Ne pas combiner avec `truncate(true)` pour écrire : sous Windows, la
/// troncature s'appliquerait avant le contrôle du type. Voir
/// [`write_no_follow`].
pub fn open_no_follow(path: &Path, options: &OpenOptions) -> std::io::Result<File> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut options = options.clone();
        options.custom_flags(libc::O_NOFOLLOW);
        options.open(path).map_err(|error| {
            if error.raw_os_error() == Some(libc::ELOOP) {
                symlink_not_allowed()
            } else {
                error
            }
        })
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;

        let mut reparse_options = options.clone();
        reparse_options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
        let file = reparse_options.open(path)?;
        let metadata = file.metadata()?;
        if metadata.file_type().is_symlink() {
            return Err(symlink_not_allowed());
        }
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0 {
            return Ok(file);
        }
        drop(file);
        options.open(path)
    }

    #[cfg(not(any(unix, windows)))]
    {
        options.open(path)
    }
}

/// Remplace le contenu de `path` sans suivre de lien (voir
/// [`open_no_follow`]) ; crée le fichier s'il n'existe pas.
///
/// Équivalent de `std::fs::write` pour un chemin du coffre déjà contrôlé.
pub fn write_no_follow(path: &Path, contents: impl AsRef<[u8]>) -> std::io::Result<()> {
    let mut file = open_no_follow(path, OpenOptions::new().write(true).create(true))?;
    // Troncature après l'ouverture, une fois le type contrôlé.
    file.set_len(0)?;
    file.write_all(contents.as_ref())
}

/// Copie `src` vers `dst` sans suivre de lien en `dst` (voir
/// [`open_no_follow`]). Équivalent de `std::fs::copy` pour une destination du
/// coffre déjà contrôlée : écrase un fichier ordinaire, refuse un lien.
pub fn copy_no_follow(src: &Path, dst: &Path) -> std::io::Result<u64> {
    let mut source = File::open(src)?;
    let permissions = source.metadata()?.permissions();
    let mut target = open_no_follow(dst, OpenOptions::new().write(true).create(true))?;
    target.set_len(0)?;
    let copied = std::io::copy(&mut source, &mut target)?;
    target.set_permissions(permissions)?;
    Ok(copied)
}

fn symlink_not_allowed() -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, SYMLINK_NOT_ALLOWED)
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
