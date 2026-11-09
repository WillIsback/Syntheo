use owhisper_interface::stream::{Alternatives, Channel, Metadata, StreamResponse};

use super::super::{OpenAIAdapter, OpenAILiveItem, OpenAILiveState};
use crate::adapter::parsing::{WordBuilder, ms_to_secs};

use super::{
    CompletedLiveItem, LiveStateReset, MAX_BLOCKED_COMPLETED_ITEMS, MAX_ITEM_ID_BYTES,
    MAX_ITEM_TRANSCRIPT_BYTES, MAX_LIVE_ITEMS, MAX_RETAINED_TRANSCRIPT_BYTES,
};

impl OpenAIAdapter {
    pub(super) fn prepare_item(
        state: &mut OpenAILiveState,
        item_id: &str,
    ) -> Result<(), LiveStateReset> {
        if state.items.contains_key(item_id) {
            return Ok(());
        }
        if item_id.len() > MAX_ITEM_ID_BYTES {
            return Err(Self::reset_live_state(state, "item ID exceeded 1 KiB"));
        }
        if state.items.len() >= MAX_LIVE_ITEMS {
            return Err(Self::reset_live_state(
                state,
                "more than 64 transcription items remained pending",
            ));
        }

        state.item_order.push_back(item_id.to_string());
        state
            .items
            .insert(item_id.to_string(), OpenAILiveItem::default());
        Ok(())
    }

    pub(super) fn ensure_item(&self, item_id: &str) -> Result<(), LiveStateReset> {
        let mut state = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prepare_item(&mut state, item_id)
    }

    pub(super) fn record_item_start(
        &self,
        item_id: &str,
        start_ms: u64,
    ) -> Result<(), LiveStateReset> {
        let mut state = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prepare_item(&mut state, item_id)?;
        state.items.get_mut(item_id).unwrap().start_ms = Some(start_ms);
        Ok(())
    }

    pub(super) fn record_item_end(&self, item_id: &str, end_ms: u64) -> Result<(), LiveStateReset> {
        let mut state = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prepare_item(&mut state, item_id)?;
        state.items.get_mut(item_id).unwrap().end_ms = Some(end_ms);
        Ok(())
    }

    pub(super) fn record_item_span(
        &self,
        item_id: &str,
        start_ms: u64,
        end_ms: u64,
    ) -> Result<(), LiveStateReset> {
        let mut state = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prepare_item(&mut state, item_id)?;
        let item = state.items.get_mut(item_id).unwrap();
        item.start_ms = Some(start_ms);
        item.end_ms = Some(end_ms);
        Ok(())
    }

    pub(super) fn append_item_delta(
        &self,
        item_id: &str,
        delta: &str,
    ) -> Result<(String, u64, u64), LiveStateReset> {
        let mut state = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prepare_item(&mut state, item_id)?;

        let item_bytes = state.items.get(item_id).unwrap().transcript.len();
        let retained_bytes = Self::retained_transcript_bytes(&state);
        if delta.len() > MAX_ITEM_TRANSCRIPT_BYTES.saturating_sub(item_bytes) {
            return Err(Self::reset_live_state(
                &mut state,
                "one transcription item exceeded 64 KiB",
            ));
        }
        if delta.len() > MAX_RETAINED_TRANSCRIPT_BYTES.saturating_sub(retained_bytes) {
            return Err(Self::reset_live_state(
                &mut state,
                "retained transcription text exceeded 512 KiB",
            ));
        }

        let fallback_start_ms = state.fallback_end_ms;
        let item = state.items.get_mut(item_id).unwrap();
        item.transcript.push_str(delta);

        let transcript = item.transcript.clone();
        let start_ms = item.start_ms.unwrap_or(fallback_start_ms);
        let end_ms = item
            .end_ms
            .unwrap_or_else(|| synthetic_end_ms(start_ms, &transcript));
        Ok((transcript, start_ms, end_ms))
    }

    pub(super) fn complete_items(
        &self,
        item_id: &str,
        transcript: &str,
    ) -> Result<Vec<CompletedLiveItem>, LiveStateReset> {
        let mut state = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Self::prepare_item(&mut state, item_id)?;

        let item = state.items.get(item_id).unwrap();
        let retained_without_item = Self::retained_transcript_bytes(&state)
            .saturating_sub(item.transcript.len())
            .saturating_sub(item.completed_transcript.as_ref().map_or(0, String::len));
        if transcript.len() > MAX_ITEM_TRANSCRIPT_BYTES {
            return Err(Self::reset_live_state(
                &mut state,
                "one completed transcription item exceeded 64 KiB",
            ));
        }
        if transcript.len() > MAX_RETAINED_TRANSCRIPT_BYTES.saturating_sub(retained_without_item) {
            return Err(Self::reset_live_state(
                &mut state,
                "retained transcription text exceeded 512 KiB",
            ));
        }

        let item = state.items.get_mut(item_id).unwrap();
        item.transcript = String::new();
        item.completed_transcript = Some(transcript.to_string());

        if Self::blocked_completed_items(&state) >= MAX_BLOCKED_COMPLETED_ITEMS {
            return Err(Self::reset_live_state(
                &mut state,
                "16 completed items were blocked behind an unfinished item",
            ));
        }

        Ok(Self::drain_completed(&mut state))
    }

    pub(super) fn drain_completed(state: &mut OpenAILiveState) -> Vec<CompletedLiveItem> {
        let mut completed = Vec::new();
        while let Some(next_item_id) = state.item_order.front() {
            if state
                .items
                .get(next_item_id)
                .and_then(|item| item.completed_transcript.as_ref())
                .is_none()
            {
                break;
            }

            let next_item_id = state.item_order.pop_front().unwrap();
            let mut item = state.items.remove(&next_item_id).unwrap();
            let transcript = item.completed_transcript.take().unwrap();
            completed.push(Self::finish_item(state, item, transcript));
        }

        completed
    }

    pub(super) fn finish_item(
        state: &mut OpenAILiveState,
        item: OpenAILiveItem,
        transcript: String,
    ) -> CompletedLiveItem {
        let observed_start_ms = item.start_ms.unwrap_or(state.fallback_end_ms);
        let start_ms = observed_start_ms.max(state.fallback_end_ms);
        let observed_duration_ms = item
            .end_ms
            .unwrap_or_else(|| synthetic_end_ms(observed_start_ms, &transcript))
            .saturating_sub(observed_start_ms);
        let end_ms = (start_ms + observed_duration_ms).max(synthetic_end_ms(start_ms, &transcript));
        state.fallback_end_ms = end_ms;
        (transcript, start_ms, end_ms)
    }

    pub(super) fn retained_transcript_bytes(state: &OpenAILiveState) -> usize {
        state
            .items
            .values()
            .map(|item| {
                item.transcript.len() + item.completed_transcript.as_ref().map_or(0, String::len)
            })
            .sum()
    }

    pub(super) fn blocked_completed_items(state: &OpenAILiveState) -> usize {
        let Some(head_id) = state.item_order.front() else {
            return 0;
        };
        if state
            .items
            .get(head_id)
            .and_then(|item| item.completed_transcript.as_ref())
            .is_some()
        {
            return 0;
        }

        state
            .item_order
            .iter()
            .skip(1)
            .filter(|item_id| {
                state
                    .items
                    .get(*item_id)
                    .and_then(|item| item.completed_transcript.as_ref())
                    .is_some()
            })
            .count()
    }

    pub(super) fn reset_live_state(
        state: &mut OpenAILiveState,
        reason: &'static str,
    ) -> LiveStateReset {
        let mut completed = Vec::new();
        while let Some(item_id) = state.item_order.pop_front() {
            let Some(mut item) = state.items.remove(&item_id) else {
                continue;
            };
            let transcript = item.completed_transcript.take().or_else(|| {
                (!item.transcript.trim().is_empty()).then(|| std::mem::take(&mut item.transcript))
            });
            if let Some(transcript) = transcript {
                completed.push(Self::finish_item(state, item, transcript));
            }
        }
        state.items.clear();

        LiveStateReset { completed, reason }
    }

    pub(super) fn finish_state_update(result: Result<(), LiveStateReset>) -> Vec<StreamResponse> {
        match result {
            Ok(()) => Vec::new(),
            Err(reset) => Self::reset_responses(reset),
        }
    }

    pub(super) fn completed_responses(completed: Vec<CompletedLiveItem>) -> Vec<StreamResponse> {
        completed
            .into_iter()
            .flat_map(|(transcript, start_ms, end_ms)| {
                Self::build_transcript_response(&transcript, true, true, start_ms, end_ms)
            })
            .collect()
    }

    pub(super) fn reset_responses(reset: LiveStateReset) -> Vec<StreamResponse> {
        tracing::warn!(reason = reset.reason, "openai_live_state_limit_exceeded");
        let mut responses = Self::completed_responses(reset.completed);
        responses.push(StreamResponse::ErrorResponse {
            error_code: None,
            error_message: format!(
                "OpenAI realtime state limit exceeded: {}; reconnecting to preserve transcript order",
                reset.reason
            ),
            provider: "openai".to_string(),
        });
        responses
    }

    pub(super) fn discard_item(&self, item_id: &str) -> Vec<(String, u64, u64)> {
        let mut state = self
            .live_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.items.remove(item_id);
        state.item_order.retain(|queued| queued != item_id);
        Self::drain_completed(&mut state)
    }

    pub(super) fn build_transcript_response(
        transcript: &str,
        is_final: bool,
        speech_final: bool,
        start_ms: u64,
        end_ms: u64,
    ) -> Vec<StreamResponse> {
        if transcript.trim().is_empty() {
            return vec![];
        }

        let raw_words = transcript.split_whitespace().collect::<Vec<_>>();
        let word_count = raw_words.len() as u64;
        let span_ms = end_ms.saturating_sub(start_ms).max(word_count);
        let words = raw_words
            .into_iter()
            .enumerate()
            .map(|(index, word)| {
                let index = index as u64;
                WordBuilder::new(word)
                    .start(ms_to_secs(start_ms + span_ms * index / word_count))
                    .end(ms_to_secs(start_ms + span_ms * (index + 1) / word_count))
                    .confidence(1.0)
                    .build()
            })
            .collect::<Vec<_>>();
        let start = ms_to_secs(start_ms);
        let duration = ms_to_secs(span_ms);

        vec![StreamResponse::TranscriptResponse {
            is_final,
            speech_final,
            from_finalize: false,
            start,
            duration,
            channel: Channel {
                alternatives: vec![Alternatives {
                    transcript: transcript.to_string(),
                    words,
                    confidence: 1.0,
                    languages: vec![],
                }],
            },
            metadata: Metadata::default(),
            channel_index: vec![0, 1],
        }]
    }
}

fn synthetic_end_ms(start_ms: u64, transcript: &str) -> u64 {
    start_ms + transcript.split_whitespace().count().max(1) as u64
}
