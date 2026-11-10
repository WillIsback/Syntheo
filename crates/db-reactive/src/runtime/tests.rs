use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::json;
use syntheo_db_change::TableChangeKind;
use syntheo_db_core::{DbOpenOptions, DbStorage};

use super::*;
use crate::types::QueryEventSink;

fn hook_test_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[tokio::test]
async fn change_batch_includes_changes_arriving_during_coalescing_window() {
    let (tx, mut rx) = tokio::sync::broadcast::channel(8);
    let (notifier, _) = ChangeNotifier::new();
    tx.send(TableChange {
        table: "sessions".to_string(),
        kind: TableChangeKind::Update,
        seq: 1,
    })
    .unwrap();

    let batch = tokio::spawn(async move { receive_change_batch(&mut rx, &notifier).await });
    tokio::time::sleep(std::time::Duration::from_millis(1)).await;
    tx.send(TableChange {
        table: "transcripts".to_string(),
        kind: TableChangeKind::Insert,
        seq: 2,
    })
    .unwrap();

    let Some(ChangeBatch::ChangedTables { changed_tables }) = batch.await.unwrap() else {
        panic!("expected changed-table batch");
    };
    assert_eq!(
        changed_tables,
        HashMap::from([("sessions".to_string(), 1), ("transcripts".to_string(), 2),])
    );
}

#[derive(Clone, Debug, PartialEq)]
enum TestEvent {
    Result(Vec<serde_json::Value>),
    Error(String),
}

#[derive(Clone)]
struct TestSink {
    events: Arc<Mutex<Vec<TestEvent>>>,
}

impl QueryEventSink for TestSink {
    fn send_result(&self, rows: Vec<serde_json::Value>) -> std::result::Result<(), String> {
        self.events.lock().unwrap().push(TestEvent::Result(rows));
        Ok(())
    }

    fn send_error(&self, error: String) -> std::result::Result<(), String> {
        self.events.lock().unwrap().push(TestEvent::Error(error));
        Ok(())
    }
}

impl TestSink {
    fn capture() -> (Self, Arc<Mutex<Vec<TestEvent>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        (
            Self {
                events: Arc::clone(&events),
            },
            events,
        )
    }
}

const LIVE_QUERY_TEST_MIGRATION_STEPS: &[syntheo_db_migrate::MigrationStep] =
    &[syntheo_db_migrate::MigrationStep {
        id: "20260415000000_live_query_test_schema",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../../tests/common/live_query_test_schema.sql"),
    }];

fn live_query_test_schema() -> syntheo_db_migrate::DbSchema {
    syntheo_db_migrate::DbSchema {
        steps: LIVE_QUERY_TEST_MIGRATION_STEPS,
    }
}

async fn setup_runtime() -> (
    tempfile::TempDir,
    sqlx::SqlitePool,
    LiveQueryRuntime<TestSink>,
) {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("app.db");
    let db = syntheo_db_core::Db::open(DbOpenOptions {
        storage: DbStorage::Local(&db_path),
        journal_mode_wal: true,
        foreign_keys: true,
        max_connections: Some(4),
    })
    .await
    .unwrap();
    syntheo_db_migrate::migrate(&db, live_query_test_schema())
        .await
        .unwrap();

    let pool = db.pool().clone();
    (dir, pool, LiveQueryRuntime::new(Arc::new(db)))
}

async fn next_event(
    events: &Arc<Mutex<Vec<TestEvent>>>,
    index: usize,
    timeout: Duration,
) -> TestEvent {
    tokio::time::timeout(timeout, async {
        loop {
            if let Some(event) = events.lock().unwrap().get(index).cloned() {
                return event;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("expected event")
}

async fn assert_no_event(events: &Arc<Mutex<Vec<TestEvent>>>, index: usize, timeout: Duration) {
    let result = tokio::time::timeout(timeout, async {
        loop {
            if let Some(event) = events.lock().unwrap().get(index).cloned() {
                return event;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;

    assert!(
        result.is_err(),
        "unexpected event at index {index}: {:?}",
        result.unwrap()
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn catch_up_refresh_emits_exactly_once_when_dependency_changes_before_activation() {
    let _guard = hook_test_lock().lock().await;
    let (_dir, pool, runtime) = setup_runtime().await;
    let activation_hook = test_support::install_activation_hook().await;
    let (sink, events) = TestSink::capture();

    let subscribe = tokio::spawn(async move {
        runtime
            .subscribe(
                "SELECT id FROM daily_notes ORDER BY id".to_string(),
                vec![],
                sink,
            )
            .await
    });

    activation_hook.wait_until_reached().await;
    assert_eq!(
        next_event(&events, 0, Duration::from_secs(1)).await,
        TestEvent::Result(Vec::new())
    );

    sqlx::query("INSERT INTO daily_notes (id, date, body, user_id) VALUES (?, ?, ?, ?)")
        .bind("note-catch-up")
        .bind("2026-04-20")
        .bind("{}")
        .bind("user-catch-up")
        .execute(&pool)
        .await
        .unwrap();

    activation_hook.release().await;
    subscribe.await.unwrap().unwrap();

    assert_eq!(
        next_event(&events, 1, Duration::from_secs(1)).await,
        TestEvent::Result(vec![json!({ "id": "note-catch-up" })])
    );
    assert_no_event(&events, 2, Duration::from_millis(150)).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn catch_up_refresh_is_suppressed_when_initial_payload_matches_latest_state() {
    let _guard = hook_test_lock().lock().await;
    let (_dir, pool, runtime) = setup_runtime().await;
    let initial_payload_hook = test_support::install_initial_payload_hook().await;
    let (sink, events) = TestSink::capture();

    let subscribe = tokio::spawn(async move {
        runtime
            .subscribe(
                "SELECT id FROM daily_notes WHERE id = ?".to_string(),
                vec![json!("note-catch-up-match")],
                sink,
            )
            .await
    });

    initial_payload_hook.wait_until_reached().await;

    sqlx::query("INSERT INTO daily_notes (id, date, body, user_id) VALUES (?, ?, ?, ?)")
        .bind("note-catch-up-match")
        .bind("2026-04-25")
        .bind("{}")
        .bind("user-match")
        .execute(&pool)
        .await
        .unwrap();

    initial_payload_hook.release().await;
    subscribe.await.unwrap().unwrap();

    assert_eq!(
        next_event(&events, 0, Duration::from_secs(1)).await,
        TestEvent::Result(vec![json!({ "id": "note-catch-up-match" })])
    );
    assert_no_event(&events, 1, Duration::from_millis(150)).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn stale_init_time_broadcast_processed_after_activation_is_ignored() {
    let _guard = hook_test_lock().lock().await;
    let (_dir, pool, runtime) = setup_runtime().await;
    let hook = test_support::install_initial_payload_hook().await;
    let (sink, events) = TestSink::capture();

    let subscribe = tokio::spawn(async move {
        runtime
            .subscribe(
                "SELECT id FROM daily_notes WHERE id = ?".to_string(),
                vec![json!("note-stale-after-activation")],
                sink,
            )
            .await
    });

    hook.wait_until_reached().await;

    sqlx::query("INSERT INTO daily_notes (id, date, body, user_id) VALUES (?, ?, ?, ?)")
        .bind("note-stale-after-activation")
        .bind("2026-04-25")
        .bind("{}")
        .bind("user-stale")
        .execute(&pool)
        .await
        .unwrap();

    for idx in 0..320 {
        sqlx::query("INSERT INTO daily_notes (id, date, body, user_id) VALUES (?, ?, ?, ?)")
            .bind(format!("note-lag-{idx}"))
            .bind("2026-04-25")
            .bind("{}")
            .bind(format!("user-lag-{idx}"))
            .execute(&pool)
            .await
            .unwrap();
    }

    hook.release().await;
    subscribe.await.unwrap().unwrap();

    assert_eq!(
        next_event(&events, 0, Duration::from_secs(1)).await,
        TestEvent::Result(vec![json!({ "id": "note-stale-after-activation" })])
    );
    assert_no_event(&events, 1, Duration::from_millis(150)).await;
}
