//! Mesure de la reprise d'une synthèse depuis une note (bêta, issue 671).
//!
//! Deux commandes, toutes deux sans état : elles lisent la synthèse générée
//! et la version envoyée (texte collé ou fichier déposé), calculent avec le
//! crate `mesure` (le même que `syntheo mesure`), et rendent le résultat.
//! - `measure` : des nombres seulement, que l'interface peut enregistrer.
//! - `measure_differences` : les différences avec leurs extraits, pour le mode
//!   Calibrage. Rendues à l'écran seulement ; ce plugin ne lit la base que
//!   pour ses réglages et n'écrit nulle part (test `plugin_persists_nothing`).
//!
//! Aucune commande ne reçoit de chemin de fichier : l'interface lit le
//! fichier choisi ou déposé. Les deux commandes sont refusées par le relay.

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
        syntheo_specta_export::write_bindings(
            make_specta_builder::<tauri::Wry>(),
            "./js/bindings.gen.ts",
        );
    }

    // Garde-fou du mode Calibrage : ce plugin ne lit la base que pour ses
    // réglages (lecture seule), n'a ni journal ni stockage, et son code
    // n'écrit nulle part. Les extraits qu'il rend ne peuvent donc être persistés
    // que par l'interface, qui ne le fait pas (tests de l'interface).
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
        let allowed_db = ["syntheo-db-app", "tauri-plugin-db"];
        for forbidden in ["db", "sqlx", "tracing", "log", "store", "fs-", "settings"] {
            for line in dependencies
                .lines()
                .filter(|l| !l.trim_start().starts_with('#'))
            {
                let name = line.split('=').next().unwrap_or("").trim();
                if allowed_db.contains(&name) {
                    continue;
                }
                assert!(!name.contains(forbidden), "dépendance interdite : {name}");
            }
        }
        // Code hors tests seulement (l'export des liaisons écrit un fichier).
        let marker = ["#[cfg", "(test)]"].concat();
        for source in [include_str!("lib.rs"), include_str!("commands.rs")] {
            let code = source.split(marker.as_str()).next().unwrap();
            let forbidden = [
                "INSERT",
                "UPDATE ",
                "DELETE",
                "execute(",
                "std::fs::",
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
