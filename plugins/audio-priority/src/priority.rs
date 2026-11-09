use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use syntheo_audio_device::{AudioDevice, AudioDirection};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct StoredDevice {
    pub uid: String,
    pub name: String,
    pub is_input: bool,
    pub last_seen: u64,
}

impl StoredDevice {
    pub fn new(uid: impl Into<String>, name: impl Into<String>, is_input: bool) -> Self {
        Self {
            uid: uid.into(),
            name: name.into(),
            is_input,
            last_seen: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        }
    }

    pub fn update_last_seen(&mut self) {
        self.last_seen = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct PriorityState {
    #[serde(default)]
    pub input_priorities: Vec<String>,
    #[serde(default, alias = "speaker_priorities")]
    pub output_priorities: Vec<String>,
    #[serde(default, alias = "hidden_mics")]
    pub hidden_inputs: Vec<String>,
    #[serde(default, alias = "hidden_speakers")]
    pub hidden_outputs: Vec<String>,
    #[serde(default)]
    pub known_devices: Vec<StoredDevice>,
}

#[derive(Debug, Clone)]
pub struct PriorityManager {
    state: PriorityState,
}

impl Default for PriorityManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PriorityManager {
    pub fn new() -> Self {
        Self {
            state: PriorityState::default(),
        }
    }

    pub fn state(&self) -> &PriorityState {
        &self.state
    }

    pub fn get_known_devices(&self) -> &[StoredDevice] {
        &self.state.known_devices
    }

    pub fn remember_device(&mut self, uid: &str, name: &str, is_input: bool) {
        if let Some(device) = self.state.known_devices.iter_mut().find(|d| d.uid == uid) {
            device.name = name.to_string();
            device.update_last_seen();
        } else {
            self.state
                .known_devices
                .push(StoredDevice::new(uid, name, is_input));
        }
    }

    pub fn forget_device(&mut self, uid: &str) {
        self.state.known_devices.retain(|d| d.uid != uid);
        self.state.input_priorities.retain(|u| u != uid);
        self.state.output_priorities.retain(|u| u != uid);
        self.state.hidden_inputs.retain(|u| u != uid);
        self.state.hidden_outputs.retain(|u| u != uid);
    }

    pub fn hide_device(&mut self, device: &AudioDevice) {
        let uid = device.id.as_str().to_string();
        let hidden_list = match device.direction {
            AudioDirection::Input => &mut self.state.hidden_inputs,
            AudioDirection::Output => &mut self.state.hidden_outputs,
        };
        if !hidden_list.contains(&uid) {
            hidden_list.push(uid);
        }
    }

    pub fn unhide_device(&mut self, device: &AudioDevice) {
        let uid = device.id.as_str();
        let hidden_list = match device.direction {
            AudioDirection::Input => &mut self.state.hidden_inputs,
            AudioDirection::Output => &mut self.state.hidden_outputs,
        };
        hidden_list.retain(|u| u != uid);
    }

    pub fn sort_by_priority(
        &self,
        devices: &[AudioDevice],
        direction: AudioDirection,
    ) -> Vec<AudioDevice> {
        let priorities = match direction {
            AudioDirection::Input => &self.state.input_priorities,
            AudioDirection::Output => &self.state.output_priorities,
        };
        self.sort_devices_by_priorities(devices, priorities)
    }

    fn sort_devices_by_priorities(
        &self,
        devices: &[AudioDevice],
        priorities: &[String],
    ) -> Vec<AudioDevice> {
        let mut sorted = devices.to_vec();
        sorted.sort_by(|a, b| {
            let index_a = priorities
                .iter()
                .position(|u| u == a.id.as_str())
                .unwrap_or(usize::MAX);
            let index_b = priorities
                .iter()
                .position(|u| u == b.id.as_str())
                .unwrap_or(usize::MAX);
            index_a.cmp(&index_b)
        });
        sorted
    }

    pub fn move_device_to_top(&mut self, device: &AudioDevice) {
        let uid = device.id.as_str().to_string();
        let priorities = match device.direction {
            AudioDirection::Input => &mut self.state.input_priorities,
            AudioDirection::Output => &mut self.state.output_priorities,
        };
        priorities.retain(|u| u != &uid);
        priorities.insert(0, uid);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_priority_state_keys_still_deserialize() {
        let state = serde_json::from_value::<PriorityState>(serde_json::json!({
            "speaker_priorities": ["output-1"],
            "hidden_mics": ["input-1"],
            "hidden_speakers": ["output-2"]
        }))
        .unwrap();

        assert_eq!(state.output_priorities, ["output-1"]);
        assert_eq!(state.hidden_inputs, ["input-1"]);
        assert_eq!(state.hidden_outputs, ["output-2"]);

        let state = serde_json::from_value::<PriorityState>(serde_json::json!({})).unwrap();
        assert!(state.input_priorities.is_empty());
        assert!(state.output_priorities.is_empty());
        assert!(state.hidden_inputs.is_empty());
        assert!(state.hidden_outputs.is_empty());
        assert!(state.known_devices.is_empty());
    }
}
