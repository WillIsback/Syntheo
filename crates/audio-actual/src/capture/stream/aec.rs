use std::sync::Arc;

use syntheo_aec::AEC;

use super::super::echo_gate::{EchoCanceller, GatedEchoCanceller};

use super::{
    AEC_DOUBLE_TALK_RESIDUAL_RATIO, AEC_LINEAR_GAIN_SMOOTHING, AEC_MAX_LINEAR_GAIN,
    AEC_MIN_MIC_RMS, AEC_MIN_REFERENCE_CORRELATION, AEC_MIN_REFERENCE_RMS,
    AEC_ROBUST_GAIN_MIN_SEGMENTS, AEC_ROBUST_GAIN_SEGMENTS,
};

/// `None` quand les modèles DTLN ne sont pas encore installés (ils sont téléchargés à la
/// demande, issue 429) : la capture continue avec le micro brut, et la boucle réessaie dès
/// qu'un téléchargement aboutit (voir [`syntheo_aec::model_generation`]).
pub(super) fn build_aec(sample_rate: u32) -> Option<GatedEchoCanceller<AEC>> {
    match AEC::new() {
        Ok(aec) => Some(GatedEchoCanceller::new(aec, sample_rate)),
        Err(error @ syntheo_aec::Error::ModelUnavailable(_)) => {
            tracing::warn!(
                error.message = %error,
                "aec_model_unavailable: echo cancellation disabled until the models are downloaded"
            );
            None
        }
        Err(error) => {
            tracing::warn!(error.message = ?error, "aec_init_failed");
            None
        }
    }
}

/// Annule l'écho d'une trame alignée. Quand la référence est silencieuse (traîne comprise), le
/// modèle n'est pas appelé et le micro aligné passe tel quel (#291) ; `None` reste réservé à
/// l'AEC désactivée ou en échec, l'aval retombant alors sur le micro brut.
///
/// `linear_echo_gain` n'est pas remis à zéro pendant la veille : il estime le couplage
/// haut-parleur → micro, qu'un silence ne change pas, et il ne sert qu'aux trames du modèle.
pub(super) fn process_aec<P: EchoCanceller>(
    aec: &mut Option<GatedEchoCanceller<P>>,
    linear_echo_gain: &mut Option<f32>,
    mic: &[f32],
    speaker: &[f32],
) -> Option<Arc<[f32]>> {
    let processor = aec.as_mut()?;
    match processor.process(mic, speaker, |processed| {
        cancel_linear_echo(speaker, processed, linear_echo_gain)
    }) {
        Ok(processed) => Some(Arc::<[f32]>::from(processed)),
        Err(error) => {
            tracing::warn!(error.message = ?error, "aec_failed");
            None
        }
    }
}

fn cancel_linear_echo(
    speaker: &[f32],
    processed: Vec<f32>,
    linear_echo_gain: &mut Option<f32>,
) -> Vec<f32> {
    let len = speaker.len().min(processed.len());
    if len == 0 {
        return processed;
    }

    let mut processed_energy = 0.0;
    let mut speaker_energy = 0.0;
    let mut cross_energy = 0.0;
    for idx in 0..len {
        let processed_sample = processed[idx];
        let speaker_sample = speaker[idx];
        processed_energy += processed_sample * processed_sample;
        speaker_energy += speaker_sample * speaker_sample;
        cross_energy += processed_sample * speaker_sample;
    }

    let len_f32 = len as f32;
    let processed_rms = (processed_energy / len_f32).sqrt();
    let speaker_rms = (speaker_energy / len_f32).sqrt();
    if processed_rms < AEC_MIN_MIC_RMS || speaker_rms < AEC_MIN_REFERENCE_RMS {
        return processed;
    }

    let correlation = cross_energy.abs() / (processed_energy * speaker_energy).sqrt().max(1e-6);
    if correlation < AEC_MIN_REFERENCE_CORRELATION {
        return processed;
    }

    let instantaneous_gain =
        (cross_energy / speaker_energy.max(1e-6)).clamp(-AEC_MAX_LINEAR_GAIN, AEC_MAX_LINEAR_GAIN);
    let residual_energy =
        (processed_energy - (cross_energy * cross_energy / speaker_energy.max(1e-6))).max(0.0);
    let residual_ratio = (residual_energy / len_f32).sqrt() / processed_rms.max(1e-6);
    let measured_gain = if residual_ratio > AEC_DOUBLE_TALK_RESIDUAL_RATIO {
        segmented_trimmed_gain(&processed, speaker, len, instantaneous_gain)
    } else {
        instantaneous_gain
    };
    let smoothed_gain = linear_echo_gain
        .map(|gain| gain + (measured_gain - gain) * AEC_LINEAR_GAIN_SMOOTHING)
        .unwrap_or(measured_gain);
    *linear_echo_gain = Some(smoothed_gain);

    let gain = if residual_ratio > AEC_DOUBLE_TALK_RESIDUAL_RATIO {
        smoothed_gain
    } else {
        measured_gain
    };

    let mut output = Vec::with_capacity(processed.len());
    output.extend(processed.iter().zip(speaker).take(len).map(
        |(processed_sample, speaker_sample)| {
            (processed_sample - gain * speaker_sample).clamp(-1.0, 1.0)
        },
    ));
    output.extend_from_slice(&processed[len..]);
    output
}

fn segmented_trimmed_gain(
    processed: &[f32],
    speaker: &[f32],
    len: usize,
    initial_gain: f32,
) -> f32 {
    let segment_len = (len / AEC_ROBUST_GAIN_SEGMENTS).max(1);
    let mut gains = Vec::with_capacity(AEC_ROBUST_GAIN_SEGMENTS);
    let mut start = 0;
    while start < len {
        let end = (start + segment_len).min(len);
        let mut processed_energy = 0.0;
        let mut speaker_energy = 0.0;
        let mut cross_energy = 0.0;
        for idx in start..end {
            let processed_sample = processed[idx];
            let speaker_sample = speaker[idx];
            processed_energy += processed_sample * processed_sample;
            speaker_energy += speaker_sample * speaker_sample;
            cross_energy += processed_sample * speaker_sample;
        }

        if processed_energy > 1e-8 && speaker_energy > 1e-8 {
            let correlation =
                cross_energy.abs() / (processed_energy * speaker_energy).sqrt().max(1e-6);
            if correlation >= AEC_MIN_REFERENCE_CORRELATION {
                let gain = (cross_energy / speaker_energy.max(1e-6))
                    .clamp(-AEC_MAX_LINEAR_GAIN, AEC_MAX_LINEAR_GAIN);
                gains.push((gain, speaker_energy));
            }
        }

        start = end;
    }

    if gains.len() < AEC_ROBUST_GAIN_MIN_SEGMENTS {
        return initial_gain;
    }

    gains.sort_by(|left, right| left.0.total_cmp(&right.0));
    let trim = if gains.len() >= 6 { gains.len() / 6 } else { 0 };
    let kept = &gains[trim..gains.len() - trim];
    let weighted_gain = kept.iter().map(|(gain, energy)| gain * energy).sum::<f32>();
    let kept_energy = kept.iter().map(|(_, energy)| energy).sum::<f32>();
    if kept_energy <= 1e-8 {
        return initial_gain;
    }

    (weighted_gain / kept_energy).clamp(-AEC_MAX_LINEAR_GAIN, AEC_MAX_LINEAR_GAIN)
}
