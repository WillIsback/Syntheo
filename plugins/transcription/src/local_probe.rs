//! Sonde de la transcription sur le poste (issue 682) : caractéristiques
//! statiques et micro-banc de quelques secondes, sans rien télécharger. Le
//! moteur est un paramètre : la décision entre A et B tombe après le banc de
//! l'issue 680.
//!
//! Exclusion mutuelle : une seule sonde à la fois ; refusée pendant une écoute
//! ou une finalisation, ou si l'état de capture ne répond pas ; une écoute qui
//! démarre interrompt la sonde en cours (verdict `interrupted`).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;

use crate::{CaptureState, ListenerPluginExt};

/// Durée du micro-banc : 3 à 5 s, assez pour un débit stable.
const BENCH: std::time::Duration = std::time::Duration::from_secs(4);

static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

/// Appelé au démarrage d'une écoute.
pub(crate) fn cancel_running_probe() {
    if RUNNING.load(Ordering::SeqCst) {
        CANCEL.store(true, Ordering::SeqCst);
    }
}

/// Libère le verrou de la sonde, même en cas de panique.
struct RunningGuard;

impl Drop for RunningGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

fn try_start() -> Option<RunningGuard> {
    RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .ok()
        .map(|_| {
            CANCEL.store(false, Ordering::SeqCst);
            RunningGuard
        })
}

/// Sonde le poste pour `engine`.
#[tauri::command]
#[specta::specta]
pub async fn probe_local_transcription<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    engine: syntheo_speech_probe::Engine,
) -> Result<syntheo_speech_probe::Probe, String> {
    let Some(guard) = try_start() else {
        return Err("probe in progress".to_owned());
    };
    match app.listener().capture_state_checked().await {
        Some(CaptureState::Inactive) => {}
        Some(_) => return Err("capture in progress".to_owned()),
        None => return Err("capture state unavailable".to_owned()),
    }
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        syntheo_speech_probe::predict::probe(engine, &data_dir, BENCH, &CANCEL)
    })
    .await
    .map_err(|_| "probe failed".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Revue 0.8.0 (sonde), constat 3 : une seule sonde à la fois, et une
    // écoute qui démarre lève le drapeau d'arrêt de la sonde en cours.
    #[test]
    fn one_probe_at_a_time_and_capture_interrupts_it() {
        let first = try_start().expect("first probe starts");
        assert!(try_start().is_none());
        assert!(!CANCEL.load(Ordering::SeqCst));
        cancel_running_probe();
        assert!(CANCEL.load(Ordering::SeqCst));
        drop(first);
        let second = try_start().expect("lock released");
        assert!(
            !CANCEL.load(Ordering::SeqCst),
            "a new probe starts uncancelled"
        );
        drop(second);
        // Sans sonde en cours, une écoute ne laisse pas de drapeau levé.
        cancel_running_probe();
        assert!(!CANCEL.load(Ordering::SeqCst));
    }
}
