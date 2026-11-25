use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut};
use futures_util::StreamExt;
use tauri::Manager;
use tauri_plugin_global_shortcut::Shortcut;
use tauri_specta::Event;

use super::trigger::portal_trigger;

use crate::ShortcutEvent;

/// Code d'erreur stable pour tout échec du portail Global Shortcuts (portail
/// absent, session refusée, liaison refusée) : l'interface le traduit (passe
/// QA 0.8.1-2 ; sous sway, c'est `create_session` qui échoue, avec « Portal
/// request failed: org.freedesktop.zbus.Error: FDO error »). Le détail ne va
/// qu'au journal.
pub const PORTAL_UNAVAILABLE: &str = "portal_unavailable";

fn portal_unavailable(step: &'static str, error: impl std::fmt::Display) -> String {
    tracing::warn!(step, %error, "global_shortcuts_portal_failed");
    PORTAL_UNAVAILABLE.to_string()
}

pub struct Registration {
    stop: tokio::sync::oneshot::Sender<()>,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl Registration {
    pub async fn close(self) {
        let _ = self.stop.send(());
        let _ = self.task.await;
    }
}

pub async fn register(app: tauri::AppHandle, key: Shortcut) -> Result<Registration, String> {
    let portal = GlobalShortcuts::new()
        .await
        .map_err(|e| portal_unavailable("connect", e))?;
    let session = portal
        .create_session(Default::default())
        .await
        .map_err(|e| portal_unavailable("create_session", e))?;
    let setup = tokio::time::timeout(std::time::Duration::from_secs(45), async {
        let pressed = portal
            .receive_activated()
            .await
            .map_err(|e| portal_unavailable("receive_activated", e))?;
        let released = portal
            .receive_deactivated()
            .await
            .map_err(|e| portal_unavailable("receive_deactivated", e))?;
        let trigger = portal_trigger(key)?;
        portal
            .bind_shortcuts(
                &session,
                &[
                    NewShortcut::new("dictate", "Dictate with Syntheo")
                        .preferred_trigger(trigger.as_str()),
                    NewShortcut::new("cancel-dictation", "Cancel Syntheo dictation")
                        .preferred_trigger("CTRL+ALT+Escape"),
                ],
                None,
                Default::default(),
            )
            .await
            .and_then(|request| request.response())
            .map_err(|e| portal_unavailable("bind_shortcuts", e))?;
        Ok::<_, String>((pressed, released))
    })
    .await;
    let (mut pressed, mut released) = match setup {
        Ok(Ok(streams)) => streams,
        error => {
            let _ = session.close().await;
            return Err(match error {
                Ok(Err(error)) => error,
                _ => "Shortcut setup timed out. Retry setup and approve your desktop's shortcut prompt.".into(),
            });
        }
    };
    let session_path: String =
        serde_json::from_value(serde_json::to_value(&session).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let (stop, mut stopped) = tokio::sync::oneshot::channel();

    let task = tauri::async_runtime::spawn(async move {
        let Ok(mut closed) = session.receive_closed().await else {
            let _ = session.close().await;
            let _ = ShortcutEvent::Cancelled.emit(&app);
            return;
        };
        let mut down = false;
        loop {
            tokio::select! {
                _ = &mut stopped => break,
                _ = closed.next() => break,
                event = pressed.next() => {
                    let Some(event) = event else { break };
                    if event.session_handle().as_str() != session_path { continue; }
                    match event.shortcut_id() {
                        "dictate" if !down => { down = true; let _ = ShortcutEvent::Pressed.emit(&app); }
                        "cancel-dictation" if app.state::<super::GlobalState>().active.load(std::sync::atomic::Ordering::SeqCst) => {
                            let _ = ShortcutEvent::Cancelled.emit(&app);
                        }
                        _ => {}
                    }
                }
                event = released.next() => {
                    let Some(event) = event else { break };
                    if event.session_handle().as_str() == session_path && event.shortcut_id() == "dictate" {
                        down = false;
                        let _ = ShortcutEvent::Released.emit(&app);
                    }
                }
            }
        }
        let _ = session.close().await;
        let _ = ShortcutEvent::Cancelled.emit(&app);
    });
    Ok(Registration { stop, task })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Passe QA 0.8.1-2 : un échec du portail renvoie le code stable, jamais
    // le message technique de zbus.
    #[test]
    fn a_portal_failure_returns_the_stable_code() {
        let error = portal_unavailable(
            "create_session",
            "Portal request failed: org.freedesktop.zbus.Error: FDO error",
        );
        assert_eq!(error, PORTAL_UNAVAILABLE);
    }
}
