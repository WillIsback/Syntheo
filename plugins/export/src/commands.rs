use std::path::PathBuf;

use crate::ExportPluginExt;

#[tauri::command]
#[specta::specta]
pub(crate) async fn export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: PathBuf,
    input: crate::ExportInput,
) -> Result<(), String> {
    app.export()
        .export_pdf(&path, input)
        .map_err(|e| e.to_string())
}

// « Imprimer… » (issue 374) : PDF temporaire, à ouvrir dans le lecteur.
#[tauri::command]
#[specta::specta]
pub(crate) async fn print_pdf<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    input: crate::ExportInput,
) -> Result<String, String> {
    app.export()
        .export_print_pdf(input)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

// Après le délai de lecture : supprime les PDF à imprimer devenus inutiles.
#[tauri::command]
#[specta::specta]
pub(crate) async fn cleanup_print_files<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    app.export()
        .cleanup_print_files(crate::print::PRINT_FILE_TTL)
        .map(|_| ())
        .map_err(|e| e.to_string())
}
