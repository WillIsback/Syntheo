use std::sync::Arc;

use tauri::Manager;

use crate::recorder::{RecordedAudio, Recorder};

#[tauri::command]
#[specta::specta]
pub(crate) async fn capture_target() -> Result<String, String> {
    crate::insertion::capture().await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn insert_text(target: String, text: String) -> Result<(), String> {
    if text.contains('\0') {
        return Err("Dictation text contains an unsupported NUL character".into());
    }
    if text.is_empty() || text.len() > 100_000 {
        return Err("Dictation text is empty or too long".into());
    }
    let text = typed_text(&text);
    if text.is_empty() {
        return Err("Dictation text is empty or too long".into());
    }
    crate::insertion::insert(target, text).await
}

/// Texte réellement frappé dans l'application cible (issue 657) : la frappe
/// simulée envoie chaque caractère tel quel, si bien qu'un retour à la ligne
/// validerait un formulaire ou une commande, et qu'un caractère de contrôle
/// ou de direction (bidi) changerait ce qui est saisi. Ils deviennent des
/// espaces, regroupées, sans espace au début ni à la fin.
pub(crate) fn typed_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut pending_space = false;
    for c in text.chars() {
        if c.is_control() || is_bidi_control(c) || c.is_whitespace() {
            pending_space = !out.is_empty();
            continue;
        }
        if pending_space {
            out.push(' ');
            pending_space = false;
        }
        out.push(c);
    }
    out
}

fn is_bidi_control(c: char) -> bool {
    matches!(
        c,
        '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
    )
}

#[cfg(test)]
mod typed_text_tests {
    use super::typed_text;

    // Issue 657 : ni retour à la ligne, ni tabulation, ni échappement, ni
    // contrôle bidi ne sont frappés ; le reste du texte est gardé.
    #[test]
    fn control_and_bidi_characters_become_single_spaces() {
        assert_eq!(
            typed_text("Bonjour\r\nrm -rf\t/\u{1b}[2J fin"),
            "Bonjour rm -rf / [2J fin"
        );
        assert_eq!(typed_text("abc\u{202E}fed\u{2066}"), "abc fed");
        assert_eq!(typed_text("  \n déjà\u{00A0}vu 👍🏽 \n"), "déjà vu 👍🏽");
        assert_eq!(typed_text("\n\t\u{200F}"), "");
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn start_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    microphone_device: Option<String>,
    owner: String,
) -> Result<(), String> {
    let audio = app
        .state::<Arc<dyn syntheo_audio::AudioProvider>>()
        .inner()
        .clone();
    app.state::<Recorder>()
        .start(audio, microphone_device, owner)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn stop_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    owner: String,
) -> Result<RecordedAudio, String> {
    app.state::<Recorder>()
        .stop(&owner)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn cancel_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    owner: String,
) -> Result<(), String> {
    app.state::<Recorder>()
        .cancel(&owner)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn start_system_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    microphone_device: Option<String>,
    owner: String,
    preview: Option<crate::preview::PreviewConfig>,
    updates: tauri::ipc::Channel<crate::preview::RecordingUpdate>,
) -> Result<(), String> {
    let audio = app
        .state::<Arc<dyn syntheo_audio::AudioProvider>>()
        .inner()
        .clone();
    app.state::<Recorder>()
        .start_with_feedback(audio, microphone_device, owner, preview, Some(updates))
        .map_err(|error| error.to_string())
}
