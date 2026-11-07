use serde::{Deserialize, Deserializer};
use serde_json::{Map, Value};
use specta::Type;

fn null_or_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Type)]
pub struct TranscriptJson {
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = Vec<TranscriptWithData>)]
    pub transcripts: Vec<TranscriptWithData>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Type)]
pub struct TranscriptWithData {
    pub id: String,
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = String)]
    pub user_id: String,
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = String)]
    pub created_at: String,
    pub session_id: String,
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = f64)]
    pub started_at: f64,
    #[serde(default)]
    pub ended_at: Option<f64>,
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = String)]
    pub memo_md: String,
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = Vec<TranscriptWord>)]
    pub words: Vec<TranscriptWord>,
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = Vec<TranscriptSpeakerHint>)]
    pub speaker_hints: Vec<TranscriptSpeakerHint>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Type)]
pub struct TranscriptWord {
    #[serde(default)]
    pub id: Option<String>,
    pub text: String,
    pub start_ms: f64,
    pub end_ms: f64,
    pub channel: f64,
    #[serde(default)]
    pub speaker: Option<String>,
    #[serde(default)]
    pub metadata: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Type)]
pub struct TranscriptSpeakerHint {
    #[serde(default)]
    pub id: Option<String>,
    pub word_id: String,
    #[serde(rename = "type")]
    pub hint_type: String,
    #[serde(default, deserialize_with = "null_or_default")]
    #[specta(type = Value)]
    pub value: Value,
}
