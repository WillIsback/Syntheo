use serde::Deserialize;
use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::BTreeMap;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagedSettings {
    schema_version: u32,
    settings: BTreeMap<String, Value>,
}

fn invalid() -> sqlx::Error {
    sqlx::Error::Protocol("invalid managed settings file".into())
}

fn validate(bytes: &[u8]) -> Result<ManagedSettings, sqlx::Error> {
    if bytes.len() > 64 * 1024 {
        return Err(invalid());
    }
    let doc: ManagedSettings = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    if doc.schema_version != 1 {
        return Err(invalid());
    }
    for (key, value) in &doc.settings {
        let valid = match key.as_str() {
            "cloud_sync_enabled"
            | "automatic_updates"
            | "measurement_enabled"
            | "calibration_enabled"
            // Module de transcription sur le poste (issue 684) : à false, il
            // n'est jamais chargé.
            | "on_device_transcription_enabled" => value == &Value::Bool(false),
            "intelligence_disabled" => value == &Value::Bool(true),
            "auto_start_scheduled_meetings" | "save_recordings" => value.is_boolean(),
            "current_llm_provider" | "current_llm_model" => value.as_str() == Some(""),
            "audio_retention" => value.as_str() == Some("none"),
            "current_stt_provider" => matches!(value.as_str(), Some("openai" | "nvidia")),
            "current_stt_model" => value
                .as_str()
                .is_some_and(|s| !s.is_empty() && s.len() <= 200),
            "stt:openai" | "stt:nvidia" => value.as_object().is_some_and(|v| {
                v.len() == 3
                    && v.get("type").and_then(Value::as_str) == Some("stt")
                    && v.get("api_key").and_then(Value::as_str) == Some("")
                    && v.get("base_url").and_then(Value::as_str).is_some_and(|s| {
                        s.len() <= 2048
                            && url::Url::parse(s).is_ok_and(|u| {
                                u.scheme() == "https"
                                    && u.host_str().is_some()
                                    && u.username().is_empty()
                                    && u.password().is_none()
                                    && u.query().is_none()
                                    && u.fragment().is_none()
                            })
                    })
            }),
            _ => false,
        };
        if !valid {
            return Err(invalid());
        }
    }
    Ok(doc)
}

/// Read policy from the directory containing the actual opened database, on
/// desktop and mobile alike. Malformed or unreadable policy fails startup.
pub async fn apply_managed_settings(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let files: Vec<(i64, String, String)> = sqlx::query_as("PRAGMA database_list")
        .fetch_all(pool)
        .await?;
    let file = files
        .iter()
        .find(|(_, name, _)| name == "main")
        .map(|(_, _, file)| file.as_str())
        .unwrap_or("");
    if file.is_empty() {
        return Ok(());
    }
    let path = std::path::Path::new(file)
        .parent()
        .ok_or_else(invalid)?
        .join("managed_settings.json");
    let settings = match tokio::fs::read(path).await {
        Ok(bytes) => validate(&bytes)?.settings,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
        Err(e) => return Err(sqlx::Error::Io(e)),
    };
    let stop_measurement =
        settings.get("measurement_enabled") == Some(&serde_json::Value::Bool(false));
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("DELETE FROM managed_app_settings")
        .execute(&mut *tx)
        .await?;
    for (id, value) in settings {
        let json = serde_json::to_string(&value).map_err(|_| invalid())?;
        sqlx::query("INSERT INTO app_settings(id,value_json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
            .bind(&id).bind(&json).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO managed_app_settings(id,value_json) VALUES(?,?)")
            .bind(id)
            .bind(json)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    // Mesure de la bêta (issue 672) imposée à false : comme une désactivation,
    // la copie des synthèses générées est vidée, en effacement sûr, et les
    // générations ouvertes sont closes. Après la politique et au mieux : une
    // erreur ici est journalisée et n'empêche jamais le démarrage.
    if stop_measurement && let Err(error) = stop_beta_measurement(pool).await {
        let kind = error
            .as_database_error()
            .and_then(|e| e.code())
            .map_or_else(|| "other".to_owned(), |code| format!("sqlite:{code}"));
        tracing::warn!(kind, "managed beta measurement cleanup skipped");
    }
    Ok(())
}

async fn stop_beta_measurement(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("PRAGMA secure_delete = ON")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM summary_generated_bodies")
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE beta_generations SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE closed_at IS NULL",
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn managed_settings_require_no_audio_retention() {
        assert!(validate(br#"{"schema_version":1,"settings":{"audio_retention":"none"}}"#).is_ok());
        assert!(
            validate(br#"{"schema_version":1,"settings":{"audio_retention":"forever"}}"#).is_err()
        );
    }
    #[test]
    fn secrets_and_unsafe_values_are_rejected() {
        assert!(validate(br#"{"schema_version":1,"settings":{"intelligence_disabled":true,"cloud_sync_enabled":false}}"#).is_ok());
        assert!(
            validate(
                br#"{"schema_version":1,"settings":{"on_device_transcription_enabled":false}}"#
            )
            .is_ok()
        );
        for text in [
            r#"{"schema_version":1,"settings":{"cloud_sync_enabled":true}}"#,
            r#"{"schema_version":1,"settings":{"on_device_transcription_enabled":true}}"#,
            r#"{"schema_version":1,"settings":{"api_key":"secret"}}"#,
            r#"{"schema_version":2,"settings":{}}"#,
        ] {
            assert!(validate(text.as_bytes()).is_err());
        }
    }
    #[test]
    fn managed_settings_accept_on_prem_stt_providers() {
        for provider in ["openai", "nvidia"] {
            let text = format!(
                r#"{{"schema_version":1,"settings":{{"current_stt_provider":"{provider}","current_stt_model":"nemotron-3.5-asr-streaming-0.6b.q8_0","stt:{provider}":{{"type":"stt","api_key":"","base_url":"https://asr.example.com/v1/realtime"}}}}}}"#
            );
            assert!(validate(text.as_bytes()).is_ok(), "{provider}");
        }
        for text in [
            r#"{"schema_version":1,"settings":{"current_stt_provider":"custom"}}"#,
            r#"{"schema_version":1,"settings":{"stt:custom":{"type":"stt","api_key":"","base_url":"https://asr.example"}}}"#,
            r#"{"schema_version":1,"settings":{"stt:nvidia":{"type":"stt","api_key":"secret","base_url":"https://asr.example"}}}"#,
        ] {
            assert!(validate(text.as_bytes()).is_err(), "{text}");
        }
    }
    #[tokio::test]
    // Vérification 0.8.0, point 1c : une erreur du nettoyage de la bêta (ici,
    // table absente) n'empêche ni le démarrage ni l'application de la
    // politique.
    async fn a_beta_cleanup_error_never_blocks_startup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.db");
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        sqlx::query("DROP TABLE beta_generations")
            .execute(db.pool())
            .await
            .unwrap();
        db.pool().close().await;
        std::fs::write(
            dir.path().join("managed_settings.json"),
            br#"{"schema_version":1,"settings":{"measurement_enabled":false}}"#,
        )
        .unwrap();
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        let value: String = sqlx::query_scalar(
            "SELECT value_json FROM app_settings WHERE id = 'measurement_enabled'",
        )
        .fetch_one(db.pool())
        .await
        .unwrap();
        assert_eq!(value, "false");
        let managed: i64 = sqlx::query_scalar("SELECT count(*) FROM managed_app_settings")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(managed, 1);
    }

    #[tokio::test]
    // Vérification 0.8.0, point 4 : une mesure imposée à false au démarrage
    // vide la copie des synthèses générées et clôt les générations.
    async fn managed_measurement_off_clears_the_beta_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.db");
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        for sql in [
            "INSERT INTO summary_generated_bodies (document_id, session_id, body_format, body, generated_at) VALUES ('note-1', 'session-1', 'prosemirror_json', '{}', '2026-11-22T08:00:00.000Z')",
            "INSERT INTO beta_generations (document_id, session_id, generated_at) VALUES ('note-1', 'session-1', '2026-11-22T08:00:00.000Z')",
        ] {
            sqlx::query(sql).execute(db.pool()).await.unwrap();
        }
        db.pool().close().await;
        std::fs::write(
            dir.path().join("managed_settings.json"),
            br#"{"schema_version":1,"settings":{"measurement_enabled":false}}"#,
        )
        .unwrap();
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        let bodies: i64 = sqlx::query_scalar("SELECT count(*) FROM summary_generated_bodies")
            .fetch_one(db.pool())
            .await
            .unwrap();
        let open: i64 =
            sqlx::query_scalar("SELECT count(*) FROM beta_generations WHERE closed_at IS NULL")
                .fetch_one(db.pool())
                .await
                .unwrap();
        assert_eq!((bodies, open), (0, 0));
    }

    #[tokio::test]
    async fn startup_policy_locks_settings_and_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.db");
        std::fs::write(dir.path().join("managed_settings.json"),br#"{"schema_version":1,"settings":{"intelligence_disabled":true,"cloud_sync_enabled":false}}"#).unwrap();
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        assert!(
            sqlx::query("UPDATE app_settings SET value_json='true' WHERE id='cloud_sync_enabled'")
                .execute(db.pool())
                .await
                .is_err()
        );
        assert!(
            sqlx::query("DELETE FROM app_settings WHERE id='intelligence_disabled'")
                .execute(db.pool())
                .await
                .is_err()
        );
        assert!(
            sqlx::query("UPDATE app_settings SET id='unmanaged' WHERE id='intelligence_disabled'")
                .execute(db.pool())
                .await
                .is_err()
        );
        sqlx::query("UPDATE app_settings SET value_json='true' WHERE id='intelligence_disabled'")
            .execute(db.pool())
            .await
            .unwrap();
        db.pool().close().await;
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        let disabled: String = sqlx::query_scalar(
            "SELECT value_json FROM app_settings WHERE id='intelligence_disabled'",
        )
        .fetch_one(db.pool())
        .await
        .unwrap();
        assert_eq!(disabled, "true");
        std::fs::write(
            dir.path().join("managed_settings.json"),
            br#"{"schema_version":1,"settings":{"intelligence_disabled":true}}"#,
        )
        .unwrap();
        apply_managed_settings(db.pool()).await.unwrap();
        sqlx::query("UPDATE app_settings SET value_json='true' WHERE id='cloud_sync_enabled'")
            .execute(db.pool())
            .await
            .unwrap();
        assert!(
            sqlx::query("DELETE FROM app_settings WHERE id='intelligence_disabled'")
                .execute(db.pool())
                .await
                .is_err()
        );
        std::fs::write(dir.path().join("managed_settings.json"), b"malformed").unwrap();
        assert!(apply_managed_settings(db.pool()).await.is_err());
        assert!(
            sqlx::query("DELETE FROM app_settings WHERE id='intelligence_disabled'")
                .execute(db.pool())
                .await
                .is_err()
        );
    }
}
