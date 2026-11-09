use super::*;
use sqlx::SqlitePool;
use syntheo_db_core::Db;
use syntheo_transcript::{FinalizedWord, PartialWord, WordState};

struct PoolJournalStore(SqlitePool);

impl JournalStore for PoolJournalStore {
    fn append(
        &self,
        target: LiveTranscriptInsert,
        delta_jsons: Vec<String>,
    ) -> BoxFuture<'static, Result<AppendOutcome, String>> {
        let pool = self.0.clone();
        Box::pin(async move {
            append_live_transcript_deltas(&pool, &target, &delta_jsons)
                .await
                .map_err(|error| error.to_string())
        })
    }
}

fn target() -> LiveTranscriptTarget {
    LiveTranscriptTarget {
        transcript_id: "transcript-1".to_string(),
        owner_user_id: "owner-1".to_string(),
        created_at: "2026-08-15T12:00:00.000Z".to_string(),
        started_at_ms: 100,
        memo: String::new(),
        provider: Some("test-provider".to_string()),
        model: Some("test-model".to_string()),
    }
}

fn word(id: &str, end_ms: i64, state: WordState) -> FinalizedWord {
    FinalizedWord {
        id: id.to_string(),
        text: id.to_string(),
        start_ms: end_ms - 100,
        end_ms,
        channel: 0,
        state,
        speaker_index: None,
    }
}

fn delta(words: Vec<FinalizedWord>) -> LiveTranscriptDelta {
    LiveTranscriptDelta {
        new_words: words,
        replaced_ids: vec!["replaced-word".to_string()],
        partials: vec![PartialWord {
            text: "uncommitted".to_string(),
            start_ms: 0,
            end_ms: 50,
            channel: 0,
            speaker_index: None,
        }],
    }
}

#[tokio::test]
async fn appends_deltas_and_flushes_with_final_word_progress() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, owner_user_id)
             VALUES ('session-1', 'workspace-1', 'owner-1')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    let pool = db.pool().clone();
    let registry = LiveJournalRegistry::default();
    let events = Arc::new(StdMutex::new(Vec::new()));
    let event_sink_events = events.clone();
    registry
        .register(
            "session-1".to_string(),
            target(),
            Arc::new(PoolJournalStore(pool.clone())),
            Arc::new(move |status| {
                event_sink_events.lock().unwrap().push(status);
            }),
        )
        .unwrap();

    let journal = registry.get("session-1").unwrap().unwrap();
    journal.append(delta(vec![word("final-1", 500, WordState::Final)]));
    journal.append(delta(vec![
        word("final-2", 800, WordState::Final),
        word("pending", 1200, WordState::Pending),
    ]));

    let status = journal.flush().await.unwrap();
    assert!(status.transcript_created);
    assert_eq!(status.persisted_through_ms, Some(800));
    assert_eq!(status.error, None);

    let deltas = sqlx::query_scalar::<_, String>(
        "SELECT delta_json FROM transcript_live_deltas
             WHERE transcript_id = 'transcript-1'
             ORDER BY sequence",
    )
    .fetch_all(db.pool())
    .await
    .unwrap();
    assert_eq!(deltas.len(), 2);
    for delta_json in deltas {
        let stored: serde_json::Value = serde_json::from_str(&delta_json).unwrap();
        assert_eq!(stored["partials"], serde_json::json!([]));
    }

    assert!(
        events
            .lock()
            .unwrap()
            .iter()
            .any(|status| status.transcript_created
                && status.persisted_through_ms == Some(800)
                && status.error.is_none())
    );
}

#[tokio::test]
async fn rejected_registration_restores_previous_journal() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, owner_user_id)
             VALUES ('session-1', 'workspace-1', 'owner-1')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    let registry = LiveJournalRegistry::default();
    let store = || Arc::new(PoolJournalStore(db.pool().clone())) as JournalStoreHandle;
    let event_sink: EventSink = Arc::new(|_| {});
    let mut target_a = target();
    target_a.transcript_id = "transcript-A".to_string();
    let (_, previous) = registry
        .register(
            "session-1".to_string(),
            target_a,
            store(),
            event_sink.clone(),
        )
        .unwrap();
    assert!(previous.is_none());

    let mut target_b = target();
    target_b.transcript_id = "transcript-B".to_string();
    let (registered_b, previous_a) = registry
        .register("session-1".to_string(), target_b, store(), event_sink)
        .unwrap();
    registry
        .rollback_registration("session-1", &registered_b, previous_a)
        .unwrap();

    let journal_a = registry.get("session-1").unwrap().unwrap();
    assert_eq!(journal_a.transcript_id, "transcript-A");
    journal_a.append(delta(vec![word("restored-word", 500, WordState::Final)]));
    assert!(journal_a.flush().await.unwrap().transcript_created);

    let journaled_deltas: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM transcript_live_deltas
             WHERE transcript_id = 'transcript-A'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(journaled_deltas, 1);

    registry.release_session("session-1").unwrap();
}
