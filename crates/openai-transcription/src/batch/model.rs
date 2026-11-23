use serde::{Deserialize, Serialize};
use strum::{AsRefStr, Display, EnumString};

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, EnumString, Display, AsRefStr,
)]
pub enum AudioModel {
    #[serde(rename = "whisper-1")]
    #[strum(serialize = "whisper-1")]
    Whisper1,
    #[serde(rename = "gpt-transcribe")]
    #[strum(serialize = "gpt-transcribe")]
    GptTranscribe,
    #[serde(rename = "gpt-4o-transcribe")]
    #[strum(serialize = "gpt-4o-transcribe")]
    Gpt4oTranscribe,
    #[serde(rename = "gpt-4o-mini-transcribe")]
    #[strum(serialize = "gpt-4o-mini-transcribe")]
    Gpt4oMiniTranscribe,
    #[serde(rename = "gpt-4o-mini-transcribe-2025-12-15")]
    #[strum(serialize = "gpt-4o-mini-transcribe-2025-12-15")]
    Gpt4oMiniTranscribe20251215,
    #[serde(rename = "gpt-4o-transcribe-diarize")]
    #[strum(serialize = "gpt-4o-transcribe-diarize")]
    Gpt4oTranscribeDiarize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GptTranscriptionModel {
    GptTranscribe,
    Gpt4oTranscribe,
    Gpt4oMiniTranscribe,
    Gpt4oMiniTranscribe20251215,
}

impl From<GptTranscriptionModel> for AudioModel {
    fn from(value: GptTranscriptionModel) -> Self {
        match value {
            GptTranscriptionModel::GptTranscribe => Self::GptTranscribe,
            GptTranscriptionModel::Gpt4oTranscribe => Self::Gpt4oTranscribe,
            GptTranscriptionModel::Gpt4oMiniTranscribe => Self::Gpt4oMiniTranscribe,
            GptTranscriptionModel::Gpt4oMiniTranscribe20251215 => Self::Gpt4oMiniTranscribe20251215,
        }
    }
}

impl TryFrom<AudioModel> for GptTranscriptionModel {
    type Error = AudioModel;

    fn try_from(value: AudioModel) -> Result<Self, Self::Error> {
        match value {
            AudioModel::GptTranscribe => Ok(Self::GptTranscribe),
            AudioModel::Gpt4oTranscribe => Ok(Self::Gpt4oTranscribe),
            AudioModel::Gpt4oMiniTranscribe => Ok(Self::Gpt4oMiniTranscribe),
            AudioModel::Gpt4oMiniTranscribe20251215 => Ok(Self::Gpt4oMiniTranscribe20251215),
            other => Err(other),
        }
    }
}
