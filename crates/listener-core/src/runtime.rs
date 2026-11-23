use crate::events::*;

pub trait ListenerRuntime: syntheo_storage::StorageRuntime {
    fn emit_lifecycle(&self, event: SessionLifecycleEvent);
    fn emit_progress(&self, event: SessionProgressEvent);
    fn emit_error(&self, event: SessionErrorEvent);
    fn emit_data(&self, event: SessionDataEvent);

    /// Source « Sur ce poste » (issue 684) : cible du lancement en cours du
    /// module `syntheo-speech`, démarré ou relancé au besoin. Appelée à chaque
    /// démarrage d'un listener, reconnexion comprise. Par défaut : indisponible.
    /// Profil retenu par la mise en service du module (issue 686) : un ou
    /// deux flux, diarisation ou non. Lu au démarrage de chaque session.
    fn on_device_profile(&self) -> Option<owhisper_client::OnDeviceProfile> {
        None
    }

    fn on_device_target(
        &self,
    ) -> futures_util::future::BoxFuture<
        'static,
        Result<owhisper_client::OnDeviceTarget, owhisper_client::OnDeviceError>,
    > {
        Box::pin(async {
            Err(owhisper_client::OnDeviceError {
                kind: owhisper_client::OnDeviceErrorKind::Unavailable,
                message: "on-device transcription is not available".to_owned(),
            })
        })
    }
}
