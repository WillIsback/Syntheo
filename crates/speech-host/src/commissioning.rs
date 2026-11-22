//! Mise en service mesurée du module (issue 686, conclusion du banc 680 §4).
//!
//! Sur l'audio de mise en service fourni avec le module (deux flux, listés
//! dans le manifeste et vérifiés), chaque profil est mesuré environ 30 s en
//! temps réel, dans l'ordre :
//!
//! 1. deux flux avec diarisation ;
//! 2. deux flux sans diarisation ;
//! 3. un seul flux (micro) avec diarisation ;
//! 4. un seul flux sans diarisation.
//!
//! Le premier profil dont le retard des finals reste sous 2 s au 95e centile,
//! sans dérive, est retenu ; sinon le poste est inéligible (renvoi vers le
//! serveur). Le résultat est enregistré à côté du module, avec la mesure.
//!
//! Retard d'un final : instant de sa réception moins l'instant où la fin de
//! son audio a été envoyée. Dérive : écart entre la médiane des retards du
//! dernier tiers et celle du premier tiers.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use owhisper_client::{FinalizeHandle, ListenClient, NvidiaAdapter, OnDeviceTarget};
use owhisper_interface::MixedMessage;
use owhisper_interface::stream::StreamResponse;
use serde::{Deserialize, Serialize};

/// Retard des finals au 95e centile au-delà duquel un profil échoue.
pub const MAX_P95: Duration = Duration::from_secs(2);
/// Dérive au-delà de laquelle un profil échoue.
pub const MAX_DRIFT: Duration = Duration::from_secs(1);
/// Durée de mesure d'un profil.
pub const MEASURE: Duration = Duration::from_secs(30);
/// Audio de mise en service, dans le dossier du module (listé au manifeste).
pub const AUDIO_FILES: [&str; 2] = ["commissioning/mic.wav", "commissioning/sys.wav"];
/// Trames de 20 ms à 16 kHz, PCM16.
const FRAME_BYTES: usize = 640;
const FRAME: Duration = Duration::from_millis(20);
/// Attente des derniers finals après la fin de l'audio.
const DRAIN: Duration = Duration::from_secs(8);

/// Profils, du plus complet au plus réduit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Profile {
    TwoStreamsDiarized,
    TwoStreams,
    OneStreamDiarized,
    OneStream,
}

impl Profile {
    pub const ALL: [Profile; 4] = [
        Self::TwoStreamsDiarized,
        Self::TwoStreams,
        Self::OneStreamDiarized,
        Self::OneStream,
    ];

    pub fn streams(self) -> usize {
        match self {
            Self::TwoStreamsDiarized | Self::TwoStreams => 2,
            _ => 1,
        }
    }

    pub fn diarization(self) -> bool {
        matches!(self, Self::TwoStreamsDiarized | Self::OneStreamDiarized)
    }
}

/// Mesure d'un profil.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Measure {
    pub profile: Profile,
    pub finals: usize,
    pub p95_ms: u64,
    pub drift_ms: i64,
    pub passed: bool,
}

/// Résultat enregistré de la mise en service.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Commissioning {
    /// Profil retenu ; `None` : inéligible.
    pub profile: Option<Profile>,
    pub measures: Vec<Measure>,
    /// Secondes depuis l'époque Unix.
    pub measured_at: u64,
    /// Construction du module mesuré : une autre construction se remesure.
    pub module_build: u64,
}

/// Fichier du résultat, à côté du dossier du module.
pub fn result_path(dir: &Path) -> Option<PathBuf> {
    let name = dir.file_name()?.to_string_lossy();
    Some(dir.parent()?.join(format!("{name}.commissioning.json")))
}

/// Résultat enregistré pour la construction `module_build`.
pub fn load(dir: &Path, module_build: u64) -> Option<Commissioning> {
    let bytes = std::fs::read(result_path(dir)?).ok()?;
    if bytes.len() > 64 * 1024 {
        return None;
    }
    serde_json::from_slice::<Commissioning>(&bytes)
        .ok()
        .filter(|c| c.module_build == module_build)
}

/// Enregistre le résultat (fichier temporaire puis renommage).
pub fn save(dir: &Path, result: &Commissioning) -> std::io::Result<()> {
    let path = result_path(dir).ok_or_else(|| std::io::Error::other("no module folder"))?;
    let temp = path.with_extension(format!("json-{}", std::process::id()));
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(result).map_err(std::io::Error::other)?,
    )?;
    std::fs::rename(&temp, &path).inspect_err(|_| {
        let _ = std::fs::remove_file(&temp);
    })
}

/// Données PCM16 16 kHz mono d'un WAV (bloc `data`).
pub fn wav_pcm16(bytes: &[u8]) -> Option<&[u8]> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut at = 12;
    let mut format_ok = false;
    while at + 8 <= bytes.len() {
        let id = &bytes[at..at + 4];
        let len = u32::from_le_bytes(bytes[at + 4..at + 8].try_into().ok()?) as usize;
        let body = bytes.get(at + 8..at + 8 + len)?;
        if id == b"fmt " && body.len() >= 16 {
            let format = u16::from_le_bytes([body[0], body[1]]);
            let channels = u16::from_le_bytes([body[2], body[3]]);
            let rate = u32::from_le_bytes([body[4], body[5], body[6], body[7]]);
            let bits = u16::from_le_bytes([body[14], body[15]]);
            format_ok = format == 1 && channels == 1 && rate == 16_000 && bits == 16;
        } else if id == b"data" {
            return format_ok.then_some(body);
        }
        at += 8 + len + (len % 2);
    }
    None
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let rank = ((p * sorted.len() as f64).ceil() as usize).clamp(1, sorted.len());
    sorted[rank - 1]
}

fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    percentile(values, 0.5)
}

/// Verdict d'une série de finals : `(fin d'audio, retard)` en secondes.
pub fn evaluate(profile: Profile, finals: &[(f64, f64)]) -> Measure {
    let mut latencies: Vec<f64> = finals.iter().map(|(_, lag)| *lag).collect();
    latencies.sort_by(f64::total_cmp);
    let p95 = percentile(&latencies, 0.95);
    let mut by_time: Vec<(f64, f64)> = finals.to_vec();
    by_time.sort_by(|a, b| a.0.total_cmp(&b.0));
    let third = by_time.len() / 3;
    let drift = if third > 0 {
        let mut first: Vec<f64> = by_time[..third].iter().map(|f| f.1).collect();
        let mut last: Vec<f64> = by_time[by_time.len() - third..]
            .iter()
            .map(|f| f.1)
            .collect();
        median(&mut last) - median(&mut first)
    } else {
        0.0
    };
    // Sans final, rien n'a été mesuré : échec.
    let passed =
        !finals.is_empty() && p95 < MAX_P95.as_secs_f64() && drift < MAX_DRIFT.as_secs_f64();
    Measure {
        profile,
        finals: finals.len(),
        p95_ms: (p95 * 1000.0).round() as u64,
        drift_ms: (drift * 1000.0).round() as i64,
        passed,
    }
}

/// Un flux : envoie l'audio en temps réel, rend `(fin d'audio, retard)` de
/// chaque final.
async fn stream(
    target: OnDeviceTarget,
    diarization: bool,
    audio: Vec<u8>,
    t0: Instant,
) -> Result<Vec<(f64, f64)>, String> {
    let client = ListenClient::builder()
        .adapter::<NvidiaAdapter>()
        .api_base(target.base_url)
        .params(owhisper_interface::ListenParams {
            languages: vec!["fr".parse().map_err(|_| "language")?],
            // Sans diarisation : un seul intervenant annoncé.
            num_speakers: (!diarization).then_some(1),
            ..Default::default()
        })
        .on_device(target.token)
        .build_single()
        .await
        .map_err(|e| e.to_string())?;
    let (tx, rx) = tokio::sync::mpsc::channel::<owhisper_client::ListenClientInput>(64);
    let input = tokio_stream_from(rx).chain(futures_util::stream::pending());
    let (output, handle) = client
        .from_realtime_audio(Box::pin(input))
        .await
        .map_err(|e| e.to_string())?;
    let sender = tokio::spawn(async move {
        let mut tick = tokio::time::interval_at(t0.into(), FRAME);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Burst);
        for frame in audio.chunks(FRAME_BYTES) {
            tick.tick().await;
            if tx
                .send(MixedMessage::Audio(bytes::Bytes::copy_from_slice(frame)))
                .await
                .is_err()
            {
                break;
            }
        }
        tx
    });
    let mut output = Box::pin(output);
    let mut finals = Vec::new();
    let mut sender = Some(sender);
    let mut drain_until: Option<Instant> = None;
    loop {
        if drain_until.is_none() && sender.as_ref().is_some_and(|s| s.is_finished()) {
            // Fin de l'audio : on demande les derniers finals.
            let _keep_open = sender.take().map(|s| s.into_future());
            handle.finalize().await;
            drain_until = Some(Instant::now() + DRAIN);
        }
        let wait = drain_until.map_or(Duration::from_millis(200), |until| {
            until.saturating_duration_since(Instant::now())
        });
        if drain_until.is_some() && wait.is_zero() {
            break;
        }
        match tokio::time::timeout(wait.min(Duration::from_millis(200)), output.next()).await {
            Ok(Some(Ok(StreamResponse::TranscriptResponse {
                is_final: true,
                start,
                duration,
                channel,
                ..
            }))) => {
                if !channel
                    .alternatives
                    .first()
                    .is_some_and(|a| a.transcript.is_empty())
                {
                    let end = start + duration;
                    let lag = t0.elapsed().as_secs_f64() - end;
                    finals.push((end, lag.max(0.0)));
                }
            }
            Ok(Some(Ok(_))) | Err(_) => {}
            Ok(Some(Err(error))) => return Err(error.to_string()),
            Ok(None) => break,
        }
    }
    Ok(finals)
}

/// Flux tokio vers flux `futures`.
fn tokio_stream_from<T: Send + 'static>(
    mut rx: tokio::sync::mpsc::Receiver<T>,
) -> impl futures_util::Stream<Item = T> + Send {
    futures_util::stream::poll_fn(move |cx| rx.poll_recv(cx))
}

/// Mesure un profil sur le lancement en cours.
pub async fn measure(
    target: &OnDeviceTarget,
    profile: Profile,
    audio: &[Vec<u8>; 2],
    duration: Duration,
) -> Result<Measure, String> {
    let bytes = ((duration.as_secs_f64() * 16_000.0) as usize) * 2;
    // Départ commun un peu plus tard : les connexions s'ouvrent d'abord.
    let t0 = Instant::now() + Duration::from_millis(500);
    let streams = (0..profile.streams()).map(|i| {
        let audio = audio[i][..audio[i].len().min(bytes)].to_vec();
        stream(target.clone(), profile.diarization(), audio, t0)
    });
    let mut finals = Vec::new();
    for result in futures_util::future::join_all(streams).await {
        finals.extend(result?);
    }
    Ok(evaluate(profile, &finals))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fast_steady_profile_passes() {
        let finals: Vec<(f64, f64)> = (1..=15).map(|i| (2.0 * i as f64, 0.8)).collect();
        let m = evaluate(Profile::TwoStreamsDiarized, &finals);
        assert!(m.passed, "{m:?}");
        assert_eq!(m.p95_ms, 800);
        assert_eq!(m.drift_ms, 0);
    }

    #[test]
    fn a_slow_or_drifting_profile_fails() {
        // p95 au-delà de 2 s.
        let slow: Vec<(f64, f64)> = (1..=15).map(|i| (2.0 * i as f64, 2.5)).collect();
        assert!(!evaluate(Profile::TwoStreams, &slow).passed);
        // Sous 2 s mais en dérive : 0,2 s → 1,9 s.
        let drifting: Vec<(f64, f64)> = (0..15)
            .map(|i| (2.0 * (i + 1) as f64, 0.2 + 0.12 * i as f64))
            .collect();
        let m = evaluate(Profile::TwoStreams, &drifting);
        assert!(m.p95_ms < 2000 && m.drift_ms > 1000 && !m.passed, "{m:?}");
        // Aucun final : échec.
        assert!(!evaluate(Profile::OneStream, &[]).passed);
    }

    #[test]
    fn reads_a_canonical_wav() {
        let mut wav = b"RIFF\0\0\0\0WAVEfmt ".to_vec();
        wav.extend(16u32.to_le_bytes());
        wav.extend(1u16.to_le_bytes());
        wav.extend(1u16.to_le_bytes());
        wav.extend(16_000u32.to_le_bytes());
        wav.extend(32_000u32.to_le_bytes());
        wav.extend(2u16.to_le_bytes());
        wav.extend(16u16.to_le_bytes());
        wav.extend(b"data");
        wav.extend(4u32.to_le_bytes());
        wav.extend([1, 2, 3, 4]);
        assert_eq!(wav_pcm16(&wav), Some(&[1u8, 2, 3, 4][..]));
        // Stéréo : refusé.
        let mut stereo = wav.clone();
        stereo[22] = 2;
        assert_eq!(wav_pcm16(&stereo), None);
    }

    #[test]
    fn the_result_is_tied_to_the_module_build() {
        let parent = tempfile::tempdir().unwrap();
        let dir = parent.path().join("speech");
        let result = Commissioning {
            profile: Some(Profile::TwoStreams),
            measures: vec![],
            measured_at: 1,
            module_build: 800_000,
        };
        save(&dir, &result).unwrap();
        assert_eq!(load(&dir, 800_000), Some(result));
        assert_eq!(load(&dir, 800_100), None);
    }
}
