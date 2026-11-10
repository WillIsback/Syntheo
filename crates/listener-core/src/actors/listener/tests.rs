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
