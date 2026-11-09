// Indicateurs de niveau des réglages : ouvre le micro choisi (issue 419) ou la
// sortie capturée comme son système (issue 450) et n'envoie à la webview qu'un
// niveau entre 0 et 1, dix fois par seconde.
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

/// Ce que mesure un mètre : le micro ou la sortie capturée, chacun par son nom
/// (`None` : le périphérique par défaut).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LevelSource {
    Microphone(Option<String>),
    Speaker(Option<String>),
}

#[derive(Default)]
pub struct LevelMonitor {
    active: Mutex<Option<ActiveMonitor>>,
}

/// Mètre du micro. Chaque ligne des réglages a le sien : ils tournent ensemble.
#[derive(Default)]
pub struct MicrophoneLevelMonitor(pub LevelMonitor);

/// Mètre de la sortie capturée comme son système.
#[derive(Default)]
pub struct SpeakerLevelMonitor(pub LevelMonitor);

impl std::ops::Deref for MicrophoneLevelMonitor {
    type Target = LevelMonitor;

    fn deref(&self) -> &LevelMonitor {
        &self.0
    }
}

impl std::ops::Deref for SpeakerLevelMonitor {
    type Target = LevelMonitor;

    fn deref(&self) -> &LevelMonitor {
        &self.0
    }
}

impl LevelMonitor {
    /// Remplace le mètre en cours, s'il y en a un, par celui de `owner`.
    /// `send` reçoit chaque niveau et renvoie `false` quand la page ne
    /// l'écoute plus.
    pub fn start(
        &self,
        audio: Arc<dyn syntheo_audio::AudioProvider>,
        owner: String,
        source: LevelSource,
        send: impl Fn(f32) -> bool + Send + 'static,
    ) -> Result<(), syntheo_audio::Error> {
        self.stop_all();
        let speaker = matches!(source, LevelSource::Speaker(_));
        let mut stream = match source {
            LevelSource::Microphone(device) => {
                audio.open_mic_capture(device, SAMPLE_RATE, CHUNK_SIZE)?
            }
            LevelSource::Speaker(device) => {
                // Les mètres ne tournent jamais pendant une écoute : ce choix
                // est celui que l'écoute suivante reprendra au démarrage.
                audio.set_speaker_device(device);
                audio.open_speaker_capture(SAMPLE_RATE, CHUNK_SIZE)?
            }
        };

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
                        let samples = if speaker { &frame.raw_speaker } else { &frame.raw_mic };
                        smoothed = smooth_level(smoothed, level_from_samples(samples));
                        if !send(smoothed) {
                            break;
                        }
                    }
                }
            }
            // Le flux est libéré ici : le périphérique se referme.
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
        speaker_device: std::sync::Mutex<Option<String>>,
    }

    impl TestAudio {
        fn new(available: bool) -> Arc<Self> {
            Arc::new(Self {
                available,
                speaker_device: std::sync::Mutex::new(None),
            })
        }
    }

    fn frames(frame: CaptureFrame) -> CaptureStream {
        CaptureStream::new(stream::unfold(frame, |frame| async move {
            tokio::time::sleep(Duration::from_millis(1)).await;
            Some((Ok(frame.clone()), frame))
        }))
    }

    impl AudioProvider for TestAudio {
        fn open_capture(&self, _config: CaptureConfig) -> Result<CaptureStream, Error> {
            unreachable!()
        }

        fn open_speaker_capture(&self, _: u32, chunk_size: usize) -> Result<CaptureStream, Error> {
            if !self.available {
                return Err(Error::SpeakerStreamSetupFailed);
            }
            Ok(frames(CaptureFrame {
                raw_mic: Arc::from([]),
                raw_speaker: Arc::from(vec![1.0_f32; chunk_size]),
                aec_mic: None,
            }))
        }

        fn set_speaker_device(&self, device: Option<String>) {
            *self.speaker_device.lock().unwrap() = device;
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
            Ok(frames(CaptureFrame {
                raw_mic: Arc::from(vec![0.5_f32; chunk_size]),
                raw_speaker: Arc::from([]),
                aec_mic: None,
            }))
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
            TestAudio::new(false),
            "settings".into(),
            LevelSource::Microphone(None),
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
                TestAudio::new(true),
                "settings".into(),
                LevelSource::Microphone(None),
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
                TestAudio::new(true),
                "settings".into(),
                LevelSource::Microphone(None),
                move |_| {
                    counter.fetch_add(1, Ordering::SeqCst);
                    false
                },
            )
            .unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(sent.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn speaker_meter_reads_the_chosen_output() {
        let monitor = SpeakerLevelMonitor::default();
        let audio = TestAudio::new(true);
        let levels = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = levels.clone();
        monitor
            .start(
                audio.clone(),
                "settings".into(),
                LevelSource::Speaker(Some("Casque".into())),
                move |level| {
                    sink.lock().unwrap().push(level);
                    true
                },
            )
            .unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        monitor.stop("settings");

        assert_eq!(
            audio.speaker_device.lock().unwrap().as_deref(),
            Some("Casque")
        );
        // Le niveau vient de la sortie (pleine échelle), pas du micro (vide).
        assert!(levels.lock().unwrap().iter().any(|level| *level > 0.9));
    }

    #[test]
    fn speaker_and_microphone_meters_are_independent() {
        let microphone = MicrophoneLevelMonitor::default();
        let speaker = SpeakerLevelMonitor::default();
        let result = speaker.start(
            TestAudio::new(false),
            "settings".into(),
            LevelSource::Speaker(None),
            |_| true,
        );
        assert_eq!(result, Err(Error::SpeakerStreamSetupFailed));
        assert!(!microphone.is_active());
        assert!(!speaker.is_active());
    }
}
