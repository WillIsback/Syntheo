//! Import d'un fichier par l'API REST de NVIDIA NeMo-Speech.cpp (issue #568).
//!
//! `POST /v1/audio/transcriptions` transcrit un enregistrement entier d'une
//! seule requête, bien plus vite que le flux temps réel (27 min 48 en 62 s sur
//! le serveur du DGX, contre 1 657 s par le flux) et avec une diarisation
//! cohérente sur tout l'enregistrement. Le serveur n'accepte que du WAV : le
//! fichier, déjà décodé en PCM 16 bits mono, est enveloppé en mémoire.

use std::time::Duration;

use owhisper_interface::{ListenParams, stream::Word};
use serde_json::{Value, json};

use super::nvidia::{WORD_BOOST, completed_words, requested_language};
use crate::error::Error;

/// Résultat d'une transcription REST : mots horodatés en secondes depuis le
/// début de l'audio envoyé, locuteurs ramenés à partir de 0.
#[derive(Debug, Clone, PartialEq)]
pub struct NemoSpeechTranscript {
    pub words: Vec<Word>,
    pub duration_secs: f64,
}

/// Point d'accès REST d'un serveur dont l'adresse a été saisie à la racine,
/// en `/v1` ou en `/v1/realtime` : le chemin est toujours celui de la racine.
pub fn nemo_speech_transcriptions_url(api_base: &str) -> Result<url::Url, Error> {
    let mut url = url::Url::parse(api_base)
        .map_err(|error| Error::provider_configuration("nvidia", error.to_string()))?;
    let scheme = match url.scheme() {
        "ws" => "http",
        "wss" => "https",
        other => other,
    }
    .to_string();
    url.set_scheme(&scheme)
        .map_err(|_| Error::provider_configuration("nvidia", "unsupported URL scheme"))?;
    url.set_path("/v1/audio/transcriptions");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

/// WAV PCM 16 bits mono, en mémoire.
pub fn pcm16_mono_wav(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let data_len = u32::try_from(samples.len() * 2).unwrap_or(u32::MAX);
    let mut wav = Vec::with_capacity(44 + samples.len() * 2);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&data_len.saturating_add(36).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    wav
}

/// Champs texte du formulaire, dans l'ordre d'envoi. `model` n'est pas envoyé :
/// le serveur transcrit avec le modèle qu'il a chargé et refuse un nom inconnu
/// (`unknown_model`).
pub fn nemo_speech_form_fields(params: &ListenParams) -> Vec<(&'static str, String)> {
    let language = requested_language(params);
    let diarization = params.num_speakers != Some(1);
    let mut fields = vec![
        ("language", language),
        ("response_format", "verbose_json".to_string()),
        ("timestamp_granularities[]", "word".to_string()),
        ("diarization", diarization.to_string()),
    ];
    if let Some(max) = params.max_speakers.filter(|max| diarization && *max > 0) {
        fields.push(("max_speaker_count", max.to_string()));
    }
    let phrases: Vec<&str> = params
        .keywords
        .iter()
        .map(|keyword| keyword.trim())
        .filter(|keyword| !keyword.is_empty())
        .collect();
    if !phrases.is_empty() {
        fields.push((
            "speech_contexts",
            json!([{ "phrases": phrases, "boost": WORD_BOOST }]).to_string(),
        ));
    }
    fields
}

/// Lit la réponse `verbose_json` : `words[]` (secondes, `speaker` 1-based) et
/// `duration`.
pub fn parse_nemo_speech_transcript(body: &Value) -> NemoSpeechTranscript {
    let words = body["words"]
        .as_array()
        .map(|words| completed_words(words))
        .unwrap_or_default();
    let duration_secs = body["duration"]
        .as_f64()
        .or_else(|| words.last().map(|word| word.end))
        .unwrap_or(0.0);
    NemoSpeechTranscript {
        words,
        duration_secs,
    }
}

/// Transcrit `samples` (PCM 16 bits mono à `sample_rate`) d'une seule requête.
pub async fn transcribe_with_nemo_speech_rest(
    api_base: &str,
    api_key: Option<&str>,
    params: &ListenParams,
    samples: &[i16],
    sample_rate: u32,
    timeout: Duration,
) -> Result<NemoSpeechTranscript, Error> {
    let url = nemo_speech_transcriptions_url(api_base)?;
    let file = reqwest::multipart::Part::bytes(pcm16_mono_wav(samples, sample_rate))
        .file_name("audio.wav")
        .mime_str("audio/wav")?;
    let mut form = reqwest::multipart::Form::new().part("file", file);
    for (name, value) in nemo_speech_form_fields(params) {
        form = form.text(name, value);
    }

    let mut request = crate::http_client::create_client()
        .post(url.as_str())
        .timeout(timeout)
        .multipart(form);
    if let Some(key) = api_key.filter(|key| !key.is_empty()) {
        request = request.bearer_auth(key);
    }
    let response = request.send().await?;
    let status = response.status();
    if !status.is_success() {
        return Err(Error::UnexpectedStatus {
            status,
            body: super::http::error_body(response).await,
        });
    }
    let body: Value = response.json().await?;
    Ok(parse_nemo_speech_transcript(&body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rest_url_is_the_server_root_route_whatever_the_saved_address() {
        for base in [
            "http://localhost:9000",
            "http://localhost:9000/v1",
            "http://localhost:9000/v1/realtime?provider=nvidia",
            "ws://localhost:9000/v1/audio/transcriptions/realtime",
        ] {
            assert_eq!(
                nemo_speech_transcriptions_url(base).unwrap().as_str(),
                "http://localhost:9000/v1/audio/transcriptions",
                "{base}"
            );
        }
        assert_eq!(
            nemo_speech_transcriptions_url("https://asr.example.ts.net/v1/realtime")
                .unwrap()
                .as_str(),
            "https://asr.example.ts.net/v1/audio/transcriptions"
        );
    }

    #[test]
    fn wav_header_describes_pcm16_mono() {
        let wav = pcm16_mono_wav(&[0, 1, -1], 16_000);
        assert_eq!(wav.len(), 44 + 6);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(wav[4..8].try_into().unwrap()), 36 + 6);
        assert_eq!(&wav[8..16], b"WAVEfmt ");
        assert_eq!(u16::from_le_bytes(wav[22..24].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 16_000);
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 6);
        assert_eq!(&wav[44..46], &0i16.to_le_bytes());
        assert_eq!(&wav[48..50], &(-1i16).to_le_bytes());
    }

    #[test]
    fn form_asks_for_timed_diarized_words_without_naming_a_model() {
        let params = ListenParams {
            model: Some("nemotron-3.5-asr-streaming-0.6b".to_string()),
            languages: vec!["fr".parse().unwrap()],
            keywords: vec!["Syntheo".to_string(), " ".to_string()],
            max_speakers: Some(4),
            ..Default::default()
        };
        let fields = nemo_speech_form_fields(&params);
        assert_eq!(
            fields,
            vec![
                ("language", "fr-FR".to_string()),
                ("response_format", "verbose_json".to_string()),
                ("timestamp_granularities[]", "word".to_string()),
                ("diarization", "true".to_string()),
                ("max_speaker_count", "4".to_string()),
                (
                    "speech_contexts",
                    r#"[{"boost":2.0,"phrases":["Syntheo"]}]"#.to_string()
                ),
            ]
        );
        assert!(fields.iter().all(|(name, _)| *name != "model"));
    }

    #[test]
    fn without_a_language_the_model_detects_it() {
        let fields = nemo_speech_form_fields(&ListenParams::default());
        assert_eq!(fields[0], ("language", "auto".to_string()));
    }

    #[test]
    fn single_voice_import_turns_diarization_off() {
        let params = ListenParams {
            num_speakers: Some(1),
            max_speakers: Some(1),
            ..Default::default()
        };
        let fields = nemo_speech_form_fields(&params);
        assert!(fields.contains(&("diarization", "false".to_string())));
        assert!(fields.iter().all(|(name, _)| *name != "max_speaker_count"));
    }

    #[test]
    fn verbose_json_words_keep_their_times_and_zero_based_speakers() {
        // Relevé sur NeMo-Speech.cpp v0.3.0 (DGX), réponse abrégée.
        let body = json!({
            "duration": 1667.9466552734375,
            "language": "fr-FR",
            "task": "transcribe",
            "text": "Et la",
            "words": [
                {"confidence": 1, "end": 0.56, "speaker": 1, "start": 0.48, "word": "Et"},
                {"confidence": 0.9, "end": 0.8, "speaker": 2, "start": 0.72, "word": "la"}
            ]
        });
        let transcript = parse_nemo_speech_transcript(&body);
        assert_eq!(transcript.duration_secs, 1667.9466552734375);
        let words: Vec<_> = transcript
            .words
            .iter()
            .map(|word| (word.word.as_str(), word.start, word.end, word.speaker))
            .collect();
        assert_eq!(
            words,
            [("Et", 0.48, 0.56, Some(0)), ("la", 0.72, 0.8, Some(1))]
        );
    }

    #[tokio::test]
    async fn posts_a_wav_file_with_bearer_key_and_reads_the_words() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, MockServer, Request, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/audio/transcriptions"))
            .and(header("authorization", "Bearer asr-key"))
            .respond_with(|request: &Request| {
                let body = String::from_utf8_lossy(&request.body);
                assert!(body.contains("filename=\"audio.wav\""));
                assert!(body.contains("RIFF"));
                assert!(body.contains("verbose_json"));
                assert!(!body.contains("name=\"model\""));
                ResponseTemplate::new(200).set_body_json(json!({
                    "duration": 1.0,
                    "words": [{"word": "Oui", "start": 0.1, "end": 0.3, "speaker": 1}]
                }))
            })
            .mount(&server)
            .await;

        let transcript = transcribe_with_nemo_speech_rest(
            &format!("{}/v1/realtime?provider=nvidia", server.uri()),
            Some("asr-key"),
            &ListenParams::default(),
            &[0; 16_000],
            16_000,
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        assert_eq!(transcript.words.len(), 1);
        assert_eq!(transcript.words[0].speaker, Some(0));
    }

    #[tokio::test]
    async fn a_refusal_is_reported_with_its_status() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401).set_body_string("invalid bearer token"))
            .mount(&server)
            .await;
        let error = transcribe_with_nemo_speech_rest(
            &server.uri(),
            Some("wrong"),
            &ListenParams::default(),
            &[0; 160],
            16_000,
            Duration::from_secs(5),
        )
        .await
        .unwrap_err();
        assert!(matches!(
            error,
            Error::UnexpectedStatus { status, .. } if status.as_u16() == 401
        ));
    }
}
