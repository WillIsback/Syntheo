//! Source « Sur ce poste » (issues 683 et 684) : le programme compagnon
//! `syntheo-speech`, livré avec l'application, et ses modèles, installés dans
//! `<données>/speech/models` ; lancé au début d'une écoute, relancé s'il meurt
//! (nouveau jeton, nouveau port), arrêté à la fin. Les réglages gérés
//! (`on_device_transcription_enabled` à false, `speech_models_urls`) sont lus
//! dans `managed_settings.json` une fois, gardés en mémoire, et jamais dans la
//! base, que la webview peut réécrire.

use std::sync::Arc;

use owhisper_client::{OnDeviceError, OnDeviceErrorKind};
use tauri::Manager;
use tokio::sync::OnceCell;

/// Ce que la construction de l'application fixe : fichiers du compagnon
/// (`SYNTHEO_SPEECH_FILES`) et sources des modèles
/// (`SYNTHEO_SPEECH_MODELS_URLS`), compilés par l'application.
#[derive(Debug, Clone, Copy, Default)]
pub struct SpeechBuild {
    pub companion_files: Option<&'static str>,
    pub models_urls: Option<&'static str>,
}

/// Sources compilées des modèles (vides : installation depuis un dossier).
pub struct CompiledSources(pub Vec<syntheo_speech_host::models::Source>);

impl CompiledSources {
    pub fn of(build: SpeechBuild) -> Self {
        Self(
            build
                .models_urls
                .and_then(|urls| syntheo_speech_host::models::parse_sources([urls]))
                .unwrap_or_default(),
        )
    }
}

/// Politique gérée, chargée au premier usage et gardée en mémoire.
#[derive(Debug, Clone, Default)]
struct Policy {
    allowed: bool,
    /// Sources imposées ; `Some(vide)` : réglage présent mais invalide.
    sources: Option<Vec<syntheo_speech_host::models::Source>>,
}

/// Politique gérée chargée au premier usage ; illisible : source refusée.
#[derive(Default)]
pub struct OnDevicePolicy(OnceCell<Policy>);

/// Dossier de données de la source.
pub fn data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("speech"))
}

/// Fils ONNX Runtime par session : deux flux partagent les cœurs.
pub fn threads_per_session() -> usize {
    std::thread::available_parallelism().map_or(1, |n| (n.get() / 4).max(1))
}

async fn policy<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Policy {
    let Some(state) = app.try_state::<OnDevicePolicy>() else {
        return Policy::default();
    };
    state
        .0
        .get_or_init(|| async {
            let Some(pool) = crate::audio_retention::db_pool(app) else {
                return Policy::default();
            };
            match syntheo_db_app::load_managed_policy(&pool).await {
                Ok(policy) => Policy {
                    allowed: policy.on_device_transcription_allowed(),
                    sources: policy.speech_models_urls().map(|urls| {
                        syntheo_speech_host::models::parse_sources(urls.iter().map(String::as_str))
                            .unwrap_or_default()
                    }),
                },
                Err(_) => Policy::default(),
            }
        })
        .await
        .clone()
}

async fn allowed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    policy(app).await.allowed
}

/// Sources des modèles : celles de l'organisation si le réglage existe (elles
/// remplacent les sources compilées), sinon les sources compilées.
async fn sources<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Vec<syntheo_speech_host::models::Source> {
    match policy(app).await.sources {
        Some(managed) => managed,
        None => app
            .try_state::<CompiledSources>()
            .map(|s| s.0.clone())
            .unwrap_or_default(),
    }
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

/// Modèles installés, pour l'interface.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OnDeviceModels {
    Missing {
        #[serde(rename = "totalBytes")]
        total_bytes: f64,
    },
    /// Installation interrompue.
    Partial {
        #[serde(rename = "presentBytes")]
        present_bytes: f64,
        #[serde(rename = "totalBytes")]
        total_bytes: f64,
    },
    Installed {
        #[serde(rename = "totalBytes")]
        total_bytes: f64,
    },
}

/// État de la source « Sur ce poste ».
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct OnDeviceStatus {
    /// Autorisée par la politique de l'organisation.
    pub allowed: bool,
    /// Le programme compagnon est livré avec cette application et présent.
    pub companion: bool,
    pub models: OnDeviceModels,
    /// Au moins une source de téléchargement (compilée ou imposée par
    /// l'organisation) : sinon, installation depuis un dossier seulement.
    pub downloadable: bool,
}

fn models_of(status: syntheo_speech_host::models::ModelsStatus) -> OnDeviceModels {
    use syntheo_speech_host::models::ModelsStatus;
    match status {
        ModelsStatus::Missing { total_bytes } => OnDeviceModels::Missing {
            total_bytes: total_bytes as f64,
        },
        ModelsStatus::Partial {
            present_bytes,
            total_bytes,
        } => OnDeviceModels::Partial {
            present_bytes: present_bytes as f64,
            total_bytes: total_bytes as f64,
        },
        ModelsStatus::Installed { total_bytes } => OnDeviceModels::Installed {
            total_bytes: total_bytes as f64,
        },
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

/// Installation et retrait : seulement sans écoute en cours.
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

/// État de la source « Sur ce poste » : politique, compagnon et modèles.
#[tauri::command]
#[specta::specta]
pub async fn on_device_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<OnDeviceStatus, String> {
    let allowed = allowed(&app).await;
    let downloadable = !sources(&app).await.is_empty();
    let (companion, models) = match host(&app) {
        Ok(host) => {
            let status = host.status().await;
            (status.companion, models_of(status.models))
        }
        Err(_) => (false, OnDeviceModels::Missing { total_bytes: 0.0 }),
    };
    Ok(OnDeviceStatus {
        allowed,
        companion,
        models,
        downloadable,
    })
}

/// Refus communs avant une installation de modèles.
async fn before_install<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Arc<syntheo_speech_host::SpeechHost>, String> {
    if !allowed(app).await {
        return Err("disabled".to_owned());
    }
    let host = host(app)?;
    if !host.status().await.companion {
        return Err("companion_missing".to_owned());
    }
    require_no_capture(app).await?;
    Ok(host)
}

/// Télécharge les modèles (≈ 1 Go) depuis les sources compilées ou imposées
/// par l'organisation, chaque fichier vérifié avant sa mise en place ; rend
/// la main à la fin. Avancement : `on_device_install_progress`.
#[tauri::command]
#[specta::specta]
pub async fn on_device_download_models<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<OnDeviceModels, String> {
    let host = before_install(&app).await?;
    let sources = sources(&app).await;
    host.download_models(&sources)
        .await
        .map_err(str::to_owned)?;
    Ok(models_of(host.status().await.models))
}

/// Installe les modèles depuis un dossier choisi ici, côté Rust (aucun chemin
/// ne vient de la webview), chaque fichier vérifié avant sa mise en place.
/// `None` : choix annulé.
#[tauri::command]
#[specta::specta]
pub async fn on_device_install_models<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<Option<OnDeviceModels>, String> {
    use tauri_plugin_dialog::DialogExt;
    let host = before_install(&app).await?;
    let mut dialog = app.dialog().file();
    #[cfg(desktop)]
    {
        dialog = dialog.set_parent(&window);
    }
    #[cfg(not(desktop))]
    let _ = &window;
    let chosen = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|_| "unavailable".to_owned())?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let source = chosen.into_path().map_err(|_| "unsafe_path".to_owned())?;
    if !is_plain_local_path(&source) {
        return Err("unsafe_path".to_owned());
    }
    // L'écoute a pu démarrer pendant le choix du dossier.
    require_no_capture(&app).await?;
    host.install_models_from(source)
        .await
        .map_err(str::to_owned)?;
    Ok(Some(models_of(host.status().await.models)))
}

/// Avancement de l'installation des modèles.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnDeviceInstallProgress {
    pub done_bytes: f64,
    pub total_bytes: f64,
}

/// Avancement de l'installation en cours ; `None` hors installation.
#[tauri::command]
#[specta::specta]
pub async fn on_device_install_progress<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<OnDeviceInstallProgress>, String> {
    Ok(host(&app)?
        .install_progress()
        .map(|(done, total)| OnDeviceInstallProgress {
            done_bytes: done as f64,
            total_bytes: total as f64,
        }))
}

/// Annule l'installation en cours (un téléchargement reprendra plus tard où
/// il s'était arrêté).
#[tauri::command]
#[specta::specta]
pub async fn on_device_cancel_install<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    host(&app)?.cancel_install();
    Ok(())
}

/// Retire les modèles.
#[tauri::command]
#[specta::specta]
pub async fn on_device_remove_models<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    require_no_capture(&app).await?;
    host(&app)?.remove_models().await.map_err(str::to_owned)
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
    /// Retard brut (attente de fin d'énoncé comprise).
    pub raw_p95_ms: f64,
    pub raw_drift_ms: f64,
    pub passed: bool,
    /// Mesure impossible : code de la raison.
    pub error: Option<String>,
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
                raw_p95_ms: m.raw_p95_ms as f64,
                raw_drift_ms: m.raw_drift_ms as f64,
                passed: m.passed,
                error: m.error,
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
    // Le module de mesure s'arrête (la prochaine écoute le relance), mais
    // seulement si cet appel a conduit la mesure : un second appel refusé
    // (« measuring ») ne doit pas tuer la mesure en cours.
    if result.as_ref().err().map(String::as_str) != Some("measuring") {
        host.stop().await;
    }
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
        assert!(!is_plain_local_path(Path::new("relative/models")));
        if cfg!(windows) {
            assert!(is_plain_local_path(Path::new(r"C:\Modeles")));
            assert!(!is_plain_local_path(Path::new(r"\\server\share\modeles")));
            assert!(!is_plain_local_path(Path::new(r"\\?\C:\m")));
            assert!(!is_plain_local_path(Path::new(r"\\.\pipe\m")));
        } else {
            assert!(is_plain_local_path(Path::new("/home/u/modeles")));
        }
    }
}
