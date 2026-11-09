use std::{
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};

use syntheo_db_app::{AppendOutcome, LiveTranscriptInsert};
use syntheo_transcript::WordState;
use syntheo_transcription_core::listener::LiveTranscriptDelta;
use tokio::{
    sync::{Mutex, mpsc, oneshot},
    time::Instant,
};

use crate::{LiveTranscriptPersistence, LiveTranscriptTarget};

use super::{
    BACKLOG_OVERFLOW_ERROR, BATCH_WINDOW, EventSink, INITIAL_RETRY_DELAY, JournalStoreHandle,
    MAX_BACKLOG_REPLACED_IDS, MAX_BACKLOG_TEXT_CHARS, MAX_BACKLOG_WORDS, MAX_RETRY_DELAY,
    RELEASE_FAILURE_TIMEOUT,
};

pub(super) enum WriterMessage {
    Delta(LiveTranscriptDelta),
    Overflow,
    Flush(oneshot::Sender<LiveTranscriptPersistence>),
    Release,
}

#[derive(Default)]
pub(super) struct BacklogTracker {
    pub(super) metrics: BacklogMetrics,
    pub(super) overflowed: bool,
}

#[derive(Clone, Copy, Default)]
pub(super) struct BacklogMetrics {
    words: usize,
    text_chars: usize,
    replaced_ids: usize,
}

impl BacklogMetrics {
    pub(super) fn from_delta(delta: &LiveTranscriptDelta) -> Self {
        Self {
            words: delta.new_words.len(),
            text_chars: delta
                .new_words
                .iter()
                .map(|word| word.text.chars().count())
                .sum(),
            replaced_ids: delta.replaced_ids.len(),
        }
    }

    pub(super) fn add(&mut self, other: Self) {
        self.words = self.words.saturating_add(other.words);
        self.text_chars = self.text_chars.saturating_add(other.text_chars);
        self.replaced_ids = self.replaced_ids.saturating_add(other.replaced_ids);
    }

    pub(super) fn subtract(&mut self, other: Self) {
        self.words = self.words.saturating_sub(other.words);
        self.text_chars = self.text_chars.saturating_sub(other.text_chars);
        self.replaced_ids = self.replaced_ids.saturating_sub(other.replaced_ids);
    }

    pub(super) fn exceeds_bounds(self) -> bool {
        self.words > MAX_BACKLOG_WORDS
            || self.text_chars > MAX_BACKLOG_TEXT_CHARS
            || self.replaced_ids > MAX_BACKLOG_REPLACED_IDS
    }

    pub(super) fn is_empty(self) -> bool {
        self.words == 0 && self.text_chars == 0 && self.replaced_ids == 0
    }
}

struct JournalEntry {
    delta_json: String,
    metrics: BacklogMetrics,
    max_final_end_ms: Option<i64>,
}

impl JournalEntry {
    fn new(mut delta: LiveTranscriptDelta) -> Result<Self, String> {
        delta.partials.clear();
        let metrics = BacklogMetrics::from_delta(&delta);
        let max_final_end_ms = delta
            .new_words
            .iter()
            .filter(|word| word.state == WordState::Final)
            .map(|word| word.end_ms)
            .max();
        let delta_json = serde_json::to_string(&delta).map_err(|error| error.to_string())?;
        Ok(Self {
            delta_json,
            metrics,
            max_final_end_ms,
        })
    }
}

async fn publish_status(
    status: &LiveTranscriptPersistence,
    shared_status: &Mutex<LiveTranscriptPersistence>,
    event_sink: &EventSink,
) {
    *shared_status.lock().await = status.clone();
    event_sink(status.clone());
}

pub(super) async fn run_writer(
    target: LiveTranscriptTarget,
    store: JournalStoreHandle,
    event_sink: EventSink,
    shared_status: Arc<Mutex<LiveTranscriptPersistence>>,
    backlog: Arc<StdMutex<BacklogTracker>>,
    mut receiver: mpsc::UnboundedReceiver<WriterMessage>,
) {
    let db_target = LiveTranscriptInsert {
        id: target.transcript_id,
        session_id: shared_status.lock().await.session_id.clone(),
        owner_user_id: target.owner_user_id,
        created_at: target.created_at,
        started_at_ms: target.started_at_ms,
        memo: target.memo,
        provider: target.provider,
        model: target.model,
    };
    let mut status = shared_status.lock().await.clone();
    let mut pending = Vec::<JournalEntry>::new();
    let mut flush_replies = Vec::<oneshot::Sender<LiveTranscriptPersistence>>::new();
    let mut batch_deadline = None;
    let mut retry_deadline = None;
    let mut retry_delay = INITIAL_RETRY_DELAY;
    let mut released_at = None;
    let mut release_failure_since = None;

    loop {
        let deadline = if !flush_replies.is_empty() && !pending.is_empty() {
            Some(Instant::now())
        } else {
            retry_deadline.or(batch_deadline)
        };
        tokio::select! {
            message = receiver.recv() => {
                match message {
                    Some(WriterMessage::Delta(delta)) => {
                        let overflowed = backlog
                            .lock()
                            .map(|backlog| backlog.overflowed)
                            .unwrap_or(true);
                        if !overflowed {
                            match JournalEntry::new(delta) {
                                Ok(entry) => {
                                    if pending.is_empty() {
                                        batch_deadline = Some(Instant::now() + BATCH_WINDOW);
                                    }
                                    pending.push(entry);
                                }
                                Err(error) => {
                                    status.error = Some(error);
                                    publish_status(&status, &shared_status, &event_sink).await;
                                }
                            }
                        }
                    }
                    Some(WriterMessage::Overflow) => {
                        pending.clear();
                        batch_deadline = None;
                        retry_deadline = None;
                        status.error = Some(BACKLOG_OVERFLOW_ERROR.to_string());
                        publish_status(&status, &shared_status, &event_sink).await;
                        for reply in flush_replies.drain(..) {
                            let _ = reply.send(status.clone());
                        }
                    }
                    Some(WriterMessage::Flush(reply)) => {
                        let is_empty = backlog
                            .lock()
                            .map(|backlog| backlog.metrics.is_empty())
                            .unwrap_or(true);
                        if pending.is_empty() && is_empty {
                            let _ = reply.send(status.clone());
                        } else {
                            flush_replies.push(reply);
                            retry_deadline = None;
                            if !pending.is_empty() {
                                batch_deadline = Some(Instant::now());
                            }
                        }
                    }
                    Some(WriterMessage::Release) => {
                        let now = Instant::now();
                        released_at.get_or_insert(now);
                        if status.error.is_some() {
                            release_failure_since.get_or_insert(now);
                        }
                        if !pending.is_empty() {
                            batch_deadline = Some(now);
                        }
                    }
                    None => {
                        let now = Instant::now();
                        released_at.get_or_insert(now);
                        if status.error.is_some() {
                            release_failure_since.get_or_insert(now);
                        }
                        if !pending.is_empty() {
                            batch_deadline = Some(now);
                        }
                    }
                }
            }
            _ = tokio::time::sleep_until(deadline.unwrap_or_else(|| Instant::now() + Duration::from_secs(86_400))), if deadline.is_some() => {
                batch_deadline = None;
                retry_deadline = None;
                if pending.is_empty() {
                    continue;
                }

                let delta_jsons = pending
                    .iter()
                    .map(|entry| entry.delta_json.clone())
                    .collect::<Vec<_>>();
                let result = store.append(db_target.clone(), delta_jsons).await;

                match result {
                    Ok(AppendOutcome { transcript_exists }) => {
                        let committed = std::mem::take(&mut pending);
                        let metrics = committed.iter().fold(
                            BacklogMetrics::default(),
                            |mut total, entry| {
                                total.add(entry.metrics);
                                total
                            },
                        );
                        let max_final_end_ms = committed
                            .iter()
                            .filter_map(|entry| entry.max_final_end_ms)
                            .max();
                        if let Ok(mut backlog) = backlog.lock() {
                            backlog.metrics.subtract(metrics);
                        }

                        status.transcript_created |= transcript_exists;
                        status.persisted_through_ms = match (
                            status.persisted_through_ms,
                            max_final_end_ms,
                        ) {
                            (Some(previous), Some(next)) => Some(previous.max(next)),
                            (None, next) => next,
                            (current, None) => current,
                        };
                        let (backlog_empty, overflowed) = backlog
                            .lock()
                            .map(|backlog| (backlog.metrics.is_empty(), backlog.overflowed))
                            .unwrap_or((false, true));
                        if overflowed {
                            status.error = Some(BACKLOG_OVERFLOW_ERROR.to_string());
                        } else if backlog_empty {
                            status.error = None;
                        }
                        publish_status(&status, &shared_status, &event_sink).await;
                        retry_delay = INITIAL_RETRY_DELAY;
                        release_failure_since = None;

                        let is_empty = backlog
                            .lock()
                            .map(|backlog| backlog.metrics.is_empty())
                            .unwrap_or(true);
                        if !flush_replies.is_empty() && is_empty {
                            for reply in flush_replies.drain(..) {
                                let _ = reply.send(status.clone());
                            }
                        }
                    }
                    Err(error) => {
                        status.error = Some(error);
                        publish_status(&status, &shared_status, &event_sink).await;
                        if !flush_replies.is_empty() {
                            for reply in flush_replies.drain(..) {
                                let _ = reply.send(status.clone());
                            }
                        }

                        let now = Instant::now();
                        if released_at.is_some() {
                            let failure_since = release_failure_since.get_or_insert(now);
                            if now.duration_since(*failure_since) >= RELEASE_FAILURE_TIMEOUT {
                                pending.clear();
                                break;
                            }
                        }
                        retry_deadline = Some(now + retry_delay);
                        retry_delay = retry_delay
                            .saturating_mul(2)
                            .min(MAX_RETRY_DELAY);
                    }
                }
            }
        }

        if released_at.is_some() && pending.is_empty() {
            let is_empty = backlog
                .lock()
                .map(|backlog| backlog.metrics.is_empty())
                .unwrap_or(true);
            if is_empty {
                break;
            }
        }
    }
}
