use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::ChannelProfile;
use crate::render::{
    RenderTranscriptInput, RenderTranscriptRequest, RenderedTranscriptSegment, SyntheticTiming,
    render_transcript_segments_ungrouped,
};

#[derive(Default)]
struct Source {
    offset_ms: i64,
    transcript_index: usize,
    legacy_run: Option<usize>,
    timing: Option<SyntheticTiming>,
}

#[derive(Default)]
struct LegacyRun {
    start_ms: Option<i64>,
    channels: HashSet<i32>,
}

// Providers like Soniqo batch emit per-channel text without real word
// alignment: every word gets a synthetic timestamp, so naive chronological
// interleaving alternates channels every few words. Words that carry
// `synthetic_timing` are instead grouped into per-channel blocks per chunk
// (or per legacy run when chunk starts are absent) for display only.
pub(crate) fn render_segments(
    mut request: RenderTranscriptRequest,
) -> Vec<RenderedTranscriptSegment> {
    if !request.transcripts.iter().any(|transcript| {
        transcript
            .words
            .iter()
            .any(|word| word.synthetic_timing.is_some())
    }) {
        return render_transcript_segments_ungrouped(request);
    }

    let mut transcripts = Vec::new();
    for transcript in request.transcripts {
        transcripts.extend(split_synthetic_transcript(transcript));
    }

    let base_started_at = transcripts
        .iter()
        .filter_map(|row| row.started_at)
        .min()
        .unwrap_or(0);
    let mut source_by_id = HashMap::new();
    let mut legacy_runs: Vec<LegacyRun> = Vec::new();
    let mut previous_was_legacy = false;
    let mut channels = HashSet::new();
    let mut has_complete_synthetic_chunk = false;
    for (transcript_index, transcript) in transcripts.iter().enumerate() {
        let offset_ms = transcript
            .started_at
            .map_or(0, |start| start - base_started_at);
        let timings: Vec<_> = transcript
            .words
            .iter()
            .map(|word| word.synthetic_timing)
            .collect();
        let legacy = !timings.is_empty()
            && timings.iter().all(|timing| timing.is_some())
            && timings
                .iter()
                .any(|timing| timing.and_then(|t| t.chunk_start_ms).is_none());
        if legacy && !previous_was_legacy {
            legacy_runs.push(LegacyRun::default());
        }
        previous_was_legacy = legacy;
        let legacy_run = legacy.then(|| legacy_runs.len() - 1);
        for (word, timing) in transcript.words.iter().zip(timings) {
            channels.insert(word.channel);
            has_complete_synthetic_chunk |= timing.and_then(|t| t.chunk_start_ms).is_some();
            if let Some(run_index) = legacy_run {
                let run = &mut legacy_runs[run_index];
                let start_ms = word.start_ms + offset_ms;
                run.start_ms = Some(run.start_ms.map_or(start_ms, |start| start.min(start_ms)));
                run.channels.insert(word.channel);
            }
            source_by_id.insert(
                word.id.clone(),
                Source {
                    offset_ms,
                    transcript_index,
                    legacy_run,
                    timing,
                },
            );
        }
    }
    request.transcripts = transcripts;
    let mut segments = render_transcript_segments_ungrouped(request);
    if legacy_runs.iter().any(|run| run.channels.len() > 1)
        || (channels.len() > 1 && has_complete_synthetic_chunk)
    {
        segments.sort_by(|left, right| {
            let left_key = sort_key(left, &source_by_id, &legacy_runs);
            let right_key = sort_key(right, &source_by_id, &legacy_runs);
            left_key
                .0
                .total_cmp(&right_key.0)
                .then_with(|| left_key.1.cmp(&right_key.1))
                .then_with(|| {
                    if left_key.1 == 0 && right_key.1 == 0 {
                        left_key
                            .2
                            .cmp(&right_key.2)
                            .then_with(|| left_key.3.cmp(&right_key.3))
                            .then_with(|| left_key.4.cmp(&right_key.4))
                    } else if left_key.1 == 1 && right_key.1 == 1 {
                        left_key.3.cmp(&right_key.3)
                    } else {
                        std::cmp::Ordering::Equal
                    }
                })
                .then_with(|| left.start_ms.cmp(&right.start_ms))
        });
    }
    segments
}

pub fn synthetic_timing_from_metadata(metadata: Option<&Value>) -> Option<SyntheticTiming> {
    let metadata = metadata?;
    if let Value::String(json) = metadata {
        return serde_json::from_str::<Value>(json)
            .ok()
            .and_then(|value| synthetic_timing_from_metadata(Some(&value)));
    }
    let timing = metadata.get("timing").filter(|value| value.is_object())?;
    if timing.get("source").and_then(Value::as_str) != Some("synthetic_text") {
        return None;
    }
    Some(SyntheticTiming {
        chunk_start_ms: timing
            .get("chunk_start_ms")
            .and_then(Value::as_f64)
            .filter(|start| start.is_finite()),
    })
}

fn split_synthetic_transcript(transcript: RenderTranscriptInput) -> Vec<RenderTranscriptInput> {
    let mut groups: Vec<(i32, f64, Vec<_>)> = Vec::new();
    let mut group_by_key = HashMap::new();
    let mut channels = HashSet::new();
    let mut timed_words = Vec::new();
    let mut legacy = false;
    for word in &transcript.words {
        channels.insert(word.channel);
        let Some(timing) = word.synthetic_timing else {
            timed_words.push(word.clone());
            continue;
        };
        let Some(chunk_start_ms) = timing.chunk_start_ms else {
            legacy = true;
            continue;
        };
        let key = (
            word.channel,
            if chunk_start_ms == 0.0 {
                0
            } else {
                chunk_start_ms.to_bits()
            },
        );
        let index = *group_by_key.entry(key).or_insert_with(|| {
            groups.push((word.channel, chunk_start_ms, Vec::new()));
            groups.len() - 1
        });
        groups[index].2.push(word.clone());
    }
    if channels.len() < 2 {
        return vec![transcript];
    }
    if legacy {
        if !timed_words.is_empty() {
            return vec![transcript];
        }
        let mut channel_words = HashMap::<i32, Vec<_>>::new();
        for word in &transcript.words {
            channel_words
                .entry(word.channel)
                .or_default()
                .push(word.clone());
        }
        let mut groups: Vec<_> = channel_words.into_iter().collect();
        groups.sort_by_key(|group| group.0);
        return groups
            .into_iter()
            .map(|(_, words)| RenderTranscriptInput {
                started_at: transcript.started_at,
                words,
                assignments: transcript.assignments.clone(),
            })
            .collect();
    }
    if groups.is_empty() {
        return vec![transcript];
    }
    if !timed_words.is_empty() {
        // A timed word belongs to the latest synthetic chunk that started at
        // or before it; merging all of them into one trailing group lets the
        // renderer bridge speech across intervening chunks.
        let mut chunk_starts: Vec<f64> = groups.iter().map(|group| group.1).collect();
        chunk_starts.sort_by(f64::total_cmp);
        chunk_starts.dedup();
        let mut timed_groups: Vec<(f64, Vec<_>)> = Vec::new();
        for word in timed_words {
            let window = chunk_starts
                .iter()
                .rev()
                .find(|start| **start <= word.start_ms as f64)
                .copied()
                .unwrap_or(f64::NEG_INFINITY);
            match timed_groups.iter_mut().find(|group| group.0 == window) {
                Some(group) => group.1.push(word),
                None => timed_groups.push((window, vec![word])),
            }
        }
        for (window, words) in timed_groups {
            let start = if window.is_infinite() {
                words.iter().map(|word| word.start_ms).min().unwrap() as f64
            } else {
                window
            };
            groups.push((-1, start, words));
        }
    }
    groups.sort_by(|left, right| {
        left.1
            .total_cmp(&right.1)
            .then_with(|| left.0.cmp(&right.0))
    });
    groups
        .into_iter()
        .map(|(_, _, words)| RenderTranscriptInput {
            started_at: transcript.started_at,
            words,
            assignments: transcript.assignments.clone(),
        })
        .collect()
}

fn sort_key(
    segment: &RenderedTranscriptSegment,
    source_by_id: &HashMap<String, Source>,
    legacy_runs: &[LegacyRun],
) -> (f64, u8, Option<usize>, u8, Option<usize>) {
    let source = segment
        .words
        .first()
        .and_then(|word| word.id.as_ref())
        .and_then(|id| source_by_id.get(id));
    let run = source
        .and_then(|source| source.legacy_run)
        .and_then(|index| legacy_runs.get(index))
        .filter(|run| run.channels.len() > 1);
    let chunk_start = source.and_then(|source| source.timing.and_then(|t| t.chunk_start_ms));
    let (start_ms, group) = if let Some(run) = run {
        (run.start_ms.unwrap_or(segment.start_ms) as f64, 0)
    } else if let Some(start) = chunk_start {
        (
            start + source.map_or(0, |source| source.offset_ms) as f64,
            1,
        )
    } else {
        (segment.start_ms as f64, 2)
    };
    let channel = match segment.key.channel {
        ChannelProfile::DirectMic => 0,
        ChannelProfile::RemoteParty => 1,
        ChannelProfile::MixedCapture => 2,
    };
    (
        start_ms,
        group,
        source.and_then(|source| source.legacy_run),
        channel,
        source.map(|source| source.transcript_index),
    )
}

#[cfg(test)]
mod tests;
