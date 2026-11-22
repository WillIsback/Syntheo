//! Mesure de la reprise d'une synthèse depuis une note (bêta, issue 671).
//!
//! Deux commandes, toutes deux sans état : elles lisent la synthèse générée
//! et la version envoyée (texte collé ou fichier déposé), calculent avec le
//! crate `mesure` (le même que `syntheo mesure`), et rendent le résultat.
//! - `measure` : des nombres seulement, que l'interface peut enregistrer.
//! - `measure_differences` : les différences avec leurs extraits, pour le mode
//!   Calibrage. Rendues à l'écran seulement ; ce plugin n'a ni base, ni
//!   journal, ni fichier en écriture (test `plugin_persists_nothing`).

#![forbid(unsafe_code)]

mod commands;

const PLUGIN_NAME: &str = "mesure";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::measure::<tauri::Wry>,
            commands::measure_differences::<tauri::Wry>,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .build()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        const OUTPUT_FILE: &str = "./js/bindings.gen.ts";

        make_specta_builder::<tauri::Wry>()
            .disable_serde_phases()
            .semantic_types(
                specta_typescript::semantic::Configuration::empty().enable_lossless_floats(),
            )
            .dangerously_cast_bigints_to_number()
            .export(specta_typescript::Typescript::default(), OUTPUT_FILE)
            .unwrap();

        let content = std::fs::read_to_string(OUTPUT_FILE).unwrap();
        std::fs::write(OUTPUT_FILE, format!("// @ts-nocheck\n{content}")).unwrap();
    }

    // Garde-fou du mode Calibrage : ce plugin ne dépend d'aucune base, d'aucun
    // journal ni d'aucun stockage, et son code n'écrit nulle part. Les
    // extraits qu'il rend ne peuvent donc être persistés que par l'interface,
    // qui ne le fait pas (tests de l'interface).
    #[test]
    fn plugin_persists_nothing() {
        let manifest = include_str!("../Cargo.toml");
        let dependencies = manifest
            .split("[dependencies]")
            .nth(1)
            .unwrap()
            .split("\n[")
            .next()
            .unwrap();
        for forbidden in ["db", "sqlx", "tracing", "log", "store", "fs-", "settings"] {
            for line in dependencies
                .lines()
                .filter(|l| !l.trim_start().starts_with('#'))
            {
                let name = line.split('=').next().unwrap_or("").trim();
                assert!(!name.contains(forbidden), "dépendance interdite : {name}");
            }
        }
        // Code hors tests seulement (l'export des liaisons écrit un fichier).
        let marker = ["#[cfg", "(test)]"].concat();
        for source in [include_str!("lib.rs"), include_str!("commands.rs")] {
            let code = source.split(marker.as_str()).next().unwrap();
            let forbidden = [
                "std::fs::write",
                "File::create",
                "OpenOptions",
                "tracing::",
                "log::",
                "println!",
                "eprintln!",
            ];
            for call in forbidden {
                assert!(!code.contains(call), "écriture interdite : {call}");
            }
        }
    }
}
