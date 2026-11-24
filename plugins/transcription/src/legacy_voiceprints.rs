use std::time::Duration;

use tauri::Manager;

const DB_WAIT: Duration = Duration::from_secs(1);
const DB_ATTEMPTS: usize = 30;

/// Efface au démarrage les empreintes vocales laissées par Syntheo : les
/// secrets du trousseau d'abord, puis les tables qui les référencent.
pub(crate) fn spawn<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        for _ in 0..DB_ATTEMPTS {
            if let Some(runtime) = app
                .try_state::<tauri_plugin_db::ManagedState>()
                .map(|state| state.inner().clone())
            {
                let secrets_app = app.clone();
                if let Err(error) = purge_after_startup(&runtime, move |scope, key| {
                    tauri_plugin_store2::delete_secret_blocking(&secrets_app, scope, key)
                })
                .await
                {
                    tracing::warn!(%error, "legacy_voiceprint_purge_failed");
                }
                return;
            }
            tokio::time::sleep(DB_WAIT).await;
        }
        tracing::warn!("legacy_voiceprint_purge_skipped_without_db");
    });
}

/// Le pool est exposé dès le `setup` du plugin db, avant les migrations : la
/// purge attend leur fin, sinon elle supprime `voiceprint_exemplars` pendant
/// qu'elles tournent et la migration 20260903120000 échoue (issue #520).
///
/// Les secrets sont effacés hors du runtime async (`spawn_blocking`) : sous
/// Linux, le trousseau (keyring, zbus) démarre son propre runtime, et
/// l'appeler depuis une tâche tokio paniquait (« Cannot start a runtime from
/// within a runtime »), empoisonnait l'accès au trousseau et rendait la clé
/// ASR illisible à chaque lancement (issue 709).
async fn purge_after_startup(
    runtime: &tauri_plugin_db::ManagedState,
    mut delete_secret: impl FnMut(&str, &str) -> Result<(), String> + Send + 'static,
) -> Result<(), String> {
    runtime
        .wait_until_ready()
        .await
        .map_err(|error| format!("database startup failed: {error}"))?;
    let secrets = syntheo_db_app::legacy_voiceprint_secrets(runtime.pool()).await?;
    if !secrets.is_empty() {
        tokio::task::spawn_blocking(move || {
            secrets
                .iter()
                .try_for_each(|(scope, key)| delete_secret(scope, key))
        })
        .await
        .map_err(|error| format!("secret deletion task failed: {error}"))??;
    }
    syntheo_db_app::drop_legacy_voiceprint_tables(runtime.pool()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn unstarted_runtime() -> tauri_plugin_db::ManagedState {
        let db = tauri_plugin_db::open_app_db_unmigrated(None).await.unwrap();
        std::sync::Arc::new(tauri_plugin_db::PluginDbRuntime::new(std::sync::Arc::new(
            db,
        )))
    }

    async fn table_exists(runtime: &tauri_plugin_db::ManagedState, name: &str) -> bool {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?)",
        )
        .bind(name)
        .fetch_one(runtime.pool())
        .await
        .unwrap()
    }

    // Issue #520 : le pool existe avant la fin des migrations. Une purge qui
    // n'attend que lui supprime `voiceprint_exemplars` pendant qu'elles
    // tournent, puis la migration 20260903120000 échoue.
    #[tokio::test]
    async fn the_purge_waits_until_the_migrations_are_done() {
        let runtime = unstarted_runtime().await;

        let purge = tokio::spawn({
            let runtime = runtime.clone();
            async move { purge_after_startup(&runtime, |_, _| Ok(())).await }
        });
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(
            !purge.is_finished(),
            "la purge ne doit pas partir avant la fin des migrations"
        );

        runtime.run_startup().await;
        runtime.wait_until_ready().await.unwrap();
        purge.await.unwrap().unwrap();

        assert!(!table_exists(&runtime, "voiceprint_exemplars").await);
        assert!(!table_exists(&runtime, "voiceprint_candidates").await);
    }

    // Issue 709 : le trousseau Linux démarre son propre runtime pour effacer
    // un secret. Appelé depuis une tâche tokio, il paniquait ; la purge
    // l'appelle désormais hors du runtime, avec des empreintes en base.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn secrets_are_deleted_outside_the_async_runtime() {
        let runtime = unstarted_runtime().await;
        runtime.run_startup().await;
        runtime.wait_until_ready().await.unwrap();
        sqlx::raw_sql(
            "PRAGMA ignore_check_constraints = ON;
             INSERT INTO voiceprint_exemplars (id, keyring_key) VALUES ('exemplar-1', 'exemplar-1');
             INSERT INTO voiceprint_candidates (id, keyring_key) VALUES ('candidate-1', 'candidate-1');
             PRAGMA ignore_check_constraints = OFF;",
        )
        .execute(runtime.pool())
        .await
        .unwrap();

        let deleted = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let seen = deleted.clone();
        purge_after_startup(&runtime, move |scope, key| {
            // Comme keyring/zbus : un runtime local et `block_on`.
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|error| error.to_string())?
                .block_on(async { seen.lock().unwrap().push(format!("{scope}:{key}")) });
            Ok(())
        })
        .await
        .unwrap();

        let mut deleted = deleted.lock().unwrap().clone();
        deleted.sort();
        assert_eq!(deleted.len(), 2, "{deleted:?}");
        assert!(!table_exists(&runtime, "voiceprint_exemplars").await);
        assert!(!table_exists(&runtime, "voiceprint_candidates").await);
    }

    // Un secret qui résiste laisse les tables pour le prochain lancement.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_failed_secret_deletion_keeps_the_tables() {
        let runtime = unstarted_runtime().await;
        runtime.run_startup().await;
        runtime.wait_until_ready().await.unwrap();
        sqlx::raw_sql(
            "PRAGMA ignore_check_constraints = ON;
             INSERT INTO voiceprint_exemplars (id, keyring_key) VALUES ('exemplar-1', 'exemplar-1');
             PRAGMA ignore_check_constraints = OFF;",
        )
        .execute(runtime.pool())
        .await
        .unwrap();

        let result = purge_after_startup(&runtime, |_, _| Err("keychain locked".into())).await;

        assert_eq!(result, Err("keychain locked".to_owned()));
        assert!(table_exists(&runtime, "voiceprint_exemplars").await);
    }

    #[tokio::test]
    async fn the_purge_is_skipped_when_the_database_failed_to_start() {
        let runtime = unstarted_runtime().await;
        // Historique de migrations illisible : le démarrage échoue.
        sqlx::query("CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY)")
            .execute(runtime.pool())
            .await
            .unwrap();
        runtime.run_startup().await;

        let result = purge_after_startup(&runtime, |_, _| panic!("aucun secret à effacer")).await;

        assert!(result.is_err());
    }
}
