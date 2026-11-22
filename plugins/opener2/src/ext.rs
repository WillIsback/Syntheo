use std::path::Path;
use tauri_plugin_opener::OpenerExt;

pub struct Opener2<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Opener2<'a, R, M> {
    /// Ouvre une page http(s) ou une adresse `mailto:` simple avec le
    /// programme par défaut ; tout autre schéma est refusé (issue 676).
    pub fn open_url(&self, url: &str) -> crate::Result<()> {
        crate::policy::check_openable_url(url)?;
        self.manager.opener().open_url(url.trim(), None::<&str>)?;
        Ok(())
    }

    /// Ouvre un fichier avec le programme associé par le système, jamais avec
    /// un programme choisi par l'appelant (issue 676).
    pub fn open_path(&self, path: &str) -> crate::Result<()> {
        crate::policy::check_openable_path(path)?;
        self.manager.opener().open_path(path, None::<&str>)?;
        Ok(())
    }

    pub fn reveal_item_in_dir<P: AsRef<Path>>(&self, path: P) -> crate::Result<()> {
        self.manager.opener().reveal_item_in_dir(path)?;
        Ok(())
    }
}

pub trait Opener2PluginExt<R: tauri::Runtime> {
    fn opener2(&self) -> Opener2<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> Opener2PluginExt<R> for T {
    fn opener2(&self) -> Opener2<'_, R, Self>
    where
        Self: Sized,
    {
        Opener2 {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}
