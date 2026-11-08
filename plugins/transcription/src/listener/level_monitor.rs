// Indicateur de niveau d'entrée des réglages (issue 419) : ouvre le micro choisi
// et n'envoie à la webview qu'un niveau entre 0 et 1, dix fois par seconde.
// Aucun échantillon n'est conservé ni transmis : chaque bloc est lu, réduit à
// son niveau, puis libéré. Le flux est refermé dès que la page le demande,
// qu'une capture démarre, ou au plus tard après `MAX_MONITOR_DURATION`.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

const SAMPLE_RATE: u32 = 16_000;
// 100 ms par bloc : le même rythme que le niveau affiché pendant une écoute.
const CHUNK_SIZE: usize = 1_600;
// Filet de sécurité si la page disparaît sans arrêter le mètre.
const MAX_MONITOR_DURATION: Duration = Duration::from_secs(10 * 60);
const SMOOTHING_ALPHA: f32 = 0.7;
const MIN_DB: f32 = -60.0;
const MAX_DB: f32 = 0.0;

struct ActiveMonitor {
    owner: String,
    cancellation: CancellationToken,
}

#[derive(Default)]
pub struct MicrophoneLevelMonitor {
    active: Mutex<Option<ActiveMonitor>>,
}

impl MicrophoneLevelMonitor {
    /// Remplace le mètre en cours, s'il y en a un, par celui de `owner`.
    /// `send` reçoit chaque niveau et renvoie `false` quand la page ne
    /// l'écoute plus.
    pub fn start(
        &self,
        audio: Arc<dyn syntheo_audio::AudioProvider>,
        owner: String,
        device: Option<String>,
        send: impl Fn(f32) -> bool + Send + 'static,
    ) -> Result<(), syntheo_audio::Error> {
        self.stop_all();
        let mut stream = audio.open_mic_capture(device, SAMPLE_RATE, CHUNK_SIZE)?;

        let cancellation = CancellationToken::new();
        let cancelled = cancellation.clone();
        tauri::async_runtime::spawn(async move {
            let deadline = tokio::time::sleep(MAX_MONITOR_DURATION);
            tokio::pin!(deadline);
            let mut smoothed = 0.0_f32;
            loop {
                tokio::select! {
                    biased;
                    _ = cancelled.cancelled() => break,
                    _ = &mut deadline => break,
                    next = stream.next() => {
                        let Some(Ok(frame)) = next else { break };
                        smoothed = smooth_level(smoothed, level_from_samples(&frame.raw_mic));
                        if !send(smoothed) {
                            break;
                        }
                    }
                }
            }
            // Le flux est libéré ici : le micro se referme.
            drop(stream);
        });

        let mut active = self.active.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(previous) = active.replace(ActiveMonitor {
            owner,
            cancellation,
        }) {
            previous.cancellation.cancel();
        }
        Ok(())
    }

    /// Arrête le mètre de `owner` ; sans effet si un autre l'a remplacé.
    pub fn stop(&self, owner: &str) {
        let mut active = self.active.lock().unwrap_or_else(|e| e.into_inner());
        if active
            .as_ref()
            .is_some_and(|monitor| monitor.owner == owner)
            && let Some(monitor) = active.take()
        {
            monitor.cancellation.cancel();
        }
    }

    /// Arrête le mètre quel que soit son propriétaire (début d'une capture).
    pub fn stop_all(&self) {
        let mut active = self.active.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(monitor) = active.take() {
            monitor.cancellation.cancel();
        }
    }

    #[cfg(test)]
    fn is_active(&self) -> bool {
        self.active
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_some()
    }
}

/// Niveau perçu d'un bloc : RMS en dB, de -60 dB (0) à 0 dB (1), comme le
/// niveau affiché pendant une écoute.
fn level_from_samples(samples: &[f32]) -> f32 {
    let (sum, count) = samples
        .iter()
        .filter(|sample| sample.is_finite())
        .fold((0.0_f32, 0_usize), |(sum, count), sample| {
            (sum + sample * sample, count + 1)
        });
    if count == 0 {
        return 0.0;
    }
    let rms = (sum / count as f32).sqrt();
    let db = if rms > 0.0 {
        20.0 * rms.log10()
    } else {
        MIN_DB
    };
    ((db - MIN_DB) / (MAX_DB - MIN_DB)).clamp(0.0, 1.0)
}

fn smooth_level(previous: f32, current: f32) -> f32 {
    (1.0 - SMOOTHING_ALPHA) * previous + SMOOTHING_ALPHA * current
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::atomic::{AtomicUsize, Ordering};

    use futures_util::stream;
    use syntheo_audio::{AudioProvider, CaptureConfig, CaptureFrame, CaptureStream, Error};

    struct TestAudio {
        available: bool,
    }

    impl AudioProvider for TestAudio {
        fn open_capture(&self, _config: CaptureConfig) -> Result<CaptureStream, Error> {
            unreachable!()
        }

        fn open_speaker_capture(&self, _: u32, _: usize) -> Result<CaptureStream, Error> {
            unreachable!()
        }

        fn open_mic_capture(
            &self,
            _device: Option<String>,
            _sample_rate: u32,
            chunk_size: usize,
        ) -> Result<CaptureStream, Error> {
            if !self.available {
                return Err(Error::NoInputDevice);
            }
            let frame = CaptureFrame {
                raw_mic: Arc::from(vec![0.5_f32; chunk_size]),
                raw_speaker: Arc::from([]),
                aec_mic: None,
            };
            Ok(CaptureStream::new(stream::unfold(
                frame,
                |frame| async move {
                    tokio::time::sleep(Duration::from_millis(1)).await;
                    Some((Ok(frame.clone()), frame))
                },
            )))
        }

        fn default_device_name(&self) -> String {
            String::new()
        }

        fn list_mic_devices(&self) -> Vec<String> {
            Vec::new()
        }

        fn play_silence(&self) -> std::sync::mpsc::Sender<()> {
            std::sync::mpsc::channel().0
        }

        fn play_bytes(&self, _: &'static [u8]) -> std::sync::mpsc::Sender<()> {
            std::sync::mpsc::channel().0
        }

        fn probe_mic(&self, _: Option<String>) -> Result<(), Error> {
            Ok(())
        }

        fn probe_speaker(&self) -> Result<(), Error> {
            Ok(())
        }
    }

    #[test]
    fn level_maps_silence_and_full_scale() {
        assert_eq!(level_from_samples(&[]), 0.0);
        assert_eq!(level_from_samples(&[0.0; 16]), 0.0);
        assert_eq!(level_from_samples(&[1.0; 16]), 1.0);
        assert_eq!(level_from_samples(&[f32::NAN]), 0.0);
        let speech = level_from_samples(&[0.1; 16]);
        assert!(speech > 0.5 && speech < 0.8, "{speech}");
    }

    #[test]
    fn start_fails_cleanly_without_microphone() {
        let monitor = MicrophoneLevelMonitor::default();
        let result = monitor.start(
            Arc::new(TestAudio { available: false }),
            "settings".into(),
            None,
            |_| true,
        );
        assert_eq!(result, Err(Error::NoInputDevice));
        assert!(!monitor.is_active());
    }

    #[tokio::test]
    async fn stop_closes_the_stream_and_ignores_other_owners() {
        let monitor = MicrophoneLevelMonitor::default();
        let sent = Arc::new(AtomicUsize::new(0));
        let counter = sent.clone();
        monitor
            .start(
                Arc::new(TestAudio { available: true }),
                "settings".into(),
                None,
                move |level| {
                    assert!((0.0..=1.0).contains(&level));
                    counter.fetch_add(1, Ordering::SeqCst);
                    true
                },
            )
            .unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(sent.load(Ordering::SeqCst) > 0);

        monitor.stop("other");
        assert!(monitor.is_active());

        monitor.stop("settings");
        assert!(!monitor.is_active());
        tokio::time::sleep(Duration::from_millis(10)).await;
        let after_stop = sent.load(Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(sent.load(Ordering::SeqCst), after_stop);
    }

    #[tokio::test]
    async fn closed_page_ends_the_monitor() {
        let monitor = MicrophoneLevelMonitor::default();
        let sent = Arc::new(AtomicUsize::new(0));
        let counter = sent.clone();
        monitor
            .start(
                Arc::new(TestAudio { available: true }),
                "settings".into(),
                None,
                move |_| {
                    counter.fetch_add(1, Ordering::SeqCst);
                    false
                },
            )
            .unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(sent.load(Ordering::SeqCst), 1);
    }
}
