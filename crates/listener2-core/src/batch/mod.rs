mod accumulator;
mod progressive;
mod simple;
mod upload;

use std::sync::Arc;

use owhisper_client::{AdapterKind, OpenAIAdapter};

use crate::{BatchEvent, BatchRuntime};

use progressive::run_progressive_batch_session;
use simple::run_direct_batch_for_adapter_kind;
use upload::{AudioInputRef, audio_duration, segment_plan};

impl BatchParams {
    /// Source audio de cet envoi : le tampon mémoire prime sur le chemin.
    /// `run_batch` décode d'abord un éventuel `audio` base64 en tampon.
    pub(in crate::batch) fn audio_input(&self) -> AudioInputRef<'_> {
        match &self.audio_buffer {
            Some(buffer) => AudioInputRef::Bytes {
                data: &buffer.data,
                file_name: &buffer.file_name,
            },
            None => AudioInputRef::Path(&self.file_path),
        }
    }

    /// Décode une seule fois l'audio base64 reçu de l'interface : la suite du
    /// batch lit le tampon sans le recopier.
    fn with_decoded_audio(mut self) -> Result<BatchParams, String> {
        if let Some(audio) = self.audio.take() {
            self.audio_buffer = Some(AudioBuffer::new(
                upload::decode_base64(&audio.data_base64)?,
                audio.file_name,
            ));
        }
        Ok(self)
    }

    /// Audio de l'envoi décodé en PCM 16 bits mono à `sample_rate`, en
    /// mémoire, pour le flux temps réel. Bloquant : à lancer hors du runtime.
    pub fn decode_pcm16_mono(self, sample_rate: u32) -> Result<Vec<i16>, String> {
        let params = self.with_decoded_audio()?;
        params
            .audio_input()
            .into_owned()
            .decode_pcm16_mono(sample_rate)
    }

    /// Copie légère (sans dupliquer un éventuel tampon audio) pour un segment.
    pub(super) fn with_audio_buffer(&self, audio_buffer: Option<AudioBuffer>) -> BatchParams {
        BatchParams {
            session_id: self.session_id.clone(),
            provider: self.provider.clone(),
            file_path: self.file_path.clone(),
            audio: None,
            audio_buffer,
            model: self.model.clone(),
            base_url: self.base_url.clone(),
            api_key: self.api_key.clone(),
            languages: self.languages.clone(),
            keywords: self.keywords.clone(),
            num_speakers: self.num_speakers,
            min_speakers: self.min_speakers,
            max_speakers: self.max_speakers,
        }
    }
}

/// Décode un morceau d'audio reçu en base64 de la webview.
pub fn decode_audio_base64(data_base64: &str) -> Result<Vec<u8>, String> {
    upload::decode_base64(data_base64)
}

/// Audio déjà en mémoire (dictée décodée, fichier déposé reçu par morceaux,
/// segment) : partagé sans copie et jamais écrit sur le disque.
#[derive(Clone)]
pub struct AudioBuffer {
    data: Arc<[u8]>,
    file_name: String,
}

impl AudioBuffer {
    pub fn new(data: Vec<u8>, file_name: String) -> Self {
        Self {
            data: Arc::from(data.into_boxed_slice()),
            file_name,
        }
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

impl std::fmt::Debug for AudioBuffer {
    // Jamais le contenu : un enregistrement de plusieurs centaines de Mo
    // n'a rien à faire dans un journal.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AudioBuffer")
            .field("len", &self.data.len())
            .field("file_name", &self.file_name)
            .finish()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, strum::Display, strum::EnumString)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum BatchProvider {
    OpenAI,
    /// Aucun mode par lot : le fichier passe par le flux temps réel du
    /// fournisseur (issue 463), hors de `run_batch`.
    Realtime,
}

/// Tampon audio transmis en mémoire (dictée) : rien n'est écrit sur le disque.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct BatchAudio {
    /// Tampon audio en base64 : Tauri sérialise `Vec<u8>` en `number[]`, ce qui
    /// ferait exploser la charge IPC d'un enregistrement dicté.
    pub data_base64: String,
    pub file_name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct BatchParams {
    pub session_id: String,
    pub provider: BatchProvider,
    #[serde(default)]
    pub file_path: String,
    /// Prioritaire sur `file_path` quand présent : l'audio vient de la mémoire.
    #[serde(default)]
    pub audio: Option<BatchAudio>,
    /// Tampon déjà en mémoire, posé côté Rust (jamais sérialisé) : prime sur
    /// `audio` et `file_path`.
    #[serde(skip)]
    pub audio_buffer: Option<AudioBuffer>,
    #[serde(default)]
    pub model: Option<String>,
    pub base_url: String,
    pub api_key: String,
    #[serde(default)]
    pub languages: Vec<syntheo_language::Language>,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub num_speakers: Option<u32>,
    #[serde(default)]
    pub min_speakers: Option<u32>,
    #[serde(default)]
    pub max_speakers: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum BatchRunMode {
    Direct,
    Streamed,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct BatchRunOutput {
    pub session_id: String,
    pub mode: BatchRunMode,
    pub response: owhisper_interface::batch::Response,
}

pub async fn run_batch(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
) -> crate::Result<BatchRunOutput> {
    let session_id = params.session_id.clone();
    run_batch_job(
        runtime.clone(),
        session_id,
        run_batch_inner(runtime, params),
    )
    .await
}

/// Cycle d'événements d'un envoi (début, réponse ou échec, fin), partagé par
/// le lot et par le flux temps réel d'un fichier.
pub async fn run_batch_job(
    runtime: Arc<dyn BatchRuntime>,
    session_id: String,
    job: impl std::future::Future<Output = crate::Result<BatchRunOutput>>,
) -> crate::Result<BatchRunOutput> {
    runtime.emit(BatchEvent::BatchStarted {
        session_id: session_id.clone(),
    });

    let result = job.await;

    if let Err(error) = &result {
        let (code, message) = match error {
            crate::Error::BatchFailed(failure) => (failure.code(), failure.to_string()),
            _ => (crate::BatchErrorCode::Unknown, error.to_string()),
        };

        runtime.emit(BatchEvent::BatchFailed {
            session_id,
            code,
            error: message,
        });
    } else {
        let output = result.as_ref().unwrap();

        runtime.emit(BatchEvent::BatchResponse {
            session_id: output.session_id.clone(),
            response: output.response.clone(),
            mode: output.mode,
        });
        runtime.emit(BatchEvent::BatchCompleted {
            session_id: output.session_id.clone(),
        });
    }

    result
}

pub fn expects_progressive_batch(params: &BatchParams) -> bool {
    match params.provider {
        BatchProvider::OpenAI => {
            OpenAIAdapter::supports_progressive_batch_model(params.model.as_deref())
        }
        BatchProvider::Realtime => false,
    }
}

async fn run_batch_inner(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
) -> crate::Result<BatchRunOutput> {
    let params = match params.with_decoded_audio() {
        Ok(params) => params,
        Err(raw_error) => {
            log_batch_failure("audio_decode", &raw_error);
            return Err(crate::BatchFailure::AudioMetadataReadFailed {
                message: format_user_friendly_error(&raw_error),
            }
            .into());
        }
    };
    let metadata = {
        let owned = params.audio_input().into_owned();
        let metadata_joined = tokio::task::spawn_blocking(move || owned.metadata()).await;

        let metadata_result = match metadata_joined {
            Ok(result) => result,
            Err(_err) => {
                tracing::error!(error.type = "audio_metadata_task_join_failed", "audio_metadata_task_join_failed");
                return Err(crate::BatchFailure::AudioMetadataJoinFailed.into());
            }
        };

        match metadata_result {
            Ok(metadata) => metadata,
            Err(raw_error) => {
                let message = format_user_friendly_error(&raw_error);
                log_batch_failure("audio_metadata_read", &raw_error);
                return Err(crate::BatchFailure::AudioMetadataReadFailed { message }.into());
            }
        }
    };

    let listen_params = build_listen_params(&params, metadata.channels, metadata.sample_rate);

    match params.provider {
        BatchProvider::OpenAI => {
            let audio = params.audio_input();
            let needs_split = segment_plan(
                &audio,
                audio_duration(&audio),
                AdapterKind::OpenAI.batch_upload_limit(listen_params.model.as_deref()),
            )
            .is_some();
            // Le streaming progressif ne lit qu'un seul fichier : un tampon
            // mémoire (dictée) ou un enregistrement à découper passe par le
            // chemin direct, qui segmente en mémoire.
            let can_stream = params.audio_buffer.is_none() && !needs_split;

            if can_stream
                && OpenAIAdapter::supports_progressive_batch_model(listen_params.model.as_deref())
            {
                run_progressive_batch_session(runtime, params, listen_params).await
            } else {
                run_direct_batch_for_adapter_kind(AdapterKind::OpenAI, params, listen_params).await
            }
        }
        BatchProvider::Realtime => Err(crate::BatchFailure::BatchCapabilityUnsupported {
            provider: BatchProvider::Realtime.to_string(),
        }
        .into()),
    }
}

fn build_listen_params(
    params: &BatchParams,
    channels: u8,
    sample_rate: u32,
) -> owhisper_interface::ListenParams {
    owhisper_interface::ListenParams {
        model: params.model.clone(),
        channels,
        sample_rate,
        languages: params.languages.clone(),
        keywords: params.keywords.clone(),
        num_speakers: params.num_speakers,
        min_speakers: params.min_speakers,
        max_speakers: params.max_speakers,
        mic_num_speakers: None,
        custom_query: None,
    }
}

pub(super) fn session_span(session_id: &str) -> tracing::Span {
    let _ = session_id;
    tracing::info_span!("session")
}

pub(super) fn log_batch_failure(operation: &str, error: &str) {
    if syntheo_user_error::is_user_error_text(error) {
        tracing::warn!(
            syntheo.operation = operation,
            error.type = "user_error",
            "batch_operation_rejected"
        );
    } else {
        tracing::error!(
            syntheo.operation = operation,
            error.type = "batch_operation_failed",
            "batch_operation_failed"
        );
    }
}

pub(super) fn format_user_friendly_error(error: &str) -> String {
    let error_lower = error.to_lowercase();

    if error_lower.contains("401") || error_lower.contains("unauthorized") {
        return "Authentication failed. Please check your API key in settings.".to_string();
    }
    if error_lower.contains("403") || error_lower.contains("forbidden") {
        return "Access denied. Your API key may not have permission for this operation."
            .to_string();
    }
    if error_lower.contains("429") || error_lower.contains("rate limit") {
        return "Rate limit exceeded. Wait a few minutes or check your provider plan's quota, then try again.".to_string();
    }
    if error_lower.contains("timeout") {
        return "Connection timed out. Please check your internet connection and try again."
            .to_string();
    }
    if error_lower.contains("connection refused")
        || error_lower.contains("failed to connect")
        || error_lower.contains("network")
    {
        return "Could not connect to the transcription service. Please check your internet connection.".to_string();
    }
    if error_lower.contains("413")
        || error_lower.contains("payload too large")
        || error_lower.contains("file too large")
        || error_lower.contains("upload limit")
        || error_lower.contains("audio duration")
    {
        return "This recording is too large for the selected transcription provider. Try another provider or split the recording.".to_string();
    }
    if error_lower.contains("invalid audio")
        || error_lower.contains("unsupported format")
        || error_lower.contains("codec")
    {
        return "The audio file format is not supported. Please try a different file.".to_string();
    }
    if error_lower.contains("file not found") || error_lower.contains("no such file") {
        return "Audio file not found. The recording may have been moved or deleted.".to_string();
    }

    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn batch_params(provider: BatchProvider, base_url: &str) -> BatchParams {
        BatchParams {
            session_id: "session".to_string(),
            provider,
            file_path: "/tmp/audio.wav".to_string(),
            audio: None,
            audio_buffer: None,
            model: None,
            base_url: base_url.to_string(),
            api_key: "key".to_string(),
            languages: vec![syntheo_language::ISO639::En.into()],
            keywords: vec![],
            num_speakers: None,
            min_speakers: None,
            max_speakers: None,
        }
    }

    #[test]
    fn base64_audio_is_decoded_once_into_a_shared_buffer() {
        let mut params = batch_params(BatchProvider::OpenAI, "http://localhost:8000/v1");
        params.audio = Some(BatchAudio {
            data_base64: "AQID".to_string(),
            file_name: "dictation.wav".to_string(),
        });

        let params = params.with_decoded_audio().unwrap();

        assert!(params.audio.is_none());
        match params.audio_input() {
            AudioInputRef::Bytes { data, file_name } => {
                assert_eq!(&data[..], &[1, 2, 3]);
                assert_eq!(file_name, "dictation.wav");
            }
            AudioInputRef::Path(_) => panic!("expected an in-memory source"),
        }
    }

    #[test]
    fn invalid_base64_audio_is_rejected() {
        let mut params = batch_params(BatchProvider::OpenAI, "http://localhost:8000/v1");
        params.audio = Some(BatchAudio {
            data_base64: "not base64!".to_string(),
            file_name: "dictation.wav".to_string(),
        });

        assert!(params.with_decoded_audio().is_err());
    }

    #[test]
    fn build_listen_params_preserves_speaker_options() {
        let mut params = batch_params(BatchProvider::OpenAI, "http://192.168.1.87:8000/v1");
        params.num_speakers = Some(3);
        params.min_speakers = Some(2);
        params.max_speakers = Some(4);

        let listen_params = build_listen_params(&params, 2, 48_000);
        assert_eq!(listen_params.num_speakers, Some(3));
        assert_eq!(listen_params.min_speakers, Some(2));
        assert_eq!(listen_params.max_speakers, Some(4));
        assert_eq!(listen_params.channels, 2);
        assert_eq!(listen_params.sample_rate, 48_000);
        assert!(listen_params.custom_query.is_none());
    }

    #[test]
    fn only_gpt_transcription_models_run_progressively() {
        for (model, expected) in [
            (None, true),
            (Some("gpt-4o-transcribe"), true),
            (Some("gpt-4o-transcribe-diarize"), false),
            (Some("whisper-large-v3"), false),
        ] {
            let mut params = batch_params(BatchProvider::OpenAI, "http://192.168.1.87:8000/v1");
            params.model = model.map(ToOwned::to_owned);
            assert_eq!(expects_progressive_batch(&params), expected, "{model:?}");
        }
    }

    #[test]
    fn provider_size_limit_errors_are_explained() {
        let errors = [
            r#"UnexpectedStatus { status: 400, body: "Audio file exceeds the 25 MB multipart upload limit." }"#,
            r#"UnexpectedStatus { status: 400, body: "{\"error\":{\"message\":\"audio duration 1500.012 seconds is longer than 1400 seconds which is the maximum for this model\"}}" }"#,
        ];

        for error in errors {
            let message = format_user_friendly_error(error);
            assert!(message.starts_with("This recording is too large"));
        }
    }
}
