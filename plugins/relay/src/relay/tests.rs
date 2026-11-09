use super::{
    MAX_EVENT_SUBSCRIPTIONS, PendingResults, can_register_event_subscription, event_handler_id,
    send_reply, send_reply_with_timeout, try_send_event,
};

#[test]
fn reads_tauri_event_id_for_unlisten_requests() {
    assert_eq!(event_handler_id(&serde_json::json!({ "eventId": 42 })), 42);
    assert_eq!(event_handler_id(&serde_json::json!({ "handler": 43 })), 43);
}

#[tokio::test]
async fn signals_connection_close_instead_of_dropping_an_event_silently() {
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let (overflow_tx, overflow_rx) = tokio::sync::watch::channel(false);

    assert!(try_send_event(&tx, &overflow_tx, "first".to_string()));
    assert!(!try_send_event(&tx, &overflow_tx, "second".to_string()));
    assert!(*overflow_rx.borrow());
    assert_eq!(rx.recv().await.as_deref(), Some("first"));
}

#[tokio::test]
async fn replies_wait_for_capacity_instead_of_being_dropped() {
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let (overflow_tx, overflow_rx) = tokio::sync::watch::channel(false);
    assert!(try_send_event(&tx, &overflow_tx, "event".to_string()));

    let reply_tx = tx.clone();
    let reply_overflow_tx = overflow_tx.clone();
    let reply = tokio::spawn(async move {
        send_reply(&reply_tx, &reply_overflow_tx, "reply".to_string()).await
    });
    tokio::task::yield_now().await;
    assert!(!reply.is_finished());

    assert_eq!(rx.recv().await.as_deref(), Some("event"));
    assert!(reply.await.unwrap());
    assert!(!*overflow_rx.borrow());
    assert_eq!(rx.recv().await.as_deref(), Some("reply"));
}

#[tokio::test]
async fn reply_timeout_signals_connection_close() {
    let (tx, _rx) = tokio::sync::mpsc::channel(1);
    tx.send("first".to_string()).await.unwrap();
    let (overflow_tx, overflow_rx) = tokio::sync::watch::channel(false);

    assert!(
        !send_reply_with_timeout(
            &tx,
            &overflow_tx,
            "reply".to_string(),
            std::time::Duration::from_millis(25),
        )
        .await
    );
    assert!(*overflow_rx.borrow());
}

#[tokio::test]
async fn pending_results_use_server_unique_internal_ids() {
    let pending = PendingResults::default();
    let (first_tx, first_rx) = tokio::sync::oneshot::channel();
    let (second_tx, second_rx) = tokio::sync::oneshot::channel();

    let first_id = pending.register(first_tx).await;
    let second_id = pending.clone().register(second_tx).await;

    assert_ne!(first_id, second_id);
    pending
        .take(first_id)
        .await
        .unwrap()
        .send(serde_json::json!(1))
        .unwrap();
    pending
        .take(second_id)
        .await
        .unwrap()
        .send(serde_json::json!(2))
        .unwrap();
    assert_eq!(first_rx.await.unwrap(), serde_json::json!(1));
    assert_eq!(second_rx.await.unwrap(), serde_json::json!(2));
}

#[test]
fn event_subscription_limit_allows_replacements_but_rejects_growth() {
    assert!(can_register_event_subscription(
        MAX_EVENT_SUBSCRIPTIONS,
        true
    ));
    assert!(!can_register_event_subscription(
        MAX_EVENT_SUBSCRIPTIONS,
        false
    ));
}
