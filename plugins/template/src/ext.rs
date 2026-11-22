pub struct Template<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    #[allow(dead_code)]
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<R: tauri::Runtime, M: tauri::Manager<R>> Template<'_, R, M> {}

pub trait TemplatePluginExt<R: tauri::Runtime> {
    fn template(&self) -> Template<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> TemplatePluginExt<R> for T {
    fn template(&self) -> Template<'_, R, Self>
    where
        Self: Sized,
    {
        Template {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}
