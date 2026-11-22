//! Signature de manifestes pour les essais : une clé minisign jetable, au
//! format de `tauri signer` (texte minisign encodé en base64).

use std::io::Cursor;
use std::path::Path;

use base64::Engine as _;
use sha2::{Digest, Sha256};

pub struct TestKey(minisign::KeyPair);

fn b64(text: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(text)
}

impl Default for TestKey {
    fn default() -> Self {
        Self::new()
    }
}

impl TestKey {
    pub fn new() -> Self {
        Self(minisign::KeyPair::generate_unencrypted_keypair().expect("clé"))
    }

    /// Clé publique, comme `MODULE_PUBLIC_KEY`.
    pub fn public(&self) -> String {
        b64(&self.0.pk.to_box().expect("clé").to_string())
    }

    /// Écrit `manifest.json`, sa signature et `files.sha256` cohérent.
    pub fn sign_module(&self, dir: &Path, manifest: &str) {
        let signature = minisign::sign(
            Some(&self.0.pk),
            &self.0.sk,
            Cursor::new(manifest.as_bytes()),
            Some("essai"),
            None,
        )
        .expect("signature");
        std::fs::write(dir.join(crate::manifest::MANIFEST_FILE), manifest).unwrap();
        std::fs::write(
            dir.join(crate::manifest::SIGNATURE_FILE),
            b64(&signature.to_string()),
        )
        .unwrap();
        let value: serde_json::Value = serde_json::from_str(manifest).unwrap();
        let list: String = ["files", "models"]
            .iter()
            .flat_map(|k| value[k].as_array().cloned().unwrap_or_default())
            .map(|e| {
                format!(
                    "{}  {}\n",
                    e["sha256"].as_str().unwrap(),
                    e["path"].as_str().unwrap()
                )
            })
            .collect();
        std::fs::write(dir.join(crate::verify::LIST_FILE), list).unwrap();
    }
}

fn entry(dir: &Path, path: &str, url: bool) -> serde_json::Value {
    let bytes = std::fs::read(dir.join(path)).unwrap();
    let hash: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let mut value = serde_json::json!({ "path": path, "sha256": hash, "size": bytes.len() });
    if url {
        value["url"] = format!("https://example.invalid/{path}").into();
    }
    value
}

/// Manifeste de la cible courante pour les fichiers du dossier.
pub fn current_manifest(
    dir: &Path,
    files: &[&str],
    models: &[&str],
    min_app_version: &str,
) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "schema": 1,
        "module": "syntheo-speech",
        "version": "0.1.0",
        "build": 1,
        "protocol": crate::host::PROTOCOL,
        "engine": "parakeet",
        "target": crate::manifest::current_target(),
        "min_app_version": min_app_version,
        "files": files.iter().map(|p| entry(dir, p, false)).collect::<Vec<_>>(),
        "models": models.iter().map(|p| entry(dir, p, true)).collect::<Vec<_>>(),
    }))
    .unwrap()
}
