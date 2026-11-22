const COMMANDS: &[&str] = &["configure", "validate", "set_active"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
