//! Choix de la sortie capturée comme son système (issue 450).
//!
//! Le réglage arrive au démarrage d'une écoute (`set_preferred_output`) et vaut pour les
//! captures ouvertes ensuite, reprises comprises. `captured_output` dit la vérité : pendant une
//! écoute, la sortie à laquelle la capture est réellement branchée ; sinon celle que capterait
//! une écoute qui démarre.

use std::sync::Mutex;

use syntheo_audio::OutputDevice;
use syntheo_audio_device::{AudioDeviceBackend, is_headphone_output, speaker_capture_output};

static PREFERRED_OUTPUT: Mutex<Option<String>> = Mutex::new(None);

/// Identifiant de la sortie que la capture WASAPI écoute en ce moment.
#[cfg(target_os = "windows")]
static CAPTURED_OUTPUT_ID: Mutex<Option<String>> = Mutex::new(None);

/// Sortie choisie pour les prochaines captures ; vide ou `None` suit la sortie par défaut.
pub fn set_preferred_output(device: Option<String>) {
    let device = device.filter(|name| !name.trim().is_empty());
    *PREFERRED_OUTPUT.lock().unwrap_or_else(|e| e.into_inner()) = device;
}

pub(crate) fn preferred_output() -> Option<String> {
    PREFERRED_OUTPUT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[cfg(target_os = "windows")]
pub(crate) fn set_captured_output_id(id: Option<String>) {
    *CAPTURED_OUTPUT_ID.lock().unwrap_or_else(|e| e.into_inner()) = id;
}

fn live_capture_output_id() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        super::linux::captured_sink_name()
    }
    #[cfg(target_os = "windows")]
    {
        CAPTURED_OUTPUT_ID
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    #[cfg(target_os = "macos")]
    {
        None
    }
}

/// Identifiant de plateforme de la sortie à capturer, seulement quand la sortie choisie est
/// présente : sans choix ou en repli, la capture suit la sortie par défaut du système.
#[cfg(target_os = "linux")]
pub(crate) fn explicit_output_id(preferred: Option<&str>) -> Option<String> {
    preferred?;
    match speaker_capture_output(preferred) {
        Some(output) if output.explicit => Some(output.device.id.0),
        _ => {
            tracing::warn!(
                syntheo.audio.device = ?preferred,
                "speaker_output_unavailable_using_default"
            );
            None
        }
    }
}

/// Sortie capturée en ce moment, ou celle que capterait une écoute avec `preferred`.
pub fn captured_output(preferred: Option<&str>) -> Option<OutputDevice> {
    let live = live_capture_output_id().and_then(|id| {
        syntheo_audio_device::backend()
            .list_output_devices()
            .ok()?
            .into_iter()
            .find(|device| device.id.0 == id)
    });
    let device = match live {
        Some(device) => device,
        None => speaker_capture_output(preferred)?.device,
    };
    Some(OutputDevice {
        headphone: is_headphone_output(&device),
        name: device.name,
    })
}

#[cfg(test)]
mod tests {
    use super::{preferred_output, set_preferred_output};

    #[test]
    #[serial_test::serial(speaker_output)]
    fn blank_choice_means_the_system_default() {
        set_preferred_output(Some("Casque (Jabra Evolve2)".into()));
        assert_eq!(
            preferred_output().as_deref(),
            Some("Casque (Jabra Evolve2)")
        );
        set_preferred_output(Some("  ".into()));
        assert_eq!(preferred_output(), None);
        set_preferred_output(None);
        assert_eq!(preferred_output(), None);
    }
}
