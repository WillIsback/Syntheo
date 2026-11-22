const COMMANDS: &[&str] = &["take_pending_deep_links"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
