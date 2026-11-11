//! Import d'un fichier par l'API REST de NVIDIA NeMo-Speech.cpp (issue #568).
//!
//! Un enregistrement entier part en une requête : la diarisation reste
//! cohérente du début à la fin. Au-delà de `MAX_REQUEST_SECS`, l'audio est
//! envoyé en morceaux successifs ; les locuteurs d'un morceau sont alors
//! décalés après ceux des précédents, faute de pouvoir les relier.

use std::time::Duration;

use owhisper_client::{AdapterKind, transcribe_with_nemo_speech_rest};
use owhisper_interface::ListenParams;
use syntheo_transcript::{FinalizedWord, WordState};

use super::{FILE_STREAM_CHANNEL, FileStreamObserver, FileStreamParams, FileStreamProgress};
use crate::actors::SAMPLE_RATE;

/// Durée d'audio par requête : 3 h de WAV 16 kHz mono font 346 Mo, sous la
/// limite par défaut du serveur (`--max-upload-mb 512`).
pub const MAX_REQUEST_SECS: u64 = 3 * 3600;

/// Délai accordé à une requête : le temps de l'audio, plus deux minutes. Un
/// serveur plus lent que le temps réel ne ferait pas mieux par le flux.
pub fn request_timeout(audio_secs: f64) -> Duration {
    Duration::from_secs_f64(audio_secs.max(0.0)) + Duration::from_secs(120)
}

/// Bornes de locuteurs de l'import, comme pour une transcription par lot.
#[derive(Debug, Clone, Copy, Default)]
pub struct SpeakerBounds {
    pub num_speakers: Option<u32>,
    pub max_speakers: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum RestFileError {
    Cancelled,
    Failed(String),
}

impl std::fmt::Display for RestFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cancelled => write!(f, "Transcription stopped."),
            Self::Failed(message) => write!(f, "{message}"),
        }
    }
}

/// Le protocole NVIDIA NeMo-Speech.cpp transcrit un fichier par son API REST.
pub fn supports_rest_file_transcription(
    base_url: &str,
    model: &str,
    languages: &[syntheo_language::Language],
) -> bool {
    AdapterKind::from_url_and_languages(base_url, languages, Some(model)) == AdapterKind::Nvidia
}

/// Mots finalisés et durée d'un fichier transcrit par l'API REST.
pub async fn rest_file_transcription(
    params: &FileStreamParams,
    speakers: SpeakerBounds,
    samples: &[i16],
    observer: &dyn FileStreamObserver,
) -> Result<(Vec<FinalizedWord>, f64), RestFileError> {
    transcribe_in_requests(params, speakers, samples, observer, MAX_REQUEST_SECS).await
}

async fn transcribe_in_requests(
    params: &FileStreamParams,
    speakers: SpeakerBounds,
    samples: &[i16],
    observer: &dyn FileStreamObserver,
    max_request_secs: u64,
) -> Result<(Vec<FinalizedWord>, f64), RestFileError> {
    let listen_params = ListenParams {
        model: Some(params.model.clone()),
        languages: params.languages.clone(),
        keywords: params.keywords.clone(),
        num_speakers: speakers.num_speakers,
        max_speakers: speakers.max_speakers,
        sample_rate: SAMPLE_RATE,
        ..Default::default()
    };
    let chunk_len = (max_request_secs * u64::from(SAMPLE_RATE)) as usize;
    let total = samples.len();
    let mut words = Vec::new();
    let mut speaker_offset = 0;
    // Une requête unique ne renvoie rien avant la fin : l'avancement est
    // inconnu jusque-là. En plusieurs morceaux, il avance par morceau.
    if total <= chunk_len {
        observer.on_progress(FileStreamProgress {
            fraction: 0.0,
            preview: None,
            indeterminate: true,
        });
    }

    for (index, chunk) in samples.chunks(chunk_len.max(1)).enumerate() {
        let offset_secs = (index * chunk_len) as f64 / f64::from(SAMPLE_RATE);
        let chunk_secs = chunk.len() as f64 / f64::from(SAMPLE_RATE);
        let request = transcribe_with_nemo_speech_rest(
            &params.base_url,
            Some(params.api_key.as_str()),
            &listen_params,
            chunk,
            SAMPLE_RATE,
            request_timeout(chunk_secs),
        );
        let transcript = cancellable(request, observer)
            .await?
            .map_err(|error| RestFileError::Failed(error.to_string()))?;

        let mut next_offset = speaker_offset;
        for word in transcript.words {
            let speaker_index = word.speaker.map(|speaker| speaker + speaker_offset);
            if let Some(speaker) = speaker_index {
                next_offset = next_offset.max(speaker + 1);
            }
            words.push(FinalizedWord {
                id: format!("{}:rest:{}", params.session_id, words.len()),
                text: word.word,
                start_ms: ((word.start + offset_secs) * 1000.0).round() as i64,
                end_ms: ((word.end + offset_secs) * 1000.0).round() as i64,
                channel: FILE_STREAM_CHANNEL,
                state: WordState::Final,
                speaker_index,
            });
        }
        speaker_offset = next_offset;

        let sent = (index * chunk_len + chunk.len()).min(total);
        observer.on_progress(FileStreamProgress {
            fraction: sent as f64 / total.max(1) as f64,
            preview: None,
            indeterminate: false,
        });
    }

    Ok((words, total as f64 / f64::from(SAMPLE_RATE)))
}

/// Attend `future` en surveillant l'arrêt demandé par l'utilisateur.
async fn cancellable<T>(
    future: impl std::future::Future<Output = T>,
    observer: &dyn FileStreamObserver,
) -> Result<T, RestFileError> {
    tokio::pin!(future);
    let mut tick = tokio::time::interval(Duration::from_millis(250));
    loop {
        tokio::select! {
            output = &mut future => return Ok(output),
            _ = tick.tick() => {
                if observer.is_cancelled() {
                    return Err(RestFileError::Cancelled);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;

    #[derive(Default)]
    struct Recorder {
        fractions: Mutex<Vec<(f64, bool)>>,
        cancelled: AtomicBool,
    }

    impl FileStreamObserver for Recorder {
        fn on_progress(&self, progress: FileStreamProgress) {
            self.fractions
                .lock()
                .unwrap()
                .push((progress.fraction, progress.indeterminate));
        }

        fn is_cancelled(&self) -> bool {
            self.cancelled.load(Ordering::SeqCst)
        }
    }

    fn params(base_url: String) -> FileStreamParams {
        FileStreamParams {
            session_id: "session".to_string(),
            model: "nemotron-3.5-asr-streaming-0.6b".to_string(),
            base_url,
            api_key: String::new(),
            languages: vec!["fr".parse().unwrap()],
            keywords: Vec::new(),
            participant_human_ids: Vec::new(),
            self_human_id: None,
        }
    }

    #[test]
    fn only_the_nvidia_protocol_uses_the_rest_import() {
        assert!(supports_rest_file_transcription(
            "http://localhost:9000?provider=nvidia",
            "nemotron-3.5-asr-streaming-0.6b",
            &[]
        ));
        assert!(!supports_rest_file_transcription(
            "http://localhost:8000/v1?provider=openai",
            "voxtral",
            &[]
        ));
    }

    #[test]
    fn timeout_leaves_room_for_a_server_at_real_time() {
        assert_eq!(request_timeout(1668.0), Duration::from_secs(1788));
        assert_eq!(request_timeout(0.0), Duration::from_secs(120));
    }

    #[tokio::test]
    async fn a_single_request_reports_unknown_progress_then_lands_words_in_milliseconds() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/audio/transcriptions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "duration": 2.0,
                "words": [
                    {"word": "Bonjour", "start": 0.48, "end": 0.9, "speaker": 1},
                    {"word": "toi", "start": 1.2, "end": 1.5, "speaker": 2}
                ]
            })))
            .mount(&server)
            .await;
        let recorder = Recorder::default();
        let (words, duration) = rest_file_transcription(
            &params(format!("{}?provider=nvidia", server.uri())),
            SpeakerBounds::default(),
            &[0; 32_000],
            &recorder,
        )
        .await
        .unwrap();

        assert_eq!(duration, 2.0);
        let words: Vec<_> = words
            .iter()
            .map(|word| {
                (
                    word.text.as_str(),
                    word.start_ms,
                    word.end_ms,
                    word.channel,
                    word.speaker_index,
                )
            })
            .collect();
        assert_eq!(
            words,
            [
                ("Bonjour", 480, 900, FILE_STREAM_CHANNEL, Some(0)),
                ("toi", 1200, 1500, FILE_STREAM_CHANNEL, Some(1)),
            ]
        );
        assert_eq!(
            *recorder.fractions.lock().unwrap(),
            [(0.0, true), (1.0, false)]
        );
    }

    #[tokio::test]
    async fn a_long_file_goes_in_successive_requests_with_shifted_times_and_speakers() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "duration": 1.0,
                "words": [
                    {"word": "a", "start": 0.1, "end": 0.2, "speaker": 1},
                    {"word": "b", "start": 0.5, "end": 0.6, "speaker": 2}
                ]
            })))
            .expect(2)
            .mount(&server)
            .await;
        let recorder = Recorder::default();
        let (words, duration) = transcribe_in_requests(
            &params(server.uri()),
            SpeakerBounds::default(),
            &[0; 32_000],
            &recorder,
            1,
        )
        .await
        .unwrap();

        assert_eq!(duration, 2.0);
        let words: Vec<_> = words
            .iter()
            .map(|word| (word.start_ms, word.speaker_index))
            .collect();
        assert_eq!(
            words,
            [
                (100, Some(0)),
                (500, Some(1)),
                (1100, Some(2)),
                (1500, Some(3))
            ]
        );
        assert_eq!(
            *recorder.fractions.lock().unwrap(),
            [(0.5, false), (1.0, false)]
        );
    }

    #[tokio::test]
    async fn a_server_error_is_reported_for_the_fallback() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(404).set_body_string("API route not found"))
            .mount(&server)
            .await;
        let error = rest_file_transcription(
            &params(server.uri()),
            SpeakerBounds::default(),
            &[0; 1600],
            &Recorder::default(),
        )
        .await
        .unwrap_err();
        assert!(matches!(error, RestFileError::Failed(message) if message.contains("404")));
    }

    #[tokio::test]
    async fn stopping_the_import_abandons_the_request() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(30)))
            .mount(&server)
            .await;
        let recorder = Recorder::default();
        recorder.cancelled.store(true, Ordering::SeqCst);
        let started = std::time::Instant::now();
        let error = rest_file_transcription(
            &params(server.uri()),
            SpeakerBounds::default(),
            &[0; 1600],
            &recorder,
        )
        .await
        .unwrap_err();
        assert!(matches!(error, RestFileError::Cancelled));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
