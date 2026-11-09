use std::collections::HashMap;

use crate::{
    FinalizedWord, IdentityAssignment, SegmentKey, SegmentWord, SpeakerLabelContext,
    SpeakerLabeler, WordState, build_segments, channel_assignments_for_participants,
    render_speaker_label, segment_options_for_participants,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct RenderTranscriptWordInput {
    pub id: String,
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub channel: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_index: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synthetic_timing: Option<SyntheticTiming>,
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SyntheticTiming {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chunk_start_ms: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct RenderTranscriptHuman {
    pub human_id: String,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct RenderTranscriptInput {
    pub started_at: Option<i64>,
    pub words: Vec<RenderTranscriptWordInput>,
    pub assignments: Vec<IdentityAssignment>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct RenderTranscriptRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker_context: Option<crate::SpeakerContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<Vec<RenderedTranscriptSegment>>,
    pub transcripts: Vec<RenderTranscriptInput>,
    pub participant_human_ids: Vec<String>,
    pub self_human_id: Option<String>,
    pub humans: Vec<RenderTranscriptHuman>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct RenderedTranscriptSegment {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provisional_speaker: Option<crate::ProvisionalSpeakerLabel>,
    pub id: String,
    pub key: SegmentKey,
    pub speaker_label: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
    pub words: Vec<SegmentWord>,
}

pub fn render_transcript_segments(
    request: RenderTranscriptRequest,
) -> Vec<RenderedTranscriptSegment> {
    crate::synthetic_render::render_segments(request)
}

pub(crate) fn render_transcript_segments_ungrouped(
    request: RenderTranscriptRequest,
) -> Vec<RenderedTranscriptSegment> {
    let RenderTranscriptRequest {
        transcripts,
        participant_human_ids,
        self_human_id,
        humans,
        speaker_context,
        preview,
    } = request;

    let base_started_at = earliest_started_at(&transcripts);
    if let Some(mut segments) = preview {
        for segment in &mut segments {
            if let Some(id) = &segment.key.speaker_human_id {
                // Unnamed humans are not in `humans` (name <> '' filter) — a
                // raw UUID is never a good label, so fall back the way
                // `resolve_speaker` does for the local user.
                segment.speaker_label = humans
                    .iter()
                    .find(|human| &human.human_id == id)
                    .map(|human| human.name.trim())
                    .filter(|name| !name.is_empty())
                    .map(str::to_owned)
                    .unwrap_or_else(|| {
                        if self_human_id.as_deref() == Some(id.as_str()) {
                            "You".to_string()
                        } else {
                            id.clone()
                        }
                    });
            }
        }
        return match speaker_context {
            Some(context) => {
                context.label_segments(segments, base_started_at, self_human_id.as_deref(), &humans)
            }
            None => segments,
        };
    }

    let mut all_segments = Vec::new();

    for transcript in transcripts {
        let offset = transcript
            .started_at
            .map(|started_at| started_at - base_started_at)
            .unwrap_or(0);

        let (words, mut assignments) =
            offset_transcript_data(transcript.words, transcript.assignments, offset);
        let segment_options = if let Some(context) = speaker_context.as_ref() {
            let mut options = crate::segment_options_for_assignments(&assignments);
            // Call-evidence changes split context intervals even while isolation
            // holds; coalesce overlapping or contiguous isolated ranges so a word
            // straddling that boundary is still inside a verified isolated period.
            let mut isolated_ranges: Vec<(i64, i64)> = context
                .intervals
                .iter()
                // `resolve_speaker` refuses self-labeling on shared mics; the
                // range fallback must honor the same guard or index-less room
                // speech would permanently inherit the owner.
                .filter(|interval| {
                    interval.mic_isolated == Some(true) && !interval.shared_microphone
                })
                .map(|interval| {
                    (
                        interval.start_ms - base_started_at,
                        interval.end_ms - base_started_at,
                    )
                })
                .collect();
            isolated_ranges.sort_unstable();
            let mut coalesced: Vec<(i64, i64)> = Vec::with_capacity(isolated_ranges.len());
            for (start, end) in isolated_ranges {
                match coalesced.last_mut() {
                    Some((_, prev_end)) if start <= *prev_end => {
                        *prev_end = (*prev_end).max(end);
                    }
                    _ => coalesced.push((start, end)),
                }
            }
            options.isolated_mic_ranges = Some(coalesced);
            // Verified isolated intervals carry only the local voice, matching
            // the live engine's `isolated_mic_human` fallback; without it an
            // index-less word would inherit a guest's channel-level assignment.
            options.isolated_mic_human = self_human_id
                .as_deref()
                .filter(|id| !id.is_empty())
                .map(str::to_owned);
            options
        } else {
            let claimed_channels: std::collections::HashSet<crate::ChannelProfile> = assignments
                .iter()
                .filter_map(|assignment| match &assignment.scope {
                    crate::IdentityScope::Channel { channel } => Some(*channel),
                    _ => None,
                })
                .collect();
            assignments.extend(
                channel_assignments_for_participants(
                    &participant_human_ids,
                    self_human_id.as_deref(),
                )
                .into_iter()
                .filter(|assignment| match &assignment.scope {
                    crate::IdentityScope::Channel { channel } => {
                        !claimed_channels.contains(channel)
                    }
                    _ => true,
                }),
            );
            segment_options_for_participants(&participant_human_ids, self_human_id.as_deref())
        };

        let segments = build_segments(&words, &[], &assignments, Some(&segment_options));
        all_segments.extend(segments);
    }

    all_segments.sort_by_key(|seg| seg.words.first().map(|w| w.start_ms).unwrap_or(i64::MAX));

    let ctx = SpeakerLabelContext {
        self_human_id: if speaker_context.is_none() {
            self_human_id.clone()
        } else {
            None
        },
        human_name_by_id: humans
            .iter()
            .cloned()
            .map(|human| (human.human_id, human.name))
            .collect::<HashMap<_, _>>(),
    };
    let max_speaker_number = if speaker_context.is_some() {
        None
    } else {
        max_speaker_number_for_participants(&participant_human_ids, self_human_id.as_deref())
    };
    let mut labeler = SpeakerLabeler::from_segments(&all_segments, Some(&ctx), max_speaker_number);

    let segments = all_segments
        .into_iter()
        .filter_map(|segment| {
            let words = normalize_rendered_segment_words(segment.words);
            let first = words.first()?;
            let last = words.last()?;
            let text = words
                .iter()
                .map(|word| word.text.as_str())
                .collect::<String>()
                .trim()
                .to_string();
            if text.is_empty() {
                return None;
            }

            Some(RenderedTranscriptSegment {
                provisional_speaker: None,
                id: stable_segment_id(&segment.key, &words),
                speaker_label: render_speaker_label(&segment.key, Some(&ctx), Some(&mut labeler)),
                start_ms: first.start_ms,
                end_ms: last.end_ms,
                text,
                words,
                key: segment.key,
            })
        })
        .collect();
    match speaker_context {
        Some(context) => {
            context.label_segments(segments, base_started_at, self_human_id.as_deref(), &humans)
        }
        None => segments,
    }
}

fn max_speaker_number_for_participants(
    participant_human_ids: &[String],
    self_human_id: Option<&str>,
) -> Option<usize> {
    let mut participants = participant_human_ids.to_vec();

    if let Some(self_human_id) = self_human_id
        && !participants.iter().any(|id| id == self_human_id)
    {
        participants.push(self_human_id.to_string());
    }

    participants.sort();
    participants.dedup();

    (participants.len() > 1).then_some(participants.len())
}

fn offset_transcript_data(
    raw_words: Vec<RenderTranscriptWordInput>,
    assignments: Vec<IdentityAssignment>,
    time_offset: i64,
) -> (Vec<FinalizedWord>, Vec<IdentityAssignment>) {
    let words: Vec<FinalizedWord> = raw_words
        .into_iter()
        .map(|w| FinalizedWord {
            id: w.id,
            text: w.text,
            start_ms: w.start_ms + time_offset,
            end_ms: w.end_ms + time_offset,
            channel: w.channel,
            state: WordState::Final,
            speaker_index: w.speaker_index,
        })
        .collect();

    (words, assignments)
}

fn earliest_started_at(transcripts: &[RenderTranscriptInput]) -> i64 {
    transcripts
        .iter()
        .filter_map(|transcript| transcript.started_at)
        .min()
        .unwrap_or(0)
}

pub fn normalize_rendered_segment_words(words: Vec<SegmentWord>) -> Vec<SegmentWord> {
    words
        .into_iter()
        .enumerate()
        .map(|(index, mut word)| {
            word.text = normalized_rendered_word_text(&word.text, index == 0);
            word
        })
        .collect()
}

pub fn stable_segment_id(key: &SegmentKey, words: &[SegmentWord]) -> String {
    let first_anchor = words
        .first()
        .map(|word| {
            word.id
                .clone()
                .unwrap_or_else(|| format!("start:{}", word.start_ms))
        })
        .unwrap_or_else(|| "none".to_string());
    let last_anchor = words
        .last()
        .map(|word| {
            word.id
                .clone()
                .unwrap_or_else(|| format!("end:{}", word.end_ms))
        })
        .unwrap_or_else(|| "none".to_string());

    format!(
        "{}:{}:{}:{}:{}",
        key.channel as i32,
        key.speaker_index
            .map(|value| value.to_string())
            .unwrap_or_else(|| "none".to_string()),
        key.speaker_human_id.as_deref().unwrap_or("none"),
        first_anchor,
        last_anchor
    )
}

fn normalized_rendered_word_text(text: &str, is_first_word: bool) -> String {
    let trimmed_start = text.trim_start();
    if trimmed_start.is_empty() {
        return text.to_string();
    }

    if is_first_word {
        return trimmed_start.to_string();
    }

    if text.starts_with(' ') {
        return text.to_string();
    }

    if trimmed_start.starts_with(|c: char| ",.;:!?)}]'".contains(c)) {
        return trimmed_start.to_string();
    }

    format!(" {trimmed_start}")
}

#[cfg(test)]
mod tests;
