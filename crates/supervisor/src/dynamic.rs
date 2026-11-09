use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use ractor::{
    Actor, ActorCell, ActorId, ActorProcessingErr, ActorRef, RpcReplyPort, SpawnErr,
    SupervisionEvent, concurrency::JoinHandle,
};

#[derive(Debug, Clone, thiserror::Error)]
pub enum SupervisorError {
    #[error("Child '{child_id}' not found in specs")]
    ChildNotFound { child_id: String },

    #[error("Child '{pid}' does not have a name set")]
    ChildNameNotSet { pid: ActorId },

    #[error("Max children exceeded")]
    MaxChildrenExceeded,

    #[error("Meltdown: {reason}")]
    Meltdown { reason: String },
}

pub type DynSpawnFuture = Pin<Box<dyn Future<Output = Result<ActorCell, SpawnErr>> + Send>>;

#[derive(Clone)]
pub struct DynSpawnFn(Arc<dyn Fn(ActorCell, String) -> DynSpawnFuture + Send + Sync>);

impl DynSpawnFn {
    pub fn new<F, Fut>(f: F) -> Self
    where
        F: Fn(ActorCell, String) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<ActorCell, SpawnErr>> + Send + 'static,
    {
        Self(Arc::new(move |cell, id| Box::pin(f(cell, id))))
    }

    pub async fn call(&self, sup: ActorCell, id: String) -> Result<ActorCell, SpawnErr> {
        (self.0)(sup, id).await
    }
}

type BackoffFn = dyn Fn(&str, usize, Instant, Option<Duration>) -> Option<Duration> + Send + Sync;

#[derive(Clone)]
pub struct ChildBackoffFn(Arc<BackoffFn>);

impl ChildBackoffFn {
    pub fn new<F>(f: F) -> Self
    where
        F: Fn(&str, usize, Instant, Option<Duration>) -> Option<Duration> + Send + Sync + 'static,
    {
        Self(Arc::new(f))
    }

    fn call(
        &self,
        child_id: &str,
        restart_count: usize,
        last_fail: Instant,
        reset_after: Option<Duration>,
    ) -> Option<Duration> {
        (self.0)(child_id, restart_count, last_fail, reset_after)
    }
}

#[derive(Clone)]
pub struct DynChildSpec {
    pub id: String,
    pub restart: crate::RestartPolicy,
    pub spawn_fn: DynSpawnFn,
    pub backoff_fn: Option<ChildBackoffFn>,
    pub reset_after: Option<Duration>,
}

#[derive(Debug, Clone)]
pub struct DynamicSupervisorOptions {
    pub max_children: Option<usize>,
    pub max_restarts: usize,
    pub max_window: Duration,
    pub reset_after: Option<Duration>,
}

pub enum DynamicSupervisorMsg {
    SpawnChild {
        spec: DynChildSpec,
        reply: Option<RpcReplyPort<Result<(), ActorProcessingErr>>>,
    },
    TerminateChild {
        child_id: String,
        reply: Option<RpcReplyPort<()>>,
    },
    ScheduledRestart {
        spec: DynChildSpec,
        generation: u64,
    },
}

impl std::fmt::Debug for DynamicSupervisorMsg {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SpawnChild { spec, .. } => {
                f.debug_struct("SpawnChild").field("id", &spec.id).finish()
            }
            Self::TerminateChild { child_id, .. } => f
                .debug_struct("TerminateChild")
                .field("child_id", child_id)
                .finish(),
            Self::ScheduledRestart { spec, generation } => f
                .debug_struct("ScheduledRestart")
                .field("id", &spec.id)
                .field("generation", generation)
                .finish(),
        }
    }
}

struct ActiveChild {
    spec: DynChildSpec,
    cell: ActorCell,
}

struct ChildFailureState {
    restart_count: usize,
    last_fail: Instant,
}

struct RestartLogEntry {
    _child_id: String,
    timestamp: Instant,
}

pub struct DynamicSupervisorState {
    options: DynamicSupervisorOptions,
    active_children: HashMap<String, ActiveChild>,
    child_failure_state: HashMap<String, ChildFailureState>,
    restart_log: Vec<RestartLogEntry>,
    // Incremented on every external SpawnChild/TerminateChild for an id, so
    // scheduled restarts carrying an older generation are dropped instead of
    // resurrecting a child that was terminated or replaced during backoff.
    child_generations: HashMap<String, u64>,
}

pub struct DynamicSupervisor;

impl DynamicSupervisor {
    pub async fn spawn(
        name: String,
        options: DynamicSupervisorOptions,
    ) -> Result<(ActorRef<DynamicSupervisorMsg>, JoinHandle<()>), SpawnErr> {
        Actor::spawn(Some(name), DynamicSupervisor, options).await
    }

    pub async fn spawn_linked<T: Actor>(
        name: impl Into<String>,
        handler: T,
        args: T::Arguments,
        supervisor: ActorCell,
    ) -> Result<(ActorRef<T::Msg>, JoinHandle<()>), SpawnErr> {
        Actor::spawn_linked(Some(name.into()), handler, args, supervisor).await
    }

    pub async fn spawn_child(
        sup_ref: ActorRef<DynamicSupervisorMsg>,
        spec: DynChildSpec,
    ) -> Result<(), ActorProcessingErr> {
        ractor::call!(sup_ref, |reply| {
            DynamicSupervisorMsg::SpawnChild {
                spec,
                reply: Some(reply),
            }
        })?
    }

    pub async fn terminate_child(
        sup_ref: ActorRef<DynamicSupervisorMsg>,
        child_id: String,
    ) -> Result<(), ActorProcessingErr> {
        ractor::call!(sup_ref, |reply| {
            DynamicSupervisorMsg::TerminateChild {
                child_id,
                reply: Some(reply),
            }
        })?;
        Ok(())
    }
}

impl DynamicSupervisorState {
    fn track_global_restart(&mut self, child_id: &str) -> Result<(), ActorProcessingErr> {
        let now = Instant::now();

        if let Some(reset_after) = self.options.reset_after
            && let Some(latest) = self.restart_log.last()
            && now.duration_since(latest.timestamp) >= reset_after
        {
            self.restart_log.clear();
        }

        self.restart_log.push(RestartLogEntry {
            _child_id: child_id.to_string(),
            timestamp: now,
        });

        self.restart_log
            .retain(|e| now.duration_since(e.timestamp) < self.options.max_window);

        if self.restart_log.len() > self.options.max_restarts {
            Err(SupervisorError::Meltdown {
                reason: "max_restarts exceeded".to_string(),
            }
            .into())
        } else {
            Ok(())
        }
    }

    fn prepare_child_failure(&mut self, spec: &DynChildSpec) {
        let now = Instant::now();
        let entry = self
            .child_failure_state
            .entry(spec.id.clone())
            .or_insert(ChildFailureState {
                restart_count: 0,
                last_fail: now,
            });

        if let Some(threshold) = spec.reset_after
            && now.duration_since(entry.last_fail) >= threshold
        {
            entry.restart_count = 0;
        }

        entry.restart_count += 1;
        entry.last_fail = now;
    }

    fn generation_of(&self, child_id: &str) -> u64 {
        self.child_generations.get(child_id).copied().unwrap_or(0)
    }

    // A successful external SpawnChild or a TerminateChild starts a new
    // lifecycle for the id: stale scheduled restarts are dropped via the
    // generation, and the failure history is cleared so backoff cannot carry
    // over from the old lifecycle.
    fn begin_new_generation(&mut self, child_id: &str) {
        *self
            .child_generations
            .entry(child_id.to_string())
            .or_insert(0) += 1;
        self.child_failure_state.remove(child_id);
    }
}

#[ractor::async_trait]
impl Actor for DynamicSupervisor {
    type Msg = DynamicSupervisorMsg;
    type State = DynamicSupervisorState;
    type Arguments = DynamicSupervisorOptions;

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        options: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(DynamicSupervisorState {
            options,
            active_children: HashMap::new(),
            child_failure_state: HashMap::new(),
            restart_log: Vec::new(),
            child_generations: HashMap::new(),
        })
    }

    async fn handle(
        &self,
        myself: ActorRef<Self::Msg>,
        msg: Self::Msg,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match msg {
            DynamicSupervisorMsg::SpawnChild { spec, reply } => {
                let result = handle_spawn_child(&spec, true, state, myself.clone()).await;
                // Only a successful spawn begins a new lifecycle: a failed
                // replacement must not cancel the previous lifecycle's
                // pending restart or discard its backoff history.
                if result.is_ok() {
                    state.begin_new_generation(&spec.id);
                }
                if let Some(reply) = reply {
                    reply.send(result)?;
                    Ok(())
                } else {
                    result
                }
            }
            DynamicSupervisorMsg::TerminateChild { child_id, reply } => {
                handle_terminate_child(&child_id, state, &myself);
                if let Some(reply) = reply {
                    reply.send(())?;
                }
                Ok(())
            }
            DynamicSupervisorMsg::ScheduledRestart { spec, generation } => {
                if generation != state.generation_of(&spec.id) {
                    return Ok(());
                }
                handle_spawn_child(&spec, false, state, myself).await
            }
        }
    }

    async fn handle_supervisor_evt(
        &self,
        myself: ActorRef<Self::Msg>,
        evt: SupervisionEvent,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match evt {
            SupervisionEvent::ActorStarted(_) | SupervisionEvent::ProcessGroupChanged(_) => {}

            SupervisionEvent::ActorTerminated(cell, _, reason) => {
                handle_child_restart(cell, false, state, &myself, reason.as_deref())?;
            }

            SupervisionEvent::ActorFailed(cell, err) => {
                let reason = format!("{:?}", err);
                handle_child_restart(cell, true, state, &myself, Some(&reason))?;
            }
        }
        Ok(())
    }
}

async fn handle_spawn_child(
    spec: &DynChildSpec,
    first_start: bool,
    state: &mut DynamicSupervisorState,
    myself: ActorRef<DynamicSupervisorMsg>,
) -> Result<(), ActorProcessingErr> {
    if !first_start {
        state.track_global_restart(&spec.id)?;
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    if let Some(max) = state.options.max_children
        && state.active_children.len() >= max
    {
        return Err(SupervisorError::MaxChildrenExceeded.into());
    }

    let result = spec.spawn_fn.call(myself.get_cell(), spec.id.clone()).await;

    match result {
        Ok(child_cell) => {
            state.active_children.insert(
                spec.id.clone(),
                ActiveChild {
                    spec: spec.clone(),
                    cell: child_cell,
                },
            );
            state
                .child_failure_state
                .entry(spec.id.clone())
                .or_insert(ChildFailureState {
                    restart_count: 0,
                    last_fail: Instant::now(),
                });
            Ok(())
        }
        Err(e) => Err(SupervisorError::Meltdown {
            reason: format!("spawn failed for '{}': {}", spec.id, e),
        }
        .into()),
    }
}

fn handle_terminate_child(
    child_id: &str,
    state: &mut DynamicSupervisorState,
    myself: &ActorRef<DynamicSupervisorMsg>,
) {
    // Bump even when the child is not active: it may have failed and be
    // waiting in backoff, and termination must invalidate that restart.
    state.begin_new_generation(child_id);
    if let Some(child) = state.active_children.remove(child_id) {
        child.cell.unlink(myself.get_cell());
        child.cell.kill();
    }
}

fn handle_child_restart(
    cell: ActorCell,
    abnormal: bool,
    state: &mut DynamicSupervisorState,
    myself: &ActorRef<DynamicSupervisorMsg>,
    _reason: Option<&str>,
) -> Result<(), ActorProcessingErr> {
    let child_id = cell
        .get_name()
        .ok_or(SupervisorError::ChildNameNotSet { pid: cell.get_id() })?;

    let child = match state.active_children.remove(&child_id) {
        Some(c) => c,
        None => return Ok(()),
    };

    let should_restart = match child.spec.restart {
        crate::RestartPolicy::Permanent => true,
        crate::RestartPolicy::Transient => abnormal,
        crate::RestartPolicy::Temporary => false,
    };

    if !should_restart {
        return Ok(());
    }

    state.prepare_child_failure(&child.spec);

    let delay = child.spec.backoff_fn.as_ref().and_then(|bf| {
        let fs = state.child_failure_state.get(&child.spec.id);
        let (count, last_fail) = fs
            .map(|f| (f.restart_count, f.last_fail))
            .unwrap_or((0, Instant::now()));
        bf.call(&child.spec.id, count, last_fail, child.spec.reset_after)
    });

    let spec = child.spec.clone();
    let generation = state.generation_of(&child_id);
    match delay {
        Some(d) => {
            let dur = ractor::concurrency::Duration::from_millis(d.as_millis() as u64);
            myself.send_after(dur, move || DynamicSupervisorMsg::ScheduledRestart {
                spec,
                generation,
            });
        }
        None => {
            myself.send_message(DynamicSupervisorMsg::ScheduledRestart { spec, generation })?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests;
