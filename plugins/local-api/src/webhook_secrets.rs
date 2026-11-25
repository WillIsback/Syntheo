//! Secrets HMAC des webhooks dans le trousseau du système (issue 653), plus en
//! clair dans app.db. La base ne garde qu'un marqueur. Si le trousseau est
//! indisponible (Linux sans Secret Service), le secret reste en base, comme
//! avant, et un avertissement est journalisé.

use std::sync::Arc;

use sqlx::SqlitePool;
use syntheo_db_app::WebhookEndpointRow;

/// Valeur de la colonne `secret` quand le secret est dans le trousseau.
pub(crate) const KEYCHAIN_MARKER: &str = "keychain";
const KEYCHAIN_SCOPE: &str = "webhook";

pub trait WebhookSecretStore: Send + Sync {
    fn read(&self, id: &str) -> Result<Option<String>, String>;
    fn write(&self, id: &str, secret: &str) -> Result<(), String>;
    fn delete(&self, id: &str) -> Result<(), String>;
}

pub(crate) type SharedSecretStore = Arc<dyn WebhookSecretStore>;

/// Trousseau du système, par le plugin store2.
pub(crate) struct KeychainSecrets<R: tauri::Runtime>(pub tauri::AppHandle<R>);

impl<R: tauri::Runtime> WebhookSecretStore for KeychainSecrets<R> {
    fn read(&self, id: &str) -> Result<Option<String>, String> {
        tauri_plugin_store2::read_secret_blocking(&self.0, KEYCHAIN_SCOPE, id)
    }
    fn write(&self, id: &str, secret: &str) -> Result<(), String> {
        tauri_plugin_store2::write_secret_blocking(&self.0, KEYCHAIN_SCOPE, id, secret)
    }
    fn delete(&self, id: &str) -> Result<(), String> {
        tauri_plugin_store2::delete_secret_blocking(&self.0, KEYCHAIN_SCOPE, id)
    }
}

async fn blocking<T: Send + 'static>(
    store: &SharedSecretStore,
    run: impl FnOnce(&dyn WebhookSecretStore) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let store = store.clone();
    tokio::task::spawn_blocking(move || run(store.as_ref()))
        .await
        .map_err(|error| error.to_string())?
}

/// Secret de signature d'un endpoint : dans le trousseau, ou encore en base
/// pour un endpoint pas encore déplacé.
pub(crate) async fn resolve_secret(
    store: &SharedSecretStore,
    endpoint: &WebhookEndpointRow,
) -> Result<String, String> {
    if endpoint.secret != KEYCHAIN_MARKER {
        return Ok(endpoint.secret.clone());
    }
    let id = endpoint.id.clone();
    blocking(store, move |store| store.read(&id))
        .await?
        .ok_or_else(|| "webhook secret missing from the system keychain".to_string())
}

/// Écrit le secret d'un endpoint au trousseau. Renvoie `false` (avec un
/// avertissement) si le trousseau est indisponible.
pub(crate) async fn write_to_keychain(store: &SharedSecretStore, id: &str, secret: &str) -> bool {
    let (key, value) = (id.to_string(), secret.to_string());
    match blocking(store, move |store| store.write(&key, &value)).await {
        Ok(()) => true,
        Err(error) => {
            tracing::warn!(
                "[local-api] webhook {id}: system keychain unavailable, secret kept in the database: {error}"
            );
            false
        }
    }
}

/// Déplace le secret d'un endpoint vers le trousseau, puis remplace la valeur
/// en base par le marqueur : la base n'est touchée qu'après une écriture
/// réussie au trousseau. Renvoie `false` si le secret reste en base.
pub(crate) async fn move_to_keychain(
    store: &SharedSecretStore,
    pool: &SqlitePool,
    id: &str,
    secret: &str,
) -> bool {
    if !write_to_keychain(store, id, secret).await {
        return false;
    }
    // Réécriture de la ligne avec `secure_delete` (complément de l'issue
    // 711) : l'ancienne valeur en clair est remise à zéro dans la page.
    let mut secure = match syntheo_db_app::SecureDeleteConnection::acquire(pool).await {
        Ok(secure) => secure,
        Err(error) => {
            tracing::warn!("[local-api] webhook {id}: secret marker not saved: {error}");
            return false;
        }
    };
    let saved =
        syntheo_db_app::set_webhook_endpoint_secret(secure.connection(), id, KEYCHAIN_MARKER).await;
    secure.release().await;
    match saved {
        Ok(_) => true,
        Err(error) => {
            tracing::warn!("[local-api] webhook {id}: secret marker not saved: {error}");
            false
        }
    }
}

/// Migration des endpoints dont le secret est encore en base.
pub(crate) async fn migrate_secrets(store: &SharedSecretStore, pool: &SqlitePool) {
    let _ = try_migrate_secrets(store, pool).await;
}

/// Comme [`migrate_secrets`], mais signale une base pas encore prête.
pub(crate) async fn try_migrate_secrets(
    store: &SharedSecretStore,
    pool: &SqlitePool,
) -> Result<(), sqlx::Error> {
    let endpoints = syntheo_db_app::list_webhook_endpoints(pool).await?;
    let mut moved = 0;
    for endpoint in endpoints {
        if endpoint.secret != KEYCHAIN_MARKER
            && move_to_keychain(store, pool, &endpoint.id, &endpoint.secret).await
        {
            moved += 1;
        }
    }
    // Les anciennes valeurs en clair restent dans le journal WAL jusqu'au
    // prochain point de contrôle (issue 711) : on le force aussitôt.
    if moved > 0 {
        syntheo_db_app::checkpoint_wal(pool).await;
    }
    Ok(())
}

/// Migration au lancement (issue 653), en tâche de fond : sans attendre
/// l'ouverture des réglages ni la prochaine livraison. Réessaie tant que la
/// base n'est pas prête (au plus une minute), sans bloquer le démarrage.
pub(crate) fn spawn_startup_migration<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    store: SharedSecretStore,
) {
    use tauri::Manager;
    tauri::async_runtime::spawn(async move {
        let migrated = startup_migration(
            || {
                app.try_state::<tauri_plugin_db::ManagedState>()
                    .map(|state| state.pool().clone())
            },
            &store,
            60,
            std::time::Duration::from_secs(1),
        )
        .await;
        if !migrated {
            tracing::warn!(
                "[local-api] webhook secrets not migrated at startup: database not ready"
            );
        }
    });
}

/// Boucle de la migration au lancement : `pool` renvoie la base dès qu'elle
/// est ouverte. Renvoie `false` si elle ne l'a jamais été.
pub(crate) async fn startup_migration(
    pool: impl Fn() -> Option<SqlitePool>,
    store: &SharedSecretStore,
    attempts: u32,
    delay: std::time::Duration,
) -> bool {
    for _ in 0..attempts {
        if let Some(pool) = pool()
            && try_migrate_secrets(store, &pool).await.is_ok()
        {
            return true;
        }
        tokio::time::sleep(delay).await;
    }
    false
}

pub(crate) async fn delete_secret(store: &SharedSecretStore, id: &str) {
    let key = id.to_string();
    if let Err(error) = blocking(store, move |store| store.delete(&key)).await {
        tracing::warn!("[local-api] webhook {id}: keychain secret not deleted: {error}");
    }
}
