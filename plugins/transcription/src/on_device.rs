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
    // Pas d'écoute sans mise en service réussie (issue 686) : le profil dit
    // si le poste tient le temps réel.
    if allowed && host.profile().is_none() {
        return Err(OnDeviceError {
            kind: OnDeviceErrorKind::NotCommissioned,
            message: "on-device module not commissioned".to_owned(),
        });
    }
    host.target(allowed)
        .await
        .map_err(|error| error.to_on_device_error())
}

/// Profil retenu par la mise en service (pour la session qui démarre).
pub fn profile<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<owhisper_client::OnDeviceProfile> {
    app.try_state::<Arc<syntheo_speech_host::SpeechHost>>()?
        .inner()
        .profile()
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

/// Mesure d'un profil, pour l'interface et la barre de diagnostic.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnDeviceMeasure {
    /// `two_streams_diarized`, `two_streams`, `one_stream_diarized`,
    /// `one_stream`.
    pub profile: String,
    pub finals: u32,
    pub p95_ms: f64,
    pub drift_ms: f64,
    pub passed: bool,
}

/// Mise en service enregistrée.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnDeviceCommissioning {
    /// Profil retenu ; `None` : poste inéligible.
    pub profile: Option<String>,
    pub measures: Vec<OnDeviceMeasure>,
    /// Secondes depuis l'époque Unix.
    pub measured_at: f64,
}

fn profile_name(profile: syntheo_speech_host::commissioning::Profile) -> String {
    serde_json::to_value(profile)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn commissioning_of(
    result: syntheo_speech_host::commissioning::Commissioning,
) -> OnDeviceCommissioning {
    OnDeviceCommissioning {
        profile: result.profile.map(profile_name),
        measures: result
            .measures
            .into_iter()
            .map(|m| OnDeviceMeasure {
                profile: profile_name(m.profile),
                finals: m.finals as u32,
                p95_ms: m.p95_ms as f64,
                drift_ms: m.drift_ms as f64,
                passed: m.passed,
            })
            .collect(),
        measured_at: result.measured_at as f64,
    }
}

/// Charge du module pendant une écoute (barre de diagnostic).
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnDeviceSessionLoad {
    pub lag_ms: f64,
    pub rtf: f64,
    /// `full`, `spaced` ou `off`.
    pub diarization: String,
    pub audio_s: f64,
}

/// Mise en service enregistrée du module installé.
#[tauri::command]
#[specta::specta]
pub async fn on_device_commissioning<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<OnDeviceCommissioning>, String> {
    let host = host(&app)?;
    Ok(
        tauri::async_runtime::spawn_blocking(move || host.commissioning())
            .await
            .map_err(|_| "io".to_owned())?
            .map(commissioning_of),
    )
}

/// Mesure les profils (environ 30 s chacun, du plus complet au plus réduit)
/// et enregistre le premier qui tient le temps réel. Refusée pendant une
/// écoute et par le relay.
#[tauri::command]
#[specta::specta]
pub async fn on_device_commission<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<OnDeviceCommissioning, String> {
    let allowed = allowed(&app).await;
    if !allowed {
        return Err("disabled".to_owned());
    }
    require_no_capture(&app).await?;
    let host = host(&app)?;
    let result = host
        .commission(true, syntheo_speech_host::commissioning::MEASURE)
        .await;
    // Le module de mesure s'arrête : la prochaine écoute le relance.
    host.stop().await;
    result.map(commissioning_of)
}

/// Avancement d'une mise en service.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct OnDeviceProgress {
    pub current: u32,
    pub total: u32,
}

/// Profil en cours de mesure, pendant une mise en service.
#[tauri::command]
#[specta::specta]
pub async fn on_device_commission_progress<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<OnDeviceProgress>, String> {
    Ok(host(&app)?
        .commissioning_progress()
        .map(|(current, total)| OnDeviceProgress {
            current: current as u32,
            total: total as u32,
        }))
}

/// Charge du module pendant une écoute ; vide hors écoute.
#[tauri::command]
#[specta::specta]
pub async fn on_device_load<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<OnDeviceSessionLoad>, String> {
    let host = host(&app)?;
    Ok(host
        .load()
        .map(|load| {
            load.sessions
                .into_iter()
                .map(|s| OnDeviceSessionLoad {
                    lag_ms: s.lag_ms as f64,
                    rtf: s.rtf,
                    diarization: s.diarization,
                    audio_s: s.audio_s,
                })
                .collect()
        })
        .unwrap_or_default())
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
