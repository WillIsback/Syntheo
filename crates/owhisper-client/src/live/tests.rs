use std::time::Duration;

use bytes::Bytes;
use syntheo_ws_client::client::Message;

use super::{ListenClientDualInput, TransformedInput, forward_dual_to_single, mic_stream_params};
use crate::{ListenClient, OpenAIAdapter, RealtimeSttAdapter};

#[derive(Clone, Default)]
struct TestAdapter;

impl RealtimeSttAdapter for TestAdapter {
    fn provider_name(&self) -> &'static str {
        "test"
    }

    fn is_supported_languages(
        &self,
        _languages: &[syntheo_language::Language],
        _model: Option<&str>,
    ) -> bool {
        true
    }

    fn supports_native_multichannel(&self) -> bool {
        false
    }

    fn build_ws_url(
        &self,
        api_base: &str,
        _params: &owhisper_interface::ListenParams,
        _channels: u8,
    ) -> url::Url {
        api_base.parse().expect("invalid test url")
    }

    fn build_auth_header(&self, _api_key: Option<&str>) -> Option<(&'static str, String)> {
        None
    }

    fn keep_alive_message(&self) -> Option<Message> {
        None
    }

    fn finalize_message(&self) -> Message {
        Message::Text("finalize".into())
    }

    fn parse_response(&self, _raw: &str) -> Vec<owhisper_interface::stream::StreamResponse> {
        Vec::new()
    }
}

#[tokio::test]
async fn malformed_custom_endpoint_returns_provider_configuration_error() {
    let api_base = format!("{}://custom.example/listen", "a".repeat(65));
    let error = ListenClient::builder()
        .adapter::<TestAdapter>()
        .api_base(api_base)
        .build_single()
        .await
        .err()
        .expect("an oversized URI scheme should be rejected");

    assert!(matches!(
        error,
        crate::Error::ProviderConfiguration { provider, .. } if provider == "test"
    ));
}

#[tokio::test]
async fn malformed_direct_endpoint_returns_provider_configuration_error() {
    let api_base = format!("http://192.168.1.87:8000/v1?pad={}", "a".repeat(70 * 1024));
    let error = ListenClient::builder()
        .adapter::<OpenAIAdapter>()
        .api_base(api_base)
        .build_single()
        .await
        .err()
        .expect("an oversized direct endpoint should be rejected");

    assert!(matches!(
        error,
        crate::Error::ProviderConfiguration { provider, .. } if provider == "openai"
    ));
}

#[tokio::test]
async fn valid_proxy_and_direct_endpoints_still_build() {
    for api_base in ["http://192.168.1.87:8000/v1", "http://localhost:8000/v1"] {
        ListenClient::builder()
            .adapter::<OpenAIAdapter>()
            .api_base(api_base)
            .build_single()
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn split_dual_builds_a_dedicated_mic_request() {
    let client = ListenClient::builder()
        .adapter::<OpenAIAdapter>()
        .api_base("http://192.168.1.87:8000/v1")
        .api_key("test-key")
        .params(owhisper_interface::ListenParams {
            mic_num_speakers: Some(1),
            ..Default::default()
        })
        .build_dual()
        .await
        .unwrap();

    assert!(
        client.mic_request.is_some(),
        "split sessions should build a dedicated mic request"
    );
}

#[tokio::test]
async fn forward_dual_to_single_forwards_all_audio_without_dropping() {
    let stream = futures_util::stream::iter(vec![
        ListenClientDualInput::Audio((Bytes::from_static(b"mic-1"), Bytes::from_static(b"spk-1"))),
        ListenClientDualInput::Audio((Bytes::from_static(b"mic-2"), Bytes::from_static(b"spk-2"))),
    ]);
    let (mic_tx, mut mic_rx) = tokio::sync::mpsc::channel(1);
    let (spk_tx, mut spk_rx) = tokio::sync::mpsc::channel(1);

    let task = tokio::spawn(forward_dual_to_single(
        stream,
        mic_tx,
        spk_tx,
        TestAdapter,
        TestAdapter,
    ));

    let Some(TransformedInput::Audio(Message::Binary(first_mic))) = mic_rx.recv().await else {
        panic!("missing first mic frame");
    };
    let Some(TransformedInput::Audio(Message::Binary(first_spk))) = spk_rx.recv().await else {
        panic!("missing first speaker frame");
    };
    let Some(TransformedInput::Audio(Message::Binary(second_mic))) =
        tokio::time::timeout(Duration::from_secs(1), mic_rx.recv())
            .await
            .expect("timed out waiting for second mic frame")
    else {
        panic!("missing second mic frame");
    };
    let Some(TransformedInput::Audio(Message::Binary(second_spk))) =
        tokio::time::timeout(Duration::from_secs(1), spk_rx.recv())
            .await
            .expect("timed out waiting for second speaker frame")
    else {
        panic!("missing second speaker frame");
    };

    assert_eq!(first_mic.as_ref(), b"mic-1");
    assert_eq!(first_spk.as_ref(), b"spk-1");
    assert_eq!(second_mic.as_ref(), b"mic-2");
    assert_eq!(second_spk.as_ref(), b"spk-2");

    let _: () = task.await.expect("forward task panicked");
}

#[test]
fn mic_stream_params_overrides_speaker_counts_for_the_mic_stream() {
    let params = owhisper_interface::ListenParams {
        mic_num_speakers: Some(1),
        ..Default::default()
    };

    let mic_params = mic_stream_params(&params);

    assert_eq!(mic_params.num_speakers, Some(1));
    assert_eq!(mic_params.max_speakers, Some(1));
    assert_eq!(params.num_speakers, None, "shared params stay untouched");
}

#[test]
fn mic_stream_params_clamps_min_speakers_below_the_mic_count() {
    let params = owhisper_interface::ListenParams {
        mic_num_speakers: Some(1),
        min_speakers: Some(3),
        ..Default::default()
    };

    let mic_params = mic_stream_params(&params);

    assert_eq!(mic_params.num_speakers, Some(1));
    assert_eq!(mic_params.max_speakers, Some(1));
    assert_eq!(mic_params.min_speakers, Some(1));
}

#[test]
fn mic_stream_params_without_mic_count_keeps_shared_expectation() {
    let params = owhisper_interface::ListenParams {
        num_speakers: Some(4),
        ..Default::default()
    };

    let mic_params = mic_stream_params(&params);

    assert_eq!(mic_params.num_speakers, Some(4));
    assert_eq!(mic_params.mic_num_speakers, None);
}

#[tokio::test]
#[allow(
    clippy::result_large_err,
    reason = "Tungstenite requires an unboxed HTTP response in handshake callbacks"
)]
async fn nvidia_dual_capture_opens_each_stream_with_the_bearer_key() {
    use std::sync::{Arc, Mutex};
    use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

    // NeMo-Speech.cpp: each capture stream opens its own WebSocket on the
    // realtime route with the API key as a Bearer header (no session minting),
    // then sends one flat `session.update` before any audio.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let handshakes = Arc::new(Mutex::new(Vec::new()));
    let seen = handshakes.clone();
    let server = tokio::spawn(async move {
        let mut tasks = Vec::new();
        for _ in 0..2 {
            let (socket, _) = listener.accept().await.unwrap();
            let seen = seen.clone();
            tasks.push(tokio::spawn(async move {
                let mut ws = tokio_tungstenite::accept_hdr_async(
                    socket,
                    |request: &Request, response: Response| {
                        let auth = request
                            .headers()
                            .get("authorization")
                            .and_then(|value| value.to_str().ok())
                            .map(str::to_owned);
                        seen.lock()
                            .unwrap()
                            .push((request.uri().path().to_owned(), auth));
                        Ok(response)
                    },
                )
                .await
                .unwrap();
                use futures_util::StreamExt;
                let first = ws.next().await.unwrap().unwrap();
                let first: serde_json::Value =
                    serde_json::from_str(first.to_text().unwrap()).unwrap();
                assert_eq!(first["type"], "session.update");
            }));
        }
        for task in tasks {
            task.await.unwrap();
        }
    });
    let client = ListenClient::builder()
        .adapter::<crate::NvidiaAdapter>()
        .api_base(base)
        .api_key("asr-key")
        .build_dual()
        .await
        .unwrap();
    let (_output, _handle) = client
        .from_realtime_audio(futures_util::stream::pending())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), server)
        .await
        .unwrap()
        .unwrap();
    let handshakes = handshakes.lock().unwrap();
    assert_eq!(handshakes.len(), 2);
    for (path, auth) in handshakes.iter() {
        assert_eq!(path, "/v1/audio/transcriptions/realtime");
        assert_eq!(auth.as_deref(), Some("Bearer asr-key"));
    }
}

#[tokio::test]
async fn empty_endpoint_is_rejected_instead_of_a_cloud_default() {
    let error = ListenClient::builder()
        .adapter::<OpenAIAdapter>()
        .api_base("")
        .build_single()
        .await
        .err()
        .expect("an empty endpoint must not fall back to a cloud host");

    assert!(matches!(
        error,
        crate::Error::ProviderConfiguration { provider, .. } if provider == "openai"
    ));
}

#[test]
fn mic_stream_params_keep_the_participant_bound_unless_the_mic_is_isolated() {
    let params = owhisper_interface::ListenParams {
        max_speakers: Some(4),
        ..Default::default()
    };
    let mic_params = mic_stream_params(&params);
    assert_eq!(mic_params.max_speakers, Some(4));
    assert_eq!(
        mic_params.num_speakers, None,
        "a bound, never an exact count"
    );

    let isolated = owhisper_interface::ListenParams {
        max_speakers: Some(4),
        mic_num_speakers: Some(1),
        ..Default::default()
    };
    assert_eq!(mic_stream_params(&isolated).max_speakers, Some(1));
}

// Issue #519 : deux connexions ouvertes à la même milliseconde ont planté un NIM
// nemotron-asr-streaming. Le flux son système n'est tenté qu'après l'établissement du flux
// micro et le délai `SPLIT_STREAM_STAGGER`, et son audio attend dans un tampon sans perte.
#[tokio::test]
async fn split_dual_staggers_the_speaker_connection_without_losing_its_audio() {
    use futures_util::StreamExt;
    use std::time::Instant;

    struct Accepted {
        handshake_at: Instant,
        frames: Vec<(Instant, Vec<u8>)>,
    }

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("ws://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let mut tasks = Vec::new();
        for _ in 0..2 {
            let (socket, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(socket).await.unwrap();
            let handshake_at = Instant::now();
            tasks.push(tokio::spawn(async move {
                let mut frames = Vec::new();
                while frames.len() < 3 {
                    match tokio::time::timeout(Duration::from_secs(5), ws.next()).await {
                        Ok(Some(Ok(Message::Binary(data)))) => {
                            frames.push((Instant::now(), data.to_vec()));
                        }
                        Ok(Some(Ok(_))) => {}
                        _ => break,
                    }
                }
                Accepted {
                    handshake_at,
                    frames,
                }
            }));
        }
        let mut accepted = Vec::new();
        for task in tasks {
            accepted.push(task.await.unwrap());
        }
        accepted
    });

    let (tx, rx) = tokio::sync::mpsc::channel::<ListenClientDualInput>(8);
    for index in 1..=3 {
        tx.send(ListenClientDualInput::Audio((
            Bytes::from(format!("mic-{index}")),
            Bytes::from(format!("spk-{index}")),
        )))
        .await
        .unwrap();
    }

    let started = Instant::now();
    let client = ListenClient::builder()
        .adapter::<TestAdapter>()
        .api_base(base)
        .build_dual()
        .await
        .unwrap();
    let (_output, _handle) = client
        .from_realtime_audio(tokio_stream::wrappers::ReceiverStream::new(rx))
        .await
        .unwrap();

    let accepted = tokio::time::timeout(Duration::from_secs(10), server)
        .await
        .unwrap()
        .unwrap();
    let (mic, spk) = (&accepted[0], &accepted[1]);
    let waited = spk.handshake_at.duration_since(mic.handshake_at);

    assert!(
        waited >= super::SPLIT_STREAM_STAGGER,
        "the speaker stream must wait {:?} after the mic stream, waited {waited:?}",
        super::SPLIT_STREAM_STAGGER,
    );
    assert!(
        started.elapsed() >= super::SPLIT_STREAM_STAGGER,
        "the stagger is part of the connection"
    );
    assert!(
        mic.frames.first().unwrap().0 < spk.handshake_at,
        "mic audio flows while the speaker stream waits"
    );
    let payloads = |accepted: &Accepted| {
        accepted
            .frames
            .iter()
            .map(|(_, data)| String::from_utf8(data.clone()).unwrap())
            .collect::<Vec<_>>()
    };
    assert_eq!(payloads(mic), ["mic-1", "mic-2", "mic-3"]);
    assert_eq!(
        payloads(spk),
        ["spk-1", "spk-2", "spk-3"],
        "speaker audio captured during the stagger is buffered, not lost"
    );
}
