use std::hash::{DefaultHasher, Hash, Hasher};

use ractor::ActorRef;
use ractor::concurrency::Duration;

use crate::DegradedError;
use crate::actors::ListenerInitError;
use crate::actors::session::types::{SessionConfigUpdate, SessionParams};

use super::{
    LISTENER_RETRY_DELAYS, MAX_LISTENER_RETRY_AFTER, SessionMsg, SessionState, children,
    emit_active_lifecycle_event, enter_batch_fallback, mode,
};

pub(super) async fn refresh_listener(myself: ActorRef<SessionMsg>, state: &mut SessionState) {
    let replay = children::stop_listener(state, "config_update").await;

    if !state.mode.should_spawn_listener() {
        return;
    }

    let replay_offset_secs =
        (state.ctx.started_at_instant.elapsed().as_secs_f64() - replay.duration_secs).max(0.0);

    match children::spawn_listener(
        myself.get_cell(),
        &state.ctx,
        Some(replay_offset_secs),
        replay.complete,
    )
    .await
    {
        Ok((listener_cell, mic_isolated)) => {
            state.listener_cell = Some(listener_cell);
            state.listener_mic_isolated = mic_isolated;
            state.mode.on_listener_attached();
            children::attach_listener_to_source(state).await;
        }
        Err(error) => {
            tracing::warn!(?error, "listener_refresh_failed");
            let retry_after = listener_retry_after(&error);
            let degraded = classify_listener_spawn_failure(state, &error);
            handle_listener_failure(&myself, state, degraded, retry_after).await;
        }
    }
}

// A source restart can change audio routing (headphones unplugging, a mic swap),
// which can flip the mic-isolation verdict the listener's provider session was
// opened with. That session cannot be renegotiated, so refresh the listener.
pub(super) async fn refresh_listener_on_isolation_change(
    myself: &ActorRef<SessionMsg>,
    state: &mut SessionState,
) {
    if state.listener_cell.is_none() {
        return;
    }

    let mic_isolated = children::source_mic_isolated(&state.ctx).await;
    if mic_isolated != state.listener_mic_isolated {
        refresh_listener(myself.clone(), state).await;
    }
}

// Only a language change reopens the provider stream. The speaker bound derived
// from the participants is applied when the stream opens: reopening it after an
// attendance change would restart the provider's diarization and renumber the
// voices already heard, a worse outcome than a looser bound.
pub(super) fn update_requires_listener_refresh(
    current: &SessionParams,
    update: &SessionConfigUpdate,
) -> bool {
    current.languages != update.languages
}

pub(super) async fn handle_listener_failure(
    myself: &ActorRef<SessionMsg>,
    state: &mut SessionState,
    degraded: DegradedError,
    retry_after: Option<Duration>,
) {
    let should_retry = should_retry_listener_failure(&degraded);
    enter_batch_fallback(state, degraded).await;
    if should_retry {
        schedule_listener_retry(myself, state, retry_after);
    }
}

pub(super) fn should_retry_listener_failure(degraded: &DegradedError) -> bool {
    !matches!(
        degraded,
        DegradedError::AuthenticationFailed { .. } | DegradedError::ProviderConfiguration { .. }
    )
}

pub(super) fn classify_listener_spawn_failure(
    state: &SessionState,
    error: &ractor::SpawnErr,
) -> DegradedError {
    if let ractor::SpawnErr::StartupFailed(error) = error
        && let Some(listener_error) = error.downcast_ref::<ListenerInitError>()
        && let Some(degraded) = &listener_error.degraded
    {
        return degraded.clone();
    }

    DegradedError::UpstreamUnavailable {
        message: mode::classify_connection_failure(&state.ctx.params.base_url),
    }
}

pub(super) fn listener_retry_after(error: &ractor::SpawnErr) -> Option<Duration> {
    let ractor::SpawnErr::StartupFailed(error) = error else {
        return None;
    };
    error
        .downcast_ref::<ListenerInitError>()
        .and_then(|error| error.retry_after)
}

fn schedule_listener_retry(
    myself: &ActorRef<SessionMsg>,
    state: &mut SessionState,
    retry_after: Option<Duration>,
) {
    let delay = listener_retry_delay(
        state.listener_retry_attempt,
        retry_after,
        &state.ctx.params.session_id,
    );
    state.listener_retry_attempt = state.listener_retry_attempt.saturating_add(1);
    tracing::info!(
        ?delay,
        ?retry_after,
        attempt = state.listener_retry_attempt,
        "listener_retry_scheduled"
    );
    myself.send_after(delay, || SessionMsg::RetryListener);
}

pub(super) fn listener_retry_base_delay(attempt: usize) -> Duration {
    LISTENER_RETRY_DELAYS[attempt.min(LISTENER_RETRY_DELAYS.len() - 1)]
}

pub(super) fn listener_retry_delay(
    attempt: usize,
    retry_after: Option<Duration>,
    session_id: &str,
) -> Duration {
    let scheduled = listener_retry_base_delay(attempt);
    let base = retry_after.map_or(scheduled, |minimum| {
        scheduled.max(minimum.min(MAX_LISTENER_RETRY_AFTER))
    });
    let base_ms = base.as_millis().min(u64::MAX as u128) as u64;
    let jitter_limit_ms = base_ms / 5;
    let mut hasher = DefaultHasher::new();
    session_id.hash(&mut hasher);
    attempt.hash(&mut hasher);
    let jitter_ms = hasher.finish() % jitter_limit_ms.saturating_add(1);
    Duration::from_millis(base_ms.saturating_add(jitter_ms))
}

pub(super) async fn retry_listener(myself: ActorRef<SessionMsg>, state: &mut SessionState) {
    if state.shutting_down || state.listener_cell.is_some() || !state.mode.should_retry_listener() {
        return;
    }

    let replay = children::prepare_listener_refresh(state).await;
    let replay_offset_secs =
        (state.ctx.started_at_instant.elapsed().as_secs_f64() - replay.duration_secs).max(0.0);

    match children::spawn_listener(
        myself.get_cell(),
        &state.ctx,
        Some(replay_offset_secs),
        replay.complete,
    )
    .await
    {
        Ok((listener_cell, mic_isolated)) => {
            tracing::info!(
                attempts = state.listener_retry_attempt,
                "listener_reconnected"
            );
            state.listener_cell = Some(listener_cell);
            state.listener_mic_isolated = mic_isolated;
            state.listener_retry_attempt = 0;
            state.mode.on_listener_attached();
            children::attach_listener_to_source(state).await;
            emit_active_lifecycle_event(state, None).await;
        }
        Err(error) => {
            tracing::warn!(?error, "listener_retry_failed");
            let retry_after = listener_retry_after(&error);
            let degraded = classify_listener_spawn_failure(state, &error);
            handle_listener_failure(&myself, state, degraded, retry_after).await;
        }
    }
}

pub(super) async fn meltdown(myself: ActorRef<SessionMsg>, state: &mut SessionState) {
    state.shutting_down = true;
    children::shutdown_children(state, "meltdown").await;
    myself.stop(Some("restart_limit_exceeded".to_string()));
}
