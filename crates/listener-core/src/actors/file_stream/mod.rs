//! Transcription d'un fichier par le flux temps réel (issue 463).
//!
//! Quand le fournisseur ne transcrit qu'en direct, un fichier importé passe
//! par le même `ListenerActor` qu'une écoute : mêmes adaptateurs, même moteur
//! de transcription (mots, locuteurs, horodatage), même reprise sans doublon
//! après une reconnexion. Seule la source change : l'audio décodé en mémoire
//! remplace le micro et le haut-parleur, et rien n'est écrit sur le disque.
//!
//! Les coupures (limite de session du serveur, réseau) se traitent comme en
//! direct : reconnexion, puis rejeu à partir de la dernière transcription
//! finalisée. L'horloge est celle du fichier et non celle du mur, ce qui
//! permet d'envoyer plus vite que le temps réel (voir `pace`).

mod collector;
mod pace;
mod rest;
#[cfg(test)]
mod tests;

pub use collector::{FILE_STREAM_CHANNEL, words_to_batch_response};
pub use pace::{DEFAULT_MAX_LEAD, DEFAULT_MAX_SPEED, FileStreamPace};
pub use rest::{
    RestFileError, SpeakerBounds, rest_file_transcription, supports_rest_file_transcription,
};

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use bytes::Bytes;
use ractor::rpc::CallResult;
use ractor::{Actor, ActorProcessingErr, ActorRef, SupervisionEvent};
use syntheo_transcript::FinalizedWord;
use tokio::sync::mpsc;

use collector::{Collector, FileStreamRuntime};
use pace::{resume_position, retry_delay, samples_for};

use crate::actors::listener::ListenerInitError;
use crate::actors::{
    ChannelMode, ListenerActor, ListenerArgs, ListenerAudioResult, ListenerMsg, SAMPLE_RATE,
    resolve_transcription_mode,
};
use crate::{DegradedError, TranscriptionMode};

const REPLAY_OVERLAP: Duration = Duration::from_secs(1);
const MAX_REPLAY: Duration = Duration::from_secs(120);
const CAUGHT_UP_MARGIN_MS: i64 = 1_500;
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const AUDIO_CALL_TIMEOUT: Duration = Duration::from_secs(2);
const LISTENER_STOP_TIMEOUT: Duration = Duration::from_secs(30);

pub struct FileStreamParams {
    pub session_id: String,
    pub model: String,
    pub base_url: String,
    pub api_key: String,
    pub languages: Vec<syntheo_language::Language>,
    pub keywords: Vec<String>,
    pub participant_human_ids: Vec<String>,
    pub self_human_id: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct FileStreamOptions {
    pub pace: FileStreamPace,
    pub retry_base_delay: Duration,
    pub retry_max_delay: Duration,
    /// Tentatives successives sans aucun mot nouveau avant d'abandonner.
    pub max_failures_without_progress: u32,
    /// Fin du fichier envoyée : attente de la transcription restante.
    pub tail_idle: Duration,
    pub tail_max: Duration,
}

impl Default for FileStreamOptions {
    fn default() -> Self {
        Self {
            pace: FileStreamPace::default(),
            retry_base_delay: Duration::from_secs(1),
            retry_max_delay: Duration::from_secs(8),
            max_failures_without_progress: 5,
            tail_idle: Duration::from_secs(4),
            tail_max: Duration::from_secs(60),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FileStreamProgress {
    /// Part du fichier déjà envoyée, de 0 à 1.
    pub fraction: f64,
    pub preview: Option<String>,
    /// Avancement inconnu jusqu'à la fin de la requête en cours (issue #568).
    pub indeterminate: bool,
}

pub trait FileStreamObserver: Send + Sync {
    fn on_progress(&self, progress: FileStreamProgress);

    fn is_cancelled(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone)]
pub enum FileStreamError {
    Cancelled,
    /// Le fournisseur n'a pas de mode temps réel pour ce modèle.
    Unsupported,
    /// Refus durable du serveur : identifiants ou configuration.
    Rejected(DegradedError),
    /// Plusieurs reconnexions de suite sans aucun mot nouveau.
    ConnectionLost(String),
}

impl std::fmt::Display for FileStreamError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cancelled => write!(f, "Transcription stopped."),
            Self::Unsupported => write!(f, "This model has no real-time transcription."),
            Self::Rejected(DegradedError::AuthenticationFailed { .. }) => {
                write!(
                    f,
                    "Authentication failed. Please check your API key in settings."
                )
            }
            Self::Rejected(DegradedError::ProviderConfiguration { message, .. }) => {
                write!(f, "The transcription server refused the request: {message}")
            }
            Self::Rejected(other) => write!(f, "{}", describe_degraded(other)),
            Self::ConnectionLost(message) => write!(
                f,
                "The connection to the transcription server was lost: {message}"
            ),
        }
    }
}

impl std::error::Error for FileStreamError {}

#[derive(Debug)]
pub struct FileStreamOutput {
    pub words: Vec<FinalizedWord>,
    pub duration_secs: f64,
    pub reconnections: u32,
    /// L'accélération a été abandonnée au profit du temps réel.
    pub realtime_fallback: bool,
}

/// Même règle qu'une écoute en direct : le modèle doit avoir un mode temps
/// réel pour ces langues.
pub fn supports_file_stream(
    base_url: &str,
    model: &str,
    languages: &[syntheo_language::Language],
) -> bool {
    resolve_transcription_mode(TranscriptionMode::Live, base_url, model, languages)
        == TranscriptionMode::Live
}

/// Nom du fournisseur temps réel (« nvidia », « openai ») pour l'étiquette du
/// transcript.
pub fn file_stream_provider_name(
    base_url: &str,
    model: &str,
    languages: &[syntheo_language::Language],
) -> String {
    owhisper_client::AdapterKind::from_url_and_languages(base_url, languages, Some(model))
        .to_string()
}

/// Envoie `samples` (PCM 16 bits mono à `SAMPLE_RATE`) dans le flux temps réel
/// et rend les mots finalisés, horodatés dans le temps du fichier.
pub async fn stream_file_transcription(
    params: FileStreamParams,
    samples: Arc<[i16]>,
    options: FileStreamOptions,
    observer: Arc<dyn FileStreamObserver>,
) -> Result<FileStreamOutput, FileStreamError> {
    if !supports_file_stream(&params.base_url, &params.model, &params.languages) {
        return Err(FileStreamError::Unsupported);
    }

    let collector = Arc::new(Mutex::new(Collector::default()));
    let mut driver = Driver {
        runtime: Arc::new(FileStreamRuntime {
            collector: collector.clone(),
        }),
        collector,
        live_transcript: Default::default(),
        params,
        samples,
        options,
        observer,
        pace: options.pace,
        reported: 0.0,
        last_report: None,
    };
    driver.run().await
}

enum FeedOutcome {
    Finished,
    Ended {
        degraded: DegradedError,
        sent: usize,
    },
    Cancelled,
}

struct Driver {
    runtime: Arc<FileStreamRuntime>,
    collector: Arc<Mutex<Collector>>,
    live_transcript: crate::actors::SharedLiveTranscript,
    params: FileStreamParams,
    samples: Arc<[i16]>,
    options: FileStreamOptions,
    observer: Arc<dyn FileStreamObserver>,
    pace: FileStreamPace,
    reported: f64,
    last_report: Option<Instant>,
}

impl Driver {
    async fn run(&mut self) -> Result<FileStreamOutput, FileStreamError> {
        let total = self.samples.len();
        let mut sent = 0usize;
        let mut failures = 0u32;
        let mut attempt = 0u32;
        let mut reconnections = 0u32;
        let mut tail_replay_without_progress = false;

        loop {
            if self.observer.is_cancelled() {
                return Err(FileStreamError::Cancelled);
            }
            let start = if attempt == 0 {
                0
            } else {
                resume_position(
                    self.transcribed_samples(),
                    sent,
                    samples_for(REPLAY_OVERLAP.as_secs_f64(), SAMPLE_RATE),
                    samples_for(MAX_REPLAY.as_secs_f64(), SAMPLE_RATE),
                )
            };
            attempt += 1;

            let mut connection = match Connection::open(self.listener_args(attempt, start)).await {
                Ok(connection) => connection,
                Err(degraded) => {
                    if is_permanent(&degraded) {
                        return Err(FileStreamError::Rejected(degraded));
                    }
                    failures += 1;
                    self.give_up_after(failures, &degraded)?;
                    self.wait_before_retry(failures).await?;
                    continue;
                }
            };

            let transcribed_before = self.transcribed_ms();
            match self.feed(&mut connection, start).await {
                FeedOutcome::Cancelled => {
                    connection.close().await;
                    return Err(FileStreamError::Cancelled);
                }
                FeedOutcome::Finished => {
                    connection.finish().await;
                    return Ok(self.output(reconnections));
                }
                FeedOutcome::Ended {
                    degraded,
                    sent: reached,
                } => {
                    connection.close().await;
                    sent = sent.max(reached);
                    if is_permanent(&degraded) {
                        return Err(FileStreamError::Rejected(degraded));
                    }
                    let progressed = self.transcribed_ms() > transcribed_before;
                    // Tout l'audio était parti : un second flux sans mot de
                    // plus prouve qu'il ne restait rien à transcrire.
                    if sent >= total && !progressed {
                        if tail_replay_without_progress {
                            return Ok(self.output(reconnections));
                        }
                        tail_replay_without_progress = true;
                    }
                    if progressed {
                        failures = 0;
                    } else {
                        failures += 1;
                        if self.pace.is_accelerated() {
                            tracing::warn!("file_stream_falls_back_to_realtime_pace");
                            self.pace = self.pace.realtime();
                        }
                        self.give_up_after(failures, &degraded)?;
                    }
                    reconnections += 1;
                    tracing::info!(reconnections, progressed, "file_stream_reconnecting");
                    self.wait_before_retry(failures.max(1)).await?;
                }
            }
        }
    }

    fn listener_args(&self, attempt: u32, start: usize) -> ListenerArgs {
        ListenerArgs {
            runtime: self.runtime.clone(),
            languages: self.params.languages.clone(),
            onboarding: false,
            model: self.params.model.clone(),
            base_url: self.params.base_url.clone(),
            api_key: self.params.api_key.clone(),
            keywords: self.params.keywords.clone(),
            transcription_mode: TranscriptionMode::Live,
            mode: ChannelMode::MicOnly,
            session_started_at: Instant::now(),
            session_started_at_unix: SystemTime::now(),
            stream_offset_secs: Some(start as f64 / f64::from(SAMPLE_RATE)),
            gap_replayed: attempt > 1,
            // Un nom par connexion : l'acteur précédent peut encore se désinscrire.
            session_id: format!("{}:file-stream:{attempt}", self.params.session_id),
            participant_human_ids: self.params.participant_human_ids.clone(),
            self_human_id: self.params.self_human_id.clone(),
            speaker_assignments: Vec::new(),
            live_transcript: self.live_transcript.clone(),
            mic_isolated: false,
        }
    }

    async fn feed(&mut self, connection: &mut Connection, start: usize) -> FeedOutcome {
        let total = self.samples.len();
        let chunk = syntheo_audio_utils::chunk_size_for_stt(SAMPLE_RATE);
        let connected_at = Instant::now();
        let mut position = start;

        while position < total {
            if self.observer.is_cancelled() {
                return FeedOutcome::Cancelled;
            }
            if let Some(degraded) = connection.try_exit() {
                return FeedOutcome::Ended {
                    degraded,
                    sent: position,
                };
            }

            let end = (position + chunk).min(total);
            let allowed = self.pace.allowed_position(
                start,
                connected_at.elapsed(),
                self.transcribed_samples(),
                SAMPLE_RATE,
            );
            if end > allowed {
                tokio::time::sleep(POLL_INTERVAL).await;
                continue;
            }

            match connection
                .send(pcm_bytes(&self.samples[position..end]))
                .await
            {
                Some(ListenerAudioResult::Accepted) => {
                    position = end;
                    self.report(position as f64 / total.max(1) as f64);
                }
                Some(ListenerAudioResult::Backpressured) => {
                    tokio::time::sleep(POLL_INTERVAL).await;
                }
                _ => {
                    return FeedOutcome::Ended {
                        degraded: connection.wait_exit().await,
                        sent: position,
                    };
                }
            }
        }

        let tail_started = Instant::now();
        let total_ms = (total as f64 * 1000.0 / f64::from(SAMPLE_RATE)) as i64;
        loop {
            if self.observer.is_cancelled() {
                return FeedOutcome::Cancelled;
            }
            if let Some(degraded) = connection.try_exit() {
                return FeedOutcome::Ended {
                    degraded,
                    sent: total,
                };
            }
            let (transcribed_ms, last_activity) = {
                let collector = self.lock();
                (collector.transcribed_ms(), collector.last_activity())
            };
            let quiet_since = last_activity.map_or(tail_started, |at| at.max(tail_started));
            if transcribed_ms >= total_ms - CAUGHT_UP_MARGIN_MS
                || quiet_since.elapsed() >= self.options.tail_idle
                || tail_started.elapsed() >= self.options.tail_max
            {
                return FeedOutcome::Finished;
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    fn report(&mut self, fraction: f64) {
        let fraction = fraction.clamp(0.0, 0.99).max(self.reported);
        let due = self
            .last_report
            .is_none_or(|at| at.elapsed() >= PROGRESS_INTERVAL);
        if !due {
            return;
        }
        self.reported = fraction;
        self.last_report = Some(Instant::now());
        let preview = self.lock().preview_text();
        self.observer.on_progress(FileStreamProgress {
            fraction,
            preview,
            indeterminate: false,
        });
    }

    fn output(&mut self, reconnections: u32) -> FileStreamOutput {
        FileStreamOutput {
            words: self.lock().finish(),
            duration_secs: self.samples.len() as f64 / f64::from(SAMPLE_RATE),
            reconnections,
            realtime_fallback: self.pace != self.options.pace,
        }
    }

    fn give_up_after(
        &self,
        failures: u32,
        degraded: &DegradedError,
    ) -> Result<(), FileStreamError> {
        if failures <= self.options.max_failures_without_progress {
            return Ok(());
        }
        let reason = self
            .lock()
            .last_error()
            .unwrap_or_else(|| describe_degraded(degraded));
        Err(FileStreamError::ConnectionLost(reason))
    }

    async fn wait_before_retry(&self, failures: u32) -> Result<(), FileStreamError> {
        let deadline = Instant::now()
            + retry_delay(
                failures,
                self.options.retry_base_delay,
                self.options.retry_max_delay,
            );
        while Instant::now() < deadline {
            if self.observer.is_cancelled() {
                return Err(FileStreamError::Cancelled);
            }
            tokio::time::sleep(POLL_INTERVAL.min(deadline - Instant::now())).await;
        }
        Ok(())
    }

    fn transcribed_ms(&self) -> i64 {
        self.lock().transcribed_ms()
    }

    fn transcribed_samples(&self) -> usize {
        samples_for(self.transcribed_ms() as f64 / 1000.0, SAMPLE_RATE)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Collector> {
        self.collector
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Un listener et le témoin qui recueille la raison de son arrêt. Lâché (tâche
/// annulée), il arrête le listener : aucune connexion ne survit à l'import.
struct Connection {
    listener: ActorRef<ListenerMsg>,
    watcher: ActorRef<()>,
    exits: mpsc::UnboundedReceiver<Option<String>>,
}

impl Connection {
    async fn open(args: ListenerArgs) -> Result<Self, DegradedError> {
        let (exits_tx, exits) = mpsc::unbounded_channel();
        let (watcher, _) = Actor::spawn(None, ExitWatcher, exits_tx)
            .await
            .map_err(|error| DegradedError::StreamError {
                message: error.to_string(),
            })?;
        let name = ListenerActor::name(&args.session_id);
        match Actor::spawn_linked(Some(name), ListenerActor, args, watcher.get_cell()).await {
            Ok((listener, _)) => Ok(Self {
                listener,
                watcher,
                exits,
            }),
            Err(error) => {
                watcher.stop(None);
                Err(classify_spawn_failure(&error))
            }
        }
    }

    async fn send(&self, audio: Bytes) -> Option<ListenerAudioResult> {
        match self
            .listener
            .call(
                move |reply| ListenerMsg::AudioSingle(audio, reply),
                Some(AUDIO_CALL_TIMEOUT),
            )
            .await
        {
            Ok(CallResult::Success(result)) => Some(result),
            _ => None,
        }
    }

    fn try_exit(&mut self) -> Option<DegradedError> {
        self.exits
            .try_recv()
            .ok()
            .map(|reason| parse_exit(reason.as_ref()))
    }

    async fn wait_exit(&mut self) -> DegradedError {
        match tokio::time::timeout(Duration::from_secs(5), self.exits.recv()).await {
            Ok(Some(reason)) => parse_exit(reason.as_ref()),
            _ => DegradedError::StreamError {
                message: "listener audio channel unavailable".to_string(),
            },
        }
    }

    /// Arrêt normal : le listener finalise les derniers mots avant de partir.
    async fn finish(&self) {
        if let Err(error) = self
            .listener
            .stop_and_wait(None, Some(LISTENER_STOP_TIMEOUT))
            .await
        {
            tracing::warn!(?error, "file_stream_listener_stop_failed");
        }
    }

    async fn close(&self) {
        let _ = self
            .listener
            .stop_and_wait(
                Some("file_stream_closed".to_string()),
                Some(Duration::from_secs(10)),
            )
            .await;
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        self.listener.stop(Some("file_stream_dropped".to_string()));
        self.watcher.stop(None);
    }
}

struct ExitWatcher;

#[ractor::async_trait]
impl Actor for ExitWatcher {
    type Msg = ();
    type State = mpsc::UnboundedSender<Option<String>>;
    type Arguments = mpsc::UnboundedSender<Option<String>>;

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        exits: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(exits)
    }

    async fn handle_supervisor_evt(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: SupervisionEvent,
        exits: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            SupervisionEvent::ActorTerminated(_, _, reason) => {
                let _ = exits.send(reason);
            }
            SupervisionEvent::ActorFailed(_, error) => {
                let degraded = DegradedError::StreamError {
                    message: error.to_string(),
                };
                let _ = exits.send(serde_json::to_string(&degraded).ok());
            }
            SupervisionEvent::ActorStarted(_) | SupervisionEvent::ProcessGroupChanged(_) => {}
        }
        Ok(())
    }
}

fn parse_exit(reason: Option<&String>) -> DegradedError {
    reason
        .and_then(|reason| serde_json::from_str::<DegradedError>(reason).ok())
        .unwrap_or_else(|| DegradedError::StreamError {
            message: reason
                .cloned()
                .unwrap_or_else(|| "stream ended".to_string()),
        })
}

fn classify_spawn_failure(error: &ractor::SpawnErr) -> DegradedError {
    if let ractor::SpawnErr::StartupFailed(error) = error
        && let Some(listener_error) = error.downcast_ref::<ListenerInitError>()
    {
        return listener_error
            .degraded
            .clone()
            .unwrap_or_else(|| DegradedError::StreamError {
                message: listener_error.message.clone(),
            });
    }
    DegradedError::UpstreamUnavailable {
        message: error.to_string(),
    }
}

fn is_permanent(degraded: &DegradedError) -> bool {
    matches!(
        degraded,
        DegradedError::AuthenticationFailed { .. } | DegradedError::ProviderConfiguration { .. }
    )
}

fn describe_degraded(degraded: &DegradedError) -> String {
    match degraded {
        DegradedError::AuthenticationFailed { provider } => {
            format!("{provider} rejected the credentials")
        }
        DegradedError::UpstreamUnavailable { message }
        | DegradedError::StreamError { message }
        | DegradedError::ProviderConfiguration { message, .. } => message.clone(),
        DegradedError::ConnectionTimeout => "connection timed out".to_string(),
    }
}

fn pcm_bytes(samples: &[i16]) -> Bytes {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    Bytes::from(bytes)
}
