use super::*;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

use crate::webhook_secrets::{KEYCHAIN_MARKER, WebhookSecretStore};

/// Trousseau en mémoire ; `available: false` simule un Linux sans Secret
/// Service.
#[derive(Default)]
struct MemorySecrets {
    values: Mutex<std::collections::HashMap<String, String>>,
    unavailable: bool,
}

impl WebhookSecretStore for MemorySecrets {
    fn read(&self, id: &str) -> Result<Option<String>, String> {
        Ok(self.values.lock().unwrap().get(id).cloned())
    }
    fn write(&self, id: &str, secret: &str) -> Result<(), String> {
        if self.unavailable {
            return Err("Secret Service unavailable".to_string());
        }
        self.values
            .lock()
            .unwrap()
            .insert(id.to_string(), secret.to_string());
        Ok(())
    }
    fn delete(&self, id: &str) -> Result<(), String> {
        self.values.lock().unwrap().remove(id);
        Ok(())
    }
}

fn memory_secrets() -> (Arc<MemorySecrets>, SharedSecretStore) {
    let store = Arc::new(MemorySecrets::default());
    (store.clone(), store)
}

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

    let targeted = dispatch_event(
        db.pool(),
        &memory_secrets().1,
        EVENT_MEETING_COMPLETED,
        "missing-meeting",
    )
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

    let error = create_endpoint(db.pool(), &memory_secrets().1, "https://example.com", &[])
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
        create_endpoint(db.pool(), &memory_secrets().1, "example.com", &[])
            .await
            .unwrap_err(),
        "url must start with http:// or https://"
    );
    assert!(
        create_endpoint(
            db.pool(),
            &memory_secrets().1,
            "https://example.com",
            &["nope".to_string()]
        )
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

// Issue 653 : un échec de livraison ne garde que l'hôte, jamais le chemin de
// l'URL (qui porte souvent un jeton).
#[test]
fn webhook_host_drops_path_and_query() {
    assert_eq!(
        super::webhook_host("https://hooks.slack.com/services/T000/B000/SECRET?x=1"),
        "hooks.slack.com"
    );
    assert_eq!(
        super::webhook_host("http://127.0.0.1:5678/webhook/abc"),
        "127.0.0.1:5678"
    );
    assert_eq!(super::webhook_host("not a url"), "invalid-url");
}

#[tokio::test]
async fn delivery_error_status_never_repeats_the_url() {
    let error = reqwest::Client::new()
        .post("http://127.0.0.1:9/webhook/SECRET-TOKEN-123?sig=abc")
        .send()
        .await
        .unwrap_err();
    let status = super::delivery_error_status(error);
    assert!(status.starts_with("error: "), "{status}");
    assert!(!status.contains("SECRET-TOKEN-123"), "{status}");
    assert!(!status.contains("sig=abc"), "{status}");
}

// Issue 653 : secrets HMAC dans le trousseau, plus en clair dans app.db.
#[tokio::test]
async fn new_endpoint_secret_lives_in_the_keychain() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    let (memory, secrets) = memory_secrets();

    let created = create_endpoint(db.pool(), &secrets, "https://example.com/hook", &[])
        .await
        .unwrap();

    assert!(created.secret.starts_with("whsec_"));
    let row = syntheo_db_app::get_webhook_endpoint(db.pool(), &created.info.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.secret, KEYCHAIN_MARKER);
    assert_eq!(
        memory.read(&created.info.id).unwrap().as_deref(),
        Some(created.secret.as_str())
    );
    assert_eq!(
        crate::webhook_secrets::resolve_secret(&secrets, &row)
            .await
            .unwrap(),
        created.secret
    );
}

#[tokio::test]
async fn legacy_secrets_are_moved_to_the_keychain() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    syntheo_db_app::insert_webhook_endpoint(
        db.pool(),
        "webhook-1",
        "https://example.com",
        "whsec_legacy",
        "[]",
    )
    .await
    .unwrap();
    let (memory, secrets) = memory_secrets();

    crate::webhook_secrets::migrate_secrets(&secrets, db.pool()).await;

    let row = syntheo_db_app::get_webhook_endpoint(db.pool(), "webhook-1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.secret, KEYCHAIN_MARKER);
    assert_eq!(
        memory.read("webhook-1").unwrap().as_deref(),
        Some("whsec_legacy")
    );
}

#[tokio::test]
async fn secret_stays_in_the_database_without_a_keychain() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    let secrets: SharedSecretStore = Arc::new(MemorySecrets {
        unavailable: true,
        ..Default::default()
    });

    let created = create_endpoint(db.pool(), &secrets, "https://example.com/hook", &[])
        .await
        .unwrap();

    let row = syntheo_db_app::get_webhook_endpoint(db.pool(), &created.info.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.secret, created.secret);
    assert_eq!(
        crate::webhook_secrets::resolve_secret(&secrets, &row)
            .await
            .unwrap(),
        created.secret
    );
}

#[tokio::test]
async fn missing_keychain_secret_fails_the_delivery_without_panicking() {
    let (_, secrets) = memory_secrets();
    let row = syntheo_db_app::WebhookEndpointRow {
        id: "webhook-1".to_string(),
        url: "https://example.com".to_string(),
        secret: KEYCHAIN_MARKER.to_string(),
        events_json: "[]".to_string(),
        active: true,
        created_at: String::new(),
        last_delivery_at: None,
        last_delivery_status: String::new(),
    };
    let outcome = deliver_once(
        &secrets,
        &row,
        EVENT_TEST,
        &Bytes::from_static(b"{}"),
        "dlv_1",
    )
    .await;
    assert!(!outcome.delivered);
    assert!(outcome.status.contains("keychain"), "{}", outcome.status);
}

// Issue 653 : migration au lancement, sans ouverture des réglages
// (list_webhooks) ni livraison.
#[tokio::test]
async fn secrets_are_migrated_at_startup_once_the_database_is_ready() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    syntheo_db_app::insert_webhook_endpoint(
        db.pool(),
        "webhook-1",
        "https://example.com",
        "whsec_legacy",
        "[]",
    )
    .await
    .unwrap();
    let (memory, secrets) = memory_secrets();
    // Base pas encore prête aux deux premières tentatives.
    let calls = Arc::new(AtomicUsize::new(0));
    let pool = db.pool().clone();
    let counter = calls.clone();

    let migrated = crate::webhook_secrets::startup_migration(
        move || (counter.fetch_add(1, Ordering::SeqCst) >= 2).then(|| pool.clone()),
        &secrets,
        10,
        std::time::Duration::from_millis(1),
    )
    .await;

    assert!(migrated);
    assert_eq!(calls.load(Ordering::SeqCst), 3);
    let row = syntheo_db_app::get_webhook_endpoint(db.pool(), "webhook-1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.secret, KEYCHAIN_MARKER);
    assert_eq!(
        memory.read("webhook-1").unwrap().as_deref(),
        Some("whsec_legacy")
    );
}

#[tokio::test]
async fn startup_migration_gives_up_without_a_database() {
    let (_, secrets) = memory_secrets();
    assert!(
        !crate::webhook_secrets::startup_migration(
            || None,
            &secrets,
            3,
            std::time::Duration::from_millis(1),
        )
        .await
    );
}

/// Serveur HTTP minimal sur un fil : répond `response` à chaque requête et
/// compte les requêtes reçues.
#[derive(Default)]
struct Receiver {
    hits: AtomicUsize,
    last_request: Mutex<String>,
}

fn local_receiver(response: String) -> (String, Arc<Receiver>) {
    use std::io::{Read as _, Write as _};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());
    let hits = Arc::new(Receiver::default());
    let counter = hits.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { return };
            counter.hits.fetch_add(1, Ordering::SeqCst);
            let mut request = Vec::new();
            let mut buffer = [0u8; 4096];
            // En-têtes, puis le corps annoncé par content-length.
            while let Ok(read) = stream.read(&mut buffer) {
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                let text = String::from_utf8_lossy(&request).to_ascii_lowercase();
                if let Some(end) = text.find("\r\n\r\n") {
                    let length = text
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length:"))
                        .and_then(|value| value.trim().parse::<usize>().ok())
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let request = String::from_utf8_lossy(&request).into_owned();
            *counter.last_request.lock().unwrap() = request;
            let _ = stream.write_all(response.as_bytes());
        }
    });
    (address, hits)
}

// Issue 707 : une redirection n'est jamais suivie ; le statut ne garde que
// l'hôte de la cible, jamais son chemin.
#[tokio::test]
async fn delivery_does_not_follow_redirects() {
    let (target, target_hits) =
        local_receiver("HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n".into());
    for code in [
        "301 Moved Permanently",
        "307 Temporary Redirect",
        "308 Permanent Redirect",
    ] {
        let (receiver, receiver_hits) = local_receiver(format!(
            "HTTP/1.1 {code}\r\nlocation: http://{target}/hooks/s3cr3t-token\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
        ));
        let (_, secrets) = memory_secrets();
        let row = syntheo_db_app::WebhookEndpointRow {
            id: "webhook-1".to_string(),
            url: format!("http://{receiver}/hook"),
            secret: uuid::Uuid::new_v4().simple().to_string(),
            events_json: "[]".to_string(),
            active: true,
            created_at: String::new(),
            last_delivery_at: None,
            last_delivery_status: String::new(),
        };
        let outcome = deliver_once(
            &secrets,
            &row,
            EVENT_TEST,
            &Bytes::from_static(b"{\"note\":\"contenu\"}"),
            "dlv_1",
        )
        .await;
        assert!(!outcome.delivered, "{code}");
        assert_eq!(receiver_hits.hits.load(Ordering::SeqCst), 1, "{code}");
        assert!(outcome.status.contains(&target), "{}", outcome.status);
        assert!(!outcome.status.contains("s3cr3t"), "{}", outcome.status);
    }
    assert_eq!(target_hits.hits.load(Ordering::SeqCst), 0);
}

// Issue 707 : une URL avec identifiants est refusée à la création.
#[tokio::test]
async fn endpoint_creation_rejects_credentials_in_the_url() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    for url in [
        "https://user:motdepasse@example.com/hook",
        "https://jeton@example.com/hook",
        "http://:motdepasse@192.168.1.10/hook",
    ] {
        assert_eq!(
            create_endpoint(db.pool(), &memory_secrets().1, url, &[])
                .await
                .unwrap_err(),
            "url must not contain credentials",
            "{url}"
        );
    }
    assert!(
        syntheo_db_app::list_webhook_endpoints(db.pool())
            .await
            .unwrap()
            .is_empty()
    );
    // Un « @ » dans le chemin n'est pas un identifiant.
    create_endpoint(
        db.pool(),
        &memory_secrets().1,
        "https://example.com/hook/@equipe",
        &[],
    )
    .await
    .unwrap();
}

// Issue 707 : une ligne antérieure au refus est affichée sans ses
// identifiants, et la livraison ne les envoie plus en Basic.
#[tokio::test]
async fn legacy_credentials_are_masked_and_never_sent() {
    let (receiver, hits) =
        local_receiver("HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n".into());
    let row = syntheo_db_app::WebhookEndpointRow {
        id: "webhook-1".to_string(),
        url: format!("http://user:motdepasse@{receiver}/hook"),
        secret: uuid::Uuid::new_v4().simple().to_string(),
        events_json: "[]".to_string(),
        active: true,
        created_at: String::new(),
        last_delivery_at: None,
        last_delivery_status: String::new(),
    };
    let info = crate::WebhookInfo::from(row.clone());
    assert_eq!(info.url, format!("http://***@{receiver}/hook"));
    assert_eq!(
        without_credentials(&row.url, ""),
        format!("http://{receiver}/hook")
    );
    let (_, secrets) = memory_secrets();
    let outcome = deliver_once(
        &secrets,
        &row,
        EVENT_TEST,
        &Bytes::from_static(b"{}"),
        "dlv_1",
    )
    .await;
    assert!(outcome.delivered, "{}", outcome.status);
    assert_eq!(hits.hits.load(Ordering::SeqCst), 1);
    let request = hits.last_request.lock().unwrap().clone();
    assert!(
        !request.to_ascii_lowercase().contains("authorization"),
        "{request}"
    );
}
