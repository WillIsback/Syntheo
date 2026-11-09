//! Fichiers audio déposés sans chemin disque (WebKitGTK, WebView2) : la
//! webview les envoie par morceaux, gardés **en mémoire** jusqu'au batch.
//! Rien n'est écrit sur le disque, même temporairement.

use std::collections::HashMap;
use std::sync::Mutex;

use syntheo_transcription_core::listener2::AudioBuffer;

/// Plafond d'un fichier déposé : au-delà, la mémoire de la machine est en jeu.
pub const MAX_AUDIO_UPLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Un envoi abandonné (fenêtre fermée en plein dépôt) ne doit pas garder sa
/// mémoire indéfiniment : au-delà, le plus ancien est libéré.
const MAX_PENDING_UPLOADS: usize = 2;

struct PendingUpload {
    file_name: String,
    expected_len: usize,
    data: Vec<u8>,
    sequence: u64,
}

#[derive(Default)]
pub struct AudioUploadRegistry {
    inner: Mutex<RegistryInner>,
}

#[derive(Default)]
struct RegistryInner {
    uploads: HashMap<String, PendingUpload>,
    next_sequence: u64,
}

impl AudioUploadRegistry {
    pub fn begin(&self, file_name: String, size_bytes: u64) -> Result<String, String> {
        if size_bytes == 0 {
            return Err("audio_upload_empty".to_string());
        }
        if size_bytes > MAX_AUDIO_UPLOAD_BYTES {
            return Err("audio_upload_too_large".to_string());
        }
        let expected_len =
            usize::try_from(size_bytes).map_err(|_| "audio_upload_too_large".to_string())?;
        let mut data = Vec::new();
        data.try_reserve_exact(expected_len)
            .map_err(|_| "audio_upload_out_of_memory".to_string())?;

        let mut inner = self.lock()?;
        while inner.uploads.len() >= MAX_PENDING_UPLOADS {
            let oldest = inner
                .uploads
                .iter()
                .min_by_key(|(_, upload)| upload.sequence)
                .map(|(id, _)| id.clone());
            match oldest {
                Some(id) => {
                    inner.uploads.remove(&id);
                }
                None => break,
            }
        }

        let upload_id = uuid::Uuid::new_v4().to_string();
        inner.next_sequence += 1;
        let sequence = inner.next_sequence;
        inner.uploads.insert(
            upload_id.clone(),
            PendingUpload {
                file_name,
                expected_len,
                data,
                sequence,
            },
        );
        Ok(upload_id)
    }

    pub fn append(&self, upload_id: &str, chunk: &[u8]) -> Result<(), String> {
        let mut inner = self.lock()?;
        let upload = inner
            .uploads
            .get_mut(upload_id)
            .ok_or_else(|| "audio_upload_not_found".to_string())?;
        if upload.data.len() + chunk.len() > upload.expected_len {
            inner.uploads.remove(upload_id);
            return Err("audio_upload_size_mismatch".to_string());
        }
        upload.data.extend_from_slice(chunk);
        Ok(())
    }

    /// Remet le tampon complet au batch et l'oublie : un envoi ne sert qu'une fois.
    pub fn take(&self, upload_id: &str) -> Result<AudioBuffer, String> {
        let mut inner = self.lock()?;
        let upload = inner
            .uploads
            .remove(upload_id)
            .ok_or_else(|| "audio_upload_not_found".to_string())?;
        if upload.data.len() != upload.expected_len {
            return Err("audio_upload_incomplete".to_string());
        }
        Ok(AudioBuffer::new(upload.data, upload.file_name))
    }

    pub fn discard(&self, upload_id: &str) {
        if let Ok(mut inner) = self.lock() {
            inner.uploads.remove(upload_id);
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, RegistryInner>, String> {
        self.inner
            .lock()
            .map_err(|_| "audio_upload_registry_poisoned".to_string())
    }
}

pub(crate) fn decode_chunk(data_base64: &str) -> Result<Vec<u8>, String> {
    syntheo_transcription_core::listener2::decode_audio_base64(data_base64)
        .map_err(|_| "audio_upload_invalid_chunk".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn begin_audio_upload<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    file_name: String,
    size_bytes: u64,
) -> Result<String, String> {
    use tauri::Manager;

    app.state::<AudioUploadRegistry>()
        .begin(file_name, size_bytes)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn append_audio_upload<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    upload_id: String,
    data_base64: String,
) -> Result<(), String> {
    use tauri::Manager;

    let chunk = decode_chunk(&data_base64)?;
    app.state::<AudioUploadRegistry>()
        .append(&upload_id, &chunk)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn discard_audio_upload<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    upload_id: String,
) -> Result<(), String> {
    use tauri::Manager;

    app.state::<AudioUploadRegistry>().discard(&upload_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_are_reassembled_in_memory() {
        let registry = AudioUploadRegistry::default();
        let id = registry.begin("drop.mp4".to_string(), 5).unwrap();

        registry.append(&id, &[1, 2]).unwrap();
        registry.append(&id, &[3, 4, 5]).unwrap();
        let buffer = registry.take(&id).unwrap();

        assert_eq!(buffer.len(), 5);
        assert!(registry.take(&id).is_err(), "an upload is used only once");
    }

    #[test]
    fn incomplete_upload_is_refused() {
        let registry = AudioUploadRegistry::default();
        let id = registry.begin("drop.mp4".to_string(), 4).unwrap();
        registry.append(&id, &[1, 2]).unwrap();

        assert_eq!(registry.take(&id).unwrap_err(), "audio_upload_incomplete");
    }

    #[test]
    fn overflowing_chunk_drops_the_upload() {
        let registry = AudioUploadRegistry::default();
        let id = registry.begin("drop.mp4".to_string(), 2).unwrap();

        assert_eq!(
            registry.append(&id, &[1, 2, 3]).unwrap_err(),
            "audio_upload_size_mismatch"
        );
        assert_eq!(registry.take(&id).unwrap_err(), "audio_upload_not_found");
    }

    #[test]
    fn empty_and_oversized_uploads_are_refused() {
        let registry = AudioUploadRegistry::default();

        assert!(registry.begin("a.wav".to_string(), 0).is_err());
        assert!(
            registry
                .begin("a.wav".to_string(), MAX_AUDIO_UPLOAD_BYTES + 1)
                .is_err()
        );
    }

    #[test]
    fn abandoned_uploads_do_not_pile_up() {
        let registry = AudioUploadRegistry::default();
        let first = registry.begin("a.wav".to_string(), 1).unwrap();
        let _second = registry.begin("b.wav".to_string(), 1).unwrap();
        let _third = registry.begin("c.wav".to_string(), 1).unwrap();

        assert_eq!(
            registry.append(&first, &[1]).unwrap_err(),
            "audio_upload_not_found"
        );
    }

    #[test]
    fn discarded_upload_is_forgotten() {
        let registry = AudioUploadRegistry::default();
        let id = registry.begin("a.wav".to_string(), 1).unwrap();
        registry.discard(&id);

        assert_eq!(registry.take(&id).unwrap_err(), "audio_upload_not_found");
    }

    #[test]
    fn chunk_must_be_valid_base64() {
        assert_eq!(decode_chunk("AQID").unwrap(), vec![1, 2, 3]);
        assert!(decode_chunk("not base64!").is_err());
    }
}
