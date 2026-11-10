//! Modèles DTLN-aec. Ils ne sont plus embarqués dans le binaire (issue 429) : l'application
//! les télécharge à la demande dans son dossier de données, et chaque fichier est vérifié par
//! sa taille et son SHA-256 épinglés ici, au téléchargement comme au chargement.

/// Un fichier de modèle, identifié par son contenu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelFile {
    pub name: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

/// Commit du dépôt public qui sert les modèles. Épinglé : un fichier modifié plus tard sur
/// `main` ne change pas ce que l'application télécharge, et le SHA-256 le refuserait de toute
/// façon.
pub const MODEL_SOURCE_COMMIT: &str = "f3a017e167c1ea608bbe438f10a5107346f922ac";

#[cfg(any(feature = "download", test))]
const MODEL_SOURCE_BASE: &str = "https://raw.githubusercontent.com/WillIsback/Syntheo";

#[cfg(any(feature = "download", test))]
impl ModelFile {
    pub fn url(&self) -> String {
        format!(
            "{MODEL_SOURCE_BASE}/{MODEL_SOURCE_COMMIT}/crates/aec/data/models/{}",
            self.name
        )
    }
}

#[cfg(feature = "128")]
pub const FILES: [ModelFile; 2] = [
    ModelFile {
        name: "model_128_1.onnx",
        size: 2_004_506,
        sha256: "a060e46a6bebed03d6360262d814851dc6c2806cec7c1b6a388e617cae7c082c",
    },
    ModelFile {
        name: "model_128_2.onnx",
        size: 5_285_219,
        sha256: "6b6e312f701a3fad2aac2981ca1ed978d25dffa0bc8da9f33235a2e91f56705a",
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
    },
    ModelFile {
        name: "model_256_2.onnx",
        size: 10_007_849,
        sha256: "19c07ebe462c424523609afb635e5ff42f1127aa434879ddb744d2db68a22dee",
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
    },
    ModelFile {
        name: "model_512_2.onnx",
        size: 24_171_883,
        sha256: "5218598dda3729f954aff857402cb4c8752b88528b62fe60b7600feebed9efd3",
    },
];
#[cfg(feature = "512")]
pub const STATE_SIZE: usize = 512;

// model already trained with these numbers.
pub const BLOCK_SIZE: usize = 512;
pub const BLOCK_SHIFT: usize = 128;
