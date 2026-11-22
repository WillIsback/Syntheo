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

fn host<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Arc<syntheo_speech_host::SpeechHost>, String> {
    app.try_state::<Arc<syntheo_speech_host::SpeechHost>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "on-device transcription is not available".to_owned())
}

/// Installation et désinstallation : seulement sans écoute en cours.
async fn require_no_capture<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    use crate::{CaptureState, ListenerPluginExt};
    match app.listener().capture_state_checked().await {
        Some(CaptureState::Inactive) => Ok(()),
        Some(_) => Err("capture in progress".to_owned()),
        None => Err("capture state unavailable".to_owned()),
    }
}

/// État de la source « Sur ce poste » : politique et module installé.
#[tauri::command]
#[specta::specta]
pub async fn on_device_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<OnDeviceStatus, String> {
    let allowed = allowed(&app).await;
    let module = match host(&app) {
        Ok(host) => module_of(host.module_status().await),
        Err(_) => OnDeviceModule::NotInstalled,
    };
    Ok(OnDeviceStatus { allowed, module })
}

/// Installe le module depuis le `manifest.json` d'un dossier de module
/// préparé : manifeste signé, liste fermée et empreintes vérifiés avant la
/// mise en place.
#[tauri::command]
#[specta::specta]
pub async fn on_device_install<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    manifest_path: String,
) -> Result<OnDeviceModule, String> {
    if !allowed(&app).await {
        return Err("on-device transcription is disabled by policy".to_owned());
    }
    require_no_capture(&app).await?;
    let manifest = std::path::PathBuf::from(manifest_path);
    if manifest.file_name().and_then(|n| n.to_str())
        != Some(syntheo_speech_host::manifest::MANIFEST_FILE)
    {
        return Err("choose the manifest.json file of the module".to_owned());
    }
    let source = manifest
        .parent()
        .ok_or_else(|| "invalid module folder".to_owned())?
        .to_path_buf();
    host(&app)?.install_from(source).await.map(module_of)
}

/// Désinstalle le module.
#[tauri::command]
#[specta::specta]
pub async fn on_device_uninstall<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    require_no_capture(&app).await?;
    host(&app)?.uninstall().await
}
