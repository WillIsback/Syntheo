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
            "nemotron-asr-streaming",
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
            "nemotron-asr-streaming",
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
        "nemotron-asr-streaming",
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
