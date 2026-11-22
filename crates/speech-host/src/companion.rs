//! Programme compagnon `syntheo-speech` (issue 683), livré dans l'installeur
//! à côté de l'exécutable de l'application (`bundle.externalBin` de Tauri).
//!
//! Ses fichiers (le binaire et, sous Windows, les bibliothèques du runtime
//! Visual C++ qu'il charge) sont épinglés à la construction : le build.rs de
//! l'application en calcule taille et SHA-256 et les compile
//! (`SYNTHEO_SPEECH_FILES`). Le dossier est celui de l'exécutable de
//! l'application, résolu ici, côté Rust ; jamais un chemin venu de la webview.
//! Avant chaque lancement, ces fichiers sont copiés dans un dossier privé,
//! hachés depuis la copie et exécutés depuis elle (`verify`).

use std::path::{Path, PathBuf};

/// Un fichier du compagnon : nom (sans dossier), taille, SHA-256.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompanionFile {
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

/// Le compagnon : son dossier et ses fichiers, le binaire en premier.
#[derive(Debug, Clone)]
pub struct Companion {
    pub dir: PathBuf,
    pub files: Vec<CompanionFile>,
}

/// Nom du binaire installé (Tauri retire le triplet de cible).
pub fn binary_name() -> &'static str {
    if cfg!(windows) {
        "syntheo-speech.exe"
    } else {
        "syntheo-speech"
    }
}

fn plain_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':'])
}

/// Lit la liste compilée : `nom:sha256:taille` séparés par `;`, le binaire en
/// premier. `None` : liste vide ou mal formée (compagnon indisponible).
pub fn parse(spec: &str) -> Option<Vec<CompanionFile>> {
    let mut files = Vec::new();
    for entry in spec.split(';').map(str::trim).filter(|e| !e.is_empty()) {
        let mut parts = entry.split(':');
        let (name, sha256, size) = (parts.next()?, parts.next()?, parts.next()?);
        if parts.next().is_some()
            || !plain_name(name)
            || sha256.len() != 64
            || !sha256
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return None;
        }
        files.push(CompanionFile {
            name: name.to_owned(),
            size: size.parse().ok()?,
            sha256: sha256.to_owned(),
        });
    }
    (files.first().map(|f| f.name.as_str()) == Some(binary_name())).then_some(files)
}

/// Dossier de l'exécutable de l'application, canonique. Refusé si
/// l'exécutable est atteint par un lien ou un point de réanalyse.
pub fn install_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let metadata = std::fs::symlink_metadata(&exe).ok()?;
    if !metadata.is_file() || is_reparse(&metadata) {
        return None;
    }
    let canonical = std::fs::canonicalize(&exe).ok()?;
    canonical.parent().map(Path::to_path_buf)
}

#[cfg(windows)]
pub(crate) fn is_reparse(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes() & 0x400 != 0
}

#[cfg(not(windows))]
pub(crate) fn is_reparse(metadata: &std::fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

impl Companion {
    /// Compagnon de cette application : liste compilée et dossier de
    /// l'exécutable. `None` : application construite sans compagnon.
    pub fn of_this_app(spec: Option<&str>) -> Option<Self> {
        Some(Self {
            files: parse(spec?)?,
            dir: install_dir()?,
        })
    }

    /// Compagnon dans `dir`, empreintes calculées maintenant (essais).
    pub fn hashed_now(dir: &Path, names: &[&str]) -> std::io::Result<Self> {
        let files = names
            .iter()
            .map(|name| {
                let (size, sha256) = syntheo_pinned_fetch::hash_file(&dir.join(name))?;
                Ok(CompanionFile {
                    name: (*name).to_owned(),
                    size,
                    sha256,
                })
            })
            .collect::<std::io::Result<_>>()?;
        Ok(Self {
            dir: dir.to_path_buf(),
            files,
        })
    }

    /// Fichiers présents, ordinaires (ni lien ni point de réanalyse), à la
    /// bonne taille. Sans hachage.
    pub fn present(&self) -> bool {
        self.files.iter().all(|f| {
            std::fs::symlink_metadata(self.dir.join(&f.name))
                .is_ok_and(|m| m.is_file() && !is_reparse(&m) && m.len() == f.size)
        })
    }

    /// Identifiant de cette construction du compagnon (mise en service liée).
    pub fn build_id(&self) -> u64 {
        self.files
            .first()
            .and_then(|f| u64::from_str_radix(&f.sha256[..15], 16).ok())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sha(c: char) -> String {
        c.to_string().repeat(64)
    }

    #[test]
    fn parses_the_compiled_list() {
        let spec = format!(
            "{}:{}:12;vcruntime140.dll:{}:3",
            binary_name(),
            sha('a'),
            sha('b')
        );
        let files = parse(&spec).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].size, 12);
        assert_eq!(files[1].name, "vcruntime140.dll");
        for bad in [
            String::new(),
            format!("autre:{}:1", sha('a')),
            format!("{}:{}:x", binary_name(), sha('a')),
            format!("{}:{}:1;../x.dll:{}:1", binary_name(), sha('a'), sha('b')),
            format!("{}:{}:1", binary_name(), sha('A')),
            format!("{}:abc:1", binary_name()),
        ] {
            assert!(parse(&bad).is_none(), "{bad}");
        }
        assert!(Companion::of_this_app(None).is_none());
    }

    #[test]
    fn the_install_dir_is_the_canonical_exe_folder() {
        let dir = install_dir().unwrap();
        assert_eq!(dir, std::fs::canonicalize(&dir).unwrap());
        assert!(
            std::env::current_exe().unwrap().starts_with(&dir)
                || dir
                    .join(std::env::current_exe().unwrap().file_name().unwrap())
                    .exists()
        );
    }

    #[test]
    fn presence_checks_kind_and_size() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(binary_name()), b"binaire").unwrap();
        let companion = Companion::hashed_now(dir.path(), &[binary_name()]).unwrap();
        assert!(companion.present());
        assert_ne!(companion.build_id(), 0);
        std::fs::write(dir.path().join(binary_name()), b"binaire plus long").unwrap();
        assert!(!companion.present());
        #[cfg(unix)]
        {
            let other = tempfile::tempdir().unwrap();
            std::fs::write(other.path().join("vrai"), b"binaire").unwrap();
            std::os::unix::fs::symlink(other.path().join("vrai"), other.path().join(binary_name()))
                .unwrap();
            let linked = Companion {
                dir: other.path().to_path_buf(),
                files: companion.files.clone(),
            };
            assert!(!linked.present());
        }
    }
}
