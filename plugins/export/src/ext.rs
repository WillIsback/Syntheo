use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use crate::destination::{self, ChosenExportPaths, Destination};
use crate::print;

pub struct Export<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Export<'a, R, M> {
    // Dossiers où l'export peut créer un fichier (issue 422) : ceux des
    // paramètres, et Téléchargements, utilisé quand aucun n'est choisi.
    pub async fn export_folders(&self) -> Vec<PathBuf> {
        let mut folders = Vec::new();
        if let Some(db) = self.manager.try_state::<tauri_plugin_db::ManagedState>() {
            match destination::configured_export_folders(db.pool()).await {
                Ok(configured) => folders.extend(configured),
                Err(error) => eprintln!("[export] failed to read the export folder: {error}"),
            }
        }
        if let Ok(downloads) = self.manager.path().download_dir() {
            folders.push(downloads);
        }
        folders
    }

    // Chemin rendu par la boîte de dialogue « Enregistrer sous ».
    pub fn remember_chosen_path(&self, path: PathBuf) {
        if let Some(chosen) = self.manager.try_state::<ChosenExportPaths>() {
            chosen.remember(path);
        }
    }

    async fn authorize(&self, path: &Path, extensions: &[&str]) -> Result<Destination, String> {
        let folders = self.export_folders().await;
        let chosen = self
            .manager
            .try_state::<ChosenExportPaths>()
            .ok_or_else(|| "export plugin is not initialized".to_string())?;
        destination::authorize(path, extensions, &folders, &chosen)
    }

    pub async fn export_pdf(
        &self,
        path: &Path,
        input: impl Into<crate::ExportInput>,
    ) -> Result<(), String> {
        let pdf = syntheo_export_core::render_pdf(input).map_err(|e| e.to_string())?;
        let destination = self.authorize(path, destination::PDF_EXTENSIONS).await?;
        destination::write_export(path, destination, &pdf).map_err(|e| e.to_string())
    }

    pub async fn export_text(&self, path: &Path, content: &str) -> Result<(), String> {
        let destination = self.authorize(path, destination::TEXT_EXTENSIONS).await?;
        destination::write_export(path, destination, content.as_bytes()).map_err(|e| e.to_string())
    }

    // Dossier privé des PDF à imprimer, dans le cache de l'app.
    pub fn print_dir(&self) -> Result<PathBuf, crate::Error> {
        let cache = self
            .manager
            .path()
            .app_cache_dir()
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        Ok(cache.join(print::PRINT_DIR_NAME))
    }

    // Écrit le PDF à imprimer sous un nom non devinable et renvoie son chemin.
    pub fn export_print_pdf(
        &self,
        input: impl Into<crate::ExportInput>,
    ) -> Result<PathBuf, crate::Error> {
        let input = input.into();
        let dir = self.print_dir()?;
        print::prepare_print_dir(&dir)?;
        print::cleanup_print_dir(&dir, print::PRINT_FILE_TTL, SystemTime::now());

        let title = input
            .metadata
            .as_ref()
            .map(|metadata| metadata.title.as_str())
            .unwrap_or_default();
        let path = print::new_print_path(&dir, title);
        syntheo_export_core::export_pdf(&path, input)?;
        Ok(path)
    }

    // Supprime les PDF à imprimer plus vieux que `min_age`.
    pub fn cleanup_print_files(&self, min_age: Duration) -> Result<usize, crate::Error> {
        let dir = self.print_dir()?;
        Ok(print::cleanup_print_dir(&dir, min_age, SystemTime::now()))
    }
}

pub trait ExportPluginExt<R: tauri::Runtime> {
    fn export(&self) -> Export<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> ExportPluginExt<R> for T {
    fn export(&self) -> Export<'_, R, Self>
    where
        Self: Sized,
    {
        Export {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}
