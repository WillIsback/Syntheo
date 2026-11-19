// Mise à jour intégrée (issue 593), au-dessus de tauri-plugin-updater.
//
// Le front ne voit jamais l'objet `Update` du plugin : il passe par ces trois
// commandes. Le parcours dépend du type de paquet installé (patché dans le
// binaire par le bundler) :
// - AppImage et installeur NSIS : vérification, téléchargement et installation
//   par le plugin, avec la signature vérifiée contre la clé publique embarquée ;
// - .deb, MSI et type inconnu : annonce seule (version, notes, page de la
//   release). `latest.json` n'a pas d'entrée pour ces formats ; on lit celle
//   du format installable du même système pour connaître la version, sans
//   jamais rien installer (un poste MSI lancerait sinon l'installeur NSIS).
//
// Les builds `devtools` (alphas) n'enregistrent pas le plugin : une alpha
// 0.7.3-1 est inférieure à 0.7.3 et se verrait proposer la release.

// En `devtools`, les commandes répondent « indisponible » : la décision par
// type de paquet et l'état restent compilés (tests) mais inutilisés.
#![cfg_attr(feature = "devtools", allow(dead_code, unused_imports))]

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, Runtime, ipc::Channel, utils::config::BundleType};
use tokio::sync::Mutex;

const RELEASES_URL: &str = "https://github.com/WillIsback/Syntheo/releases";
const LINUX_TARGET: &str = "linux-x86_64-appimage";
const WINDOWS_TARGET: &str = "windows-x86_64-nsis";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum UpdatePath {
    /// Parcours normal du plugin, sans forcer de cible.
    Install,
    /// Annonce seule, en lisant l'entrée de ce format installable.
    AnnounceOnly(&'static str),
}

pub(crate) fn update_path(bundle: Option<BundleType>, windows: bool) -> UpdatePath {
    match bundle {
        Some(BundleType::AppImage | BundleType::Nsis) => UpdatePath::Install,
        Some(BundleType::Msi) => UpdatePath::AnnounceOnly(WINDOWS_TARGET),
        Some(BundleType::Deb | BundleType::Rpm) => UpdatePath::AnnounceOnly(LINUX_TARGET),
        _ if windows => UpdatePath::AnnounceOnly(WINDOWS_TARGET),
        _ => UpdatePath::AnnounceOnly(LINUX_TARGET),
    }
}

pub(crate) fn release_url(version: &str) -> String {
    format!("{RELEASES_URL}/tag/v{}", version.trim_start_matches('v'))
}

/// Erreur de mise à jour, en code stable (issue 601) : l'interface affiche un
/// libellé traduit par code, le détail technique part dans le journal.
#[derive(Debug, Clone, Copy, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdaterError {
    /// Signature refusée : autre clé, version signée différente ou absente,
    /// signature illisible.
    Signature,
    /// Serveur injoignable : hors ligne, proxy, délai dépassé.
    Offline,
    /// Téléchargement interrompu ou refusé en cours de route.
    Interrupted,
    /// `latest.json` illisible, sans entrée pour ce format ou introuvable.
    Manifest,
    /// Build `devtools` : pas de mise à jour intégrée.
    #[cfg_attr(not(feature = "devtools"), allow(dead_code))]
    Unavailable,
    /// Tout le reste (installation, état incohérent).
    Other,
}

/// Étape où l'erreur survient : une même erreur réseau n'a pas le même sens
/// pendant la vérification (serveur injoignable) et le téléchargement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum UpdaterStage {
    Check,
    Download,
    Install,
}

/// Variantes de tauri-plugin-updater 2.14.1 (Cargo.lock).
pub(crate) fn classify_error(
    error: &tauri_plugin_updater::Error,
    stage: UpdaterStage,
) -> UpdaterError {
    use tauri_plugin_updater::Error;
    match error {
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion => UpdaterError::Signature,
        Error::Reqwest(error) => match stage {
            // Réponse reçue mais illisible (BOM, JSON invalide) : le manifeste.
            UpdaterStage::Check if error.is_decode() => UpdaterError::Manifest,
            UpdaterStage::Check => UpdaterError::Offline,
            UpdaterStage::Download if error.is_connect() => UpdaterError::Offline,
            UpdaterStage::Download => UpdaterError::Interrupted,
            UpdaterStage::Install => UpdaterError::Other,
        },
        // Statut HTTP en échec pendant le téléchargement.
        Error::Network(_) => UpdaterError::Interrupted,
        Error::ReleaseNotFound
        | Error::Serialization(_)
        | Error::Semver(_)
        | Error::TargetNotFound(_)
        | Error::TargetsNotFound(_)
        | Error::UrlParse(_) => UpdaterError::Manifest,
        _ => UpdaterError::Other,
    }
}

fn report_error(error: &tauri_plugin_updater::Error, stage: UpdaterStage) -> UpdaterError {
    let code = classify_error(error, stage);
    tracing::warn!(?stage, ?code, error = %error, "updater_failed");
    code
}

/// Une nouvelle recherche qui retrouve la version déjà téléchargée la garde
/// prête à être installée (issue 601).
pub(crate) fn keeps_download(
    previous_version: Option<&str>,
    found_version: &str,
    downloaded: bool,
) -> bool {
    downloaded && previous_version == Some(found_version)
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum UpdateCheck {
    /// Pas de vérification possible : build `devtools`, plugin absent.
    #[cfg_attr(not(feature = "devtools"), allow(dead_code))]
    Unavailable,
    UpToDate,
    Available {
        version: String,
        notes: Option<String>,
        date: Option<String>,
        /// `false` : .deb, MSI ou type inconnu, annonce avec lien seulement.
        installable: bool,
        release_url: String,
        /// Cette version est déjà téléchargée : prête à être installée.
        downloaded: bool,
    },
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum DownloadEvent {
    Progress { downloaded: u32, total: Option<u32> },
    Finished,
}

#[derive(Default)]
pub struct UpdaterState {
    #[cfg(not(feature = "devtools"))]
    pending: Mutex<Option<tauri_plugin_updater::Update>>,
    downloaded: Mutex<Option<Vec<u8>>>,
}

#[cfg(not(feature = "devtools"))]
fn available(update: &tauri_plugin_updater::Update, installable: bool) -> UpdateCheck {
    UpdateCheck::Available {
        version: update.version.clone(),
        notes: update.body.clone().filter(|body| !body.trim().is_empty()),
        // Date telle qu'écrite dans latest.json (RFC 3339).
        date: update
            .raw_json
            .get("pub_date")
            .and_then(|value| value.as_str())
            .map(str::to_owned),
        installable,
        release_url: release_url(&update.version),
        downloaded: false,
    }
}

#[cfg(not(feature = "devtools"))]
async fn announce<R: Runtime>(
    app: &AppHandle<R>,
    target: &str,
) -> Result<UpdateCheck, UpdaterError> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app
        .updater_builder()
        .target(target)
        .build()
        .map_err(|error| report_error(&error, UpdaterStage::Check))?
        .check()
        .await
        .map_err(|error| report_error(&error, UpdaterStage::Check))?;
    // L'objet `Update` est abandonné ici : seule l'annonce sort.
    Ok(update.map_or(UpdateCheck::UpToDate, |update| available(&update, false)))
}

/// La mise à jour intégrée existe dans ce build : faux pour les alphas
/// `devtools`. Lue à l'ouverture des Paramètres, sans attendre une
/// vérification (issue 601).
#[tauri::command]
#[specta::specta]
pub fn updater_supported() -> bool {
    !cfg!(feature = "devtools")
}

#[tauri::command]
#[specta::specta]
pub async fn updater_check<R: Runtime>(app: AppHandle<R>) -> Result<UpdateCheck, UpdaterError> {
    #[cfg(feature = "devtools")]
    {
        let _ = app;
        Ok(UpdateCheck::Unavailable)
    }
    #[cfg(not(feature = "devtools"))]
    {
        use tauri_plugin_updater::{Error, UpdaterExt};
        let state = app.state::<UpdaterState>();
        let path = update_path(tauri::utils::platform::bundle_type(), cfg!(windows));
        let check = match path {
            UpdatePath::AnnounceOnly(target) => announce(&app, target).await?,
            UpdatePath::Install => {
                let updater = app
                    .updater()
                    .map_err(|error| report_error(&error, UpdaterStage::Check))?;
                match updater.check().await {
                    Ok(Some(update)) => {
                        let mut pending = state.pending.lock().await;
                        let mut downloaded = state.downloaded.lock().await;
                        let keep = keeps_download(
                            pending.as_ref().map(|previous| previous.version.as_str()),
                            &update.version,
                            downloaded.is_some(),
                        );
                        if !keep {
                            *downloaded = None;
                        }
                        let mut check = available(&update, true);
                        if let UpdateCheck::Available {
                            downloaded: ready, ..
                        } = &mut check
                        {
                            *ready = keep;
                        }
                        *pending = Some(update);
                        return Ok(check);
                    }
                    Ok(None) => UpdateCheck::UpToDate,
                    // Filet : manifeste sans entrée pour ce format.
                    Err(Error::TargetsNotFound(_)) => {
                        let fallback = if cfg!(windows) {
                            WINDOWS_TARGET
                        } else {
                            LINUX_TARGET
                        };
                        announce(&app, fallback).await?
                    }
                    Err(error) => return Err(report_error(&error, UpdaterStage::Check)),
                }
            }
        };
        *state.pending.lock().await = None;
        *state.downloaded.lock().await = None;
        Ok(check)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn updater_download<R: Runtime>(
    app: AppHandle<R>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), UpdaterError> {
    #[cfg(feature = "devtools")]
    {
        let _ = (app, on_event);
        Err(UpdaterError::Unavailable)
    }
    #[cfg(not(feature = "devtools"))]
    {
        let state = app.state::<UpdaterState>();
        let update = state.pending.lock().await.clone().ok_or_else(|| {
            tracing::warn!("updater_download: no_pending_update");
            UpdaterError::Other
        })?;
        let mut downloaded: u64 = 0;
        let bytes = update
            .download(
                |chunk, total| {
                    downloaded += chunk as u64;
                    let _ = on_event.send(DownloadEvent::Progress {
                        downloaded: u32::try_from(downloaded).unwrap_or(u32::MAX),
                        total: total.map(|value| u32::try_from(value).unwrap_or(u32::MAX)),
                    });
                },
                || {
                    let _ = on_event.send(DownloadEvent::Finished);
                },
            )
            .await
            .map_err(|error| report_error(&error, UpdaterStage::Download))?;
        *state.downloaded.lock().await = Some(bytes);
        Ok(())
    }
}

/// Installe la mise à jour téléchargée. Le front l'appelle hors écoute, sur
/// action de la personne, puis relance l'application. Sous Windows,
/// l'installeur NSIS (mode silencieux, sans fenêtre) ferme l'application
/// lui-même et la relance.
#[tauri::command]
#[specta::specta]
pub async fn updater_install<R: Runtime>(app: AppHandle<R>) -> Result<(), UpdaterError> {
    #[cfg(feature = "devtools")]
    {
        let _ = app;
        Err(UpdaterError::Unavailable)
    }
    #[cfg(not(feature = "devtools"))]
    {
        let state = app.state::<UpdaterState>();
        let update = state.pending.lock().await.clone().ok_or_else(|| {
            tracing::warn!("updater_install: no_pending_update");
            UpdaterError::Other
        })?;
        let bytes = state.downloaded.lock().await.take().ok_or_else(|| {
            tracing::warn!("updater_install: update_not_downloaded");
            UpdaterError::Other
        })?;
        update
            .install(bytes)
            .map_err(|error| report_error(&error, UpdaterStage::Install))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appimage_and_nsis_follow_the_plugin_without_forcing_a_target() {
        assert_eq!(
            update_path(Some(BundleType::AppImage), false),
            UpdatePath::Install
        );
        assert_eq!(
            update_path(Some(BundleType::Nsis), true),
            UpdatePath::Install
        );
    }

    #[test]
    fn deb_and_msi_are_announced_from_the_installable_entry_of_their_system() {
        assert_eq!(
            update_path(Some(BundleType::Deb), false),
            UpdatePath::AnnounceOnly("linux-x86_64-appimage")
        );
        assert_eq!(
            update_path(Some(BundleType::Rpm), false),
            UpdatePath::AnnounceOnly("linux-x86_64-appimage")
        );
        assert_eq!(
            update_path(Some(BundleType::Msi), true),
            UpdatePath::AnnounceOnly("windows-x86_64-nsis")
        );
    }

    #[test]
    fn an_unknown_bundle_type_is_only_announced() {
        assert_eq!(
            update_path(None, false),
            UpdatePath::AnnounceOnly("linux-x86_64-appimage")
        );
        assert_eq!(
            update_path(None, true),
            UpdatePath::AnnounceOnly("windows-x86_64-nsis")
        );
    }

    // Issue 601 : codes stables par étape, variantes de tauri-plugin-updater
    // 2.14.1.
    #[test]
    fn classifies_signature_manifest_and_download_errors() {
        use tauri_plugin_updater::Error;
        let signature = [
            Error::SignatureUtf8("x".to_string()),
            Error::SignedVersionMismatch {
                signed: "0.7.3".to_string(),
                announced: "0.7.4".to_string(),
            },
            Error::MissingSignedVersion,
        ];
        for error in &signature {
            for stage in [UpdaterStage::Download, UpdaterStage::Install] {
                assert_eq!(
                    classify_error(error, stage),
                    UpdaterError::Signature,
                    "{error}"
                );
            }
        }
        let manifest = [
            Error::ReleaseNotFound,
            Error::TargetsNotFound(vec!["linux-x86_64-appimage".to_string()]),
            Error::TargetNotFound("linux-x86_64".to_string()),
            Error::Serialization(serde_json::from_str::<serde_json::Value>("{").unwrap_err()),
        ];
        for error in &manifest {
            assert_eq!(
                classify_error(error, UpdaterStage::Check),
                UpdaterError::Manifest,
                "{error}"
            );
        }
        assert_eq!(
            classify_error(
                &Error::Network("Download request failed with status: 404".to_string()),
                UpdaterStage::Download
            ),
            UpdaterError::Interrupted
        );
        for error in [Error::AuthenticationFailed, Error::TempDirNotFound] {
            assert_eq!(
                classify_error(&error, UpdaterStage::Install),
                UpdaterError::Other
            );
        }
    }

    #[tokio::test]
    async fn classifies_network_errors_by_stage() {
        use tauri_plugin_updater::Error;
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        // Rien n'écoute sur ce port : connexion refusée.
        let refused = reqwest::Client::new()
            .get("http://127.0.0.1:9/latest.json")
            .send()
            .await
            .unwrap_err();
        let refused = Error::Reqwest(refused);
        assert_eq!(
            classify_error(&refused, UpdaterStage::Check),
            UpdaterError::Offline
        );
        assert_eq!(
            classify_error(&refused, UpdaterStage::Download),
            UpdaterError::Offline
        );

        // latest.json précédé d'un BOM : « error decoding response body ».
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200).set_body_string("\u{feff}{\"version\":\"0.7.4\"}"),
            )
            .mount(&server)
            .await;
        let decode = reqwest::get(server.uri())
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap_err();
        let decode = Error::Reqwest(decode);
        assert_eq!(
            classify_error(&decode, UpdaterStage::Check),
            UpdaterError::Manifest
        );
        assert_eq!(
            classify_error(&decode, UpdaterStage::Download),
            UpdaterError::Interrupted
        );
    }

    #[test]
    fn a_new_check_keeps_the_same_downloaded_version_ready() {
        assert!(keeps_download(Some("0.7.4"), "0.7.4", true));
        // Autre version, rien de téléchargé ou première recherche : à télécharger.
        assert!(!keeps_download(Some("0.7.4"), "0.7.5", true));
        assert!(!keeps_download(Some("0.7.4"), "0.7.4", false));
        assert!(!keeps_download(None, "0.7.4", true));
    }

    #[test]
    fn updater_errors_serialize_as_stable_codes() {
        assert_eq!(
            serde_json::to_value(UpdaterError::Signature).unwrap(),
            "signature"
        );
        assert_eq!(
            serde_json::to_value(UpdaterError::Interrupted).unwrap(),
            "interrupted"
        );
    }

    #[test]
    fn release_url_points_to_the_announced_version() {
        assert_eq!(
            release_url("0.7.4"),
            "https://github.com/WillIsback/Syntheo/releases/tag/v0.7.4"
        );
        assert_eq!(
            release_url("v0.7.4"),
            "https://github.com/WillIsback/Syntheo/releases/tag/v0.7.4"
        );
    }
}
