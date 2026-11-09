use super::*;

#[test]
fn for_model_applies_openai_defaults() {
    let whisper = CreateTranscriptionOptions::for_model(AudioModel::Whisper1, true, true);
    let diarize =
        CreateTranscriptionOptions::for_model(AudioModel::Gpt4oTranscribeDiarize, true, false);

    match whisper {
        CreateTranscriptionOptions::Whisper(options) => {
            assert_eq!(
                options.response_format,
                Some(WhisperResponseFormat::VerboseJson)
            );
        }
        other => panic!("expected whisper options, got {other:?}"),
    }

    match diarize {
        CreateTranscriptionOptions::Diarize(options) => {
            assert_eq!(
                options.common.chunking_strategy,
                Some(ChunkingStrategy::auto())
            );
            assert_eq!(
                options.response_format,
                Some(DiarizedResponseFormat::DiarizedJson)
            );
            assert_eq!(options.stream, None);
        }
        other => panic!("expected diarized options, got {other:?}"),
    }
}

#[test]
fn multipart_text_fields_match_api_shape() {
    let mut options =
        CreateTranscriptionOptions::for_model(AudioModel::Gpt4oTranscribe, true, true);
    options.push_language("en");

    let CreateTranscriptionOptions::Gpt(gpt) = &mut options else {
        panic!("expected gpt options");
    };
    gpt.include.push(TranscriptionInclude::Logprobs);
    gpt.prompt = Some("expect domain terms".to_string());

    let fields = options
        .multipart_text_fields()
        .expect("serialize multipart");

    assert!(
        fields
            .iter()
            .any(|field| field.name == "model" && field.value == "gpt-4o-transcribe")
    );
    assert!(
        fields
            .iter()
            .any(|field| field.name == "language" && field.value == "en")
    );
    assert!(
        fields
            .iter()
            .any(|field| field.name == "include[]" && field.value == "logprobs")
    );
    assert!(
        fields
            .iter()
            .any(|field| field.name == "prompt" && field.value == "expect domain terms")
    );
    assert!(
        fields
            .iter()
            .any(|field| field.name == "response_format" && field.value == "json")
    );
    assert!(
        fields
            .iter()
            .any(|field| field.name == "stream" && field.value == "true")
    );
}

#[test]
fn gpt_transcribe_uses_plural_languages() {
    let mut options = CreateTranscriptionOptions::for_model(AudioModel::GptTranscribe, true, true);
    options.push_language("en");
    options.push_language("ko");
    options.push_keyword("technical term");

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
    assert!(
        fields
            .iter()
            .any(|field| field.name == "keywords[]" && field.value == "technical term")
    );
}

#[test]
fn diarized_requests_emit_chunking_strategy_auto() {
    let options =
        CreateTranscriptionOptions::for_model(AudioModel::Gpt4oTranscribeDiarize, true, false);

    let fields = options
        .multipart_text_fields()
        .expect("serialize multipart");

    assert!(
        fields
            .iter()
            .any(|field| { field.name == "chunking_strategy" && field.value == "auto" })
    );
}
