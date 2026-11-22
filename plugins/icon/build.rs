const COMMANDS: &[&str] = &["set_dock_icon", "set_recording_indicator"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
