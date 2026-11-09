use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use ractor::{Actor, ActorCell, ActorProcessingErr, ActorRef, SpawnErr, SupervisionEvent};

use crate::restart::{RestartBudget, RestartTracker};
use crate::retry::{RetryStrategy, spawn_with_retry};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestartPolicy {
    Permanent,
    Transient,
    Temporary,
}

pub type SpawnFuture = Pin<Box<dyn Future<Output = Result<ActorCell, SpawnErr>> + Send>>;

#[derive(Clone)]
pub struct SpawnFn(Arc<dyn Fn(ActorCell) -> SpawnFuture + Send + Sync>);

impl SpawnFn {
    pub fn new<F, Fut>(f: F) -> Self
    where
        F: Fn(ActorCell) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<ActorCell, SpawnErr>> + Send + 'static,
    {
        Self(Arc::new(move |cell| Box::pin(f(cell))))
    }

    pub async fn call(&self, supervisor_cell: ActorCell) -> Result<ActorCell, SpawnErr> {
        (self.0)(supervisor_cell).await
    }
}

pub struct ChildSpec {
    pub id: String,
    pub restart_policy: RestartPolicy,
    pub spawn_fn: SpawnFn,
}

pub struct SupervisorConfig {
    pub children: Vec<ChildSpec>,
    pub restart_budget: RestartBudget,
    pub retry_strategy: RetryStrategy,
}

struct ChildEntry {
    id: String,
    cell: Option<ActorCell>,
    policy: RestartPolicy,
    spawn_fn: SpawnFn,
    tracker: RestartTracker,
}

pub struct SupervisorState {
    children: Vec<ChildEntry>,
    budget: RestartBudget,
    retry_strategy: RetryStrategy,
    shutting_down: bool,
}

pub struct Supervisor;

#[derive(Debug)]
pub enum SupervisorMsg {
    Shutdown,
}

impl SupervisorState {
    fn find_child_index(&self, cell: &ActorCell) -> Option<usize> {
        self.children
            .iter()
            .position(|e| e.cell.as_ref().is_some_and(|c| c.get_id() == cell.get_id()))
    }

    fn stop_all_children(&mut self) {
        for entry in &mut self.children {
            if let Some(cell) = entry.cell.take() {
                cell.stop(Some("supervisor_shutdown".to_string()));
            }
        }
    }
}

fn should_restart(policy: RestartPolicy, abnormal: bool) -> bool {
    match policy {
        RestartPolicy::Permanent => true,
        RestartPolicy::Transient => abnormal,
        RestartPolicy::Temporary => false,
    }
}

async fn handle_child_exit(
    myself: &ActorRef<SupervisorMsg>,
    state: &mut SupervisorState,
    idx: usize,
    abnormal: bool,
) {
    state.children[idx].cell = None;

    if !should_restart(state.children[idx].policy, abnormal) {
        return;
    }

    if !state.children[idx].tracker.record_restart(&state.budget) {
        tracing::error!(child = %state.children[idx].id, "restart_limit_exceeded");
        state.shutting_down = true;
        state.stop_all_children();
        myself.stop(Some("meltdown".to_string()));
        return;
    }

    let spawn_fn = state.children[idx].spawn_fn.clone();
    let sup_cell = myself.get_cell();
    let retry = state.retry_strategy.clone();

    let new_cell = spawn_with_retry(&retry, || {
        let sup = sup_cell.clone();
        let sf = spawn_fn.clone();
        async move { sf.call(sup).await }
    })
    .await;

    match new_cell {
        Some(cell) => {
            state.children[idx].cell = Some(cell);
        }
        None => {
            tracing::error!(child = %state.children[idx].id, "spawn_retry_exhausted");
            state.shutting_down = true;
            state.stop_all_children();
            myself.stop(Some("spawn_retry_exhausted".to_string()));
        }
    }
}

#[ractor::async_trait]
impl Actor for Supervisor {
    type Msg = SupervisorMsg;
    type State = SupervisorState;
    type Arguments = SupervisorConfig;

    async fn pre_start(
        &self,
        myself: ActorRef<Self::Msg>,
        config: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        let mut children = Vec::new();

        for spec in config.children {
            let cell =
                spec.spawn_fn
                    .call(myself.get_cell())
                    .await
                    .map_err(|e| -> ActorProcessingErr {
                        format!("failed to spawn child '{}': {}", spec.id, e).into()
                    })?;

            children.push(ChildEntry {
                id: spec.id,
                cell: Some(cell),
                policy: spec.restart_policy,
                spawn_fn: spec.spawn_fn,
                tracker: RestartTracker::new(),
            });
        }

        Ok(SupervisorState {
            children,
            budget: config.restart_budget,
            retry_strategy: config.retry_strategy,
            shutting_down: false,
        })
    }

    async fn handle(
        &self,
        myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            SupervisorMsg::Shutdown => {
                state.shutting_down = true;
                state.stop_all_children();
                myself.stop(None);
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
        for child in &mut state.children {
            child.tracker.maybe_reset(&state.budget);
        }

        if state.shutting_down {
            return Ok(());
        }

        match message {
            SupervisionEvent::ActorStarted(_) | SupervisionEvent::ProcessGroupChanged(_) => {}

            SupervisionEvent::ActorTerminated(cell, _, _reason) => {
                if let Some(idx) = state.find_child_index(&cell) {
                    handle_child_exit(&myself, state, idx, false).await;
                }
            }

            SupervisionEvent::ActorFailed(cell, _error) => {
                if let Some(idx) = state.find_child_index(&cell) {
                    handle_child_exit(&myself, state, idx, true).await;
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
