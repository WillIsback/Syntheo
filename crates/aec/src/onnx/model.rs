//! Modèles DTLN-aec, embarqués dans le binaire (issue 702) : l'annulation d'écho marche dès
//! le premier lancement, hors ligne, sans aucune connexion sortante. Seuls les deux fichiers
//! de la variante compilée (feature `128`, `256` ou `512`) sont inclus. Leur taille et leur
//! SHA-256 restent épinglés ici et vérifiés au chargement.

use sha2::{Digest, Sha256};

/// Un fichier de modèle embarqué, identifié par son contenu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelFile {
    pub name: &'static str,
    pub size: u64,
    pub sha256: &'static str,
    pub bytes: &'static [u8],
}

impl ModelFile {
    /// Renvoie les octets embarqués s'ils ont la taille et l'empreinte épinglées.
    pub(crate) fn verified_bytes(&self) -> Result<&'static [u8], crate::Error> {
        if self.bytes.len() as u64 == self.size && sha256_hex(self.bytes) == self.sha256 {
            Ok(self.bytes)
        } else {
            Err(crate::Error::ModelChecksum(self.name))
        }
    }
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(feature = "128")]
pub const FILES: [ModelFile; 2] = [
    ModelFile {
        name: "model_128_1.onnx",
        size: 2_004_506,
        sha256: "a060e46a6bebed03d6360262d814851dc6c2806cec7c1b6a388e617cae7c082c",
        bytes: include_bytes!("../../data/models/model_128_1.onnx"),
    },
    ModelFile {
        name: "model_128_2.onnx",
        size: 5_285_219,
        sha256: "6b6e312f701a3fad2aac2981ca1ed978d25dffa0bc8da9f33235a2e91f56705a",
        bytes: include_bytes!("../../data/models/model_128_2.onnx"),
    },
];
#[cfg(feature = "128")]
pub const STATE_SIZE: usize = 128;

#[cfg(feature = "256")]
pub const FILES: [ModelFile; 2] = [
    ModelFile {
        name: "model_256_1.onnx",
        size: 5_552_245,
        sha256: "e7df5a25fce3565bc7d3b9c0b3a4e53f7adb96a4cc772dc189df895f6f33adb7",
        bytes: include_bytes!("../../data/models/model_256_1.onnx"),
    },
    ModelFile {
        name: "model_256_2.onnx",
        size: 10_007_849,
        sha256: "19c07ebe462c424523609afb635e5ff42f1127aa434879ddb744d2db68a22dee",
        bytes: include_bytes!("../../data/models/model_256_2.onnx"),
    },
];
#[cfg(feature = "256")]
pub const STATE_SIZE: usize = 256;

#[cfg(feature = "512")]
pub const FILES: [ModelFile; 2] = [
    ModelFile {
        name: "model_512_1.onnx",
        size: 17_366_051,
        sha256: "72e664d7f2dea2fcc0b7dafedf60a2fa95ce8184095501f58f95332f00825911",
        bytes: include_bytes!("../../data/models/model_512_1.onnx"),
    },
    ModelFile {
        name: "model_512_2.onnx",
        size: 24_171_883,
        sha256: "5218598dda3729f954aff857402cb4c8752b88528b62fe60b7600feebed9efd3",
        bytes: include_bytes!("../../data/models/model_512_2.onnx"),
    },
];
#[cfg(feature = "512")]
pub const STATE_SIZE: usize = 512;

// model already trained with these numbers.
pub const BLOCK_SIZE: usize = 512;
pub const BLOCK_SHIFT: usize = 128;

#[cfg(test)]
mod tests {
    use super::*;

    /// Les octets embarqués sont bien ceux dont la taille et le SHA-256 sont épinglés.
    #[test]
    fn embedded_models_match_the_pinned_fingerprints() {
        for file in &FILES {
            assert_eq!(file.bytes.len() as u64, file.size, "{}", file.name);
            assert_eq!(sha256_hex(file.bytes), file.sha256, "{}", file.name);
            assert!(file.verified_bytes().is_ok());
        }
    }

    #[test]
    fn an_altered_fingerprint_is_refused() {
        let file = ModelFile {
            sha256: "0000000000000000000000000000000000000000000000000000000000000000",
            ..FILES[0]
        };
        assert!(matches!(
            file.verified_bytes(),
            Err(crate::Error::ModelChecksum(_))
        ));
    }
}
