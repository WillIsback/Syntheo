//! Manifeste signé du module (issue 683), vérifié avant `files.sha256`.
//!
//! `manifest.json` décrit un module construit pour une cible : version,
//! protocole, moteur, version minimale de l'application, et l'empreinte et la
//! taille de chaque fichier (binaire, bibliothèques, modèles avec leur URL de
//! téléchargement). `manifest.json.sig` est sa signature minisign, encodée en
//! base64 comme celles de `tauri signer sign`, faite avec une clé propre au
//! module, distincte de celle des mises à jour de l'application.
//!
//! La vérification refuse un manifeste non signé par la clé attendue, d'une
//! autre cible ou d'un autre protocole, ou qui exige une application plus
//! récente ; puis elle exige que `files.sha256` liste exactement les mêmes
//! fichiers avec les mêmes empreintes.

use std::collections::BTreeMap;
use std::path::Path;

use base64::Engine as _;
use minisign_verify::{PublicKey, Signature};
use serde::Deserialize;

pub const MANIFEST_FILE: &str = "manifest.json";
pub const SIGNATURE_FILE: &str = "manifest.json.sig";
/// Taille maximale du manifeste et de sa signature.
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;

/// Version minimale du module acceptée par cette application : un manifeste
/// signé mais plus ancien (retour à une version vulnérable) est refusé.
pub const MIN_MODULE_VERSION: &str = "0.1.0";

/// Clé publique de signature des modules (format de `tauri signer`). Absente
/// tant que la clé n'est pas créée : aucun module n'est alors chargé.
pub const MODULE_PUBLIC_KEY: Option<&str> = None;

/// Plancher anti-retour, à côté du dossier du module (il survit à une
/// désinstallation).
fn floor_path(dir: &Path) -> Option<std::path::PathBuf> {
    let name = dir.file_name()?.to_string_lossy();
    Some(dir.parent()?.join(format!("{name}.floor")))
}

fn read_floor(path: &Path) -> u64 {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| text.trim().parse().ok())
        .unwrap_or(0)
}

fn raise_floor(path: &Path, build: u64) {
    if build <= read_floor(path) {
        return;
    }
    let temp = path.with_extension(format!("floor-{}", std::process::id()));
    if std::fs::write(&temp, build.to_string()).is_ok() {
        let _ = std::fs::rename(&temp, path);
    }
}

/// Cible de cette application.
pub fn current_target() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else {
        "unsupported"
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema: u32,
    pub module: String,
    pub version: String,
    /// Numéro de construction croissant (anti-retour) : l'application garde
    /// le plus haut accepté et refuse les inférieurs.
    pub build: u64,
    pub protocol: u64,
    pub engine: String,
    pub target: String,
    pub min_app_version: String,
    pub files: Vec<Entry>,
    #[serde(default)]
    pub models: Vec<Entry>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub path: String,
    pub sha256: String,
    pub size: u64,
    /// URL de téléchargement (modèles).
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ManifestError {
    /// Pas de clé de signature configurée dans cette application.
    NoKey,
    /// Manifeste ou signature absents ou illisibles.
    Missing,
    /// Signature invalide pour la clé attendue.
    BadSignature,
    /// Manifeste mal formé.
    Invalid,
    /// Autre cible, autre protocole ou moteur inconnu.
    Incompatible,
    /// L'application est plus ancienne que la version minimale demandée.
    AppTooOld,
    /// Module plus ancien que `MIN_MODULE_VERSION`, ou construction plus
    /// ancienne que la plus récente déjà acceptée (retour en arrière).
    ModuleTooOld,
    /// `files.sha256` ne correspond pas au manifeste.
    ListMismatch,
}

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::NoKey => "no module signing key is configured",
            Self::Missing => "module manifest or signature is missing",
            Self::BadSignature => "module manifest signature is invalid",
            Self::Invalid => "module manifest is invalid",
            Self::Incompatible => "module is built for another target or protocol",
            Self::AppTooOld => "module requires a newer application",
            Self::ModuleTooOld => "module is older than the minimum version",
            Self::ListMismatch => "module file list does not match its manifest",
        })
    }
}

fn read_small(path: &Path) -> Result<Vec<u8>, ManifestError> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| ManifestError::Missing)?;
    if !metadata.is_file() || metadata.len() > MAX_MANIFEST_BYTES {
        return Err(ManifestError::Missing);
    }
    std::fs::read(path).map_err(|_| ManifestError::Missing)
}

/// Décode une clé ou une signature au format de `tauri signer` (texte
/// minisign encodé en base64).
fn decode_text(value: &[u8]) -> Result<String, ManifestError> {
    let text: Vec<u8> = value
        .iter()
        .copied()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(text)
        .map_err(|_| ManifestError::BadSignature)?;
    String::from_utf8(bytes).map_err(|_| ManifestError::BadSignature)
}

fn version_tuple(version: &str) -> Option<(u64, u64, u64)> {
    let core = version.trim_start_matches('v').split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    Some((parts.next()??, parts.next()??, parts.next()??))
}

fn valid_entry(entry: &Entry) -> bool {
    entry.sha256.len() == 64
        && entry
            .sha256
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
        && entry
            .url
            .as_deref()
            .is_none_or(|url| url.starts_with("https://"))
}

/// Vérifie le manifeste signé du dossier et rend ses entrées (chemin →
/// empreinte et taille), égales à celles de `files.sha256`.
pub fn verify_manifest(
    dir: &Path,
    public_key: Option<&str>,
    app_version: &str,
    list: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, u64>, ManifestError> {
    verify_manifest_with(dir, public_key, app_version, MIN_MODULE_VERSION, list)
}

/// `verify_manifest` avec une version minimale du module donnée (essais).
pub fn verify_manifest_with(
    dir: &Path,
    public_key: Option<&str>,
    app_version: &str,
    min_module_version: &str,
    list: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, u64>, ManifestError> {
    let public_key = public_key.ok_or(ManifestError::NoKey)?;
    let manifest_bytes = read_small(&dir.join(MANIFEST_FILE))?;
    let signature_bytes = read_small(&dir.join(SIGNATURE_FILE))?;
    let key = PublicKey::decode(&decode_text(public_key.as_bytes())?)
        .map_err(|_| ManifestError::NoKey)?;
    let signature = Signature::decode(&decode_text(&signature_bytes)?)
        .map_err(|_| ManifestError::BadSignature)?;
    key.verify(&manifest_bytes, &signature, false)
        .map_err(|_| ManifestError::BadSignature)?;

    let manifest: Manifest =
        serde_json::from_slice(&manifest_bytes).map_err(|_| ManifestError::Invalid)?;
    if manifest.schema != 1 || manifest.module != "syntheo-speech" {
        return Err(ManifestError::Invalid);
    }
    if manifest.target != current_target()
        || manifest.protocol != crate::host::PROTOCOL
        || manifest.engine != "parakeet"
    {
        return Err(ManifestError::Incompatible);
    }
    let required = version_tuple(&manifest.min_app_version).ok_or(ManifestError::Invalid)?;
    let current = version_tuple(app_version).ok_or(ManifestError::AppTooOld)?;
    if current < required {
        return Err(ManifestError::AppTooOld);
    }
    let module = version_tuple(&manifest.version).ok_or(ManifestError::Invalid)?;
    if Some(module) < version_tuple(min_module_version) {
        return Err(ManifestError::ModuleTooOld);
    }
    let floor_path = floor_path(dir);
    if let Some(path) = &floor_path
        && manifest.build < read_floor(path)
    {
        return Err(ManifestError::ModuleTooOld);
    }

    let mut entries = BTreeMap::new();
    for entry in manifest.files.iter().chain(&manifest.models) {
        if !valid_entry(entry) || entries.insert(entry.path.clone(), entry).is_some() {
            return Err(ManifestError::Invalid);
        }
    }
    let same = entries.len() == list.len()
        && entries
            .iter()
            .all(|(path, entry)| list.get(path) == Some(&entry.sha256));
    if !same {
        return Err(ManifestError::ListMismatch);
    }
    // Manifeste authentique : le plancher monte (au mieux).
    if let Some(path) = &floor_path {
        raise_floor(path, manifest.build);
    }
    Ok(entries
        .into_iter()
        .map(|(path, entry)| (path, entry.size))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_on_their_core() {
        assert_eq!(version_tuple("0.8.0"), Some((0, 8, 0)));
        assert_eq!(version_tuple("v0.8.1-2"), Some((0, 8, 1)));
        assert!(version_tuple("0.8.0-1") >= version_tuple("0.8.0"));
        assert_eq!(version_tuple("0.8"), None);
    }

    #[test]
    fn no_key_means_no_module() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            verify_manifest(dir.path(), None, "0.8.0", &BTreeMap::new()).err(),
            Some(ManifestError::NoKey)
        );
    }

    #[test]
    fn an_older_signed_module_is_refused() {
        use crate::test_signing::{TestKey, current_manifest};
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(crate::verify::binary_name()), b"x").unwrap();
        let key = TestKey::new();
        key.sign_module(
            dir.path(),
            &current_manifest(dir.path(), &[crate::verify::binary_name()], &[], "0.8.0"),
        );
        let list = std::fs::read_to_string(dir.path().join(crate::verify::LIST_FILE)).unwrap();
        let list: BTreeMap<String, String> = list
            .lines()
            .map(|l| {
                let (hash, path) = l.split_once("  ").unwrap();
                (path.to_owned(), hash.to_owned())
            })
            .collect();
        let public = key.public();
        assert!(verify_manifest_with(dir.path(), Some(&public), "0.8.0", "0.1.0", &list).is_ok());
        assert_eq!(
            verify_manifest_with(dir.path(), Some(&public), "0.8.0", "0.2.0", &list).err(),
            Some(ManifestError::ModuleTooOld)
        );
    }

    #[test]
    fn an_older_build_is_refused_once_a_newer_one_was_accepted() {
        use crate::test_signing::TestKey;
        let parent = tempfile::tempdir().unwrap();
        let dir = parent.path().join("speech");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(crate::verify::binary_name()), b"x").unwrap();
        let key = TestKey::new();
        let public = key.public();
        let sign = |build: u64| {
            let manifest = crate::test_signing::current_manifest(
                &dir,
                &[crate::verify::binary_name()],
                &[],
                "0.8.0",
            )
            .replace("\"build\": 1", &format!("\"build\": {build}"));
            key.sign_module(&dir, &manifest);
            let list = std::fs::read_to_string(dir.join(crate::verify::LIST_FILE)).unwrap();
            list.lines()
                .map(|l| {
                    let (hash, path) = l.split_once("  ").unwrap();
                    (path.to_owned(), hash.to_owned())
                })
                .collect::<BTreeMap<String, String>>()
        };
        let list = sign(7);
        assert!(verify_manifest(&dir, Some(&public), "0.8.0", &list).is_ok());
        let list = sign(6);
        assert_eq!(
            verify_manifest(&dir, Some(&public), "0.8.0", &list).err(),
            Some(ManifestError::ModuleTooOld)
        );
        let list = sign(8);
        assert!(verify_manifest(&dir, Some(&public), "0.8.0", &list).is_ok());
        assert_eq!(read_floor(&parent.path().join("speech.floor")), 8);
    }
}
