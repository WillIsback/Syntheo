use serde::{Serialize, ser::Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[cfg(feature = "onnx")]
    #[error(transparent)]
    SyntheoOnnxError(#[from] syntheo_onnx::Error),

    #[cfg(feature = "onnx")]
    #[error(transparent)]
    OrtError(#[from] syntheo_onnx::ort::Error),

    #[error(transparent)]
    FftError(#[from] realfft::FftError),

    #[cfg(feature = "onnx")]
    #[error(transparent)]
    ShapeError(#[from] syntheo_onnx::ndarray::ShapeError),

    #[error("Missing output tensor: {0}")]
    MissingOutput(String),

    /// Modèle absent (premier lancement hors ligne, téléchargement pas encore fait).
    #[error("echo cancellation model unavailable: {0}")]
    ModelUnavailable(String),

    /// Fichier tronqué, altéré ou plus grand que prévu.
    #[error("echo cancellation model failed verification: {0}")]
    ModelChecksum(&'static str),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[cfg(feature = "download")]
    #[error(transparent)]
    Download(#[from] reqwest::Error),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
