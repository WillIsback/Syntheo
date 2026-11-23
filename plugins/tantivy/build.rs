const COMMANDS: &[&str] = &["search"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
