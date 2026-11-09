use super::sse::OpenAISyntheticProgress;
use super::*;
use crate::adapter::MIXED_CAPTURE_CHANNEL;
use owhisper_interface::batch_stream::BatchStreamEvent;

#[tokio::test]
async fn batch_without_endpoint_is_rejected() {
    for model in ["whisper-1", "mistralai/Voxtral-Mini-3B-2507"] {
        let client = crate::BatchClient::<OpenAIAdapter>::builder()
            .api_base("")
            .api_key("")
            .params(ListenParams {
                model: Some(model.to_string()),
                ..Default::default()
            })
            .build();
        let error = client
            .transcribe_file(syntheo_data::english_1::AUDIO_PATH)
            .await
            .expect_err("an empty endpoint must not fall back to a cloud host");
        assert!(
            matches!(&error, Error::AudioProcessing(message) if message.contains("no transcription endpoint")),
            "{model}: {error:?}"
        );
    }
}

#[tokio::test]
async fn custom_batch_model_is_sent_verbatim() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/audio/transcriptions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "text": "bonjour",
            "words": [{ "word": "bonjour", "start": 0.0, "end": 0.5 }]
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = crate::BatchClient::<OpenAIAdapter>::builder()
        .api_base(format!("{}/v1", server.uri()))
        .api_key("")
        .params(ListenParams {
            model: Some("mistralai/Voxtral-Mini-3B-2507".to_string()),
            languages: vec![syntheo_language::ISO639::Fr.into()],
            ..Default::default()
        })
        .build();
    let response = client
        .transcribe_file(syntheo_data::english_1::AUDIO_PATH)
        .await
        .unwrap();

    let requests = server.received_requests().await.unwrap();
    let body = String::from_utf8_lossy(&requests[0].body);
    let field =
        |name: &str, value: &str| body.contains(&format!("name=\"{name}\"\r\n\r\n{value}\r\n"));
    assert!(
        field("model", "mistralai/Voxtral-Mini-3B-2507"),
        "{body:.400}"
    );
    assert!(field("response_format", "verbose_json"));
    assert!(field("language", "fr"));
    assert_eq!(
        response.results.channels[0].alternatives[0].transcript,
        "bonjour"
    );
}

#[tokio::test]
async fn in_memory_audio_reaches_the_custom_batch_endpoint() {
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/audio/transcriptions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "text": "bonjour",
            "words": [{ "word": "bonjour", "start": 0.0, "end": 0.5 }]
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = crate::BatchClient::<OpenAIAdapter>::builder()
        .api_base(format!("{}/v1", server.uri()))
        .api_key("")
        .params(ListenParams {
            model: Some("mistralai/Voxtral-Mini-3B-2507".to_string()),
            ..Default::default()
        })
        .build();

    let response = client
        .transcribe_bytes(b"fake-wav-bytes".to_vec(), "dictation.wav".to_string())
        .await
        .unwrap();

    assert_eq!(
        response.results.channels[0].alternatives[0].transcript,
        "bonjour"
    );
    let requests = server.received_requests().await.unwrap();
    let body = String::from_utf8_lossy(&requests[0].body);
    assert!(body.contains("filename=\"dictation.wav\""), "{body:.300}");
    assert!(body.contains("fake-wav-bytes"), "{body:.300}");
}

#[test]
fn gpt_transcribe_options_request_json_with_all_language_hints() {
    let options = build_transcription_options(
        &ListenParams::default(),
        openai_transcription::batch::AudioModel::GptTranscribe,
        true,
        false,
    );
    let fields = options
        .multipart_text_fields()
        .expect("serialize multipart");
    assert!(
        fields
            .iter()
            .any(|field| { field.name == "response_format" && field.value == "json" })
    );
    assert!(!fields.iter().any(|field| field.name == "stream"));

    let options = build_transcription_options(
        &ListenParams {
            languages: vec![
                syntheo_language::ISO639::En.into(),
                syntheo_language::ISO639::Ko.into(),
            ],
            ..Default::default()
        },
        openai_transcription::batch::AudioModel::GptTranscribe,
        true,
        false,
    );
    let fields = options
        .multipart_text_fields()
        .expect("serialize multipart");
    let languages = fields
        .iter()
        .filter(|field| field.name == "languages[]")
        .map(|field| field.value.as_str())
        .collect::<Vec<_>>();

    assert_eq!(languages, vec!["en", "ko"]);
    assert!(!fields.iter().any(|field| field.name == "language"));
}

#[test]
fn whisper_options_request_word_timestamps_only_for_batch() {
    let options = build_transcription_options(
        &ListenParams {
            model: Some("whisper-1".to_string()),
            ..Default::default()
        },
        openai_transcription::batch::AudioModel::Whisper1,
        true,
        false,
    );
    let fields = options
        .multipart_text_fields()
        .expect("serialize multipart");
    assert!(
        fields
            .iter()
            .any(|field| { field.name == "timestamp_granularities[]" && field.value == "word" })
    );

    let options = build_transcription_options(
        &ListenParams {
            model: Some("whisper-1".to_string()),
            ..Default::default()
        },
        openai_transcription::batch::AudioModel::Whisper1,
        false,
        true,
    );
    let fields = options
        .multipart_text_fields()
        .expect("serialize multipart");
    assert!(matches!(options, CreateTranscriptionOptions::Whisper(_)));
    assert!(!fields.iter().any(|field| field.name == "stream"));
    assert!(
        !fields
            .iter()
            .any(|field| field.name == "timestamp_granularities[]")
    );
}

#[test]
fn parse_sse_delta_accumulates_partial_text() {
    let mut state = OpenAISseParserState::new(());
    let event = state
        .parse_sse_block(r#"data: {"type":"transcript.text.delta","delta":"hello"}"#)
        .expect("expected progress event")
        .expect("expected valid progress event");

    assert_eq!(state.parser.partial_text(), "hello");
    assert!(matches!(
        event,
        BatchStreamEvent::Progress {
            percentage,
            partial_text: Some(ref text),
            ..
        } if text == "hello" && percentage > 0.0
    ));
}

#[test]
fn parse_sse_done_emits_final_result() {
    let mut state = OpenAISseParserState::new(());
    state
        .parser
        .parse_sse_block(r#"data: {"type":"transcript.text.delta","delta":"hello"}"#)
        .expect("seed parser");
    let event = state
        .parse_sse_block(
            r#"data: {"type":"transcript.text.done","text":"hello world","usage":{"type":"tokens","input_tokens":1,"output_tokens":2,"total_tokens":3}}"#,
        )
        .expect("expected result event")
        .expect("expected valid result event");

    let BatchStreamEvent::Result { response } = event else {
        panic!("expected result event");
    };

    assert_eq!(state.parser.partial_text(), "hello world");
    assert_eq!(
        response.results.channels[0].alternatives[0].transcript,
        "hello world"
    );
    let words = &response.results.channels[0].alternatives[0].words;
    assert!(words.is_empty());
    assert_eq!(response.metadata["usage"]["type"], "tokens");
    assert_eq!(response.metadata["timing_source"], "synthetic_text");
}

#[test]
fn parse_buffer_handles_crlf_delimited_sse_blocks() {
    let mut state = OpenAISseParserState::new(());
    state.buffer =
        b"data: {\"type\":\"transcript.text.delta\",\"delta\":\"hello\"}\r\n\r\n".to_vec();

    state.fill_pending_event();

    let event = state
        .pending_events
        .pop_front()
        .expect("expected parsed event")
        .expect("expected valid event");

    assert!(state.buffer.is_empty());
    assert!(matches!(
        event,
        BatchStreamEvent::Progress {
            percentage,
            partial_text: Some(ref text),
            ..
        } if text == "hello" && percentage > 0.0
    ));
}

#[test]
fn incomplete_sse_frame_at_eof_is_a_terminal_error() {
    let mut state = OpenAISseParserState::new(());
    state.push_chunk(bytes::Bytes::from_static(
        b"data: {\"type\":\"transcript.text.delta\",\"delta\":\"hello\"}",
    ));

    state.finish();

    assert!(state.terminated);
    assert!(state.buffer.is_empty());
    let error = state
        .pending_events
        .pop_front()
        .expect("expected terminal error")
        .expect_err("incomplete frame must fail");
    assert!(error.to_string().contains("incomplete frame"));
}

#[test]
fn oversized_sse_frame_is_rejected_without_retaining_the_frame() {
    let mut state = OpenAISseParserState::new(());
    let oversized = vec![b'x'; MAX_SSE_FRAME_BYTES + MAX_SSE_DELIMITER_BYTES + 1];

    state.push_chunk(oversized.into());

    assert!(state.terminated);
    assert!(state.buffer.is_empty());
    let error = state
        .pending_events
        .pop_front()
        .expect("expected terminal error")
        .expect_err("oversized frame must fail");
    assert!(error.to_string().contains("exceeded 8 MiB"));
    state.push_chunk(bytes::Bytes::from_static(b"data: ignored\n\n"));
    assert!(state.pending_events.is_empty());
}

#[test]
fn one_chunk_queues_only_one_sse_event_at_a_time() {
    let mut state = OpenAISseParserState::new(());
    let frame = "data: {\"type\":\"transcript.text.delta\",\"delta\":\"x\"}\n\n";
    let event_count = 2_048;
    state.push_chunk(frame.repeat(event_count).into());
    assert!(state.pending_chunk.is_some());
    assert!(state.buffer.len() <= SSE_READ_AHEAD_BYTES);

    for _ in 0..event_count {
        assert_eq!(state.pending_events.len(), 1);
        state.pending_events.pop_front().unwrap().unwrap();
        state.fill_pending_event();
    }

    assert!(state.pending_events.is_empty());
    assert!(state.buffer.is_empty());
    assert!(state.pending_chunk.is_none());
}

#[test]
fn estimate_openai_progress_is_monotonic_and_capped() {
    let mut progress = OpenAISyntheticProgress::default();
    let first = progress.observe_delta("hello");
    let second = progress.observe_delta("hello world from openai");
    let capped = progress.observe_delta(&"a".repeat(10_000));

    assert!(first > 0.0);
    assert!(second >= first);
    assert!(capped <= OPENAI_PROGRESS_CAP);
}

#[test]
fn convert_standard_response_preserves_text_without_words() {
    let response: CreateTranscriptionResponse = serde_json::from_str(
        r#"{
                "text": " hello, world! ",
                "usage": {
                    "type": "duration",
                    "seconds": 2.0
                }
            }"#,
    )
    .expect("parse standard response");

    let batch = convert_response(response);
    let alternative = &batch.results.channels[0].alternatives[0];
    let words = &alternative.words;

    assert_eq!(alternative.transcript, "hello, world!");
    assert!(words.is_empty());
    assert_eq!(batch.metadata["usage"]["type"], "duration");
    assert_eq!(batch.metadata["duration"], 2.0);
    assert_eq!(batch.metadata["timing_source"], "synthetic_text");
}

#[test]
fn convert_diarized_response_preserves_speaker_segments() {
    let response: CreateTranscriptionResponse = serde_json::from_str(
        r#"{
                "duration": 4.0,
                "task": "transcribe",
                "text": "hello there general kenobi",
                "segments": [
                    {
                        "id": "seg_1",
                        "speaker": "agent",
                        "start": 0.0,
                        "end": 2.0,
                        "text": "hello there",
                        "type": "transcript.text.segment"
                    },
                    {
                        "id": "seg_2",
                        "speaker": "customer",
                        "start": 2.0,
                        "end": 4.0,
                        "text": "general kenobi",
                        "type": "transcript.text.segment"
                    }
                ]
            }"#,
    )
    .expect("parse diarized response");

    let batch = convert_response(response);
    let words = &batch.results.channels[0].alternatives[0].words;

    assert_eq!(words.len(), 4);
    assert_eq!(words[0].channel, MIXED_CAPTURE_CHANNEL);
    assert_eq!(words[0].speaker, Some(0));
    assert_eq!(words[2].speaker, Some(1));
    assert_eq!(
        batch.metadata["timing_source"],
        "provider_segment_interpolated"
    );
    assert_eq!(batch.metadata["speaker_labels"][0], "agent");
    assert_eq!(
        batch.metadata["speaker_segments"].as_array().map(Vec::len),
        Some(2)
    );
}
