use super::*;
use crate::RestartPolicy;
use ractor::{ActorRef, ActorStatus};
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

static TEST_SEQ: AtomicU64 = AtomicU64::new(0);

fn unique_name(prefix: &str) -> String {
    format!(
        "{prefix}_{}_{}",
        std::process::id(),
        TEST_SEQ.fetch_add(1, Ordering::Relaxed)
    )
}

#[derive(Clone)]
enum ChildBehavior {
    Healthy,
    DelayedFail { ms: u64 },
    DelayedNormal { ms: u64 },
}

struct TestChild {
    counter: Arc<AtomicU32>,
}

#[ractor::async_trait]
impl Actor for TestChild {
    type Msg = ();
    type State = ChildBehavior;
    type Arguments = ChildBehavior;

    async fn pre_start(
        &self,
        myself: ActorRef<Self::Msg>,
        behavior: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        self.counter.fetch_add(1, Ordering::SeqCst);

        match behavior {
            ChildBehavior::DelayedFail { ms } | ChildBehavior::DelayedNormal { ms } => {
                myself.send_after(Duration::from_millis(ms), || ());
            }
            ChildBehavior::Healthy => {}
        }

        Ok(behavior)
    }

    async fn handle(
        &self,
        myself: ActorRef<Self::Msg>,
        _msg: Self::Msg,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match state {
            ChildBehavior::DelayedFail { .. } => panic!("delayed_fail"),
            ChildBehavior::DelayedNormal { .. } => myself.stop(None),
            ChildBehavior::Healthy => {}
        }
        Ok(())
    }
}

fn make_spec(
    id: &str,
    restart: RestartPolicy,
    behavior: ChildBehavior,
    counter: Arc<AtomicU32>,
) -> DynChildSpec {
    let id = id.to_string();
    DynChildSpec {
        id: id.clone(),
        restart,
        spawn_fn: DynSpawnFn::new(move |sup_cell, child_id| {
            let behavior = behavior.clone();
            let counter = counter.clone();
            async move {
                let (child_ref, _join) = DynamicSupervisor::spawn_linked(
                    child_id,
                    TestChild { counter },
                    behavior,
                    sup_cell,
                )
                .await?;
                Ok(child_ref.get_cell())
            }
        }),
        backoff_fn: None,
        reset_after: None,
    }
}

fn options(max_restarts: usize) -> DynamicSupervisorOptions {
    DynamicSupervisorOptions {
        max_children: None,
        max_restarts,
        max_window: Duration::from_secs(5),
        reset_after: None,
    }
}

#[tokio::test]
async fn transient_child_no_restart_on_normal_exit() {
    let sup_name = unique_name("dyn_transient_normal_sup");
    let child_name = unique_name("dyn_transient_normal_child");
    let counter = Arc::new(AtomicU32::new(0));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(5))
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        make_spec(
            &child_name,
            RestartPolicy::Transient,
            ChildBehavior::DelayedNormal { ms: 50 },
            counter.clone(),
        ),
    )
    .await
    .expect("failed to spawn child");

    tokio::time::sleep(Duration::from_millis(180)).await;
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);
    assert_eq!(counter.load(Ordering::SeqCst), 1);
    assert!(
        !sup_ref
            .get_children()
            .iter()
            .any(|c| c.get_status() == ActorStatus::Running)
    );

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test]
async fn temporary_child_never_restarts_on_failure() {
    let sup_name = unique_name("dyn_temporary_sup");
    let child_name = unique_name("dyn_temporary_child");
    let counter = Arc::new(AtomicU32::new(0));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(5))
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        make_spec(
            &child_name,
            RestartPolicy::Temporary,
            ChildBehavior::DelayedFail { ms: 50 },
            counter.clone(),
        ),
    )
    .await
    .expect("failed to spawn child");

    tokio::time::sleep(Duration::from_millis(180)).await;
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);
    assert_eq!(counter.load(Ordering::SeqCst), 1);
    assert!(
        !sup_ref
            .get_children()
            .iter()
            .any(|c| c.get_status() == ActorStatus::Running)
    );

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test]
async fn permanent_child_triggers_meltdown_when_budget_exceeded() {
    let sup_name = unique_name("dyn_meltdown_sup");
    let child_name = unique_name("dyn_meltdown_child");
    let counter = Arc::new(AtomicU32::new(0));

    let mut opts = options(1);
    opts.max_window = Duration::from_secs(2);

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, opts)
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        make_spec(
            &child_name,
            RestartPolicy::Permanent,
            ChildBehavior::DelayedFail { ms: 40 },
            counter.clone(),
        ),
    )
    .await
    .expect("failed to spawn child");

    let _ = sup_handle.await;
    assert_eq!(sup_ref.get_status(), ActorStatus::Stopped);
    assert_eq!(counter.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn reset_after_allows_restarts_across_quiet_periods() {
    let sup_name = unique_name("dyn_reset_after_sup");
    let child_name = unique_name("dyn_reset_after_child");
    let counter = Arc::new(AtomicU32::new(0));

    let mut opts = options(1);
    opts.max_window = Duration::from_secs(10);
    opts.reset_after = Some(Duration::from_millis(80));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, opts)
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        make_spec(
            &child_name,
            RestartPolicy::Permanent,
            ChildBehavior::DelayedFail { ms: 140 },
            counter.clone(),
        ),
    )
    .await
    .expect("failed to spawn child");

    tokio::time::sleep(Duration::from_millis(520)).await;
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);
    assert!(counter.load(Ordering::SeqCst) >= 3);

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test]
async fn max_children_is_enforced() {
    let sup_name = unique_name("dyn_max_children_sup");
    let child_name_1 = unique_name("dyn_max_children_child1");
    let child_name_2 = unique_name("dyn_max_children_child2");
    let counter = Arc::new(AtomicU32::new(0));

    let mut opts = options(5);
    opts.max_children = Some(1);

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, opts)
        .await
        .expect("failed to spawn dynamic supervisor");

    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        make_spec(
            &child_name_1,
            RestartPolicy::Permanent,
            ChildBehavior::Healthy,
            counter.clone(),
        ),
    )
    .await
    .expect("first child should spawn");

    let second = DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        make_spec(
            &child_name_2,
            RestartPolicy::Permanent,
            ChildBehavior::Healthy,
            counter.clone(),
        ),
    )
    .await;

    assert!(second.is_err());
    assert_eq!(counter.load(Ordering::SeqCst), 1);
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test]
async fn terminate_child_does_not_restart() {
    let sup_name = unique_name("dyn_terminate_sup");
    let child_name = unique_name("dyn_terminate_child");
    let counter = Arc::new(AtomicU32::new(0));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(5))
        .await
        .expect("failed to spawn dynamic supervisor");

    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        make_spec(
            &child_name,
            RestartPolicy::Permanent,
            ChildBehavior::Healthy,
            counter.clone(),
        ),
    )
    .await
    .expect("failed to spawn child");

    tokio::time::sleep(Duration::from_millis(40)).await;
    DynamicSupervisor::terminate_child(sup_ref.clone(), child_name)
        .await
        .expect("failed to terminate child");
    tokio::time::sleep(Duration::from_millis(120)).await;

    assert_eq!(counter.load(Ordering::SeqCst), 1);
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);
    assert!(
        !sup_ref
            .get_children()
            .iter()
            .any(|c| c.get_status() == ActorStatus::Running)
    );

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test(start_paused = true)]
async fn terminate_during_backoff_does_not_resurrect() {
    let sup_name = unique_name("dyn_term_backoff_sup");
    let child_name = unique_name("dyn_term_backoff_child");
    let counter = Arc::new(AtomicU32::new(0));

    let mut spec = make_spec(
        &child_name,
        RestartPolicy::Permanent,
        ChildBehavior::DelayedFail { ms: 20 },
        counter.clone(),
    );
    spec.backoff_fn = Some(ChildBackoffFn::new(|_id, _count, _last, _reset| {
        Some(Duration::from_millis(200))
    }));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(5))
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(sup_ref.clone(), spec)
        .await
        .expect("failed to spawn child");

    // Child fails at ~20ms; its restart is pending until ~220ms.
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(counter.load(Ordering::SeqCst), 1);

    DynamicSupervisor::terminate_child(sup_ref.clone(), child_name)
        .await
        .expect("failed to terminate child");

    tokio::time::sleep(Duration::from_millis(500)).await;
    assert_eq!(
        counter.load(Ordering::SeqCst),
        1,
        "terminated child was resurrected by a stale scheduled restart"
    );
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);
    assert!(
        !sup_ref
            .get_children()
            .iter()
            .any(|c| c.get_status() == ActorStatus::Running)
    );

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test(start_paused = true)]
async fn replace_before_restart_keeps_replacement() {
    let sup_name = unique_name("dyn_replace_sup");
    let child_name = unique_name("dyn_replace_child");
    let fail_counter = Arc::new(AtomicU32::new(0));
    let healthy_counter = Arc::new(AtomicU32::new(0));

    let mut failing_spec = make_spec(
        &child_name,
        RestartPolicy::Permanent,
        ChildBehavior::DelayedFail { ms: 20 },
        fail_counter.clone(),
    );
    failing_spec.backoff_fn = Some(ChildBackoffFn::new(|_id, _count, _last, _reset| {
        Some(Duration::from_millis(200))
    }));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(5))
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(sup_ref.clone(), failing_spec)
        .await
        .expect("failed to spawn failing child");

    // Replace the child under the same id while its restart is pending.
    tokio::time::sleep(Duration::from_millis(50)).await;
    let replacement = make_spec(
        &child_name,
        RestartPolicy::Permanent,
        ChildBehavior::Healthy,
        healthy_counter.clone(),
    );
    DynamicSupervisor::spawn_child(sup_ref.clone(), replacement)
        .await
        .expect("failed to spawn replacement child");

    tokio::time::sleep(Duration::from_millis(500)).await;
    assert_eq!(
        fail_counter.load(Ordering::SeqCst),
        1,
        "stale scheduled restart clobbered the deliberate replacement"
    );
    assert_eq!(healthy_counter.load(Ordering::SeqCst), 1);
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);
    assert_eq!(
        sup_ref
            .get_children()
            .iter()
            .filter(|c| c.get_status() == ActorStatus::Running)
            .count(),
        1
    );

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test(start_paused = true)]
async fn failed_replacement_spawn_keeps_pending_restart() {
    let sup_name = unique_name("dyn_failed_replace_sup");
    let child_name = unique_name("dyn_failed_replace_child");
    let counter = Arc::new(AtomicU32::new(0));

    let mut spec = make_spec(
        &child_name,
        RestartPolicy::Permanent,
        ChildBehavior::DelayedFail { ms: 20 },
        counter.clone(),
    );
    spec.backoff_fn = Some(ChildBackoffFn::new(|_id, _count, _last, _reset| {
        Some(Duration::from_millis(200))
    }));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(10))
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(sup_ref.clone(), spec.clone())
        .await
        .expect("failed to spawn child");

    // Child fails at ~20ms; its restart is pending until ~220ms.
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(counter.load(Ordering::SeqCst), 1);

    let mut broken_spec = spec;
    broken_spec.spawn_fn = DynSpawnFn::new(|_sup_cell, _child_id| async {
        Err(ractor::SpawnErr::StartupFailed(
            "injected spawn failure".into(),
        ))
    });
    DynamicSupervisor::spawn_child(sup_ref.clone(), broken_spec)
        .await
        .expect_err("broken replacement spawn should fail");

    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(
        counter.load(Ordering::SeqCst) >= 2,
        "failed replacement spawn cancelled the pending scheduled restart"
    );
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test(start_paused = true)]
async fn respawn_after_terminate_starts_with_fresh_backoff_history() {
    let sup_name = unique_name("dyn_fresh_backoff_sup");
    let child_name = unique_name("dyn_fresh_backoff_child");
    let counter = Arc::new(AtomicU32::new(0));
    let observed_counts = Arc::new(std::sync::Mutex::new(Vec::new()));

    let spec = |counts: Arc<std::sync::Mutex<Vec<usize>>>, counter: Arc<AtomicU32>| {
        let mut spec = make_spec(
            &child_name,
            RestartPolicy::Permanent,
            ChildBehavior::DelayedFail { ms: 20 },
            counter,
        );
        spec.backoff_fn = Some(ChildBackoffFn::new(move |_id, count, _last, _reset| {
            counts.lock().unwrap().push(count);
            Some(Duration::from_millis(200))
        }));
        spec
    };

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(10))
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        spec(observed_counts.clone(), counter.clone()),
    )
    .await
    .expect("failed to spawn child");

    // Let the child fail twice so its per-child failure count escalates.
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(observed_counts.lock().unwrap().len() >= 2);

    DynamicSupervisor::terminate_child(sup_ref.clone(), child_name.clone())
        .await
        .expect("failed to terminate child");
    observed_counts.lock().unwrap().clear();

    DynamicSupervisor::spawn_child(
        sup_ref.clone(),
        spec(observed_counts.clone(), counter.clone()),
    )
    .await
    .expect("failed to respawn child");
    tokio::time::sleep(Duration::from_millis(50)).await;

    // The new lifecycle's first failure must not inherit the old count.
    assert_eq!(
        observed_counts.lock().unwrap().first().copied(),
        Some(1),
        "backoff saw stale failure history from the previous lifecycle"
    );

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test(start_paused = true)]
async fn repeated_failure_still_restarts_with_generations() {
    let sup_name = unique_name("dyn_repeat_fail_sup");
    let child_name = unique_name("dyn_repeat_fail_child");
    let counter = Arc::new(AtomicU32::new(0));

    let mut spec = make_spec(
        &child_name,
        RestartPolicy::Permanent,
        ChildBehavior::DelayedFail { ms: 20 },
        counter.clone(),
    );
    spec.backoff_fn = Some(ChildBackoffFn::new(|_id, _count, _last, _reset| {
        Some(Duration::from_millis(50))
    }));

    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, options(10))
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(sup_ref.clone(), spec)
        .await
        .expect("failed to spawn child");

    tokio::time::sleep(Duration::from_millis(320)).await;
    assert!(
        counter.load(Ordering::SeqCst) >= 3,
        "restarts within one generation should keep working, got {}",
        counter.load(Ordering::SeqCst)
    );
    assert_eq!(sup_ref.get_status(), ActorStatus::Running);

    sup_ref.stop(None);
    let _ = sup_handle.await;
}

#[tokio::test]
async fn backoff_delays_second_restart_attempt() {
    let sup_name = unique_name("dyn_backoff_sup");
    let child_name = unique_name("dyn_backoff_child");
    let counter = Arc::new(AtomicU32::new(0));

    let mut spec = make_spec(
        &child_name,
        RestartPolicy::Permanent,
        ChildBehavior::DelayedFail { ms: 10 },
        counter.clone(),
    );
    spec.backoff_fn = Some(ChildBackoffFn::new(
        |_id, restart_count, _last, _child_reset| {
            if restart_count <= 1 {
                None
            } else {
                Some(Duration::from_millis(220))
            }
        },
    ));

    let mut opts = options(1);
    opts.max_window = Duration::from_secs(5);

    let start = std::time::Instant::now();
    let (sup_ref, sup_handle) = DynamicSupervisor::spawn(sup_name, opts)
        .await
        .expect("failed to spawn dynamic supervisor");
    DynamicSupervisor::spawn_child(sup_ref.clone(), spec)
        .await
        .expect("failed to spawn child");

    let _ = sup_handle.await;
    let elapsed = start.elapsed();
    assert_eq!(sup_ref.get_status(), ActorStatus::Stopped);
    assert!(
        elapsed >= Duration::from_millis(200),
        "expected delayed restart, got {elapsed:?}"
    );
    assert_eq!(counter.load(Ordering::SeqCst), 2);
}
