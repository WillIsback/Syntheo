use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptItem {
    pub speaker: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub items: Vec<TranscriptItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportMetadata {
    pub title: String,
    pub created_at: String,
    pub participants: Vec<String>,
    pub duration: Option<String>,
}

// Section and cover labels, in the interface language (issue 454).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportLabels {
    pub memo: String,
    pub summary: String,
    pub transcript: String,
    pub participants: String,
    pub unknown_speaker: String,
}

impl Default for ExportLabels {
    fn default() -> Self {
        Self {
            memo: "Memo".to_string(),
            summary: "Summary".to_string(),
            transcript: "Transcript".to_string(),
            participants: "Participants".to_string(),
            unknown_speaker: "Unknown".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportInput {
    pub enhanced_md: String,
    pub memo_md: Option<String>,
    pub transcript: Option<Transcript>,
    pub metadata: Option<ExportMetadata>,
    // English labels when absent.
    #[serde(default)]
    pub labels: Option<ExportLabels>,
}
