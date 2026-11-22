use crate::events::*;

pub trait ListenerRuntime: syntheo_storage::StorageRuntime {
    fn emit_lifecycle(&self, event: SessionLifecycleEvent);
    fn emit_progress(&self, event: SessionProgressEvent);
    fn emit_error(&self, event: SessionErrorEvent);
    fn emit_data(&self, event: SessionDataEvent);

    /// Source « Sur ce poste » (issue 684) : cible du lancement en cours du
    /// module `syntheo-speech`, démarré ou relancé au besoin. Appelée à chaque
    /// démarrage d'un listener, reconnexion comprise. Par défaut : indisponible.
    fn on_device_target(
        &self,
    ) -> futures_util::future::BoxFuture<'static, Result<owhisper_client::OnDeviceTarget, String>>
    {
        Box::pin(async { Err("on-device transcription is not available".to_owned()) })
    }
}
