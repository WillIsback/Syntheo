mod error;
mod ext;

pub use error::{Error, Result};
pub use ext::*;

const PLUGIN_NAME: &str = "sidecar2";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![])
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

    fn create_app<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::App<R> {
        let mut ctx = tauri::test::mock_context(tauri::test::noop_assets());
        ctx.config_mut().identifier = "com.syntheo.dev".to_string();
        ctx.config_mut().version = Some("0.0.1".to_string());

        builder.plugin(init()).build(ctx).unwrap()
    }

    #[tokio::test]
    async fn test_sidecar2() {
        let _app = create_app(tauri::test::mock_builder());
    }
}
