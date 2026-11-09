use super::*;
use clap::Parser;

async fn fixture() -> (tempfile::TempDir, Args, String) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("app.db");
    let db = syntheo_db_core::Db::connect_local_plain(&path)
        .await
        .unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    for statement in [
        "INSERT INTO app_settings(id,value_json) VALUES('cloud_sync_enabled','false')",
        "INSERT INTO sessions(id,title,started_at,ended_at) VALUES('meeting-1','Raw title','2026-10-01T10:00:00Z','2026-10-01T10:30:00Z')",
        "INSERT INTO sessions(id,title) VALUES('other','Keep this meeting')",
        "INSERT INTO session_documents(id,session_id,kind,body_format,body) VALUES('note-1','meeting-1','note','markdown','Raw historical note')",
        "UPDATE session_documents SET body='Raw current note' WHERE id='note-1'",
        r#"INSERT INTO transcripts(id,session_id,ended_at_ms,words_json) VALUES('transcript-1','meeting-1',1000,'[{"text":"Raw private word","start_ms":0,"end_ms":1000,"channel":0,"state":"final"}]')"#,
        "INSERT INTO transcript_live_state(transcript_id) VALUES('transcript-1')",
        r#"INSERT INTO transcript_live_deltas(id,transcript_id,sequence,delta_json) VALUES('delta-1','transcript-1',0,'{"new_words":["Raw partial"],"replaced_ids":[],"partials":[]}')"#,
    ] {
        sqlx::query(statement).execute(db.pool()).await.unwrap();
    }
    let exported = syntheo_agent_access::get_local_meeting_export(db.pool(), "meeting-1".into())
        .await
        .unwrap();
    let bytes = format!(
        "{}\n",
        output::json("meetings.export", &exported, None).unwrap()
    );
    let hash = Sha256::digest(bytes.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    db.pool().close().await;
    for folder in [
        "sessions/project/meeting-1",
        "sessions/old/meeting-1",
        "search_index",
    ] {
        std::fs::create_dir_all(dir.path().join(folder)).unwrap();
        std::fs::write(dir.path().join(folder).join("audio.wav"), b"Raw audio").unwrap();
    }
    let args = Args::try_parse_from([
        "syntheo",
        "--json",
        "--db-path",
        path.to_str().unwrap(),
        "meetings",
        "--source",
        "local",
        "list",
    ])
    .unwrap();
    (dir, args, hash)
}

#[tokio::test]
async fn saved_export_file_hash_is_accepted() {
    let (dir, args, _) = fixture().await;
    let db = db::open(&args).await.unwrap();
    let exported = syntheo_agent_access::get_local_meeting_export(db.pool(), "meeting-1".into())
        .await
        .unwrap();
    let body = output::json("meetings.export", &exported, None).unwrap();
    db.pool().close().await;
    let hash = Sha256::digest(body.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    run(&args, "meeting-1", &hash, true).await.unwrap();
    assert!(
        !dir.path()
            .join("sessions/project/meeting-1/audio.wav")
            .exists()
    );
}

#[tokio::test]
async fn pending_proposal_blocks_purge() {
    let (dir, args, hash) = fixture().await;
    let db = db::open_write(&args).await.unwrap();
    sqlx::query("INSERT INTO session_proposals(id,session_id) VALUES('proposal-1','meeting-1')")
        .execute(db.pool())
        .await
        .unwrap();
    db.pool().close().await;
    assert!(run(&args, "meeting-1", &hash, true).await.is_err());
    assert!(
        dir.path()
            .join("sessions/project/meeting-1/audio.wav")
            .exists()
    );
}

#[tokio::test]
async fn conditional_purge_removes_history_partials_audio_and_index() {
    let (dir, args, hash) = fixture().await;
    assert!(
        run(&args, "meeting-1", &"0".repeat(64), true)
            .await
            .is_err()
    );
    assert!(
        dir.path()
            .join("sessions/project/meeting-1/audio.wav")
            .exists()
    );
    run(&args, "meeting-1", &hash, true).await.unwrap();
    let db = db::open(&args).await.unwrap();
    for table in [
        "session_documents",
        "session_document_versions",
        "transcripts",
        "transcript_live_state",
        "transcript_live_deltas",
        "local_meeting_purges",
    ] {
        let count: i64 =
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(db.pool())
                .await
                .unwrap();
        assert_eq!(count, 0, "{table}");
    }
    let remaining: String = sqlx::query_scalar("SELECT title FROM sessions WHERE id='other'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(remaining, "Keep this meeting");
    db.pool().close().await;
    assert!(!dir.path().join("sessions/project/meeting-1").exists());
    assert!(!dir.path().join("sessions/old/meeting-1").exists());
    assert!(!dir.path().join("search_index").exists());
    let bytes = std::fs::read(dir.path().join("app.db")).unwrap();
    assert!(!bytes.windows(11).any(|w| w == b"Raw private"));
    assert!(!bytes.windows(10).any(|w| w == b"Raw histor"));
}

#[tokio::test]
async fn incomplete_and_running_recordings_are_kept_and_cleanup_can_resume() {
    let (dir, args, hash) = fixture().await;
    let lock = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(dir.path().join("fr.willisback.syntheo.running.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    assert!(run(&args, "meeting-1", &hash, true).await.is_err());
    drop(lock);
    let db = db::open_write(&args).await.unwrap();
    sqlx::query("UPDATE transcripts SET ended_at_ms=NULL WHERE id='transcript-1'")
        .execute(db.pool())
        .await
        .unwrap();
    let exported = syntheo_agent_access::get_local_meeting_export(db.pool(), "meeting-1".into())
        .await
        .unwrap();
    let bytes = format!(
        "{}\n",
        output::json("meetings.export", &exported, None).unwrap()
    );
    let incomplete = Sha256::digest(bytes.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    db.pool().close().await;
    assert!(run(&args, "meeting-1", &incomplete, true).await.is_err());
    let db = db::open_write(&args).await.unwrap();
    let mut tx = db.pool().begin().await.unwrap();
    syntheo_db_app::purge_local_session(&mut tx, "meeting-1")
        .await
        .unwrap();
    sqlx::query("INSERT INTO local_meeting_purges VALUES('meeting-1',?,'[\"sessions/project/meeting-1\",\"sessions/old/meeting-1\",\"search_index\"]')").bind(&hash).execute(&mut *tx).await.unwrap();
    tx.commit().await.unwrap();
    db.pool().close().await;
    // A journal is replayed by the exact original snapshot only.
    assert!(run(&args, "meeting-1", &incomplete, true).await.is_err());
    run(&args, "meeting-1", &hash, true).await.unwrap();
    assert!(!dir.path().join("sessions/project/meeting-1").exists());
}
#[tokio::test]
async fn first_launch_initialization_requires_managed_policy_and_never_enables_intelligence() {
    let dir = tempfile::tempdir().unwrap();
    let args = Args::try_parse_from([
        "syntheo",
        "--json",
        "--base",
        dir.path().to_str().unwrap(),
        "meetings",
        "--source",
        "local",
        "initialize-managed",
    ])
    .unwrap();
    assert!(initialize_managed(&args, true).await.is_err());
    assert!(!dir.path().join("app.db").exists());
    std::fs::write(dir.path().join("managed_settings.json"),br#"{"schema_version":1,"settings":{"intelligence_disabled":true,"cloud_sync_enabled":false,"automatic_updates":false}}"#).unwrap();
    initialize_managed(&args, true).await.unwrap();
    let db = db::open(&args).await.unwrap();
    let values: Vec<(String, String)> =
        sqlx::query_as("SELECT id,value_json FROM managed_app_settings ORDER BY id")
            .fetch_all(db.pool())
            .await
            .unwrap();
    assert_eq!(
        values.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>(),
        [
            "automatic_updates",
            "cloud_sync_enabled",
            "intelligence_disabled"
        ]
    );
    assert!(values.iter().all(|(id, value)| value
        == if id == "intelligence_disabled" {
            "true"
        } else {
            "false"
        }));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions")
            .fetch_one(db.pool())
            .await
            .unwrap(),
        0
    );
    db.pool().close().await;
}
