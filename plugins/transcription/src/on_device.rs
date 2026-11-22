//! Source « Sur ce poste » (issue 684) : le module `syntheo-speech`, installé
//! dans `<données>/modules/speech`, lancé au début d'une écoute, relancé s'il
//! meurt (nouveau jeton, nouveau port), arrêté à la fin. Un réglage géré
//! (`on_device_transcription_enabled` à false) interdit son chargement : il
//! est lu dans `managed_settings.json` une fois, gardé en mémoire, et jamais
//! dans la base, que la webview peut réécrire.

use std::sync::Arc;

use owhisper_client::{OnDeviceError, OnDeviceErrorKind};
use tauri::Manager;
use tokio::sync::OnceCell;

/// Politique gérée chargée au premier usage ; illisible : module refusé.
#[derive(Default)]
pub struct OnDevicePolicy(OnceCell<bool>);

/// Dossier du module installé.
pub fn module_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("modules").join("speech"))
}

/// Fils ONNX Runtime par session : deux flux partagent les cœurs.
pub fn threads_per_session() -> usize {
    std::thread::available_parallelism().map_or(1, |n| (n.get() / 4).max(1))
}

async fn allowed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    let Some(policy) = app.try_state::<OnDevicePolicy>() else {
        return false;
    };
    *policy
        .0
        .get_or_init(|| async {
            let Some(pool) = crate::audio_retention::db_pool(app) else {
                return false;
            };
            match syntheo_db_app::load_managed_policy(&pool).await {
                Ok(policy) => policy.on_device_transcription_allowed(),
                Err(_) => false,
            }
        })
        .await
}

/// Cible du lancement en cours, après vérification et lancement au besoin.
pub async fn target<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<owhisper_client::OnDeviceTarget, OnDeviceError> {
    let host = app
        .try_state::<Arc<syntheo_speech_host::SpeechHost>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| OnDeviceError {
            kind: OnDeviceErrorKind::Unavailable,
            message: "on-device transcription is not available".to_owned(),
        })?;
    let allowed = allowed(app).await;
    host.target(allowed)
        .await
        .map_err(|error| error.to_on_device_error())
}

/// Arrête le module s'il tourne.
pub async fn stop<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(host) = app.try_state::<Arc<syntheo_speech_host::SpeechHost>>() {
        host.inner().clone().stop().await;
    }
}

/// Module installé, pour l'interface.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OnDeviceModule {
    NotInstalled,
    Installed {
        version: String,
        #[serde(rename = "sizeBytes")]
        size_bytes: f64,
    },
    /// Présent mais refusé (non signé, altéré, incompatible).
    Invalid {
        reason: String,
    },
}

/// État de la source « Sur ce poste ».
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct OnDeviceStatus {
    /// Autorisée par la politique de l'organisation.
    pub allowed: bool,
    /// Une clé de signature des modules est configurée dans cette
    /// application : sans elle, rien ne peut être installé.
    pub installable: bool,
    pub module: OnDeviceModule,
}

fn module_of(status: syntheo_speech_host::install::ModuleStatus) -> OnDeviceModule {
    use syntheo_speech_host::install::ModuleStatus;
    match status {
        ModuleStatus::NotInstalled => OnDeviceModule::NotInstalled,
        ModuleStatus::Installed {
            version,
            size_bytes,
        } => OnDeviceModule::Installed {
            version,
            size_bytes: size_bytes as f64,
        },
        ModuleStatus::Invalid { reason } => OnDeviceModule::Invalid { reason },
    }
}

/// Erreurs des commandes : des codes stables, traduits par l'interface
/// (jamais de texte technique affiché tel quel).
fn host<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Arc<syntheo_speech_host::SpeechHost>, String> {
    app.try_state::<Arc<syntheo_speech_host::SpeechHost>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "unavailable".to_owned())
}

/// Installation et désinstallation : seulement sans écoute en cours.
async fn require_no_capture<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    use crate::{CaptureState, ListenerPluginExt};
    match app.listener().capture_state_checked().await {
        Some(CaptureState::Inactive) => Ok(()),
        _ => Err("capture_in_progress".to_owned()),
    }
}

/// Chemin local ordinaire : absolu, sans partage réseau (UNC), ni chemin
/// verbatim ou de périphérique.
fn is_plain_local_path(path: &std::path::Path) -> bool {
    use std::path::{Component, Prefix};
    if !path.is_absolute() {
        return false;
    }
    match path.components().next() {
        Some(Component::Prefix(prefix)) => matches!(prefix.kind(), Prefix::Disk(_)),
        Some(Component::RootDir) => !cfg!(windows),
        _ => false,
    }
}

/// État de la source « Sur ce poste » : politique et module installé.
#[tauri::command]
#[specta::specta]
pub async fn on_device_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<OnDeviceStatus, String> {
    let allowed = allowed(&app).await;
    let (installable, module) = match host(&app) {
        Ok(host) => (host.installable(), module_of(host.module_status().await)),
        Err(_) => (false, OnDeviceModule::NotInstalled),
    };
    Ok(OnDeviceStatus {
        allowed,
        installable,
        module,
    })
}

/// Installe le module : le fichier `manifest.json` d'un dossier de module est
/// choisi ici, côté Rust (aucun chemin ne vient de la webview). Manifeste
/// signé, liste fermée et empreintes sont vérifiés avant la mise en place.
/// `None` : choix annulé.
#[tauri::command]
#[specta::specta]
pub async fn on_device_install<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<Option<OnDeviceModule>, String> {
    use tauri_plugin_dialog::DialogExt;
    if !allowed(&app).await {
        return Err("disabled".to_owned());
    }
    let host = host(&app)?;
    if !host.installable() {
        return Err("no_key".to_owned());
    }
    require_no_capture(&app).await?;
    let mut dialog = app.dialog().file().add_filter("manifest.json", &["json"]);
    #[cfg(desktop)]
    {
        dialog = dialog.set_parent(&window);
    }
    #[cfg(not(desktop))]
    let _ = &window;
    let chosen = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_file())
        .await
        .map_err(|_| "unavailable".to_owned())?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let manifest = chosen.into_path().map_err(|_| "unsafe_path".to_owned())?;
    if !is_plain_local_path(&manifest) {
        return Err("unsafe_path".to_owned());
    }
    if manifest.file_name().and_then(|n| n.to_str())
        != Some(syntheo_speech_host::manifest::MANIFEST_FILE)
    {
        return Err("not_manifest".to_owned());
    }
    let source = manifest
        .parent()
        .ok_or_else(|| "not_manifest".to_owned())?
        .to_path_buf();
    // L'écoute a pu démarrer pendant le choix du fichier.
    require_no_capture(&app).await?;
    host.install_from(source)
        .await
        .map(|status| Some(module_of(status)))
        .map_err(str::to_owned)
}

/// Désinstalle le module.
#[tauri::command]
#[specta::specta]
pub async fn on_device_uninstall<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    require_no_capture(&app).await?;
    host(&app)?.uninstall().await.map_err(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::is_plain_local_path;
    use std::path::Path;

    #[test]
    fn only_plain_local_paths_are_accepted() {
        assert!(!is_plain_local_path(Path::new("relative/manifest.json")));
        if cfg!(windows) {
            assert!(is_plain_local_path(Path::new(r"C:\Modules\manifest.json")));
            assert!(!is_plain_local_path(Path::new(
                r"\\server\share\manifest.json"
            )));
            assert!(!is_plain_local_path(Path::new(r"\\?\C:\m\manifest.json")));
            assert!(!is_plain_local_path(Path::new(r"\\.\pipe\manifest.json")));
        } else {
            assert!(is_plain_local_path(Path::new(
                "/home/u/module/manifest.json"
            )));
        }
    }
}
