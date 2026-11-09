use super::*;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

#[test]
fn signature_matches_reference_hmac() {
    // The key is generated at runtime so that no key material is
    // hard-coded in the sources (CodeQL rust/hard-coded-cryptographic-value).
    // The expected MAC is recomputed here with a manual RFC 2104
    // construction over `sha2`, independent from the `hmac` crate used
    // by `sign_payload`.
    let key = uuid::Uuid::new_v4().simple().to_string();
    let payload = "{\"a\":1}";

    assert_eq!(
        sign_payload(&key, payload),
        reference_hmac_sha256_hex(key.as_bytes(), payload.as_bytes())
    );
    // Same key and body must produce the same signature, while a
    // different key must change it.
    assert_eq!(sign_payload(&key, payload), sign_payload(&key, payload));
    assert_ne!(
        sign_payload(&key, payload),
        sign_payload(&uuid::Uuid::new_v4().simple().to_string(), payload)
    );
}

fn reference_hmac_sha256_hex(key: &[u8], message: &[u8]) -> String {
    use sha2::Digest as _;

    const BLOCK_LEN: usize = 64;
    let normalized: Vec<u8> = if key.len() > BLOCK_LEN {
        sha2::Sha256::digest(key).to_vec()
    } else {
        key.to_vec()
    };
    let mut padded = normalized;
    padded.resize(BLOCK_LEN, 0);

    let inner_block: Vec<u8> = padded.iter().map(|byte| byte ^ 0x36).collect();
    let mut inner = sha2::Sha256::new();
    inner.update(&inner_block);
    inner.update(message);
    let inner = inner.finalize();

    let outer_block: Vec<u8> = padded.iter().map(|byte| byte ^ 0x5c).collect();
    let mut outer = sha2::Sha256::new();
    outer.update(&outer_block);
    outer.update(inner);
    outer
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[test]
fn empty_event_list_subscribes_to_everything() {
    let endpoint = syntheo_db_app::WebhookEndpointRow {
        id: "webhook-1".to_string(),
        url: "https://example.com".to_string(),
        secret: "whsec_x".to_string(),
        events_json: "[]".to_string(),
        active: true,
        created_at: String::new(),
        last_delivery_at: None,
        last_delivery_status: String::new(),
    };
    assert!(subscribes(&endpoint, EVENT_NOTE_ENHANCED));

    let scoped = syntheo_db_app::WebhookEndpointRow {
        events_json: "[\"meeting.completed\"]".to_string(),
        ..endpoint
    };
    assert!(subscribes(&scoped, EVENT_MEETING_COMPLETED));
    assert!(!subscribes(&scoped, EVENT_NOTE_ENHANCED));
}

#[tokio::test]
async fn dispatch_without_subscribed_endpoints_is_a_no_op() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    syntheo_db_app::insert_webhook_endpoint(
        db.pool(),
        "webhook-1",
        "https://example.com",
        "whsec_test",
        "[\"note.enhanced\"]",
    )
    .await
    .unwrap();

    let targeted = dispatch_event(db.pool(), EVENT_MEETING_COMPLETED, "missing-meeting")
        .await
        .unwrap();

    assert_eq!(targeted, 0);
}

#[tokio::test]
async fn endpoint_creation_stops_at_the_fanout_limit() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();

    for index in 0..MAX_WEBHOOK_ENDPOINTS {
        syntheo_db_app::insert_webhook_endpoint(
            db.pool(),
            &format!("webhook-{index}"),
            "https://example.com",
            "whsec_test",
            "[]",
        )
        .await
        .unwrap();
    }

    let error = create_endpoint(db.pool(), "https://example.com", &[])
        .await
        .unwrap_err();

    assert_eq!(
        error,
        format!("at most {MAX_WEBHOOK_ENDPOINTS} webhook endpoints can be configured")
    );
    assert_eq!(
        syntheo_db_app::list_webhook_endpoints(db.pool())
            .await
            .unwrap()
            .len(),
        MAX_WEBHOOK_ENDPOINTS
    );
}

#[tokio::test]
async fn endpoint_creation_rejects_bad_urls_and_unknown_events() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();

    assert_eq!(
        create_endpoint(db.pool(), "example.com", &[])
            .await
            .unwrap_err(),
        "url must start with http:// or https://"
    );
    assert!(
        create_endpoint(db.pool(), "https://example.com", &["nope".to_string()])
            .await
            .unwrap_err()
            .starts_with("unknown event 'nope'")
    );
    assert!(
        syntheo_db_app::list_webhook_endpoints(db.pool())
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn bounded_runner_limits_concurrency_without_dropping_items() {
    let active = Arc::new(AtomicUsize::new(0));
    let completed = Arc::new(AtomicUsize::new(0));
    let peak = Arc::new(AtomicUsize::new(0));

    run_bounded(0..100, 4, {
        let active = active.clone();
        let completed = completed.clone();
        let peak = peak.clone();
        move |_| {
            let active = active.clone();
            let completed = completed.clone();
            let peak = peak.clone();
            async move {
                let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(current, Ordering::SeqCst);
                tokio::task::yield_now().await;
                active.fetch_sub(1, Ordering::SeqCst);
                completed.fetch_add(1, Ordering::SeqCst);
            }
        }
    })
    .await;

    assert_eq!(completed.load(Ordering::SeqCst), 100);
    assert!(peak.load(Ordering::SeqCst) <= 4);
}

#[tokio::test]
async fn bounded_admission_queues_a_limited_waiting_tier() {
    let active = Arc::new(tokio::sync::Semaphore::new(1));
    let waiting = Arc::new(tokio::sync::Semaphore::new(2));
    let active_guard = active.clone().acquire_owned().await.unwrap();

    let first = tokio::spawn(acquire_with_waiting_tier(
        active.clone(),
        waiting.clone(),
        "busy",
    ));
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        while waiting.available_permits() != 1 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let second = tokio::spawn(acquire_with_waiting_tier(
        active.clone(),
        waiting.clone(),
        "busy",
    ));
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        while waiting.available_permits() != 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();

    assert_eq!(
        acquire_with_waiting_tier(active.clone(), waiting.clone(), "busy")
            .await
            .unwrap_err(),
        "busy"
    );

    drop(active_guard);
    let first_permit = tokio::time::timeout(std::time::Duration::from_secs(1), first)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    drop(first_permit);
    let second_permit = tokio::time::timeout(std::time::Duration::from_secs(1), second)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    drop(second_permit);

    assert_eq!(active.available_permits(), 1);
    assert_eq!(waiting.available_permits(), 2);
}

#[tokio::test]
async fn cancelled_admission_releases_its_waiting_slot() {
    let active = Arc::new(tokio::sync::Semaphore::new(1));
    let waiting = Arc::new(tokio::sync::Semaphore::new(1));
    let active_guard = active.clone().acquire_owned().await.unwrap();
    let waiter = tokio::spawn(acquire_with_waiting_tier(
        active.clone(),
        waiting.clone(),
        "busy",
    ));
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        while waiting.available_permits() != 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();

    waiter.abort();
    assert!(waiter.await.unwrap_err().is_cancelled());
    assert_eq!(waiting.available_permits(), 1);
    drop(active_guard);
}
