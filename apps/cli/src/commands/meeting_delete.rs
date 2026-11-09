use crate::{Args, Error, Result, db, output};
use sha2::{Digest, Sha256};
use sqlx::Connection;
use std::path::{Component, Path, PathBuf};

fn invalid(reason: &'static str) -> Error {
    Error::operation("delete meeting", reason)
}

/// Call only while the desktop app is closed. The agent enforces this too.
fn closed(base: &Path) -> Result<Vec<std::fs::File>> {
    let mut locks = Vec::new();
    for name in [
        "launch.lock",
        "fr.willisback.syntheo.running.lock",
        "fr.willisback.syntheo.dev.running.lock",
    ] {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(base.join(name))
            .map_err(|_| invalid("cannot lock recorder"))?;
        file.try_lock()
            .map_err(|_| invalid("close Syntheo before deletion"))?;
        locks.push(file);
    }
    Ok(locks)
}

fn contained(base: &Path, relative: &str) -> Result<PathBuf> {
    let relative = Path::new(relative);
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(invalid("invalid recording path"));
    }
    let path = base.join(relative);
    let mut existing = path.as_path();
    while !existing.exists() {
        existing = existing
            .parent()
            .ok_or_else(|| invalid("invalid recording path"))?;
    }
    if !existing
        .canonicalize()
        .map_err(|_| invalid("recording path unavailable"))?
        .starts_with(base)
    {
        return Err(invalid("recording path escapes storage"));
    }
    Ok(path)
}
fn find_sessions(base: &Path, id: &str, found: &mut Vec<PathBuf>) -> Result<()> {
    let entries = match std::fs::read_dir(base) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(invalid("recording directory unavailable")),
    };
    for entry in entries {
        let entry = entry.map_err(|_| invalid("recording directory unavailable"))?;
        if !entry
            .file_type()
            .map_err(|_| invalid("recording metadata unavailable"))?
            .is_dir()
        {
            continue;
        }
        if entry.file_name() == id {
            found.push(entry.path());
        } else {
            find_sessions(&entry.path(), id, found)?;
        }
    }
    Ok(())
}

pub async fn initialize_managed(args: &Args, json: bool) -> Result<()> {
    let path = db::resolve_path(args)?;
    let base = path
        .parent()
        .ok_or_else(|| invalid("storage unavailable"))?;
    if !base.join("managed_settings.json").is_file() {
        return Err(invalid("managed policy required before initialization"));
    }
    let _locks = closed(base)?;
    let db = syntheo_db_core::Db::connect_local_plain(&path)
        .await
        .map_err(|_| invalid("cannot initialize recorder database"))?;
    syntheo_db_app::prepare_schema(&db)
        .await
        .map_err(|_| invalid("cannot apply managed recorder policy"))?;
    let protected:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM managed_app_settings WHERE id='intelligence_disabled' AND value_json='true')").fetch_one(db.pool()).await.map_err(|_|invalid("cannot verify managed policy"))?;
    db.pool().close().await;
    if !protected {
        return Err(invalid(
            "managed capture policy requires intelligence disabled",
        ));
    }
    output::emit(&if json {
        output::json(
            "meetings.initialize-managed",
            &serde_json::json!({"managed":true}),
            None,
        )?
    } else {
        "Managed recorder initialized.".into()
    });
    Ok(())
}

pub async fn run(args: &Args, id: &str, expected: &str, json: bool) -> Result<()> {
    if expected.len() != 64
        || !expected.bytes().all(|b| b.is_ascii_hexdigit())
        || id.is_empty()
        || id == "."
        || id == ".."
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(invalid("invalid snapshot identity"));
    }
    let path = db::resolve_path(args)?;
    let base = path
        .parent()
        .ok_or_else(|| invalid("storage unavailable"))?
        .canonicalize()
        .map_err(|_| invalid("storage unavailable"))?;
    let _locks = closed(&base)?;
    let writer = db::open_write(args).await?;
    let mut connection = writer
        .pool()
        .acquire()
        .await
        .map_err(|_| invalid("cannot open meeting"))?;
    sqlx::query("PRAGMA secure_delete=ON")
        .execute(&mut *connection)
        .await
        .map_err(|_| invalid("cannot secure local purge"))?;
    let mut tx = connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|_| invalid("cannot lock meeting"))?;
    let pending: Option<(String, String)> = sqlx::query_as(
        "SELECT export_sha256,paths_json FROM local_meeting_purges WHERE meeting_id=?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| invalid("managed capture migration is required"))?;
    let paths = if let Some((hash, paths)) = pending {
        if hash != expected {
            return Err(invalid("snapshot changed"));
        }
        serde_json::from_str::<Vec<String>>(&paths).map_err(|_| invalid("invalid purge journal"))?
    } else {
        // A separate read-only pool observes the committed snapshot while our
        // IMMEDIATE transaction prevents all competing writers.
        let reader = db::open(args).await?;
        let exported =
            syntheo_agent_access::get_local_meeting_export(reader.pool(), id.to_owned()).await?;
        reader.pool().close().await;
        // Stdout ends with a newline; `--output` files do not. Accept either.
        let body = output::json("meetings.export", &exported, None)?;
        let digest = |text: &str| {
            Sha256::digest(text.as_bytes())
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        };
        if digest(&format!("{body}\n")) != expected && digest(&body) != expected {
            return Err(invalid("snapshot changed"));
        }
        if exported.capture_pending
            || exported.export.meeting.started_at.is_empty()
            || exported.export.meeting.ended_at.is_empty()
            || exported.export.transcripts.is_empty()
            || exported.export.transcripts.iter().any(|t| {
                t.ended_at_ms.is_none()
                    || t.words.is_empty()
                    || t.words.iter().any(|w| w["state"] != "final")
            })
        {
            return Err(invalid("transcription is incomplete"));
        }
        // Pending proposals are not part of the export, so purging would
        // silently discard edits made after it.
        let pending_proposals: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM session_proposals WHERE session_id=? AND status='pending')",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| invalid("cannot read proposals"))?;
        if pending_proposals {
            return Err(invalid("meeting has pending proposals"));
        }
        let mut paths = vec!["search_index".to_string()];
        let mut sessions = Vec::new();
        find_sessions(&base.join("sessions"), id, &mut sessions)?;
        for session in sessions {
            paths.push(
                session
                    .strip_prefix(&base)
                    .map_err(|_| invalid("recording path escapes storage"))?
                    .to_string_lossy()
                    .into_owned(),
            );
        }
        for relative in &paths {
            contained(&base, relative)?;
        }
        syntheo_db_app::purge_local_session(&mut tx, id)
            .await
            .map_err(|_| invalid("cannot purge local meeting"))?;
        let encoded =
            serde_json::to_string(&paths).map_err(|_| invalid("cannot persist purge journal"))?;
        sqlx::query(
            "INSERT INTO local_meeting_purges(meeting_id,export_sha256,paths_json) VALUES(?,?,?)",
        )
        .bind(id)
        .bind(expected)
        .bind(encoded)
        .execute(&mut *tx)
        .await
        .map_err(|_| invalid("cannot persist purge journal"))?;
        paths
    };
    tx.commit()
        .await
        .map_err(|_| invalid("cannot commit local purge"))?;
    let (busy, _, _): (i64, i64, i64) = sqlx::query_as("PRAGMA wal_checkpoint(TRUNCATE)")
        .fetch_one(&mut *connection)
        .await
        .map_err(|_| invalid("database cleanup awaits retry"))?;
    if busy != 0 {
        return Err(invalid("database cleanup awaits retry"));
    }
    sqlx::query("VACUUM")
        .execute(&mut *connection)
        .await
        .map_err(|_| invalid("database cleanup awaits retry"))?;
    // Keep the journal until every recording and derived search artifact has
    // gone. Retrying the same snapshot resumes after an interrupted removal.
    for relative in paths {
        let target = contained(&base, &relative)?;
        match tokio::fs::remove_dir_all(&target).await {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err(invalid("recording cleanup awaits retry")),
        }
    }
    sqlx::query("DELETE FROM local_meeting_purges WHERE meeting_id=? AND export_sha256=?")
        .bind(id)
        .bind(expected)
        .execute(&mut *connection)
        .await
        .map_err(|_| invalid("purge cleanup awaits retry"))?;
    let rendered = if json {
        output::json(
            "meetings.delete",
            &serde_json::json!({"meeting_id":id,"deleted":true,"export_sha256":expected}),
            None,
        )?
    } else {
        "Meeting permanently deleted.".to_string()
    };
    output::emit(&rendered);
    Ok(())
}

#[cfg(test)]
mod tests;
