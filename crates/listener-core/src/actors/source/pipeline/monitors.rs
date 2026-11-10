use std::{sync::Arc, time::Instant};

use crate::{ListenerRuntime, SessionDataEvent};

use super::{AUDIO_AMPLITUDE_THROTTLE, DROPOUT_RATIO_THRESHOLD, DROPOUT_WINDOW_SAMPLES};

// Real microphones never produce exact zeros; a run of them means the device or its driver stopped
// delivering audio. Bluetooth headsets in call mode do this between words. Reported once per
// stream so the UI can warn without being spammed.
//
// Dual capture pads the mic with zeros while the speaker stream leads it, which is routine until
// the mic delivers its first samples. Counting starts at the first non-zero sample so a slow mic
// start is not mistaken for gating; padding after that means the mic stalled, which is a dropout.
pub(super) struct DropoutMonitor {
    pub(super) runtime: Arc<dyn ListenerRuntime>,
    pub(super) session_id: String,
    pub(super) mic_started: bool,
    pub(super) zero_samples: usize,
    pub(super) total_samples: usize,
    pub(super) reported: bool,
}

impl DropoutMonitor {
    pub(super) fn new(runtime: Arc<dyn ListenerRuntime>, session_id: String) -> Self {
        Self {
            runtime,
            session_id,
            mic_started: false,
            zero_samples: 0,
            total_samples: 0,
            reported: false,
        }
    }

    pub(super) fn reset(&mut self) {
        self.mic_started = false;
        self.zero_samples = 0;
        self.total_samples = 0;
        self.reported = false;
    }

    pub(super) fn observe(&mut self, raw_mic: &[f32]) {
        if self.reported {
            return;
        }

        let zero_samples = raw_mic.iter().filter(|sample| **sample == 0.0).count();
        if !self.mic_started {
            if zero_samples == raw_mic.len() {
                return;
            }
            self.mic_started = true;
        }

        self.zero_samples += zero_samples;
        self.total_samples += raw_mic.len();
        if self.total_samples < DROPOUT_WINDOW_SAMPLES {
            return;
        }

        let ratio = self.zero_samples as f32 / self.total_samples as f32;
        self.zero_samples = 0;
        self.total_samples = 0;
        if ratio < DROPOUT_RATIO_THRESHOLD {
            return;
        }

        tracing::warn!(ratio, "mic_dropouts_detected");
        self.runtime.emit_data(SessionDataEvent::MicDropouts {
            session_id: self.session_id.clone(),
            ratio,
        });
        self.reported = true;
    }
}

pub(super) struct AmplitudeEmitter {
    pub(super) runtime: Arc<dyn ListenerRuntime>,
    pub(super) session_id: String,
    pub(super) mic_smoothed: f32,
    pub(super) spk_smoothed: f32,
    pub(super) last_emit: Instant,
}

impl AmplitudeEmitter {
    pub(super) const SMOOTHING_ALPHA: f32 = 0.7;
    pub(super) const MIN_DB: f32 = -60.0;
    pub(super) const MAX_DB: f32 = 0.0;

    pub(super) fn new(runtime: Arc<dyn ListenerRuntime>, session_id: String) -> Self {
        Self {
            runtime,
            session_id,
            mic_smoothed: 0.0,
            spk_smoothed: 0.0,
            last_emit: Instant::now() - AUDIO_AMPLITUDE_THROTTLE,
        }
    }

    pub(super) fn reset(&mut self) {
        self.mic_smoothed = 0.0;
        self.spk_smoothed = 0.0;
        self.last_emit = Instant::now() - AUDIO_AMPLITUDE_THROTTLE;
    }

    pub(super) fn observe_mic(&mut self, data: &[f32]) {
        let amplitude = Self::amplitude_from_chunk(data);
        self.mic_smoothed =
            (1.0 - Self::SMOOTHING_ALPHA) * self.mic_smoothed + Self::SMOOTHING_ALPHA * amplitude;
        self.emit_if_ready();
    }

    pub(super) fn observe_spk(&mut self, data: &[f32]) {
        let amplitude = Self::amplitude_from_chunk(data);
        self.spk_smoothed =
            (1.0 - Self::SMOOTHING_ALPHA) * self.spk_smoothed + Self::SMOOTHING_ALPHA * amplitude;
        self.emit_if_ready();
    }

    pub(super) fn emit_if_ready(&mut self) {
        if self.last_emit.elapsed() < AUDIO_AMPLITUDE_THROTTLE {
            return;
        }

        let mic_level = (self.mic_smoothed * 1000.0) as u16;
        let spk_level = (self.spk_smoothed * 1000.0) as u16;

        self.runtime.emit_data(SessionDataEvent::AudioAmplitude {
            session_id: self.session_id.clone(),
            mic: mic_level,
            speaker: spk_level,
        });

        self.last_emit = Instant::now();
    }

    pub(super) fn amplitude_from_chunk(chunk: &[f32]) -> f32 {
        if chunk.is_empty() {
            return 0.0;
        }

        let sum_squares: f32 = chunk.iter().filter(|x| x.is_finite()).map(|&x| x * x).sum();
        let count = chunk.iter().filter(|x| x.is_finite()).count();
        if count == 0 {
            return 0.0;
        }
        let rms = (sum_squares / count as f32).sqrt();

        let db = if rms > 0.0 {
            20.0 * rms.log10()
        } else {
            Self::MIN_DB
        };

        ((db - Self::MIN_DB) / (Self::MAX_DB - Self::MIN_DB)).clamp(0.0, 1.0)
    }
}
