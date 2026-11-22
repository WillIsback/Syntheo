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
pub fn floor_path(dir: &Path) -> Option<std::path::PathBuf> {
    let name = dir.file_name()?.to_string_lossy();
    Some(dir.parent()?.join(format!("{name}.floor")))
}

/// Numéro de construction d'une version x.y.z : `MAJEUR·10⁶ + MINEUR·10³ +
/// CORRECTIF`, suivi de deux chiffres de reconstruction. Monotone d'une
/// release de l'application à l'autre.
pub fn build_base(version: &str) -> Option<u64> {
    let (major, minor, patch) = version_tuple(version)?;
    (minor < 1000 && patch < 1000).then(|| (major * 1_000_000 + minor * 1_000 + patch) * 100)
}

/// Plancher enregistré ; une valeur au-delà de ce que cette application peut
/// accepter (`ceiling`) est aberrante : ignorée (puis réécrite).
fn read_floor(path: &Path, ceiling: u64) -> u64 {
    let value = std::fs::read_to_string(path)
        .ok()
        .and_then(|text| text.trim().parse::<u64>().ok())
        .unwrap_or(0);
    if value > ceiling {
        tracing::warn!(target: "syntheo_speech", "module floor out of range; ignored");
        return 0;
    }
    value
}

/// Monte le plancher : fichier temporaire, fsync, renommage ; erreurs
/// journalisées, temporaire nettoyé.
fn raise_floor(path: &Path, build: u64, ceiling: u64) {
    use std::io::Write;
    if build <= read_floor(path, ceiling) {
        return;
    }
    let temp = path.with_extension(format!("floor-{}", std::process::id()));
    let written = std::fs::File::create(&temp).and_then(|mut file| {
        file.write_all(build.to_string().as_bytes())?;
        file.sync_all()
    });
    let result = written.and_then(|()| std::fs::rename(&temp, path));
    if let Err(error) = result {
        tracing::warn!(target: "syntheo_speech", kind = ?error.kind(), "module floor not saved");
        let _ = std::fs::remove_file(&temp);
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

impl ManifestError {
    /// Code stable pour l'interface.
    pub fn code(&self) -> &'static str {
        match self {
            Self::NoKey => "no_key",
            Self::Missing | Self::Invalid | Self::ListMismatch => "module_incomplete",
            Self::BadSignature => "bad_signature",
            Self::Incompatible => "incompatible",
            Self::AppTooOld => "app_too_old",
            Self::ModuleTooOld => "module_too_old",
        }
    }
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
    crate::verify::read_bounded(path, MAX_MANIFEST_BYTES).ok_or(ManifestError::Missing)
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
    verify_manifest_at(
        dir,
        public_key,
        app_version,
        min_module_version,
        floor_path(dir).as_deref(),
        list,
    )
}

/// `verify_manifest` avec le plancher anti-retour donné : celui du module
/// installé, même quand le dossier vérifié est une source ou une copie
/// d'installation.
pub fn verify_manifest_at(
    dir: &Path,
    public_key: Option<&str>,
    app_version: &str,
    min_module_version: &str,
    floor: Option<&Path>,
    list: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, u64>, ManifestError> {
    let manifest = read_signed(dir, public_key)?;
    let sizes = accept(&manifest, app_version, min_module_version, floor, list)?;
    // Manifeste authentique et accepté : le plancher monte (au mieux).
    if let Some(path) = floor {
        raise_floor_for(path, manifest.build, app_version);
    }
    Ok(sizes)
}

/// Manifeste dont la signature est vérifiée, avant toute autre lecture du
/// dossier.
pub fn read_signed(dir: &Path, public_key: Option<&str>) -> Result<Manifest, ManifestError> {
    let public_key = public_key.ok_or(ManifestError::NoKey)?;
    let manifest_bytes = read_small(&dir.join(MANIFEST_FILE))?;
    let signature_bytes = read_small(&dir.join(SIGNATURE_FILE))?;
    let key = PublicKey::decode(&decode_text(public_key.as_bytes())?)
        .map_err(|_| ManifestError::NoKey)?;
    let signature = Signature::decode(&decode_text(&signature_bytes)?)
        .map_err(|_| ManifestError::BadSignature)?;
    key.verify(&manifest_bytes, &signature, false)
        .map_err(|_| ManifestError::BadSignature)?;
    serde_json::from_slice(&manifest_bytes).map_err(|_| ManifestError::Invalid)
}

/// Contrôles d'un manifeste signé : module, cible, versions, construction
/// contre le plancher (lu, jamais écrit ici), liste. Rend les tailles.
pub fn accept(
    manifest: &Manifest,
    app_version: &str,
    min_module_version: &str,
    floor: Option<&Path>,
    list: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, u64>, ManifestError> {
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
    // Construction dérivée de la version minimale de l'application (deux
    // chiffres de reconstruction) : cohérente, et monotone d'une release à
    // l'autre.
    let base = build_base(&manifest.min_app_version).ok_or(ManifestError::Invalid)?;
    if manifest.build < base || manifest.build > base + 99 {
        return Err(ManifestError::Invalid);
    }
    let ceiling = build_base(app_version).map_or(0, |b| b + 99);
    if let Some(path) = floor
        && manifest.build < read_floor(path, ceiling)
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
    Ok(entries
        .into_iter()
        .map(|(path, entry)| (path.clone(), entry.size))
        .collect())
}

/// Monte le plancher à `build` (après une installation réussie, ou au
/// lancement d'un module accepté).
pub fn raise_floor_for(path: &Path, build: u64, app_version: &str) {
    let ceiling = build_base(app_version).map_or(0, |b| b + 99);
    raise_floor(path, build, ceiling);
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
        let sign = |min_app: &str, build: u64| {
            let manifest = crate::test_signing::current_manifest(
                &dir,
                &[crate::verify::binary_name()],
                &[],
                min_app,
            );
            let mut value: serde_json::Value = serde_json::from_str(&manifest).unwrap();
            value["build"] = build.into();
            key.sign_module(&dir, &value.to_string());
            let list = std::fs::read_to_string(dir.join(crate::verify::LIST_FILE)).unwrap();
            list.lines()
                .map(|l| {
                    let (hash, path) = l.split_once("  ").unwrap();
                    (path.to_owned(), hash.to_owned())
                })
                .collect::<BTreeMap<String, String>>()
        };
        let floor = parent.path().join("speech.floor");
        // 0.8.0, reconstruction 1 puis 0 (retour), puis 0.8.1.
        let list = sign("0.8.0", 800_001);
        assert!(verify_manifest(&dir, Some(&public), "0.8.1", &list).is_ok());
        let list = sign("0.8.0", 800_000);
        assert_eq!(
            verify_manifest(&dir, Some(&public), "0.8.1", &list).err(),
            Some(ManifestError::ModuleTooOld)
        );
        let list = sign("0.8.1", 800_100);
        assert!(verify_manifest(&dir, Some(&public), "0.8.1", &list).is_ok());
        assert_eq!(read_floor(&floor, u64::MAX), 800_100);
        // Construction incohérente avec la version minimale : invalide.
        let list = sign("0.8.1", 900_000);
        assert_eq!(
            verify_manifest(&dir, Some(&public), "0.8.1", &list).err(),
            Some(ManifestError::Invalid)
        );
        // Plancher aberrant (au-delà de cette application) : ignoré et réécrit.
        std::fs::write(&floor, "99999999999").unwrap();
        let list = sign("0.8.1", 800_100);
        assert!(verify_manifest(&dir, Some(&public), "0.8.1", &list).is_ok());
        assert_eq!(read_floor(&floor, u64::MAX), 800_100);
        assert_eq!(build_base("1.2.3"), Some(100_200_300));
    }
}
