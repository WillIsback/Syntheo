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
                if let Err(error) = purge_after_startup(&runtime, |scope, key| {
                    tauri_plugin_store2::delete_secret_blocking(&app, scope, key)
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
async fn purge_after_startup(
    runtime: &tauri_plugin_db::ManagedState,
    delete_secret: impl FnMut(&str, &str) -> Result<(), String>,
) -> Result<(), String> {
    runtime
        .wait_until_ready()
        .await
        .map_err(|error| format!("database startup failed: {error}"))?;
    syntheo_db_app::purge_legacy_voiceprints(runtime.pool(), delete_secret).await
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
