mod batch;
mod error;
mod events;
mod runtime;
mod subtitle;

pub use batch::{
    AudioBuffer, BatchAudio, BatchParams, BatchProvider, BatchRunMode, BatchRunOutput,
    decode_audio_base64, expects_progressive_batch, run_batch, run_batch_job,
};
pub use error::*;
pub use events::*;
pub use runtime::*;
pub use subtitle::*;

use std::str::FromStr;

use owhisper_client::AdapterKind;

pub fn is_supported_languages_live(
    provider: &str,
    model: Option<&str>,
    languages: &[syntheo_language::Language],
) -> std::result::Result<bool, String> {
    let adapter_kind =
        AdapterKind::from_str(provider).map_err(|_| format!("unknown_provider: {}", provider))?;

    Ok(adapter_kind.is_supported_languages_live(languages, model))
}

pub fn is_supported_languages_batch(
    provider: &str,
    model: Option<&str>,
    languages: &[syntheo_language::Language],
) -> std::result::Result<bool, String> {
    let adapter_kind =
        AdapterKind::from_str(provider).map_err(|_| format!("unknown_provider: {}", provider))?;

    Ok(adapter_kind.is_supported_languages_batch(languages, model))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_support_by_on_prem_protocol() {
        let french = vec!["fr".parse().unwrap()];
        assert!(is_supported_languages_live("openai", Some("whisper-large-v3"), &french).unwrap());
        assert!(is_supported_languages_batch("openai", Some("whisper-large-v3"), &french).unwrap());
        assert!(!is_supported_languages_batch("nvidia", None, &french).unwrap());
        assert!(is_supported_languages_live("soniqo", None, &french).is_err());
    }
}
