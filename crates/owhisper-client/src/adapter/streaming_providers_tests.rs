use super::*;
use owhisper_interface::{ListenParams, stream::StreamResponse};
use syntheo_ws_client::client::Message;

fn transcript(response: &StreamResponse) -> (&str, bool, f64, f64) {
    match response {
        StreamResponse::TranscriptResponse {
            channel,
            is_final,
            start,
            duration,
            ..
        } => (
            &channel.alternatives[0].transcript,
            *is_final,
            *start,
            *duration,
        ),
        _ => panic!("expected transcript"),
    }
}

fn json_of(message: &Message) -> serde_json::Value {
    match message {
        Message::Text(text) => serde_json::from_str(text).expect("valid JSON"),
        _ => panic!("expected text message"),
    }
}

fn completed(adapter: &NvidiaAdapter, raw: &str) -> StreamResponse {
    let mut result = adapter.parse_response(raw);
    assert_eq!(result.len(), 1);
    result.remove(0)
}

fn session(params: &ListenParams) -> serde_json::Value {
    let initial = NvidiaAdapter::default()
        .initial_message(None, params, 1)
        .expect("initial message");
    let message = json_of(&initial);
    assert_eq!(message["type"], "session.update");
    message["session"].clone()
}

#[test]
fn nvidia_final_segment_keeps_word_alignment_and_zero_based_speakers() {
    // NeMo-Speech.cpp reports word times in seconds and speakers from 1.
    let adapter = NvidiaAdapter::default();
    let _ = adapter.audio_to_message(bytes::Bytes::from(vec![0; 2 * 16_000 * 2]));
    let result = completed(
        &adapter,
        r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"Bonjour toi","audio_processed":2,"words":[{"word":"Bonjour","start":1.0,"end":1.25,"speaker":1,"confidence":0.9},{"word":"toi","start":1.25,"end":1.5,"speaker":2,"confidence":1}]}"#,
    );
    assert_eq!(transcript(&result), ("Bonjour toi", true, 1.0, 0.5));
    let StreamResponse::TranscriptResponse { channel, .. } = &result else {
        unreachable!()
    };
    let speakers: Vec<_> = channel.alternatives[0]
        .words
        .iter()
        .map(|word| word.speaker)
        .collect();
    assert_eq!(speakers, [Some(0), Some(1)]);
}

#[test]
fn nvidia_words_without_diarization_have_no_speaker() {
    let adapter = NvidiaAdapter::default();
    let _ = adapter.audio_to_message(bytes::Bytes::from(vec![0; 16_000 * 2]));
    let result = completed(
        &adapter,
        r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"Oui","words":[{"word":"Oui","start":0.2,"end":0.4,"confidence":1}]}"#,
    );
    let StreamResponse::TranscriptResponse { channel, .. } = &result else {
        unreachable!()
    };
    assert_eq!(channel.alternatives[0].words[0].speaker, None);
}

#[test]
fn nvidia_deltas_accumulate_into_the_open_utterance() {
    // Each delta carries only the new text: the partial is their concatenation.
    let adapter = NvidiaAdapter::default();
    let mut texts = vec![];
    for delta in ["Et", "", " la person", "ne en"] {
        let raw = serde_json::json!({
            "type": "conversation.item.input_audio_transcription.delta",
            "delta": delta,
        })
        .to_string();
        texts.extend(
            adapter
                .parse_response(&raw)
                .iter()
                .map(|response| transcript(response).0.to_string()),
        );
    }
    assert_eq!(texts, ["Et", "Et la person", "Et la personne en"]);
}

#[test]
fn nvidia_partial_after_a_final_starts_a_new_utterance() {
    let adapter = NvidiaAdapter::default();
    let _ = adapter.audio_to_message(bytes::Bytes::from(vec![0; 5 * 16_000 * 2]));
    adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.delta","delta":"Bonjour à"}"#,
    );
    adapter.parse_response(r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"Bonjour à tous.","words":[{"word":"Bonjour","start":0.3,"end":0.9},{"word":"tous.","start":4.2,"end":4.8}]}"#);
    let _ = adapter.audio_to_message(bytes::Bytes::from(vec![0; 16_000 * 2]));
    let partial = adapter.parse_response(
        r#"{"type":"conversation.item.input_audio_transcription.delta","delta":"Et ensuite"}"#,
    );
    let (text, is_final, start, duration) = transcript(&partial[0]);
    assert_eq!((text, is_final), ("Et ensuite", false));
    assert!((start - 4.8).abs() < 1e-9, "start = {start}");
    assert!((duration - 1.2).abs() < 1e-9, "duration = {duration}");
}

#[test]
fn nvidia_ignores_an_empty_final_result() {
    // With endpointing, the final commit answers with an empty `.completed`.
    let adapter = NvidiaAdapter::default();
    let _ = adapter.audio_to_message(bytes::Bytes::from(vec![0; 16_000 * 2]));
    assert!(
        adapter
            .parse_response(r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"","words":[]}"#)
            .is_empty()
    );
}

#[test]
fn nvidia_commit_acknowledgement_ends_the_stream() {
    let adapter = NvidiaAdapter::default();
    let _ = adapter.audio_to_message(bytes::Bytes::from(vec![0; 16_000 * 2]));
    let result = completed(&adapter, r#"{"type":"input_audio_buffer.committed"}"#);
    assert_eq!(transcript(&result), ("", true, 1.0, 0.0));
    assert!(matches!(
        result,
        StreamResponse::TranscriptResponse {
            from_finalize: true,
            ..
        }
    ));
}

#[test]
fn nvidia_reports_server_errors() {
    let result = completed(
        &NvidiaAdapter::default(),
        r#"{"type":"error","error":{"message":"unsupported realtime event type: x","type":"invalid_request_error","code":400}}"#,
    );
    assert!(matches!(
        result,
        StreamResponse::ErrorResponse { ref error_message, error_code: Some(400), .. }
            if error_message == "unsupported realtime event type: x"
    ));
}

#[test]
fn nvidia_sends_one_flat_session_update() {
    let params = ListenParams {
        model: Some("nemotron-3.5-asr-streaming-0.6b.q8_0".to_string()),
        languages: vec!["fr".parse().unwrap()],
        keywords: vec![
            "Participants".to_string(),
            "  étape ".to_string(),
            "".to_string(),
        ],
        ..Default::default()
    };
    assert_eq!(
        session(&params),
        serde_json::json!({
            "language": "fr-FR",
            "sample_rate": 16000,
            "automatic_punctuation": true,
            "word_timestamps": true,
            "speaker_diarization": true,
            "endpointing_ms": 1000,
            "speech_contexts": [{ "phrases": ["Participants", "étape"], "boost": 2.0 }],
        })
    );
}

#[test]
fn nvidia_keeps_auto_and_regional_languages() {
    for (language, expected) in [("en-GB", "en-GB"), ("de", "de-DE"), ("fr", "fr-FR")] {
        let params = ListenParams {
            languages: vec![language.parse().unwrap()],
            ..Default::default()
        };
        assert_eq!(session(&params)["language"], expected, "{language}");
    }
}

#[test]
fn nvidia_without_keywords_sends_no_speech_context() {
    assert!(
        session(&ListenParams::default())
            .get("speech_contexts")
            .is_none()
    );
}

#[test]
fn nvidia_sends_the_speaker_bound_as_max_speaker_count() {
    let params = ListenParams {
        max_speakers: Some(3),
        ..Default::default()
    };
    let session = session(&params);
    assert_eq!(session["speaker_diarization"], true);
    assert_eq!(session["max_speaker_count"], 3);
    assert!(
        self::session(&ListenParams::default())
            .get("max_speaker_count")
            .is_none()
    );
}

#[test]
fn nvidia_single_voice_stream_disables_diarization_without_a_bound() {
    // An isolated mic stream carries one voice: diarization stays off.
    let params = ListenParams {
        num_speakers: Some(1),
        max_speakers: Some(1),
        ..Default::default()
    };
    let session = session(&params);
    assert_eq!(session["speaker_diarization"], false);
    assert!(session.get("max_speaker_count").is_none());
}

#[test]
fn nvidia_streams_binary_audio_and_commits_only_at_the_end() {
    // A commit ends the recognition stream on NeMo-Speech.cpp: audio chunks are
    // sent alone, and the single commit is the finalize message.
    let adapter = NvidiaAdapter::default();
    let messages = adapter.audio_messages(bytes::Bytes::from_static(b"\x00\x01\x02\x03"));
    assert_eq!(messages.len(), 1);
    assert!(
        matches!(&messages[0], Message::Binary(audio) if audio.as_ref() == b"\x00\x01\x02\x03")
    );
    assert_eq!(
        adapter
            .finalize_messages()
            .iter()
            .map(|message| json_of(message)["type"].clone())
            .collect::<Vec<_>>(),
        [serde_json::json!("input_audio_buffer.commit")]
    );
}

#[test]
fn nvidia_authenticates_with_a_bearer_key() {
    let adapter = NvidiaAdapter::default();
    assert_eq!(
        adapter.build_auth_header(Some("asr-key")),
        Some(("Authorization", "Bearer asr-key".into()))
    );
    assert_eq!(adapter.build_auth_header(Some("")), None);
    assert_eq!(adapter.build_auth_header(None), None);
}

#[test]
fn provider_selection_survives_custom_and_loopback_endpoints() {
    for (provider, expected) in [
        ("nvidia", AdapterKind::Nvidia),
        ("openai", AdapterKind::OpenAI),
    ] {
        assert_eq!(
            AdapterKind::from_url_and_languages(
                &format!("http://localhost:9000?provider={provider}"),
                &[],
                None
            ),
            expected
        );
    }
    let url = NvidiaAdapter::default().build_ws_url(
        "http://localhost:9000?provider=nvidia",
        &ListenParams::default(),
        1,
    );
    assert_eq!(
        url.as_str(),
        "ws://localhost:9000/v1/audio/transcriptions/realtime"
    );
}

#[test]
fn nvidia_without_a_language_asks_the_model_to_detect_it() {
    // Profile › Main language › Automatic detection sends no language (#569).
    assert_eq!(session(&ListenParams::default())["language"], "auto");
}

#[test]
fn nvidia_leaves_out_the_detected_language_tag() {
    let adapter = NvidiaAdapter::default();
    let _ = adapter.audio_to_message(bytes::Bytes::from(vec![0; 2 * 16_000 * 2]));
    let mut partials = vec![];
    for delta in ["<fr", "-FR> Bon", "jour"] {
        let raw = serde_json::json!({
            "type": "conversation.item.input_audio_transcription.delta",
            "delta": delta,
        })
        .to_string();
        partials.extend(
            adapter
                .parse_response(&raw)
                .iter()
                .map(|response| transcript(response).0.to_string()),
        );
    }
    assert_eq!(partials, ["<fr", "Bon", "Bonjour"]);

    let result = completed(
        &adapter,
        r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"<fr-FR> Bonjour","words":[{"word":"<fr-FR>","start":0.0,"end":0.1},{"word":"Bonjour","start":0.2,"end":0.6}]}"#,
    );
    let StreamResponse::TranscriptResponse { channel, .. } = &result else {
        unreachable!()
    };
    assert_eq!(channel.alternatives[0].transcript, "Bonjour");
    let words: Vec<_> = channel.alternatives[0]
        .words
        .iter()
        .map(|word| word.word.as_str())
        .collect();
    assert_eq!(words, ["Bonjour"]);
}

#[test]
fn nvidia_keeps_text_that_merely_starts_with_a_bracket() {
    let adapter = NvidiaAdapter::default();
    let result = completed(
        &adapter,
        r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":"<inaudible> oui"}"#,
    );
    assert_eq!(transcript(&result).0, "<inaudible> oui");
}
