use std::path::PathBuf;

use crate::ExportPluginExt;

#[tauri::command]
#[specta::specta]
pub(crate) async fn export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: PathBuf,
    input: crate::ExportInput,
) -> Result<(), String> {
    app.export().export_pdf(&path, input).await
}

// Export Markdown, texte ou Org (issue 422 : remplace fs2.write_text_file).
#[tauri::command]
#[specta::specta]
pub(crate) async fn export_text<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: PathBuf,
    content: String,
) -> Result<(), String> {
    app.export().export_text(&path, &content).await
}

// Boîte de dialogue « Enregistrer sous » ouverte côté Rust : le chemin choisi
// est le seul, hors dossiers d'export, où `export` et `export_text` écrivent.
#[tauri::command]
#[specta::specta]
pub(crate) async fn choose_export_path<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    default_path: String,
    extension: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let default_path = PathBuf::from(default_path);
    let mut dialog = app
        .dialog()
        .file()
        .add_filter(extension.to_uppercase(), &[extension.as_str()]);
    #[cfg(desktop)]
    {
        dialog = dialog.set_parent(&window);
    }
    #[cfg(not(desktop))]
    let _ = &window;
    if let Some(directory) = default_path.parent()
        && directory.components().count() > 0
    {
        dialog = dialog.set_directory(directory);
    }
    if let Some(name) = default_path.file_name() {
        dialog = dialog.set_file_name(name.to_string_lossy());
    }
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    app.export().remember_chosen_path(path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
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
