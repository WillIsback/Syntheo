use super::responses::classify_provider_error;
use super::*;

#[tokio::test]
async fn stream_task_shutdown_aborts_a_hung_task_after_the_deadline() {
    let (shutdown_tx, _shutdown_rx) = tokio::sync::oneshot::channel();
    let mut shutdown_tx = Some(shutdown_tx);
    let mut task = tokio::spawn(std::future::pending::<Vec<StreamResponse>>());

    let responses = stop_stream_task(&mut shutdown_tx, &mut task, Duration::from_millis(20)).await;

    assert!(responses.is_empty());
    assert!(shutdown_tx.is_none());
    let join_result = tokio::time::timeout(Duration::from_secs(1), &mut task)
        .await
        .expect("aborted stream task should stop promptly");
    assert!(join_result.unwrap_err().is_cancelled());
}

#[tokio::test]
async fn stream_task_shutdown_discards_queued_provider_errors() {
    let (shutdown_tx, _shutdown_rx) = tokio::sync::oneshot::channel();
    let mut shutdown_tx = Some(shutdown_tx);
    let mut task = tokio::spawn(async {
        vec![StreamResponse::ErrorResponse {
            error_code: Some(400),
            error_message: "invalid request".to_string(),
            provider: "openai".to_string(),
        }]
    });

    let responses = stop_stream_task(&mut shutdown_tx, &mut task, Duration::from_secs(1)).await;

    assert!(responses.is_empty());
}

#[test]
fn permanent_provider_errors_do_not_use_the_retryable_stream_error() {
    assert!(matches!(
        classify_provider_error(Some(401), "invalid key", "openai"),
        DegradedError::AuthenticationFailed { .. }
    ));
    assert!(matches!(
        classify_provider_error(Some(400), "invalid model", "openai"),
        DegradedError::ProviderConfiguration { .. }
    ));
    assert!(matches!(
        classify_provider_error(Some(402), "quota exhausted", "openai"),
        DegradedError::ProviderConfiguration { .. }
    ));
    assert!(matches!(
        classify_provider_error(Some(429), "rate limited", "openai"),
        DegradedError::StreamError { .. }
    ));
    assert!(matches!(
        classify_provider_error(Some(500), "server error", "openai"),
        DegradedError::StreamError { .. }
    ));
}

// Revue de l'issue 686, constat 4 : en micro seul (profil « un seul flux »),
// le son du poste n'est pas envoyé et ne compte pas pour le chien de garde.
// Micro silencieux et son du poste actif pendant 60 s : aucun arrêt.
#[test]
fn mic_only_watchdog_ignores_the_unsent_speaker_audio() {
    let silent = bytes::Bytes::from(vec![0u8; 3200]);
    let loud: Vec<u8> = (0..1600)
        .flat_map(|i| (if i % 2 == 0 { 8000i16 } else { -8000i16 }).to_le_bytes())
        .collect();
    let loud = bytes::Bytes::from(loud);
    let start = std::time::Instant::now();
    for (mode, expect_stop) in [
        (crate::actors::ChannelMode::MicOnly, false),
        (crate::actors::ChannelMode::MicAndSpeaker, true),
    ] {
        let mut progress = super::stream::StreamProgress::new(start);
        let mut stopped = false;
        for tick in 1..=600u64 {
            let now = start + std::time::Duration::from_millis(100 * tick);
            let samples = dual_active_samples(mode, &silent, &loud);
            stopped |= progress.observe_audio(samples, now);
        }
        assert_eq!(stopped, expect_stop, "{mode:?}");
    }
}
