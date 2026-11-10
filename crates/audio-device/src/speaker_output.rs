//! Sortie capturée comme son système (issue 450).
//!
//! L'utilisateur choisit dans les réglages la sortie dont Syntheo transcrit le son, ou laisse
//! « Sortie par défaut actuelle » pour suivre le système (casque branché → casque capté). Une
//! sortie choisie mais absente se replie sur la sortie par défaut. Le choix est fait par le nom
//! affiché, comme pour le micro ; la capture cible ensuite l'identifiant de la plateforme (nom
//! du sink PipeWire, identifiant du point de terminaison WASAPI).

use crate::{AudioDevice, AudioDeviceBackend};

/// Sortie retenue pour capturer le son système.
#[derive(Debug, Clone, PartialEq)]
pub struct SpeakerCaptureOutput {
    pub device: AudioDevice,
    /// Vrai quand la sortie choisie est utilisée ; faux quand on suit la sortie par défaut
    /// (aucun choix, ou sortie choisie absente).
    pub explicit: bool,
}

/// Noms des sorties qu'on peut capturer, sans doublon, dans l'ordre de la plateforme.
pub fn speaker_output_names() -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for device in crate::backend().list_output_devices().unwrap_or_default() {
        if !device.name.is_empty() && !names.contains(&device.name) {
            names.push(device.name);
        }
    }
    names
}

/// La sortie qu'une capture du son système doit écouter avec le choix `preferred`.
pub fn speaker_capture_output(preferred: Option<&str>) -> Option<SpeakerCaptureOutput> {
    let backend = crate::backend();
    let outputs = backend.list_output_devices().unwrap_or_default();
    resolve_speaker_capture_output(preferred, outputs).or_else(|| {
        // Certains systèmes ne marquent aucune sortie comme défaut dans la liste.
        let device = backend.get_default_output_device().ok().flatten()?;
        Some(SpeakerCaptureOutput {
            device,
            explicit: false,
        })
    })
}

/// Vrai pour un casque ou des écouteurs.
pub fn is_headphone_output(device: &AudioDevice) -> bool {
    crate::backend().is_headphone(device)
}

pub(crate) fn resolve_speaker_capture_output(
    preferred: Option<&str>,
    outputs: Vec<AudioDevice>,
) -> Option<SpeakerCaptureOutput> {
    let preferred = preferred.map(str::trim).filter(|name| !name.is_empty());
    let mut default = None;
    for device in outputs {
        if preferred == Some(device.name.as_str()) {
            return Some(SpeakerCaptureOutput {
                device,
                explicit: true,
            });
        }
        if device.is_default && default.is_none() {
            default = Some(device);
        }
    }
    default.map(|device| SpeakerCaptureOutput {
        device,
        explicit: false,
    })
}

#[cfg(test)]
mod tests {
    use super::resolve_speaker_capture_output;
    use crate::{AudioDevice, AudioDirection, TransportType};

    fn output(id: &str, name: &str, is_default: bool) -> AudioDevice {
        AudioDevice::new(id, name, AudioDirection::Output, TransportType::Unknown)
            .with_default(is_default)
    }

    fn outputs() -> Vec<AudioDevice> {
        vec![
            output("hdmi", "HDMI — GPU NVIDIA", false),
            output("speakers", "Haut-parleurs (Realtek)", true),
            output("headset", "Casque (Jabra Evolve2)", false),
        ]
    }

    #[test]
    fn no_choice_follows_the_system_default() {
        let picked = resolve_speaker_capture_output(None, outputs()).unwrap();
        assert_eq!(picked.device.id.as_str(), "speakers");
        assert!(!picked.explicit);

        let blank = resolve_speaker_capture_output(Some("  "), outputs()).unwrap();
        assert_eq!(blank.device.id.as_str(), "speakers");
        assert!(!blank.explicit);
    }

    #[test]
    fn chosen_output_wins_over_the_default() {
        let picked =
            resolve_speaker_capture_output(Some("Casque (Jabra Evolve2)"), outputs()).unwrap();
        assert_eq!(picked.device.id.as_str(), "headset");
        assert!(picked.explicit);
    }

    #[test]
    fn missing_choice_falls_back_to_the_default() {
        let picked = resolve_speaker_capture_output(Some("Casque débranché"), outputs()).unwrap();
        assert_eq!(picked.device.id.as_str(), "speakers");
        assert!(!picked.explicit);
    }

    #[test]
    fn default_change_is_followed_without_a_choice() {
        // Casque branché : le système en fait la sortie par défaut.
        let plugged = vec![
            output("speakers", "Haut-parleurs (Realtek)", false),
            output("headset", "Casque (Jabra Evolve2)", true),
        ];
        let picked = resolve_speaker_capture_output(None, plugged).unwrap();
        assert_eq!(picked.device.id.as_str(), "headset");
    }

    #[test]
    fn nothing_to_capture_without_outputs_or_default() {
        assert!(resolve_speaker_capture_output(None, Vec::new()).is_none());
        let no_default = vec![output("hdmi", "HDMI", false)];
        assert!(resolve_speaker_capture_output(Some("Casque"), no_default).is_none());
    }
}
