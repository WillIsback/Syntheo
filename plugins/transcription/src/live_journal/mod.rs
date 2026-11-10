use std::{
    collections::HashMap,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};

use futures_util::future::BoxFuture;
use syntheo_db_app::{AppendOutcome, LiveTranscriptInsert, append_live_transcript_deltas};
use syntheo_transcription_core::listener::LiveTranscriptDelta;
use tauri::Manager;
use tauri_specta::Event;
use tokio::sync::{Mutex, mpsc, oneshot};

use crate::{LiveTranscriptPersistence, LiveTranscriptPersistenceEvent, LiveTranscriptTarget};

mod writer;

use writer::{BacklogMetrics, BacklogTracker, WriterMessage, run_writer};

const BATCH_WINDOW: Duration = Duration::from_millis(250);
const INITIAL_RETRY_DELAY: Duration = Duration::from_millis(500);
const MAX_RETRY_DELAY: Duration = Duration::from_secs(5);
const RELEASE_FAILURE_TIMEOUT: Duration = Duration::from_secs(60);
const FLUSH_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_BACKLOG_WORDS: usize = 10_000;
const MAX_BACKLOG_TEXT_CHARS: usize = 1_000_000;
const MAX_BACKLOG_REPLACED_IDS: usize = 10_000;
const BACKLOG_OVERFLOW_ERROR: &str = "transcript persistence backlog overflowed";
const FLUSH_TIMEOUT_ERROR: &str = "transcript persistence flush timed out";

type JournalStoreHandle = Arc<dyn JournalStore>;
type EventSink = Arc<dyn Fn(LiveTranscriptPersistence) + Send + Sync>;

trait JournalStore: Send + Sync {
    fn append(
        &self,
        target: LiveTranscriptInsert,
        delta_jsons: Vec<String>,
    ) -> BoxFuture<'static, Result<AppendOutcome, String>>;
}

#[derive(Default)]
pub(crate) struct LiveJournalRegistry {
    sessions: StdMutex<HashMap<String, LiveTranscriptJournal>>,
}

impl LiveJournalRegistry {
    fn register(
        &self,
        session_id: String,
        target: LiveTranscriptTarget,
        store: JournalStoreHandle,
        event_sink: EventSink,
    ) -> Result<(LiveTranscriptJournal, Option<LiveTranscriptJournal>), String> {
        let journal = LiveTranscriptJournal::spawn(session_id.clone(), target, store, event_sink);
        let previous = self
            .sessions
            .lock()
            .map_err(|error| error.to_string())?
            .insert(session_id, journal.clone());
        Ok((journal, previous))
    }

    pub(crate) fn rollback_registration(
        &self,
        session_id: &str,
        registered: &LiveTranscriptJournal,
        previous: Option<LiveTranscriptJournal>,
    ) -> Result<(), String> {
        let result = self
            .sessions
            .lock()
            .map_err(|error| error.to_string())
            .map(|mut sessions| {
                if sessions
                    .get(session_id)
                    .is_some_and(|journal| journal.is_same_instance(registered))
                {
                    match previous {
                        Some(previous) => {
                            sessions.insert(session_id.to_string(), previous);
                        }
                        None => {
                            sessions.remove(session_id);
                        }
                    }
                }
            });
        registered.release();
        result
    }

    pub(crate) fn append(&self, session_id: &str, delta: LiveTranscriptDelta) {
        let journal = self
            .sessions
            .lock()
            .ok()
            .and_then(|sessions| sessions.get(session_id).cloned());
        if let Some(journal) = journal {
            journal.append(delta);
        }
    }

    pub(crate) fn get(&self, session_id: &str) -> Result<Option<LiveTranscriptJournal>, String> {
        self.sessions
            .lock()
            .map(|sessions| sessions.get(session_id).cloned())
            .map_err(|error| error.to_string())
    }

    pub(crate) fn release(&self, session_id: &str, transcript_id: &str) -> Result<(), String> {
        let removed = {
            let mut sessions = self.sessions.lock().map_err(|error| error.to_string())?;
            if sessions
                .get(session_id)
                .is_some_and(|journal| journal.transcript_id == transcript_id)
            {
                sessions.remove(session_id)
            } else {
                None
            }
        };
        if let Some(journal) = removed {
            journal.release();
        }
        Ok(())
    }

    pub(crate) fn release_session(&self, session_id: &str) -> Result<(), String> {
        let removed = self
            .sessions
            .lock()
            .map_err(|error| error.to_string())?
            .remove(session_id);
        if let Some(journal) = removed {
            journal.release();
        }
        Ok(())
    }
}

#[derive(Clone)]
pub(crate) struct LiveTranscriptJournal {
    transcript_id: String,
    sender: mpsc::UnboundedSender<WriterMessage>,
    status: Arc<Mutex<LiveTranscriptPersistence>>,
    backlog: Arc<StdMutex<BacklogTracker>>,
    event_sink: EventSink,
}

impl LiveTranscriptJournal {
    fn spawn(
        session_id: String,
        target: LiveTranscriptTarget,
        store: JournalStoreHandle,
        event_sink: EventSink,
    ) -> Self {
        let transcript_id = target.transcript_id.clone();
        let status = Arc::new(Mutex::new(LiveTranscriptPersistence {
            session_id,
            transcript_id: transcript_id.clone(),
            transcript_created: false,
            persisted_through_ms: None,
            error: None,
        }));
        let backlog = Arc::new(StdMutex::new(BacklogTracker::default()));
        let (sender, receiver) = mpsc::unbounded_channel();
        tokio::spawn(run_writer(
            target,
            store,
            event_sink.clone(),
            status.clone(),
            backlog.clone(),
            receiver,
        ));
        Self {
            transcript_id,
            sender,
            status,
            backlog,
            event_sink,
        }
    }

    pub(crate) fn append(&self, delta: LiveTranscriptDelta) {
        if delta.new_words.is_empty() && delta.replaced_ids.is_empty() {
            return;
        }

        let metrics = BacklogMetrics::from_delta(&delta);
        let overflowed = {
            let Ok(mut backlog) = self.backlog.lock() else {
                return;
            };
            if backlog.overflowed {
                return;
            }
            backlog.metrics.add(metrics);
            if backlog.metrics.exceeds_bounds() {
                backlog.overflowed = true;
                backlog.metrics = BacklogMetrics::default();
                true
            } else {
                false
            }
        };

        if overflowed {
            let _ = self.sender.send(WriterMessage::Overflow);
        } else if let Err(error) = self.sender.send(WriterMessage::Delta(delta))
            && let WriterMessage::Delta(delta) = error.0
            && let Ok(mut backlog) = self.backlog.lock()
        {
            backlog.metrics.subtract(BacklogMetrics::from_delta(&delta));
        }
    }

    pub(crate) async fn flush(&self) -> Result<LiveTranscriptPersistence, String> {
        let (reply, response) = oneshot::channel();
        self.sender
            .send(WriterMessage::Flush(reply))
            .map_err(|error| error.to_string())?;

        match tokio::time::timeout(FLUSH_TIMEOUT, response).await {
            Ok(Ok(status)) => Ok(status),
            Ok(Err(error)) => Err(error.to_string()),
            Err(_) => {
                let status = {
                    let mut status = self.status.lock().await;
                    status.error = Some(FLUSH_TIMEOUT_ERROR.to_string());
                    status.clone()
                };
                (self.event_sink)(status.clone());
                Ok(status)
            }
        }
    }

    fn is_same_instance(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.status, &other.status)
    }

    pub(crate) fn release(&self) {
        let _ = self.sender.send(WriterMessage::Release);
    }
}

pub(crate) fn register_app_journal<R: tauri::Runtime>(
    registry: &LiveJournalRegistry,
    app: tauri::AppHandle<R>,
    session_id: String,
    target: LiveTranscriptTarget,
) -> Result<(LiveTranscriptJournal, Option<LiveTranscriptJournal>), String> {
    let store: JournalStoreHandle = Arc::new(AppJournalStore(app.clone()));
    let event_app = app;
    let event_sink: EventSink = Arc::new(move |status| {
        if let Some(registry) = event_app.try_state::<crate::CaptureGapRegistry>() {
            if status.error.is_some() {
                registry.persistence_failed(&status.session_id, crate::capture_gaps::unix_now_ms());
            } else if let Some(persisted_through_ms) = status.persisted_through_ms {
                registry.persisted_through(&status.session_id, persisted_through_ms);
            }
        }
        if let Err(error) = (LiveTranscriptPersistenceEvent { status }).emit(&event_app) {
            tracing::error!(?error, "failed_to_emit_live_transcript_persistence_event");
        }
    });
    registry.register(session_id, target, store, event_sink)
}

struct AppJournalStore<R: tauri::Runtime>(tauri::AppHandle<R>);

impl<R: tauri::Runtime> JournalStore for AppJournalStore<R> {
    fn append(
        &self,
        target: LiveTranscriptInsert,
        delta_jsons: Vec<String>,
    ) -> BoxFuture<'static, Result<AppendOutcome, String>> {
        let app = self.0.clone();
        Box::pin(async move {
            let runtime = app
                .try_state::<tauri_plugin_db::ManagedState>()
                .map(|state| state.inner().clone())
                .ok_or_else(|| "database is not ready yet".to_string())?;
            let _guard = runtime.synced_write_guard().await;
            append_live_transcript_deltas(runtime.pool(), &target, &delta_jsons)
                .await
                .map_err(|error| error.to_string())
        })
    }
}

#[cfg(test)]
mod tests;
