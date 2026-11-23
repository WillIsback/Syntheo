use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri::Manager;

mod ax_worker;
mod commands;
mod dnd;
mod error;
mod events;
mod ext;
mod manifest;
mod mic_usage_tracker;
mod timer_registry;

#[cfg(feature = "test-support")]
pub mod env;
#[cfg(not(feature = "test-support"))]
mod env;

#[cfg(feature = "test-support")]
pub mod handler;
#[cfg(not(feature = "test-support"))]
mod handler;

#[cfg(feature = "test-support")]
pub mod policy;
#[cfg(not(feature = "test-support"))]
mod policy;

pub use dnd::*;
pub use error::*;
pub use events::*;
pub use ext::*;
pub use mic_usage_tracker::MicUsageTracker;
pub use policy::*;

const PLUGIN_NAME: &str = "detect";

pub(crate) type DetectorState = Mutex<syntheo_detect::Detector>;
pub(crate) type ScreenShareSamplerState = Arc<Mutex<syntheo_detect::ScreenShareSampler>>;

/// L'invite « Êtes-vous en réunion ? » est-elle affichée par l'interface
/// (`notification_detect && !notification_disabled`) ? Poussée par
/// `set_detect_enabled` au démarrage et à chaque changement (issue 618). Ne
/// coupe pas `MicDetected`, décide seulement de la carence de 10 minutes.
/// Hors du mutex du processeur : le minuteur la lit en tenant ce verrou.
///
/// Fausse avant la première poussée : sans carence, une détection ne peut
/// pas retarder la suivante (le cas de l'issue 618).
#[derive(Default)]
pub(crate) struct DetectEnabled(pub(crate) AtomicBool);

#[cfg(feature = "test-support")]
pub type ProcessorState = Arc<Mutex<Processor>>;
#[cfg(not(feature = "test-support"))]
pub(crate) type ProcessorState = Arc<Mutex<Processor>>;

pub struct Processor {
    pub policy: policy::MicNotificationPolicy,
    pub mic_usage_tracker: mic_usage_tracker::MicUsageTracker,
    pub mic_active_threshold_secs: u64,
}

impl Default for Processor {
    fn default() -> Self {
        Self {
            policy: Default::default(),
            mic_usage_tracker: Default::default(),
            mic_active_threshold_secs: mic_usage_tracker::DEFAULT_MIC_ACTIVE_THRESHOLD_SECS,
        }
    }
}

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::list_installed_applications::<tauri::Wry>,
            commands::list_mic_using_applications::<tauri::Wry>,
            commands::set_respect_do_not_disturb::<tauri::Wry>,
            commands::set_ignored_bundle_ids::<tauri::Wry>,
            commands::set_included_bundle_ids::<tauri::Wry>,
            commands::list_default_ignored_bundle_ids::<tauri::Wry>,
            commands::inspect_meeting_accessibility::<tauri::Wry>,
            commands::send_meeting_chat_message::<tauri::Wry>,
            commands::capture_meeting_chat_messages::<tauri::Wry>,
            commands::capture_meeting_screen_share::<tauri::Wry>,
            commands::get_preferred_languages::<tauri::Wry>,
            commands::set_mic_active_threshold::<tauri::Wry>,
            commands::set_detect_enabled::<tauri::Wry>,
        ])
        .events(tauri_specta::collect_events![DetectEvent])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            specta_builder.mount_events(app);

            app.manage(DetectorState::default());
            app.manage(ProcessorState::default());
            app.manage(DetectEnabled::default());
            app.manage(ScreenShareSamplerState::default());
            app.manage(ax_worker::AxWorker::default());

            let app_handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                handler::setup(&app_handle).unwrap();
            });

            Ok(())
        })
        .build()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn command_manifest_is_single_source() {
        syntheo_specta_export::assert_command_manifest_is_single_source(
            make_specta_builder::<tauri::Wry>(),
            PLUGIN_NAME,
            crate::manifest::COMMANDS,
        );
    }

    #[test]
    fn export_types() {
        syntheo_specta_export::write_bindings(
            make_specta_builder::<tauri::Wry>(),
            "./js/bindings.gen.ts",
        );
    }

    fn create_app<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::App<R> {
        builder
            .plugin(init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }

    #[test]
    fn test_detect() {
        let _app = create_app(tauri::test::mock_builder());
    }
}
