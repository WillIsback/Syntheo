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

/// Déplace le secret d'un endpoint vers le trousseau, puis remplace la valeur
/// en base par le marqueur. Renvoie `false` si le secret reste en base.
pub(crate) async fn move_to_keychain(
    store: &SharedSecretStore,
    pool: &SqlitePool,
    id: &str,
    secret: &str,
) -> bool {
    let (key, value) = (id.to_string(), secret.to_string());
    if let Err(error) = blocking(store, move |store| store.write(&key, &value)).await {
        tracing::warn!(
            "[local-api] webhook {id}: system keychain unavailable, secret kept in the database: {error}"
        );
        return false;
    }
    match syntheo_db_app::set_webhook_endpoint_secret(pool, id, KEYCHAIN_MARKER).await {
        Ok(_) => true,
        Err(error) => {
            tracing::warn!("[local-api] webhook {id}: secret marker not saved: {error}");
            false
        }
    }
}

/// Migration des endpoints dont le secret est encore en base.
pub(crate) async fn migrate_secrets(store: &SharedSecretStore, pool: &SqlitePool) {
    let Ok(endpoints) = syntheo_db_app::list_webhook_endpoints(pool).await else {
        return;
    };
    for endpoint in endpoints {
        if endpoint.secret != KEYCHAIN_MARKER {
            move_to_keychain(store, pool, &endpoint.id, &endpoint.secret).await;
        }
    }
}

pub(crate) async fn delete_secret(store: &SharedSecretStore, id: &str) {
    let key = id.to_string();
    if let Err(error) = blocking(store, move |store| store.delete(&key)).await {
        tracing::warn!("[local-api] webhook {id}: keychain secret not deleted: {error}");
    }
}
