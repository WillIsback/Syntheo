mod children;
mod mode;
#[cfg(test)]
mod reliability_tests;

use ractor::concurrency::Duration;
use ractor::{Actor, ActorCell, ActorProcessingErr, ActorRef, SupervisionEvent};
use tracing::Instrument;

use crate::DegradedError;
use crate::actors::session::types::{
    SessionConfigUpdate, SessionContext, session_span, session_supervisor_name,
};
use crate::actors::{ListenerConfigUpdate, ListenerMsg};

use self::children::ChildKind;
use self::mode::SessionModeState;

mod listener_retry;

use listener_retry::{
    classify_listener_spawn_failure, handle_listener_failure, listener_retry_after, meltdown,
    refresh_listener, refresh_listener_on_isolation_change, retry_listener,
    update_requires_listener_refresh,
};

// La première reconnexion est rapide : une coupure isolée (flux fermé par le
// serveur ou par un proxy comme Caddy lors d'un rechargement) est réparée en
// une seconde, au lieu de laisser la transcription en direct « en pause ».
const LISTENER_RETRY_DELAYS: [Duration; 6] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(10),
    Duration::from_secs(20),
    Duration::from_secs(30),
];
const MAX_LISTENER_RETRY_AFTER: Duration = Duration::from_secs(30);

pub struct SessionState {
    ctx: SessionContext,
    source_cell: Option<ActorCell>,
    listener_cell: Option<ActorCell>,
    source_restarts: syntheo_supervisor::RestartTracker,
    mode: SessionModeState,
    listener_retry_attempt: usize,
    listener_mic_isolated: bool,
    shutting_down: bool,
}

pub struct SessionActor;

pub enum SessionMsg {
    Shutdown,
    RetryListener,
    SourceHealthy,
    SourceRoutingChanged,
    UpdateCredentials(String),
    UpdateConfig(SessionConfigUpdate),
}

#[ractor::async_trait]
impl Actor for SessionActor {
    type Msg = SessionMsg;
    type State = SessionState;
    type Arguments = SessionContext;

    async fn pre_start(
        &self,
        myself: ActorRef<Self::Msg>,
        ctx: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        let session_id = ctx.params.session_id.clone();
        let span = session_span(&session_id);

        async {
            let mode = SessionModeState::new(
                ctx.requested_transcription_mode,
                ctx.params.transcription_mode,
            );
            // Règle audio de Syntheo : la source va directement au listener
            // (endpoint STT) et l'audio n'est jamais écrit sur disque.
            let source_ref =
                children::spawn_source(myself.get_cell(), &ctx, mode.listener_routing(None))
                    .await
                    .map_err(|e| -> ActorProcessingErr { Box::new(e) })?;

            Ok(SessionState {
                ctx,
                source_cell: Some(source_ref.get_cell()),
                listener_cell: None,
                source_restarts: syntheo_supervisor::RestartTracker::new(),
                mode,
                listener_retry_attempt: 0,
                listener_mic_isolated: false,
                shutting_down: false,
            })
        }
        .instrument(span)
        .await
    }

    // Listener is spawned in post_start so that a connection failure enters
    // batch fallback instead of killing the session -- source and recorder keep running.
    async fn post_start(
        &self,
        myself: ActorRef<Self::Msg>,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let span = session_span(&state.ctx.params.session_id);

        async {
            if !state.mode.should_spawn_listener() {
                return Ok(());
            }

            match children::spawn_listener(myself.get_cell(), &state.ctx, None, false).await {
                Ok((listener_cell, mic_isolated)) => {
                    state.listener_cell = Some(listener_cell);
                    state.listener_mic_isolated = mic_isolated;
                    state.mode.on_listener_attached();
                    children::attach_listener_to_source(state).await;
                }
                Err(error) => {
                    tracing::warn!(?error, "listener_spawn_failed");
                    let retry_after = listener_retry_after(&error);
                    let degraded = classify_listener_spawn_failure(state, &error);
                    handle_listener_failure(&myself, state, degraded, retry_after).await;
                }
            }

            Ok(())
        }
        .instrument(span)
        .await
    }

    async fn handle(
        &self,
        myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            SessionMsg::SourceHealthy => state.source_restarts.reset(),
            SessionMsg::SourceRoutingChanged => {
                refresh_listener_on_isolation_change(&myself, state).await;
            }
            SessionMsg::Shutdown => {
                state.shutting_down = true;
                children::shutdown_children(state, "session_stop").await;
                myself.stop(None);
            }
            SessionMsg::UpdateCredentials(api_key) => {
                if !api_key.is_empty() && api_key != state.ctx.params.api_key {
                    state.ctx.params.api_key = api_key;
                    if state.listener_cell.is_none() && !state.shutting_down {
                        state.listener_retry_attempt = 0;
                        retry_listener(myself, state).await;
                    }
                }
            }
            SessionMsg::RetryListener => {
                retry_listener(myself, state).await;
            }
            SessionMsg::UpdateConfig(update) => {
                update_config(myself, state, update).await;
            }
        }
        Ok(())
    }

    async fn handle_supervisor_evt(
        &self,
        myself: ActorRef<Self::Msg>,
        message: SupervisionEvent,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let span = session_span(&state.ctx.params.session_id);
        async {
            if state.shutting_down {
                return Ok(());
            }

            match message {
                SupervisionEvent::ActorStarted(_) | SupervisionEvent::ProcessGroupChanged(_) => {}

                SupervisionEvent::ActorTerminated(cell, _, reason) => {
                    match children::identify_child(state, &cell) {
                        Some(ChildKind::Listener) => {
                            tracing::info!(?reason, "listener_terminated");
                            state.listener_cell = None;
                            handle_listener_failure(
                                &myself,
                                state,
                                mode::parse_degraded_reason(reason.as_ref()),
                                None,
                            )
                            .await;
                        }
                        Some(ChildKind::Source) => {
                            tracing::info!(?reason, "source_terminated_attempting_restart");
                            state.source_cell = None;
                            let is_device_change = reason.as_deref() == Some("device_change");
                            if !children::try_restart_source(
                                myself.get_cell(),
                                state,
                                !is_device_change,
                            )
                            .await
                            {
                                tracing::error!("source_restart_limit_exceeded_meltdown");
                                meltdown(myself, state).await;
                            } else {
                                refresh_listener_on_isolation_change(&myself, state).await;
                            }
                        }
                        None => {
                            tracing::warn!("unknown_child_terminated");
                        }
                    }
                }
                SupervisionEvent::ActorFailed(cell, error) => {
                    match children::identify_child(state, &cell) {
                        Some(ChildKind::Listener) => {
                            tracing::info!(?error, "listener_failed");
                            state.listener_cell = None;
                            handle_listener_failure(
                                &myself,
                                state,
                                DegradedError::StreamError {
                                    message: format!("{:?}", error),
                                },
                                None,
                            )
                            .await;
                        }
                        Some(ChildKind::Source) => {
                            tracing::warn!(?error, "source_failed_attempting_restart");
                            state.source_cell = None;
                            if !children::try_restart_source(myself.get_cell(), state, true).await {
                                tracing::error!("source_restart_limit_exceeded_meltdown");
                                meltdown(myself, state).await;
                            } else {
                                refresh_listener_on_isolation_change(&myself, state).await;
                            }
                        }
                        None => {
                            tracing::warn!("unknown_child_failed");
                        }
                    }
                }
            }

            Ok(())
        }
        .instrument(span)
        .await
    }
    async fn post_stop(
        &self,
        _myself: ActorRef<Self::Msg>,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        children::shutdown_children(state, "session_stop").await;
        if state.ctx.params.retain_audio == Some(false) {
            let result = match crate::actors::audio_sweep::find_session_dir(
                &state.ctx.app_dir,
                &state.ctx.params.session_id,
            ) {
                Ok(dir) => {
                    tokio::task::spawn_blocking(move || {
                        crate::actors::audio_sweep::delete_transcribed_capture_audio(&dir)
                            .map(|_| ())
                    })
                    .await?
                }
                Err(error) => Err(error),
            };
            if let Err(error) = result {
                let error = format!("audio_deletion_failed: {error}");
                state
                    .ctx
                    .runtime
                    .emit_error(crate::SessionErrorEvent::AudioError {
                        session_id: state.ctx.params.session_id.clone(),
                        error: error.clone(),
                        device: None,
                        is_fatal: false,
                    });
                return Err(std::io::Error::other(error).into());
            }
        }
        Ok(())
    }
}

pub async fn spawn_session_supervisor(
    ctx: SessionContext,
) -> Result<(ActorCell, tokio::task::JoinHandle<()>), ActorProcessingErr> {
    let supervisor_name = session_supervisor_name(&ctx.params.session_id);
    let (actor_ref, handle) = Actor::spawn(Some(supervisor_name), SessionActor, ctx).await?;
    Ok((actor_ref.get_cell(), handle))
}

async fn emit_active_lifecycle_event(state: &SessionState, error: Option<DegradedError>) {
    state.ctx.runtime.emit_lifecycle(
        state
            .mode
            .active_event(state.ctx.params.session_id.clone(), error),
    );
}

async fn enter_batch_fallback(state: &mut SessionState, degraded: DegradedError) {
    state.mode.enter_batch_fallback();
    children::attach_listener_to_source(state).await;
    emit_active_lifecycle_event(state, Some(degraded)).await;
}

async fn update_config(
    myself: ActorRef<SessionMsg>,
    state: &mut SessionState,
    update: SessionConfigUpdate,
) {
    if update.session_id != state.ctx.params.session_id {
        return;
    }

    let should_refresh_listener = state.mode.should_spawn_listener()
        && update_requires_listener_refresh(&state.ctx.params, &update);

    state.ctx.params.languages = update.languages;
    state.ctx.params.participant_human_ids = update.participant_human_ids;
    state.ctx.params.self_human_id = update.self_human_id;
    state.ctx.params.speaker_assignments = update.speaker_assignments;

    if should_refresh_listener {
        refresh_listener(myself, state).await;
        return;
    }

    if let Some(listener_cell) = &state.listener_cell {
        let listener_ref: ractor::ActorRef<ListenerMsg> = listener_cell.clone().into();
        if let Err(error) = listener_ref.cast(ListenerMsg::UpdateConfig(ListenerConfigUpdate {
            languages: state.ctx.params.languages.clone(),
            participant_human_ids: state.ctx.params.participant_human_ids.clone(),
            self_human_id: state.ctx.params.self_human_id.clone(),
            speaker_assignments: state.ctx.params.speaker_assignments.clone(),
        })) {
            tracing::warn!(?error, "failed_to_cast_listener_config_update");
        }
    }
}

#[cfg(test)]
mod tests;
