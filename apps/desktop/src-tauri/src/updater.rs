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
    }
}

#[cfg(not(feature = "devtools"))]
async fn announce<R: Runtime>(app: &AppHandle<R>, target: &str) -> Result<UpdateCheck, String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app
        .updater_builder()
        .target(target)
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    // L'objet `Update` est abandonné ici : seule l'annonce sort.
    Ok(update.map_or(UpdateCheck::UpToDate, |update| available(&update, false)))
}

#[tauri::command]
#[specta::specta]
pub async fn updater_check<R: Runtime>(app: AppHandle<R>) -> Result<UpdateCheck, String> {
    #[cfg(feature = "devtools")]
    {
        let _ = app;
        Ok(UpdateCheck::Unavailable)
    }
    #[cfg(not(feature = "devtools"))]
    {
        use tauri_plugin_updater::{Error, UpdaterExt};
        let state = app.state::<UpdaterState>();
        *state.downloaded.lock().await = None;
        let path = update_path(tauri::utils::platform::bundle_type(), cfg!(windows));
        let check = match path {
            UpdatePath::AnnounceOnly(target) => announce(&app, target).await?,
            UpdatePath::Install => {
                let updater = app.updater().map_err(|error| error.to_string())?;
                match updater.check().await {
                    Ok(Some(update)) => {
                        let check = available(&update, true);
                        *state.pending.lock().await = Some(update);
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
                    Err(error) => return Err(error.to_string()),
                }
            }
        };
        *state.pending.lock().await = None;
        Ok(check)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn updater_download<R: Runtime>(
    app: AppHandle<R>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    #[cfg(feature = "devtools")]
    {
        let _ = (app, on_event);
        Err("updater_unavailable".to_string())
    }
    #[cfg(not(feature = "devtools"))]
    {
        let state = app.state::<UpdaterState>();
        let update = state
            .pending
            .lock()
            .await
            .clone()
            .ok_or_else(|| "no_pending_update".to_string())?;
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
            .map_err(|error| error.to_string())?;
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
pub async fn updater_install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    #[cfg(feature = "devtools")]
    {
        let _ = app;
        Err("updater_unavailable".to_string())
    }
    #[cfg(not(feature = "devtools"))]
    {
        let state = app.state::<UpdaterState>();
        let update = state
            .pending
            .lock()
            .await
            .clone()
            .ok_or_else(|| "no_pending_update".to_string())?;
        let bytes = state
            .downloaded
            .lock()
            .await
            .take()
            .ok_or_else(|| "update_not_downloaded".to_string())?;
        update.install(bytes).map_err(|error| error.to_string())
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
