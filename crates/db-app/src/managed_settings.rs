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

/// Caractère que `String.prototype.trim` retire en JavaScript : les blancs
/// Unicode de Rust, sauf U+0085, plus U+FEFF (marque d'ordre des octets).
fn js_trim_char(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

/// Adresse imposée telle qu'elle est stockée : débarrassée en tête et en fin
/// de ce que retire le `trim()` de l'interface. Une politique déjà déployée
/// avec un espace final reste acceptée, et le texte stocké est exactement
/// celui que l'interface réécrit en enregistrant la clé API (issue 707).
fn normalized_base_url(s: &str) -> &str {
    s.trim_matches(js_trim_char)
}

/// Adresse HTTPS sans identifiants, requête ni fragment, une fois normalisée.
///
/// Le parseur d'URL retire tabulations et sauts de ligne à l'intérieur : une
/// telle adresse, écrite brute, ne correspondrait plus à celle qu'il
/// interprète. Elles restent refusées.
fn plain_https(s: &str) -> bool {
    let s = normalized_base_url(s);
    s.len() <= 2048
        && !s.contains(['\t', '\r', '\n'])
        && url::Url::parse(s).is_ok_and(|u| {
            u.scheme() == "https"
                && u.host_str().is_some()
                && u.username().is_empty()
                && u.password().is_none()
                && u.query().is_none()
                && u.fragment().is_none()
        })
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
                    && v.get("base_url").and_then(Value::as_str).is_some_and(plain_https)
            }),
            // Miroir des modèles de transcription sur le poste (issue 683) :
            // remplace les sources compilées.
            // Même validateur que speech-host (syntheo-speech-sources) : une
            // liste acceptée ici sert telle quelle au téléchargement.
            "speech_models_urls" => value.as_array().is_some_and(|urls| {
                (1..=syntheo_speech_sources::MAX_SOURCES).contains(&urls.len())
                    && urls.iter().all(|url| {
                        url.as_str()
                            .is_some_and(|url| syntheo_speech_sources::Source::parse(url).is_some())
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

/// `managed_settings.json` beside the actual opened database, or `None` for
/// an in-memory database.
async fn policy_path(pool: &SqlitePool) -> Result<Option<std::path::PathBuf>, sqlx::Error> {
    let files: Vec<(i64, String, String)> = sqlx::query_as("PRAGMA database_list")
        .fetch_all(pool)
        .await?;
    let file = files
        .iter()
        .find(|(_, name, _)| name == "main")
        .map(|(_, _, file)| file.as_str())
        .unwrap_or("");
    if file.is_empty() {
        return Ok(None);
    }
    Ok(Some(
        std::path::Path::new(file)
            .parent()
            .ok_or_else(invalid)?
            .join("managed_settings.json"),
    ))
}

async fn read_policy(path: &std::path::Path) -> Result<BTreeMap<String, Value>, sqlx::Error> {
    match tokio::fs::read(path).await {
        Ok(bytes) => Ok(validate(&bytes)?.settings),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(sqlx::Error::Io(e)),
    }
}

/// Validated policy, read from the file and never from the database, for
/// security decisions taken in Rust: the webview can write `app_settings`
/// through `plugin:db|execute`, so the stored copy is only a mirror for the
/// interface.
#[derive(Debug, Clone, Default)]
pub struct ManagedPolicy {
    settings: BTreeMap<String, Value>,
}

impl ManagedPolicy {
    /// The on-device transcription module (issue 684) may be loaded.
    pub fn on_device_transcription_allowed(&self) -> bool {
        self.settings.get("on_device_transcription_enabled") != Some(&Value::Bool(false))
    }

    /// Sources des modèles imposées par l'organisation (issue 683), dans
    /// l'ordre ; `None` : les sources compilées.
    pub fn speech_models_urls(&self) -> Option<Vec<String>> {
        let urls = self.settings.get("speech_models_urls")?.as_array()?;
        Some(
            urls.iter()
                .filter_map(|u| u.as_str().map(str::to_owned))
                .collect(),
        )
    }
}

/// Reads the policy beside the opened database. Callers load it once and keep
/// it in memory, like the policy applied at startup.
pub async fn load_managed_policy(pool: &SqlitePool) -> Result<ManagedPolicy, sqlx::Error> {
    let settings = match policy_path(pool).await? {
        Some(path) => read_policy(&path).await?,
        None => BTreeMap::new(),
    };
    Ok(ManagedPolicy { settings })
}

/// Ligne d'`app_settings` d'une clé du fichier. La clé documentée `stt:<id>`
/// désigne le fournisseur que l'interface range sous `ai_provider:stt:<id>`
/// (providers-storage.ts) : sans cette traduction, l'adresse imposée était
/// écrite sur une ligne que personne ne lit, et les déclencheurs gardaient
/// cette ligne-là au lieu de celle du fournisseur.
fn storage_id(key: String) -> String {
    match key.strip_prefix("stt:") {
        Some(provider) => format!("ai_provider:stt:{provider}"),
        None => key,
    }
}

/// Texte écrit pour une clé du fichier. Les déclencheurs de
/// `managed_app_settings` comparent le texte : pour `stt:<id>`, la valeur
/// suit l'ordre de `setAiProvider` (providers.ts, `JSON.stringify({type,
/// base_url, api_key})`), sinon l'interface ne pourrait plus réécrire la
/// même ligne en enregistrant la clé API au trousseau (« setting is
/// managed »). serde_json, sans preserve_order, trierait les clés.
fn storage_json(key: &str, value: &Value) -> Result<String, sqlx::Error> {
    if key.starts_with("stt:") {
        let base_url = value
            .get("base_url")
            .and_then(Value::as_str)
            .map(normalized_base_url)
            .ok_or_else(invalid)?;
        let base_url = serde_json::to_string(base_url).map_err(|_| invalid())?;
        return Ok(format!(
            r#"{{"type":"stt","base_url":{base_url},"api_key":""}}"#
        ));
    }
    serde_json::to_string(value).map_err(|_| invalid())
}

/// Read policy from the directory containing the actual opened database, on
/// desktop and mobile alike. Malformed or unreadable policy fails startup.
pub async fn apply_managed_settings(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let Some(path) = policy_path(pool).await? else {
        return Ok(());
    };
    let settings = read_policy(&path).await?;
    let stop_measurement =
        settings.get("measurement_enabled") == Some(&serde_json::Value::Bool(false));
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("DELETE FROM managed_app_settings")
        .execute(&mut *tx)
        .await?;
    for (key, value) in settings {
        let json = storage_json(&key, &value)?;
        let id = storage_id(key);
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
    fn managed_settings_accept_only_plain_https_model_sources() {
        let doc = |urls: &str| {
            format!(r#"{{"schema_version":1,"settings":{{"speech_models_urls":{urls}}}}}"#)
        };
        let ok = validate(
            doc(r#"["https://miroir.drasi.example/modeles/{path}","https://b.example/{name}"]"#)
                .as_bytes(),
        )
        .unwrap();
        let policy = ManagedPolicy {
            settings: ok.settings,
        };
        assert_eq!(policy.speech_models_urls().unwrap().len(), 2);
        assert!(ManagedPolicy::default().speech_models_urls().is_none());
        for bad in [
            r#"[]"#,
            r#""https://a.example/{path}""#,
            r#"["http://a.example/{path}"]"#,
            r#"["https://user:pw@a.example/{path}"]"#,
            r#"["https://jeton@a.example/{path}"]"#,
            r#"["https://a.example/{path}?t=1"]"#,
            r#"["https://a.example/{autre}"]"#,
            r#"["https:///{path}"]"#,
            r#"["https://a.example/{path},https://b.example"]"#,
            r#"["HTTPS://a.example/{path}"]"#,
            r#"["https:a.example/{path}"]"#,
            r#"["https://a.example/{path}", "https://b.example/{path}", "https://c.example/{path}", "https://d.example/{path}", "https://e.example/{path}", "https://f.example/{path}", "https://g.example/{path}", "https://h.example/{path}", "https://i.example/{path}"]"#,
            r#"[1]"#,
            // Revue, R6 : entrées vides, et plus de 8 éléments même si
            // certains sont vides.
            r#"[""]"#,
            r#"["   "]"#,
            r#"["https://a.example/{path}", ""]"#,
            r#"["https://a.example/{path}", "https://b.example/{path}", "https://c.example/{path}", "https://d.example/{path}", "https://e.example/{path}", "https://f.example/{path}", "https://g.example/{path}", "https://h.example/{path}", ""]"#,
            r#"[]"#,
        ] {
            assert!(validate(doc(bad).as_bytes()).is_err(), "{bad}");
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

    // Issue 707 : les blancs de tête et de fin sont retirés (normalisation,
    // voir la base ci-dessous) ; tabulations et sauts de ligne à l'intérieur,
    // que le parseur d'URL retirerait en silence, restent refusés.
    #[test]
    fn managed_stt_base_url_normalizes_surrounding_but_rejects_embedded_whitespace() {
        for (base_url, ok) in [
            (" https://asr.example.com/v1", true),
            ("https://asr.example.com/v1 ", true),
            (r"\thttps://asr.example.com/v1", true),
            (r"https://asr.example.com/v1\n", true),
            (r"\ufeffhttps://asr.example.com/v1\u00a0", true),
            (r"https://asr.exa\tmple.com/v1", false),
            (r"https://asr.example.com/v\r1", false),
            (r"https://asr.example.com/v\n1", false),
            (r" http://asr.example.com/v1 ", false),
            ("   ", false),
        ] {
            let text = format!(
                r#"{{"schema_version":1,"settings":{{"stt:openai":{{"type":"stt","api_key":"","base_url":"{base_url}"}}}}}}"#
            );
            // Échappements JSON : le document est valide, seule l'adresse
            // est en cause.
            assert!(serde_json::from_str::<Value>(&text).is_ok(), "{base_url:?}");
            assert_eq!(validate(text.as_bytes()).is_ok(), ok, "{base_url:?}");
        }
    }

    // La normalisation retire exactement ce que retire `trim()` en
    // JavaScript (liste relevée avec Node : String.fromCharCode(c).trim()).
    #[test]
    fn base_url_normalization_matches_javascript_trim() {
        const JS_TRIM: &[u32] = &[
            0x9, 0xa, 0xb, 0xc, 0xd, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
            0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
            0xfeff,
        ];
        for code in 0..=0xffff_u32 {
            if let Some(c) = char::from_u32(code) {
                assert_eq!(js_trim_char(c), JS_TRIM.contains(&code), "U+{code:04X}");
            }
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

    // Issue 684, revue : la webview peut écrire en SQL ; la politique lue
    // pour une décision de sécurité vient du fichier, pas de la base.
    #[tokio::test]
    async fn rewriting_the_database_does_not_lift_the_on_device_ban() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.db");
        std::fs::write(
            dir.path().join("managed_settings.json"),
            br#"{"schema_version":1,"settings":{"on_device_transcription_enabled":false}}"#,
        )
        .unwrap();
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        sqlx::query("DELETE FROM managed_app_settings")
            .execute(db.pool())
            .await
            .unwrap();
        sqlx::query(
            "UPDATE app_settings SET value_json='true' WHERE id='on_device_transcription_enabled'",
        )
        .execute(db.pool())
        .await
        .unwrap();
        let policy = load_managed_policy(db.pool()).await.unwrap();
        assert!(!policy.on_device_transcription_allowed());
        // Sans politique : autorisé.
        let dir = tempfile::tempdir().unwrap();
        let db = syntheo_db_core::Db::connect_local_plain(&dir.path().join("app.db"))
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        assert!(
            load_managed_policy(db.pool())
                .await
                .unwrap()
                .on_device_transcription_allowed()
        );
    }

    // Issue 707 : la politique stt:<id> impose l'adresse du fournisseur sur
    // la ligne que lit l'interface, et cette ligne est verrouillée.
    #[tokio::test]
    async fn managed_stt_provider_locks_the_row_the_interface_reads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.db");
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        // Adresse saisie avant la politique : elle doit être remplacée.
        sqlx::query(
            r#"INSERT INTO app_settings(id,value_json) VALUES('ai_provider:stt:openai','{"type":"stt","base_url":"http://192.168.1.87:8000/v1","api_key":""}')"#,
        )
        .execute(db.pool())
        .await
        .unwrap();
        db.pool().close().await;
        std::fs::write(
            dir.path().join("managed_settings.json"),
            br#"{"schema_version":1,"settings":{"current_stt_provider":"openai","stt:openai":{"type":"stt","api_key":"","base_url":"https://asr.example.com/v1"}}}"#,
        )
        .unwrap();
        let db = syntheo_db_core::Db::connect_local_plain(&path)
            .await
            .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        let stored: String = sqlx::query_scalar(
            "SELECT value_json FROM app_settings WHERE id='ai_provider:stt:openai'",
        )
        .fetch_one(db.pool())
        .await
        .unwrap();
        // Même texte que JSON.stringify({type, base_url, api_key}) de
        // setAiProvider (providers.ts).
        assert_eq!(
            stored,
            r#"{"type":"stt","base_url":"https://asr.example.com/v1","api_key":""}"#
        );
        let raw: i64 = sqlx::query_scalar(
            "SELECT (SELECT count(*) FROM app_settings WHERE id='stt:openai')
                  + (SELECT count(*) FROM managed_app_settings WHERE id='stt:openai')",
        )
        .fetch_one(db.pool())
        .await
        .unwrap();
        assert_eq!(raw, 0);
        assert!(
            sqlx::query(
                r#"UPDATE app_settings SET value_json='{"type":"stt","base_url":"http://evil.example/v1","api_key":""}' WHERE id='ai_provider:stt:openai'"#,
            )
            .execute(db.pool())
            .await
            .is_err()
        );
        // Saisie de la clé API du fournisseur imposé : l'interface réécrit la
        // même valeur, dans son ordre ; l'écriture passe.
        let written = sqlx::query(
            r#"UPDATE app_settings SET value_json='{"type":"stt","base_url":"https://asr.example.com/v1","api_key":""}', updated_at='2026-11-23T00:00:00.000Z' WHERE id='ai_provider:stt:openai' AND value_json=?"#,
        )
        .bind(&stored)
        .execute(db.pool())
        .await
        .unwrap();
        assert_eq!(written.rows_affected(), 1);
        assert!(
            sqlx::query("DELETE FROM app_settings WHERE id='ai_provider:stt:openai'")
                .execute(db.pool())
                .await
                .is_err()
        );
    }

    // Issue 707 : une politique déployée avec un espace final ou une marque
    // d'ordre des octets (U+FEFF) démarre ; l'adresse est stockée normalisée,
    // et l'interface, qui réécrit JSON.stringify({type, base_url: trim(),
    // api_key}), peut enregistrer la clé API.
    #[tokio::test]
    async fn managed_stt_base_url_with_surrounding_blanks_is_normalized() {
        for raw in [
            r"https://asr.example.com/v1 ",
            r"﻿https://asr.example.com/v1",
            r" ﻿https://asr.example.com/v1　\n",
        ] {
            let dir = tempfile::tempdir().unwrap();
            std::fs::write(
                dir.path().join("managed_settings.json"),
                format!(
                    r#"{{"schema_version":1,"settings":{{"stt:openai":{{"type":"stt","api_key":"","base_url":"{raw}"}}}}}}"#
                ),
            )
            .unwrap();
            let db = syntheo_db_core::Db::connect_local_plain(&dir.path().join("app.db"))
                .await
                .unwrap();
            crate::prepare_schema(&db).await.unwrap();
            let expected = r#"{"type":"stt","base_url":"https://asr.example.com/v1","api_key":""}"#;
            let stored: String = sqlx::query_scalar(
                "SELECT value_json FROM app_settings WHERE id='ai_provider:stt:openai'",
            )
            .fetch_one(db.pool())
            .await
            .unwrap();
            assert_eq!(stored, expected, "{raw:?}");
            let managed: String = sqlx::query_scalar(
                "SELECT value_json FROM managed_app_settings WHERE id='ai_provider:stt:openai'",
            )
            .fetch_one(db.pool())
            .await
            .unwrap();
            assert_eq!(managed, expected, "{raw:?}");
            // Écriture de l'interface (persistProviderConfig) à l'enregistrement
            // de la clé API.
            let written = sqlx::query(
                "UPDATE app_settings SET value_json=?, updated_at='2026-11-23T00:00:00.000Z' WHERE id='ai_provider:stt:openai' AND value_json=?",
            )
            .bind(expected)
            .bind(&stored)
            .execute(db.pool())
            .await
            .unwrap();
            assert_eq!(written.rows_affected(), 1, "{raw:?}");
        }
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
