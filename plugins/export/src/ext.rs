use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use crate::print;

pub struct Export<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Export<'a, R, M> {
    pub fn export_pdf(
        &self,
        path: impl AsRef<Path>,
        input: impl Into<crate::ExportInput>,
    ) -> Result<(), crate::Error> {
        syntheo_export_core::export_pdf(path, input)
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
