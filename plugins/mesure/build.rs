const COMMANDS: &[&str] = &["measure", "measure_differences"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
