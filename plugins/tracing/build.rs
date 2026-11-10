const COMMANDS: &[&str] = &["do_log"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
