use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

use owhisper_interface::stream::{StreamResponse, Word};

use super::channel_state::ChannelState;
#[cfg(test)]
use super::channel_state::{MAX_PARTIAL_TEXT_BYTES, MAX_PARTIAL_WORDS};
use super::types::{FinalizedWord, PartialWord, TranscriptDelta, WordState};
use super::words::assemble;

/// Stateful processor that converts raw `StreamResponse`s into
/// `TranscriptDelta`s and manages correction jobs from any source.
///
/// # Correction sources
///
/// All correction flows follow the same lifecycle:
///
/// 1. Words are finalized (with state `Pending` or `Final`)
/// 2. A correction source processes them asynchronously
/// 3. Correction resolves: pending words are replaced with corrected finals
/// 4. On bounded-state pressure or session end: pending words become final
///    with their original text
///
/// The processor supports two integration patterns:
///
/// - **Inline** cloud handoff: the streaming protocol itself carries
///   handoff/correction metadata. Handled automatically inside `process()`.
///
/// - **External** (LLM postprocessor, future sources): the caller finalizes
///   words via `process()`, then calls `submit_correction` / `apply_correction`
///   to manage the pending→final lifecycle.
pub struct TranscriptProcessor {
    channels: BTreeMap<i32, ChannelState>,
    pending_corrections: HashMap<u64, PendingCorrection>,
    pending_correction_order: VecDeque<u64>,
    pending_correction_words: usize,
    pending_correction_bytes: usize,
    next_job_id: u64,
    finalize_partials: bool,
    flush_partials: bool,
    stitch_final_words: bool,
}

const MAX_PENDING_CORRECTION_JOBS: usize = 64;
const MAX_PENDING_CORRECTION_WORDS: usize = 4_096;
const MAX_PENDING_CORRECTION_BYTES: usize = 256 * 1024;
const MAX_CHANNEL_STATES: usize = 16;

struct PendingCorrection {
    original_words: Vec<FinalizedWord>,
    retained_bytes: usize,
}

#[derive(Default)]
struct CorrectionPromotion {
    words: Vec<FinalizedWord>,
    replaced_ids: Vec<String>,
}

impl CorrectionPromotion {
    fn extend_job(&mut self, job: PendingCorrection) {
        self.replaced_ids
            .extend(job.original_words.iter().map(|word| word.id.clone()));
        self.words.extend(job.original_words);
    }

    fn apply_to(self, new_words: &mut Vec<FinalizedWord>, replaced_ids: &mut Vec<String>) {
        if self.words.is_empty() {
            return;
        }

        let promoted_ids = self
            .words
            .iter()
            .map(|word| word.id.clone())
            .collect::<HashSet<_>>();
        new_words.retain(|word| !promoted_ids.contains(&word.id));
        new_words.extend(self.words);
        replaced_ids.extend(self.replaced_ids);

        let mut seen = HashSet::new();
        replaced_ids.retain(|id| seen.insert(id.clone()));
    }
}

struct ParsedStreamResponse<'a> {
    is_final: bool,
    channel: i32,
    words: &'a [Word],
    transcript: &'a str,
    correction: CorrectionMetadata,
}

#[derive(Default)]
struct CorrectionMetadata {
    is_cloud_corrected: bool,
    is_cloud_handoff: bool,
    cloud_job_id: u64,
}

struct PartialSnapshot {
    partials: Vec<PartialWord>,
}

impl TranscriptProcessor {
    pub fn new() -> Self {
        Self {
            channels: BTreeMap::new(),
            pending_corrections: HashMap::new(),
            pending_correction_order: VecDeque::new(),
            pending_correction_words: 0,
            pending_correction_bytes: 0,
            next_job_id: 1,
            finalize_partials: true,
            flush_partials: true,
            stitch_final_words: true,
        }
    }

    /// Disable this for providers whose partials are UI snapshots rather than
    /// commit-worthy transcript words.
    pub fn with_partial_finalization(mut self, finalize_partials: bool) -> Self {
        self.finalize_partials = finalize_partials;
        self.flush_partials = finalize_partials;
        self
    }

    /// Control whether remaining partials are committed when the session ends.
    pub fn with_flush_partial_finalization(mut self, flush_partials: bool) -> Self {
        self.flush_partials = flush_partials;
        self
    }

    pub fn clear_partials(&mut self, channel: i32, start_ms: i64, end_ms: i64) -> TranscriptDelta {
        if let Some(state) = self.channels.get_mut(&channel) {
            state.clear_partials(start_ms, end_ms);
        }
        self.partial_snapshot().into_delta(vec![], vec![])
    }

    pub fn process(&mut self, response: &StreamResponse) -> Option<TranscriptDelta> {
        let parsed = ParsedStreamResponse::from_response(response)?;
        let raw_words = assemble(parsed.words, parsed.transcript, parsed.channel);
        if raw_words.is_empty() {
            return None;
        }

        if parsed.correction.is_corrected_job()
            && !self
                .pending_corrections
                .contains_key(&parsed.correction.cloud_job_id)
        {
            return None;
        }

        if !self.channels.contains_key(&parsed.channel) && self.channels.len() >= MAX_CHANNEL_STATES
        {
            return None;
        }

        let channel_state = self
            .channels
            .entry(parsed.channel)
            .or_insert_with(ChannelState::new);

        if parsed.is_final {
            let word_state = if parsed.correction.is_handoff_job() {
                WordState::Pending
            } else {
                WordState::Final
            };

            let mut new_words = channel_state.apply_final(
                raw_words,
                word_state,
                self.finalize_partials,
                self.stitch_final_words,
            );

            let mut replaced_ids = vec![];

            if parsed.correction.is_corrected_job() {
                if new_words.is_empty() {
                    let mut promotion = CorrectionPromotion::default();
                    if let Some(job) = self.remove_job(parsed.correction.cloud_job_id) {
                        promotion.extend_job(job);
                    }
                    promotion.apply_to(&mut new_words, &mut replaced_ids);
                } else {
                    replaced_ids = self
                        .resolve_job(parsed.correction.cloud_job_id)
                        .unwrap_or_default();
                }
            }

            if parsed.correction.is_handoff_job() {
                let promotion = self.register_job(parsed.correction.cloud_job_id, &new_words);
                promotion.apply_to(&mut new_words, &mut replaced_ids);
            }

            let snapshot = self.partial_snapshot();

            if new_words.is_empty() && replaced_ids.is_empty() {
                return None;
            }

            Some(snapshot.into_delta(new_words, replaced_ids))
        } else {
            let new_words = channel_state
                .apply_partial(raw_words, self.finalize_partials || self.flush_partials);
            Some(self.partial_snapshot().into_delta(new_words, vec![]))
        }
    }

    // ── Generic correction API ──────────────────────────────────────────────

    pub fn submit_correction(&mut self, words: Vec<FinalizedWord>) -> (u64, TranscriptDelta) {
        let job_id = self.next_job_id();
        let mut replaced_ids: Vec<String> = words.iter().map(|w| w.id.clone()).collect();

        let mut pending_words: Vec<FinalizedWord> = words
            .into_iter()
            .map(|w| FinalizedWord {
                state: WordState::Pending,
                ..w
            })
            .collect();

        let promotion = self.register_job(job_id, &pending_words);
        promotion.apply_to(&mut pending_words, &mut replaced_ids);

        let delta = self
            .partial_snapshot()
            .into_delta(pending_words, replaced_ids);

        (job_id, delta)
    }

    pub fn apply_correction(
        &mut self,
        job_id: u64,
        corrected_words: Vec<FinalizedWord>,
    ) -> TranscriptDelta {
        let Some(replaced_ids) = self.resolve_job(job_id) else {
            return self.partial_snapshot().into_delta(vec![], vec![]);
        };

        self.partial_snapshot()
            .into_delta(corrected_words, replaced_ids)
    }

    /// Finalize everything pending while keeping each channel's delivery position, so a stream
    /// that resumes over replayed audio (a listener reconnect) does not emit those words again.
    pub fn checkpoint(&mut self) -> TranscriptDelta {
        let mut new_words = vec![];

        for state in self.channels.values_mut() {
            new_words.extend(state.checkpoint(self.flush_partials));
        }

        let promotion = self.promote_all_corrections();
        let mut replaced_ids = vec![];
        promotion.apply_to(&mut new_words, &mut replaced_ids);

        TranscriptDelta {
            new_words,
            replaced_ids,
            partials: vec![],
        }
    }

    /// Drain all remaining state at session end.
    pub fn flush(&mut self) -> TranscriptDelta {
        let delta = self.checkpoint();
        self.channels.clear();
        delta
    }

    // ── Internal ────────────────────────────────────────────────────────────

    fn register_job(&mut self, job_id: u64, words: &[FinalizedWord]) -> CorrectionPromotion {
        let mut promotion = CorrectionPromotion::default();

        if let Some(displaced) = self.remove_job(job_id) {
            promotion.extend_job(displaced);
        }

        let original_words = words
            .iter()
            .cloned()
            .map(|word| FinalizedWord {
                state: WordState::Final,
                ..word
            })
            .collect::<Vec<_>>();
        let retained_bytes = original_words
            .iter()
            .map(|word| word.id.len().saturating_add(word.text.len()))
            .fold(0usize, usize::saturating_add);

        self.pending_correction_words = self
            .pending_correction_words
            .saturating_add(original_words.len());
        self.pending_correction_bytes =
            self.pending_correction_bytes.saturating_add(retained_bytes);
        self.pending_correction_order.push_back(job_id);
        self.pending_corrections.insert(
            job_id,
            PendingCorrection {
                original_words,
                retained_bytes,
            },
        );

        while self.pending_corrections.len() > MAX_PENDING_CORRECTION_JOBS
            || self.pending_correction_words > MAX_PENDING_CORRECTION_WORDS
            || self.pending_correction_bytes > MAX_PENDING_CORRECTION_BYTES
        {
            let Some(oldest_job_id) = self.pending_correction_order.front().copied() else {
                break;
            };
            if let Some(expired) = self.remove_job(oldest_job_id) {
                promotion.extend_job(expired);
            }
        }

        promotion
    }

    fn resolve_job(&mut self, job_id: u64) -> Option<Vec<String>> {
        self.remove_job(job_id)
            .map(|job| job.original_words.into_iter().map(|word| word.id).collect())
    }

    fn remove_job(&mut self, job_id: u64) -> Option<PendingCorrection> {
        let job = self.pending_corrections.remove(&job_id)?;
        self.pending_correction_order.retain(|id| *id != job_id);
        self.pending_correction_words = self
            .pending_correction_words
            .saturating_sub(job.original_words.len());
        self.pending_correction_bytes = self
            .pending_correction_bytes
            .saturating_sub(job.retained_bytes);
        Some(job)
    }

    fn promote_all_corrections(&mut self) -> CorrectionPromotion {
        let mut promotion = CorrectionPromotion::default();
        while let Some(job_id) = self.pending_correction_order.front().copied() {
            if let Some(job) = self.remove_job(job_id) {
                promotion.extend_job(job);
            }
        }
        promotion
    }

    fn next_job_id(&mut self) -> u64 {
        let id = self.next_job_id;
        self.next_job_id += 1;
        id
    }

    fn partial_snapshot(&self) -> PartialSnapshot {
        PartialSnapshot::from_channels(self.channels.values())
    }
}

impl Default for TranscriptProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl<'a> ParsedStreamResponse<'a> {
    fn from_response(response: &'a StreamResponse) -> Option<Self> {
        let StreamResponse::TranscriptResponse {
            is_final,
            channel,
            channel_index,
            metadata,
            ..
        } = response
        else {
            return None;
        };

        let alt = channel.alternatives.first()?;
        if alt.words.is_empty() && alt.transcript.is_empty() {
            return None;
        }

        Some(Self {
            is_final: *is_final,
            channel: channel_index.first().copied().unwrap_or(0),
            words: &alt.words,
            transcript: &alt.transcript,
            correction: CorrectionMetadata::from_extra(metadata.extra.as_ref()),
        })
    }
}

impl CorrectionMetadata {
    fn from_extra(extra: Option<&HashMap<String, serde_json::Value>>) -> Self {
        let get_bool = |key: &str| -> bool {
            extra
                .and_then(|value| value.get(key))
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
        };
        let get_u64 = |key: &str| -> u64 {
            extra
                .and_then(|value| value.get(key))
                .and_then(|value| value.as_u64())
                .unwrap_or(0)
        };

        Self {
            is_cloud_corrected: get_bool("cloud_corrected"),
            is_cloud_handoff: get_bool("cloud_handoff"),
            cloud_job_id: get_u64("cloud_job_id"),
        }
    }

    fn is_corrected_job(&self) -> bool {
        self.is_cloud_corrected && self.cloud_job_id != 0
    }

    fn is_handoff_job(&self) -> bool {
        self.is_cloud_handoff && self.cloud_job_id != 0
    }
}

impl PartialSnapshot {
    fn from_channels<'a>(states: impl Iterator<Item = &'a ChannelState>) -> Self {
        let mut partials = Vec::new();

        for state in states {
            partials.extend(state.current_partials());
        }

        Self { partials }
    }

    fn into_delta(
        self,
        new_words: Vec<FinalizedWord>,
        replaced_ids: Vec<String>,
    ) -> TranscriptDelta {
        TranscriptDelta {
            new_words,
            replaced_ids,
            partials: self.partials,
        }
    }
}

#[cfg(test)]
mod tests;
