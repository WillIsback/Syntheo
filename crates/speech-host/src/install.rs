//! Installation, état et désinstallation du module (issue 685).
//!
//! L'installation part d'un dossier de module préparé (binaire, modèles,
//! `files.sha256`, `manifest.json` et sa signature). Elle vérifie le manifeste
//! signé et la liste fermée du dossier source, copie les fichiers listés dans
//! un dossier privé de l'application, hache cette copie, puis la met en place
//! d'un seul renommage. L'ancien module n'est remplacé qu'après une
//! vérification complète.

use std::path::{Path, PathBuf};

use crate::manifest::{MANIFEST_FILE, SIGNATURE_FILE};
use crate::verify::{LIST_FILE, VerifyError, check, check_at, hash_in_place};

/// État du module installé, pour l'interface.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModuleStatus {
    NotInstalled,
    /// Manifeste signé valide (sans hachage : il est fait à chaque lancement).
    Installed {
        version: String,
        size_bytes: u64,
    },
    /// Présent mais refusé (non signé, altéré, incompatible…).
    Invalid {
        reason: String,
    },
}

fn version_of(dir: &Path) -> String {
    std::fs::read(dir.join(MANIFEST_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .and_then(|value| value["version"].as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn size_of(dir: &Path, entries: &std::collections::BTreeMap<String, String>) -> u64 {
    entries
        .keys()
        .filter_map(|path| std::fs::metadata(dir.join(path)).ok())
        .map(|metadata| metadata.len())
        .sum()
}

/// État du module de `dir` (bloquant, sans hachage).
pub fn status(dir: &Path, public_key: Option<&str>, app_version: &str) -> ModuleStatus {
    if !dir.exists() {
        return ModuleStatus::NotInstalled;
    }
    match check(dir, public_key, app_version) {
        Ok(entries) => ModuleStatus::Installed {
            version: version_of(dir),
            size_bytes: size_of(dir, &entries),
        },
        Err(error) => ModuleStatus::Invalid {
            reason: error.code().to_owned(),
        },
    }
}

fn sibling(dir: &Path, suffix: &str) -> Result<PathBuf, VerifyError> {
    let name = dir
        .file_name()
        .ok_or(VerifyError::Missing)?
        .to_string_lossy();
    let parent = dir.parent().ok_or(VerifyError::Missing)?;
    Ok(parent.join(format!("{name}.{suffix}-{}", uuid::Uuid::new_v4().simple())))
}

/// Supprime les dossiers provisoires (`speech.install-*`, `speech.old-*`)
/// laissés par un arrêt brutal ou un échec ; appelé sous le verrou de l'hôte.
pub fn remove_leftovers(dest: &Path) {
    let (Some(parent), Some(name)) = (dest.parent(), dest.file_name()) else {
        return;
    };
    let name = name.to_string_lossy();
    let prefixes = [format!("{name}.install-"), format!("{name}.old-")];
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
        if is_dir && prefixes.iter().any(|p| file_name.starts_with(p.as_str())) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Ouvre un fichier source sans suivre de lien ni bloquer sur un fichier
/// spécial ; refuse ce qui n'est pas un fichier ordinaire de la taille
/// attendue.
fn open_source(path: &Path, size: Option<u64>) -> Result<std::fs::File, VerifyError> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x0020_0000); // FILE_FLAG_OPEN_REPARSE_POINT
    }
    let file = options.open(path).map_err(|_| VerifyError::Missing)?;
    let metadata = file.metadata().map_err(|_| VerifyError::Io)?;
    if !metadata.is_file() || size.is_some_and(|s| s != metadata.len()) {
        return Err(VerifyError::Missing);
    }
    Ok(file)
}

/// Copie bornée à la taille contrôlée, hachée pendant la copie.
fn copy_verified(
    source: &Path,
    target: &Path,
    size: u64,
    expected: Option<&str>,
) -> Result<(), VerifyError> {
    use sha2::{Digest, Sha256};
    use std::io::{Read, Write};
    let file = open_source(source, Some(size))?;
    let mut reader = file.take(size);
    let mut out = std::fs::File::create(target).map_err(|_| VerifyError::Io)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    let mut copied = 0u64;
    loop {
        let read = reader.read(&mut buffer).map_err(|_| VerifyError::Io)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        out.write_all(&buffer[..read])
            .map_err(|_| VerifyError::Io)?;
        copied += read as u64;
    }
    out.sync_all().map_err(|_| VerifyError::Io)?;
    if copied != size {
        return Err(VerifyError::WrongSize);
    }
    if let Some(expected) = expected {
        let hash: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if hash != expected {
            return Err(VerifyError::Altered);
        }
    }
    Ok(())
}

/// Renomme, avec quelques réessais courts (un antivirus ou l'indexeur peut
/// tenir le dossier un instant sous Windows).
fn rename_retrying(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut last = None;
    for attempt in 0..5 {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(error) => last = Some(error),
        }
        if cfg!(windows) && attempt < 4 {
            std::thread::sleep(std::time::Duration::from_millis(100));
        } else {
            break;
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("rename failed")))
}

/// Installe le module de `source` dans `dest` (bloquant : copie et hache).
///
/// - Écrit toujours une copie neuve mise en place par renommage, jamais en
///   place : sous Linux, un module en cours voit l'inode d'origine par son
///   descripteur.
/// - Source et copie sont vérifiées contre le plancher anti-retour du module
///   installé, en lecture seule ; le plancher ne monte qu'après la mise en
///   place réussie.
/// - Si la mise en place échoue, l'ancien module revient à sa place.
/// - Une erreur de copie ou de renommage (disque plein) est `VerifyError::Io`.
pub fn install(
    source: &Path,
    dest: &Path,
    public_key: Option<&str>,
    app_version: &str,
) -> Result<ModuleStatus, VerifyError> {
    remove_leftovers(dest);
    let floor = crate::manifest::floor_path(dest);
    let checked = check_at(source, public_key, app_version, floor.as_deref())?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|_| VerifyError::Io)?;
    }
    let staging = sibling(dest, "install")?;
    let result = (|| {
        for (path, expected) in &checked.entries {
            let target = staging.join(path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|_| VerifyError::Io)?;
            }
            let size = *checked.sizes.get(path).ok_or(VerifyError::Missing)?;
            copy_verified(&source.join(path), &target, size, Some(expected))?;
        }
        for path in [LIST_FILE, MANIFEST_FILE, SIGNATURE_FILE] {
            let bytes = crate::verify::read_bounded(&source.join(path), 256 * 1024)
                .ok_or(VerifyError::InvalidList)?;
            std::fs::write(staging.join(path), bytes).map_err(|_| VerifyError::Io)?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let binary = staging.join(crate::verify::binary_name());
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| VerifyError::Io)?;
        }
        // La copie doit repasser tous les contrôles, puis le hachage.
        let copied = check_at(&staging, public_key, app_version, floor.as_deref())?;
        hash_in_place(&staging, &copied.entries)?;
        // Mise en place, avec retour arrière ; l'ancien module n'est supprimé
        // qu'après la réussite.
        let old = if dest.exists() {
            let old = sibling(dest, "old")?;
            rename_retrying(dest, &old).map_err(|_| VerifyError::Io)?;
            Some(old)
        } else {
            None
        };
        if rename_retrying(&staging, dest).is_err() {
            if let Some(old) = &old {
                let _ = rename_retrying(old, dest);
            }
            return Err(VerifyError::Io);
        }
        if let Some(old) = old {
            let _ = std::fs::remove_dir_all(old);
        }
        Ok(copied.build)
    })();
    let build = match result {
        Ok(build) => build,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    if let Some(path) = &floor {
        crate::manifest::raise_floor_for(path, build, app_version);
    }
    Ok(status(dest, public_key, app_version))
}

/// Supprime le module installé (et les dossiers provisoires restants).
pub fn uninstall(dest: &Path) -> std::io::Result<()> {
    remove_leftovers(dest);
    match std::fs::remove_dir_all(dest) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_signing::{TestKey, current_manifest};
    use crate::verify::binary_name;

    fn source(key: &TestKey) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(binary_name()), b"binaire").unwrap();
        std::fs::create_dir_all(dir.path().join("models")).unwrap();
        std::fs::write(dir.path().join("models/m.onnx"), b"modele").unwrap();
        key.sign_module(
            dir.path(),
            &current_manifest(dir.path(), &[binary_name()], &["models/m.onnx"], "0.8.0"),
        );
        dir
    }

    #[test]
    fn install_status_and_uninstall() {
        let key = TestKey::new();
        let public = key.public();
        let src = source(&key);
        let data = tempfile::tempdir().unwrap();
        let dest = data.path().join("modules/speech");
        assert_eq!(
            status(&dest, Some(&public), "0.8.0"),
            ModuleStatus::NotInstalled
        );
        let installed = install(src.path(), &dest, Some(&public), "0.8.0").unwrap();
        assert_eq!(
            installed,
            ModuleStatus::Installed {
                version: "0.1.0".into(),
                size_bytes: 13
            }
        );
        // Réinstallation : remplace sans laisser de dossier temporaire.
        install(src.path(), &dest, Some(&public), "0.8.0").unwrap();
        let left: Vec<_> = std::fs::read_dir(data.path().join("modules"))
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();
        // Le plancher anti-retour reste à côté du module, même désinstallé.
        let mut left = left;
        left.sort();
        assert_eq!(left, ["speech", "speech.floor"]);
        uninstall(&dest).unwrap();
        assert_eq!(
            status(&dest, Some(&public), "0.8.0"),
            ModuleStatus::NotInstalled
        );
    }

    #[test]
    fn an_unsigned_or_altered_source_is_not_installed() {
        let key = TestKey::new();
        let src = source(&key);
        let data = tempfile::tempdir().unwrap();
        let dest = data.path().join("speech");
        // Autre clé.
        let other = TestKey::new().public();
        assert!(install(src.path(), &dest, Some(&other), "0.8.0").is_err());
        // Contenu modifié, même taille.
        std::fs::write(src.path().join("models/m.onnx"), b"modelX").unwrap();
        assert_eq!(
            install(src.path(), &dest, Some(&key.public()), "0.8.0").err(),
            Some(VerifyError::Altered)
        );
        assert!(!dest.exists());
        let left: Vec<_> = std::fs::read_dir(data.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .filter(|name| name != "speech.floor")
            .collect();
        assert!(left.is_empty(), "rien laissé : {left:?}");
        // Sans clé configurée : refus.
        assert!(install(src.path(), &dest, None, "0.8.0").is_err());
    }

    // Revue de l'issue 685, constat 2 : une installation ratée laisse le
    // plancher et le module en place intacts.
    #[test]
    fn a_failed_install_keeps_the_floor_and_the_installed_module() {
        let key = TestKey::new();
        let public = key.public();
        let src = source(&key);
        let data = tempfile::tempdir().unwrap();
        let dest = data.path().join("speech");
        install(src.path(), &dest, Some(&public), "0.8.1").unwrap();
        let floor = data.path().join("speech.floor");
        let before = std::fs::read_to_string(&floor).unwrap();
        // Nouvelle source, construction plus haute (0.8.1), fichier altéré.
        let newer = tempfile::tempdir().unwrap();
        std::fs::write(newer.path().join(binary_name()), b"binaire").unwrap();
        std::fs::create_dir_all(newer.path().join("models")).unwrap();
        std::fs::write(newer.path().join("models/m.onnx"), b"modele").unwrap();
        key.sign_module(
            newer.path(),
            &current_manifest(newer.path(), &[binary_name()], &["models/m.onnx"], "0.8.1"),
        );
        std::fs::write(newer.path().join("models/m.onnx"), b"modelX").unwrap();
        assert_eq!(
            install(newer.path(), &dest, Some(&public), "0.8.1").err(),
            Some(VerifyError::Altered)
        );
        assert_eq!(std::fs::read_to_string(&floor).unwrap(), before);
        assert!(matches!(
            status(&dest, Some(&public), "0.8.1"),
            ModuleStatus::Installed { .. }
        ));
    }

    #[test]
    fn leftovers_are_cleaned_before_installing() {
        let key = TestKey::new();
        let src = source(&key);
        let data = tempfile::tempdir().unwrap();
        let dest = data.path().join("speech");
        std::fs::create_dir_all(data.path().join("speech.install-dead")).unwrap();
        std::fs::create_dir_all(data.path().join("speech.old-dead")).unwrap();
        install(src.path(), &dest, Some(&key.public()), "0.8.0").unwrap();
        assert!(!data.path().join("speech.install-dead").exists());
        assert!(!data.path().join("speech.old-dead").exists());
    }

    #[test]
    fn an_altered_installed_module_is_reported_invalid() {
        let key = TestKey::new();
        let public = key.public();
        let src = source(&key);
        let data = tempfile::tempdir().unwrap();
        let dest = data.path().join("speech");
        install(src.path(), &dest, Some(&public), "0.8.0").unwrap();
        std::fs::write(dest.join("evil.so"), b"x").unwrap();
        assert!(matches!(
            status(&dest, Some(&public), "0.8.0"),
            ModuleStatus::Invalid { .. }
        ));
    }
}
