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
use crate::verify::{LIST_FILE, VerifyError, check, check_with_floor, hash_in_place};

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
            reason: error.to_string(),
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

/// Installe le module de `source` dans `dest` (bloquant : copie et hache).
/// Écrit toujours une copie neuve mise en place par renommage, jamais en
/// place : sous Linux, un module en cours voit l'inode d'origine par son
/// descripteur. Une erreur de copie ou de renommage (disque plein) est
/// `VerifyError::Io`.
pub fn install(
    source: &Path,
    dest: &Path,
    public_key: Option<&str>,
    app_version: &str,
) -> Result<ModuleStatus, VerifyError> {
    // Plancher anti-retour du module installé, pas de la source.
    let floor = crate::manifest::floor_path(dest);
    let entries = check_with_floor(source, public_key, app_version, floor.as_deref())?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|_| VerifyError::Io)?;
    }
    let staging = sibling(dest, "install")?;
    let result = (|| {
        for path in
            entries
                .keys()
                .map(String::as_str)
                .chain([LIST_FILE, MANIFEST_FILE, SIGNATURE_FILE])
        {
            let target = staging.join(path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|_| VerifyError::Io)?;
            }
            std::fs::copy(source.join(path), &target).map_err(|_| VerifyError::Io)?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let binary = staging.join(crate::verify::binary_name());
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| VerifyError::Io)?;
        }
        // La copie doit repasser tous les contrôles, puis le hachage.
        let copied = check_with_floor(&staging, public_key, app_version, floor.as_deref())?;
        hash_in_place(&staging, &copied)?;
        // Mise en place : l'ancien module part de côté, puis est supprimé.
        if dest.exists() {
            let old = sibling(dest, "old")?;
            std::fs::rename(dest, &old).map_err(|_| VerifyError::Io)?;
            std::fs::rename(&staging, dest).map_err(|_| VerifyError::Io)?;
            let _ = std::fs::remove_dir_all(old);
        } else {
            std::fs::rename(&staging, dest).map_err(|_| VerifyError::Io)?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    result?;
    Ok(status(dest, public_key, app_version))
}

/// Supprime le module installé.
pub fn uninstall(dest: &Path) -> std::io::Result<()> {
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
