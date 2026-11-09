use base64::Engine;
use syntheo_ws_client::client::Message;

use super::*;

fn initial_message_json(params: &ListenParams) -> serde_json::Value {
    match OpenAIAdapter::default()
        .initial_message(None, params, 1)
        .expect("initial message")
    {
        Message::Text(text) => serde_json::from_str(&text).expect("valid JSON"),
        _ => panic!("expected text message"),
    }
}

#[test]
fn live_model_uses_plural_language_and_keyword_hints() {
    let json = initial_message_json(&ListenParams {
        languages: vec![
            syntheo_language::ISO639::En.into(),
            syntheo_language::ISO639::Ko.into(),
        ],
        keywords: vec!["technical term".to_string()],
        ..Default::default()
    });
    let transcription = &json["session"]["audio"]["input"]["transcription"];

    assert_eq!(transcription["model"], "gpt-live-transcribe");
    assert_eq!(transcription["languages"], serde_json::json!(["en", "ko"]));
    assert_eq!(
        transcription["keywords"],
        serde_json::json!(["technical term"])
    );
    assert!(transcription.get("language").is_none());
    assert!(json["session"].get("include").is_none());
    assert!(
        json["session"]["audio"]["input"]
            .get("turn_detection")
            .is_none()
    );
}

#[test]
fn openai_error_codes_preserve_retry_classification() {
    let responses = OpenAIAdapter::default().parse_response(
        r#"{"type":"error","event_id":"e1","error":{"type":"invalid_request_error","code":"invalid_value","message":"Invalid model"}}"#,
    );
    assert!(matches!(
        responses.as_slice(),
        [StreamResponse::ErrorResponse {
            error_code: Some(400),
            provider,
            ..
        }] if provider == "openai"
    ));
    assert_eq!(
        openai_error_status("invalid_request_error", Some("invalid_value")),
        Some(400)
    );
    assert_eq!(
        openai_error_status("invalid_request_error", Some("insufficient_quota")),
        Some(402)
    );
    assert_eq!(
        openai_error_status("rate_limit_error", Some("rate_limit_exceeded")),
        Some(429)
    );
    assert_eq!(openai_error_status("server_error", None), Some(500));
    assert_eq!(openai_error_status("unknown_error", None), None);
}

#[test]
fn legacy_model_uses_singular_language_hint() {
    let json = initial_message_json(&ListenParams {
        model: Some("gpt-4o-transcribe".to_string()),
        languages: vec![
            syntheo_language::ISO639::En.into(),
            syntheo_language::ISO639::Ko.into(),
        ],
        ..Default::default()
    });
    let transcription = &json["session"]["audio"]["input"]["transcription"];

    assert_eq!(transcription["language"], "en");
    assert!(transcription.get("languages").is_none());
    assert_eq!(
        json["session"]["include"],
        serde_json::json!(["item.input_audio_transcription.logprobs"])
    );
    assert!(
        json["session"]["audio"]["input"]
            .get("turn_detection")
            .is_some()
    );
}

#[test]
fn realtime_audio_is_declared_and_resampled_at_24khz() {
    let adapter = OpenAIAdapter::default();
    let params = ListenParams {
        sample_rate: 16_000,
        ..Default::default()
    };
    let message = adapter.initial_message(None, &params, 1).unwrap();
    let Message::Text(message) = message else {
        panic!("expected text message");
    };
    let json: serde_json::Value = serde_json::from_str(&message).unwrap();
    assert_eq!(json["session"]["audio"]["input"]["format"]["rate"], 24_000);

    let input = (0..160_i16).flat_map(i16::to_le_bytes).collect::<Vec<_>>();
    let Message::Text(message) = adapter.audio_to_message(input.into()) else {
        panic!("expected text message");
    };
    let json: serde_json::Value = serde_json::from_str(&message).unwrap();
    let output = base64::engine::general_purpose::STANDARD
        .decode(json["audio"].as_str().unwrap())
        .unwrap();
    assert_eq!(output.len(), 240 * std::mem::size_of::<i16>());
}

#[test]
fn transcript_deltas_are_cumulative_and_final_turns_keep_monotonic_times() {
    let adapter = OpenAIAdapter::default();
    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"e1","item_id":"item-1","audio_start_ms":0}"#,
    );
    let first_delta = adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.delta","event_id":"e2","item_id":"item-1","content_index":0,"delta":"Hello","logprobs":[]}"#,
    );
    let second_delta = adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.delta","event_id":"e3","item_id":"item-1","content_index":0,"delta":" world","logprobs":[]}"#,
    );

    assert_eq!(transcript(&first_delta), "Hello");
    assert_eq!(transcript(&second_delta), "Hello world");

    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_stopped","event_id":"e4","item_id":"item-1","audio_end_ms":1000}"#,
    );
    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"e5","item_id":"item-2","audio_start_ms":1200}"#,
    );
    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_stopped","event_id":"e6","item_id":"item-2","audio_end_ms":1800}"#,
    );
    let out_of_order_final = adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.completed","event_id":"e7","item_id":"item-2","content_index":0,"transcript":"Next turn","logprobs":[]}"#,
    );
    assert!(out_of_order_final.is_empty());
    let ordered_finals = adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.completed","event_id":"e8","item_id":"item-1","content_index":0,"transcript":"Hello world","logprobs":[]}"#,
    );

    assert_eq!(transcript_at(&ordered_finals, 0), "Hello world");
    assert_eq!(transcript_at(&ordered_finals, 1), "Next turn");
    assert!(last_word_end_at(&ordered_finals, 0) <= first_word_start_at(&ordered_finals, 1));
}

#[test]
fn forked_sessions_keep_transcript_state_isolated() {
    let adapter = OpenAIAdapter::for_live_sample_rate(16_000);
    let mic = adapter.fork_session();
    let speaker = adapter.fork_session();

    mic.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"e1","item_id":"item-1","audio_start_ms":0}"#,
    );
    speaker.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"e2","item_id":"item-1","audio_start_ms":0}"#,
    );
    let mic_delta = mic.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.delta","event_id":"e3","item_id":"item-1","content_index":0,"delta":"Mic","logprobs":[]}"#,
    );
    let speaker_delta = speaker.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.delta","event_id":"e4","item_id":"item-1","content_index":0,"delta":"Speaker","logprobs":[]}"#,
    );

    assert_eq!(transcript(&mic_delta), "Mic");
    assert_eq!(transcript(&speaker_delta), "Speaker");
}

#[test]
fn failed_item_is_nonfatal_and_releases_completed_later_items() {
    let adapter = OpenAIAdapter::default();
    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"e1","item_id":"item-1","audio_start_ms":0}"#,
    );
    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"e2","item_id":"item-2","audio_start_ms":1000}"#,
    );
    let held_final = adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.completed","event_id":"e3","item_id":"item-2","content_index":0,"transcript":"Later turn","logprobs":[]}"#,
    );
    assert!(held_final.is_empty());

    let responses = adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.failed","event_id":"e4","item_id":"item-1","content_index":0,"error":{"type":"server_error","code":"server_error","message":"failed"}}"#,
    );

    assert_eq!(responses.len(), 1);
    assert_eq!(transcript(&responses), "Later turn");
}

#[test]
fn stalled_head_releases_bounded_completed_backlog_before_reconnect() {
    let adapter = OpenAIAdapter::default();
    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"head-start","item_id":"head","audio_start_ms":0}"#,
    );
    adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.delta","event_id":"head-delta","item_id":"head","content_index":0,"delta":"Head partial","logprobs":[]}"#,
    );

    let mut recovered = Vec::new();
    for index in 0..MAX_BLOCKED_COMPLETED_ITEMS {
        let item_id = format!("later-{index}");
        let started = serde_json::json!({
            "type": "input_audio_buffer.speech_started",
            "event_id": format!("start-{index}"),
            "item_id": item_id,
            "audio_start_ms": (index as u64 + 1) * 1_000,
        });
        assert!(adapter.parse_response(&started.to_string()).is_empty());

        let completed = serde_json::json!({
            "type": "conversation.item.input_audio_transcription.completed",
            "event_id": format!("done-{index}"),
            "item_id": item_id,
            "content_index": 0,
            "transcript": format!("Later {index}"),
            "logprobs": [],
        });
        recovered = adapter.parse_response(&completed.to_string());
        if index + 1 < MAX_BLOCKED_COMPLETED_ITEMS {
            assert!(recovered.is_empty());
        }
    }

    assert_eq!(
        recovered.len(),
        MAX_BLOCKED_COMPLETED_ITEMS + 2,
        "best-known head, completed backlog, then terminal recovery error"
    );
    assert_eq!(transcript_at(&recovered, 0), "Head partial");
    for index in 0..MAX_BLOCKED_COMPLETED_ITEMS {
        assert_eq!(
            transcript_at(&recovered, index + 1),
            format!("Later {index}")
        );
    }
    assert!(is_state_limit_error(recovered.last().unwrap()));

    let state = adapter.live_state.lock().unwrap();
    assert!(state.items.is_empty());
    assert!(state.item_order.is_empty());
}

#[test]
fn cumulative_deltas_are_bounded_and_recovered_before_terminal_error() {
    let adapter = OpenAIAdapter::default();
    adapter.parse_response(
        r#"{"type":"input_audio_buffer.speech_started","event_id":"start","item_id":"item-1","audio_start_ms":0}"#,
    );
    let chunk = "x".repeat(1_024);
    for index in 0..(MAX_ITEM_TRANSCRIPT_BYTES / chunk.len()) {
        let delta = serde_json::json!({
            "type": "conversation.item.input_audio_transcription.delta",
            "event_id": format!("delta-{index}"),
            "item_id": "item-1",
            "content_index": 0,
            "delta": chunk,
            "logprobs": [],
        });
        let responses = adapter.parse_response(&delta.to_string());
        assert_eq!(responses.len(), 1);
    }
    let overflow = serde_json::json!({
        "type": "conversation.item.input_audio_transcription.delta",
        "event_id": "overflow",
        "item_id": "item-1",
        "content_index": 0,
        "delta": "y",
        "logprobs": [],
    });

    let responses = adapter.parse_response(&overflow.to_string());

    assert_eq!(responses.len(), 2);
    assert_eq!(transcript(&responses).len(), MAX_ITEM_TRANSCRIPT_BYTES);
    assert!(is_state_limit_error(&responses[1]));
    let state = adapter.live_state.lock().unwrap();
    assert!(state.items.is_empty());
    assert!(state.item_order.is_empty());
}

#[test]
fn pending_item_count_is_bounded_and_fails_explicitly() {
    let adapter = OpenAIAdapter::default();
    for index in 0..MAX_LIVE_ITEMS {
        let started = serde_json::json!({
            "type": "input_audio_buffer.speech_started",
            "event_id": format!("start-{index}"),
            "item_id": format!("item-{index}"),
            "audio_start_ms": index as u64,
        });
        assert!(adapter.parse_response(&started.to_string()).is_empty());
    }

    let overflow = serde_json::json!({
        "type": "input_audio_buffer.speech_started",
        "event_id": "overflow",
        "item_id": "item-overflow",
        "audio_start_ms": MAX_LIVE_ITEMS as u64,
    });
    let responses = adapter.parse_response(&overflow.to_string());

    assert_eq!(responses.len(), 1);
    assert!(is_state_limit_error(&responses[0]));
    let state = adapter.live_state.lock().unwrap();
    assert!(state.items.is_empty());
    assert!(state.item_order.is_empty());
}

fn transcript(responses: &[StreamResponse]) -> &str {
    transcript_at(responses, 0)
}

fn transcript_at(responses: &[StreamResponse], index: usize) -> &str {
    let StreamResponse::TranscriptResponse { channel, .. } = &responses[index] else {
        panic!("expected transcript response");
    };
    &channel.alternatives[0].transcript
}

fn first_word_start_at(responses: &[StreamResponse], index: usize) -> f64 {
    let StreamResponse::TranscriptResponse { channel, .. } = &responses[index] else {
        panic!("expected transcript response");
    };
    channel.alternatives[0].words[0].start
}

fn last_word_end_at(responses: &[StreamResponse], index: usize) -> f64 {
    let StreamResponse::TranscriptResponse { channel, .. } = &responses[index] else {
        panic!("expected transcript response");
    };
    channel.alternatives[0].words.last().unwrap().end
}

fn is_state_limit_error(response: &StreamResponse) -> bool {
    matches!(
        response,
        StreamResponse::ErrorResponse { error_message, provider, .. }
            if provider == "openai" && error_message.contains("state limit exceeded")
    )
}
