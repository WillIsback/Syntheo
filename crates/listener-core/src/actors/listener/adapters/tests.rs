use std::sync::Arc;
use std::time::{Instant, SystemTime};

use super::*;

struct NoopRuntime;

impl syntheo_storage::StorageRuntime for NoopRuntime {
    fn global_base(&self) -> Result<std::path::PathBuf, syntheo_storage::Error> {
        Ok(std::path::PathBuf::from("/tmp"))
    }

    fn vault_base(&self) -> Result<std::path::PathBuf, syntheo_storage::Error> {
        Ok(std::path::PathBuf::from("/tmp"))
    }
}

impl crate::ListenerRuntime for NoopRuntime {
    fn emit_lifecycle(&self, _event: crate::SessionLifecycleEvent) {}

    fn emit_progress(&self, _event: crate::SessionProgressEvent) {}

    fn emit_data(&self, _event: crate::SessionDataEvent) {}

    fn emit_error(&self, _event: crate::SessionErrorEvent) {}
}

fn listener_args(base_url: &str, model: &str) -> ListenerArgs {
    ListenerArgs {
        runtime: Arc::new(NoopRuntime),
        languages: vec![syntheo_language::ISO639::En.into()],
        onboarding: false,
        model: model.to_string(),
        base_url: base_url.to_string(),
        api_key: String::new(),
        keywords: vec![],
        transcription_mode: crate::TranscriptionMode::Live,
        mode: crate::actors::ChannelMode::MicOnly,
        session_started_at: Instant::now(),
        session_started_at_unix: SystemTime::now(),
        stream_offset_secs: None,
        gap_replayed: false,
        session_id: "session".to_string(),
        participant_human_ids: vec![],
        self_human_id: None,
        speaker_assignments: vec![],
        live_transcript: Default::default(),
        stall_backoff: Default::default(),
        mic_isolated: false,
    }
}

#[test]
fn listen_params_bound_speakers_from_participants_without_exact_count() {
    for (label, base_url, model, participants, self_human_id, expected) in [
        (
            "openai repeated attendance",
            "http://192.168.1.87:8000/v1",
            "mistralai/Voxtral-Mini-4B-Realtime-2602",
            vec!["remote-a", "self", "remote-b", "remote-a"],
            Some("self"),
            Some(3 + crate::UNLISTED_SPEAKER_MARGIN),
        ),
        (
            "openai one remote",
            "http://192.168.1.87:8000/v1",
            "mistralai/Voxtral-Mini-4B-Realtime-2602",
            vec!["remote"],
            Some("self"),
            Some(2 + crate::UNLISTED_SPEAKER_MARGIN),
        ),
        (
            "nvidia",
            "https://asr.example/v1/realtime?provider=nvidia",
            "nemotron-3.5-asr-streaming-0.6b.q8_0",
            vec!["remote"],
            Some("self"),
            Some(2 + crate::UNLISTED_SPEAKER_MARGIN),
        ),
        (
            "syntheo proxy",
            "https://api.example.com/stt",
            "cloud",
            vec!["self", "remote-a", "remote-b"],
            Some("self"),
            Some(3 + crate::UNLISTED_SPEAKER_MARGIN),
        ),
    ] {
        let mut args = listener_args(base_url, model);
        args.participant_human_ids = participants.iter().map(|id| id.to_string()).collect();
        args.self_human_id = self_human_id.map(|id| id.to_string());

        let params = build_listen_params(&args);
        let custom_query = params.custom_query.expect("custom query");

        assert_eq!(params.num_speakers, None, "never an exact count: {label}");
        assert_eq!(params.min_speakers, None, "case: {label}");
        assert_eq!(params.max_speakers, expected, "case: {label}");
        assert!(
            !custom_query.contains_key("speaker_labels"),
            "case: {label}"
        );
        assert!(!custom_query.contains_key("max_speakers"), "case: {label}");
    }
}

#[test]
fn listen_params_leave_speaker_counts_open_without_other_participants() {
    for (label, participants, self_human_id) in [
        ("no participants", vec![], Some("self")),
        ("self only", vec!["self"], Some("self")),
        ("unknown self, nobody listed", vec![], None),
    ] {
        let mut args = listener_args(
            "https://asr.example/v1/realtime?provider=nvidia",
            "nemotron-3.5-asr-streaming-0.6b.q8_0",
        );
        args.participant_human_ids = participants.iter().map(|id| id.to_string()).collect();
        args.self_human_id = self_human_id.map(|id: &str| id.to_string());

        let params = build_listen_params(&args);

        assert_eq!(params.num_speakers, None, "case: {label}");
        assert_eq!(params.max_speakers, None, "case: {label}");
    }
}

#[test]
fn isolated_mic_keeps_its_single_voice_alongside_the_participant_bound() {
    let mut args = listener_args(
        "https://asr.example/v1/realtime?provider=nvidia",
        "nemotron-3.5-asr-streaming-0.6b.q8_0",
    );
    args.mode = crate::actors::ChannelMode::MicAndSpeaker;
    args.mic_isolated = true;
    args.participant_human_ids = vec!["remote-a".to_string(), "remote-b".to_string()];
    args.self_human_id = Some("self".to_string());

    let params = build_listen_params(&args);

    assert_eq!(params.mic_num_speakers, Some(1));
    assert_eq!(params.num_speakers, None);
    assert_eq!(
        params.max_speakers,
        Some(3 + crate::UNLISTED_SPEAKER_MARGIN)
    );
}

#[test]
fn listen_params_count_only_isolated_mic_as_single_speaker() {
    let mut args = listener_args(
        "http://192.168.1.87:8000/v1",
        "mistralai/Voxtral-Mini-4B-Realtime-2602",
    );
    args.mic_isolated = true;

    let params = build_listen_params(&args);
    assert_eq!(params.mic_num_speakers, Some(1));
    assert_eq!(params.num_speakers, None);

    let args = listener_args(
        "http://192.168.1.87:8000/v1",
        "mistralai/Voxtral-Mini-4B-Realtime-2602",
    );
    let params = build_listen_params(&args);
    assert_eq!(params.mic_num_speakers, None);
}

#[test]
fn build_extra_prefers_explicit_stream_offset() {
    let mut args = listener_args(
        "http://192.168.1.87:8000/v1",
        "mistralai/Voxtral-Mini-4B-Realtime-2602",
    );
    args.stream_offset_secs = Some(12.5);

    let (offset_secs, _) = build_extra(&args);

    assert_eq!(offset_secs, 12.5);
}

// Revue de l'issue 684 : une preuve du module fausse n'est pas une clé
// d'API refusée.
#[test]
fn a_wrong_module_proof_is_not_an_api_key_error() {
    assert!(matches!(
        classify_ws_connect_failure(
            "nvidia",
            &syntheo_ws_client::Error::PeerAuthenticationFailed
        ),
        DegradedError::OnDeviceAuthenticationFailed
    ));
}

#[test]
fn websocket_connect_failures_are_classified() {
    let error = syntheo_ws_client::Error::ConnectFailed {
        attempt: 1,
        max_attempts: 3,
        message: "HTTP 401 Unauthorized".to_string(),
        is_auth: true,
        status_code: Some(401),
        retryable: false,
        retry_after_secs: None,
    };
    assert!(matches!(
        classify_ws_connect_failure("openai", &error),
        DegradedError::AuthenticationFailed { provider } if provider == "openai"
    ));

    let error = syntheo_ws_client::Error::ConnectFailed {
        attempt: 1,
        max_attempts: 3,
        message: "HTTP 400 Bad Request".to_string(),
        is_auth: false,
        status_code: Some(400),
        retryable: false,
        retry_after_secs: None,
    };
    assert!(matches!(
        classify_ws_connect_failure("openai", &error),
        DegradedError::ProviderConfiguration { provider, message }
            if provider == "openai" && message == "HTTP 400 Bad Request"
    ));

    let error = syntheo_ws_client::Error::ConnectRetriesExhausted {
        attempts: 3,
        last_error: "HTTP 503 Service Unavailable".to_string(),
        retry_after_secs: None,
    };
    assert!(matches!(
        classify_ws_connect_failure("openai", &error),
        DegradedError::UpstreamUnavailable { .. }
    ));
}

#[test]
fn websocket_retry_after_reaches_the_session_supervisor() {
    let error = syntheo_ws_client::Error::ConnectFailed {
        attempt: 1,
        max_attempts: 1,
        message: "HTTP 503 Service Unavailable".to_string(),
        is_auth: false,
        status_code: Some(503),
        retryable: true,
        retry_after_secs: Some(7),
    };

    let error = ws_connect_error(
        &listener_args("https://api.example.com/stt", "cloud"),
        error,
    );
    let error = error
        .downcast_ref::<super::super::ListenerInitError>()
        .expect("listener init error");

    assert_eq!(error.retry_after, Some(Duration::from_secs(7)));
}

// Issue 574 : serveur NeMo-Speech.cpp lancé sans `--diar-model`, simulé par sa
// liste de modèles (`speaker_diarization: false`). La session s'ouvre sans
// demander la diarisation ; sonde en échec ou muette, comportement d'avant.
async fn nemo_models_server(speaker_diarization: Option<bool>) -> wiremock::MockServer {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::start().await;
    let mut transcription = serde_json::json!({
        "capability": "transcription",
        "id": "nemotron-3.5-asr-streaming-0.6b.q8_0",
        "object": "model",
        "streaming": true,
        "word_timestamps": true,
    });
    if let Some(value) = speaker_diarization {
        transcription["speaker_diarization"] = serde_json::json!(value);
    }
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data": [transcription],
            "object": "list",
        })))
        .mount(&server)
        .await;
    server
}

#[tokio::test]
async fn nemo_session_without_diarizer_does_not_request_diarization() {
    let server = nemo_models_server(Some(false)).await;
    let mut args = listener_args(
        &format!("{}/v1/realtime?provider=nvidia", server.uri()),
        "nemotron-3.5-asr-streaming-0.6b.q8_0",
    );
    args.participant_human_ids = vec!["remote-a".to_string(), "remote-b".to_string()];
    args.mic_isolated = true;

    let params = nemo_speech_listen_params(&args).await;

    // Une voix unique pour l'adaptateur : speaker_diarization à false, sans
    // max_speaker_count (couvert par streaming_providers_tests.rs).
    assert_eq!(params.num_speakers, Some(1));
    assert_eq!(params.max_speakers, None);
    assert_eq!(params.mic_num_speakers, None);
}

#[tokio::test]
async fn nemo_session_keeps_diarization_when_offered_or_unknown() {
    let offered = nemo_models_server(Some(true)).await;
    let silent = nemo_models_server(None).await;
    for base in [
        format!("{}/v1/realtime?provider=nvidia", offered.uri()),
        format!("{}/v1/realtime?provider=nvidia", silent.uri()),
        // Sonde en échec : rien n'écoute sur ce port.
        "http://127.0.0.1:9/v1/realtime?provider=nvidia".to_string(),
    ] {
        let mut args = listener_args(&base, "nemotron-3.5-asr-streaming-0.6b.q8_0");
        args.participant_human_ids = vec!["remote-a".to_string()];
        let params = nemo_speech_listen_params(&args).await;
        assert_eq!(params, build_listen_params(&args), "{base}");
        assert_ne!(params.num_speakers, Some(1), "{base}");
    }
}

/// Runtime qui rend une cible « Sur ce poste » fixe, et compte ses appels.
struct OnDeviceRuntime {
    target: Option<owhisper_client::OnDeviceTarget>,
    calls: std::sync::atomic::AtomicUsize,
}

impl syntheo_storage::StorageRuntime for OnDeviceRuntime {
    fn global_base(&self) -> Result<std::path::PathBuf, syntheo_storage::Error> {
        Ok(std::path::PathBuf::from("/tmp"))
    }

    fn vault_base(&self) -> Result<std::path::PathBuf, syntheo_storage::Error> {
        Ok(std::path::PathBuf::from("/tmp"))
    }
}

impl crate::ListenerRuntime for OnDeviceRuntime {
    fn emit_lifecycle(&self, _event: crate::SessionLifecycleEvent) {}
    fn emit_progress(&self, _event: crate::SessionProgressEvent) {}
    fn emit_data(&self, _event: crate::SessionDataEvent) {}
    fn emit_error(&self, _event: crate::SessionErrorEvent) {}

    fn on_device_target(
        &self,
    ) -> futures_util::future::BoxFuture<
        'static,
        Result<owhisper_client::OnDeviceTarget, owhisper_client::OnDeviceError>,
    > {
        self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let target = self.target.clone();
        Box::pin(async move {
            target.ok_or_else(|| owhisper_client::OnDeviceError {
                kind: owhisper_client::OnDeviceErrorKind::Crashing,
                message: "module unavailable".to_owned(),
            })
        })
    }
}

// Issue 684 : l'adresse réservée de la source « Sur ce poste » est résolue
// par le runtime à chaque listener ; sans module, échec net et lisible.
#[tokio::test]
async fn on_device_target_is_resolved_by_the_runtime_for_each_listener() {
    let mut args = listener_args(owhisper_client::ON_DEVICE_BASE_URL, "");
    let runtime = Arc::new(OnDeviceRuntime {
        target: None,
        calls: Default::default(),
    });
    args.runtime = runtime.clone();
    let error = connection_target(&args).await.expect_err("refusé");
    assert!(error.to_string().contains("on_device_unavailable"));
    let token = owhisper_client::OnDeviceToken::new(vec![1; 16]).unwrap();
    let runtime = Arc::new(OnDeviceRuntime {
        target: Some(owhisper_client::OnDeviceTarget {
            base_url: "http://127.0.0.1:4242".to_owned(),
            token,
        }),
        calls: Default::default(),
    });
    args.runtime = runtime.clone();
    for _ in 0..2 {
        let (base_url, token) = connection_target(&args).await.unwrap();
        assert_eq!(base_url, "http://127.0.0.1:4242");
        assert!(token.is_some());
    }
    assert_eq!(runtime.calls.load(std::sync::atomic::Ordering::SeqCst), 2);
    // Un serveur distant ne passe jamais par le runtime ni par la preuve.
    let remote = listener_args("https://asr.example/v1/realtime?provider=nvidia", "");
    let (base_url, token) = connection_target(&remote).await.unwrap();
    assert_eq!(base_url, "https://asr.example/v1/realtime?provider=nvidia");
    assert!(token.is_none());
    assert_eq!(
        AdapterKind::from_url_and_languages(owhisper_client::ON_DEVICE_BASE_URL, &[], None),
        AdapterKind::Nvidia
    );
}
