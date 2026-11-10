use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::broadcast::error::{RecvError, TryRecvError};
use tokio::sync::watch as tokio_watch;

use syntheo_db_core::Db;
use syntheo_db_execute::DbExecutor;

use crate::error::{Error, Result};
use crate::schema::CatalogStore;
use crate::subscriptions::{QueryEventPayload, RefreshJob, Registry};
use crate::types::{DependencyAnalysis, QueryEventSink, SubscriptionRegistration};
use crate::visibility::wait_for_announced_commits;
use crate::watch::WatchId;
use syntheo_db_change::{ChangeNotifier, TableChange};

pub struct LiveQueryRuntime<S> {
    db: Arc<Db>,
    executor: DbExecutor,
    change_notifier: ChangeNotifier,
    catalog: CatalogStore,
    subscriptions: Registry<S>,
    shutdown_tx: tokio_watch::Sender<bool>,
    dispatcher: std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl<S: QueryEventSink> LiveQueryRuntime<S> {
    pub fn new(db: Arc<Db>) -> Self {
        let change_notifier = db.change_notifier().clone();
        Self::new_with_notifier(db, change_notifier)
    }

    fn new_with_notifier(db: Arc<Db>, change_notifier: ChangeNotifier) -> Self {
        let executor = DbExecutor::new(Arc::clone(&db));
        let catalog = CatalogStore::default();
        let subscriptions = Registry::default();
        let (shutdown_tx, mut shutdown_rx) = tokio_watch::channel(false);
        let mut change_rx = change_notifier.subscribe();
        let dispatcher_catalog = catalog.clone();
        let dispatcher_subscriptions = subscriptions.clone();
        let dispatcher_db = Arc::clone(&db);
        let dispatcher_executor = executor.clone();
        let dispatcher_notifier = change_notifier.clone();

        let dispatcher = tokio::spawn(async move {
            loop {
                tokio::select! {
                    changed = shutdown_rx.changed() => {
                        if changed.is_err() || *shutdown_rx.borrow() {
                            break;
                        }
                    }
                    jobs = next_refresh_jobs(
                        &mut change_rx,
                        dispatcher_db.as_ref(),
                        &dispatcher_notifier,
                        &dispatcher_catalog,
                        &dispatcher_subscriptions,
                    ) => {
                        let Some(jobs) = jobs else {
                            break;
                        };
                        if jobs.is_empty() {
                            continue;
                        }

                        for job in jobs {
                            dispatcher_subscriptions
                                .refresh(&dispatcher_executor, job, None)
                                .await;
                        }
                    }
                }
            }
        });

        Self {
            db,
            executor,
            change_notifier,
            catalog,
            subscriptions,
            shutdown_tx,
            dispatcher: std::sync::Mutex::new(Some(dispatcher)),
        }
    }

    pub async fn subscribe(
        &self,
        sql: String,
        params: Vec<serde_json::Value>,
        sink: S,
    ) -> Result<SubscriptionRegistration> {
        let baseline_seq = self.change_notifier.current_seq();
        // Les validations comptées dans `baseline_seq` doivent être visibles par la charge
        // initiale, sinon elle serait périmée et la séquence ignorée à l'activation.
        wait_for_announced_commits(self.db.pool()).await;
        let analysis = self.analyze_subscription(&sql).await;
        let registered = self
            .subscriptions
            .register(sql.clone(), params.clone(), sink.clone(), analysis)
            .await;

        #[cfg(test)]
        test_support::before_initial_payload_load().await;

        let initial_payload = self
            .deliver_initial_payload(&registered.registration.id, &sql, &params, &sink)
            .await?;

        #[cfg(test)]
        test_support::before_activation().await;

        self.activate_reactive_subscription(
            baseline_seq,
            registered.reactive_watch_id,
            &registered.registration.analysis,
            &initial_payload,
            &sql,
            &params,
        )
        .await;

        Ok(registered.registration)
    }

    pub async fn unsubscribe(&self, subscription_id: &str) -> Result<()> {
        let removed = self.subscriptions.unregister(subscription_id).await;
        if removed {
            Ok(())
        } else {
            Err(Error::SubscriptionNotFound(subscription_id.to_string()))
        }
    }

    pub async fn dependency_analysis(&self, subscription_id: &str) -> Option<DependencyAnalysis> {
        self.subscriptions
            .dependency_analysis(subscription_id)
            .await
    }

    pub fn db(&self) -> &Db {
        self.db.as_ref()
    }

    async fn analyze_subscription(&self, sql: &str) -> DependencyAnalysis {
        match self.catalog.analyze_query(self.db.pool(), sql).await {
            Ok(targets) => DependencyAnalysis::Reactive { targets },
            Err(error) => DependencyAnalysis::NonReactive {
                reason: error.to_string(),
            },
        }
    }

    async fn deliver_initial_payload(
        &self,
        subscription_id: &str,
        sql: &str,
        params: &[serde_json::Value],
        sink: &S,
    ) -> Result<QueryEventPayload> {
        let initial_payload = QueryEventPayload::load(&self.executor, sql, params).await;

        if let Err(error) = initial_payload.send_to(sink) {
            self.subscriptions.unregister(subscription_id).await;
            return Err(Error::Sink(error));
        }

        Ok(initial_payload)
    }

    async fn activate_reactive_subscription(
        &self,
        baseline_seq: u64,
        watch_id: Option<WatchId>,
        analysis: &DependencyAnalysis,
        initial_payload: &QueryEventPayload,
        sql: &str,
        params: &[serde_json::Value],
    ) {
        let Some(watch_id) = watch_id else {
            return;
        };

        let activation_seq = self.change_notifier.current_seq();
        let latest_dependency_seq = match analysis {
            DependencyAnalysis::Reactive { targets } => self
                .catalog
                .latest_dependency_seq(&self.change_notifier, targets, self.db.pool())
                .await
                .ok()
                .flatten()
                .unwrap_or(baseline_seq),
            DependencyAnalysis::NonReactive { .. } => baseline_seq,
        };
        let ignore_through_seq = latest_dependency_seq.max(activation_seq);

        self.subscriptions
            .activate(watch_id, ignore_through_seq)
            .await;

        if latest_dependency_seq > baseline_seq {
            wait_for_announced_commits(self.db.pool()).await;
            self.subscriptions
                .refresh(
                    &self.executor,
                    RefreshJob {
                        watch_id,
                        sql: sql.to_string(),
                        params: params.to_vec(),
                    },
                    Some(initial_payload),
                )
                .await;
        }
    }
}

enum ChangeBatch {
    ChangedTables {
        changed_tables: HashMap<String, u64>,
    },
    RerunAll {
        trigger_seq: u64,
    },
}

async fn next_refresh_jobs<S>(
    change_rx: &mut tokio::sync::broadcast::Receiver<TableChange>,
    db: &Db,
    change_notifier: &ChangeNotifier,
    catalog: &CatalogStore,
    subscriptions: &Registry<S>,
) -> Option<Vec<RefreshJob>> {
    let batch = receive_change_batch(change_rx, change_notifier).await?;
    // Les changements sont annoncés depuis le crochet de validation, avant que la validation
    // soit effective : sans cette barrière, la relecture peut encore voir l'ancien état.
    wait_for_announced_commits(db.pool()).await;
    Some(collect_refresh_jobs(db, catalog, subscriptions, batch).await)
}

async fn receive_change_batch(
    change_rx: &mut tokio::sync::broadcast::Receiver<TableChange>,
    change_notifier: &ChangeNotifier,
) -> Option<ChangeBatch> {
    match change_rx.recv().await {
        Ok(first_change) => {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            Some(drain_buffered_changes(
                change_rx,
                change_notifier,
                first_change,
            ))
        }
        Err(RecvError::Closed) => None,
        Err(RecvError::Lagged(_)) => Some(rerun_all_batch(change_rx, change_notifier)),
    }
}

fn drain_buffered_changes(
    change_rx: &mut tokio::sync::broadcast::Receiver<TableChange>,
    change_notifier: &ChangeNotifier,
    first_change: TableChange,
) -> ChangeBatch {
    let mut changed_tables = HashMap::from([(first_change.table, first_change.seq)]);

    loop {
        match change_rx.try_recv() {
            Ok(next_change) => {
                changed_tables
                    .entry(next_change.table)
                    .and_modify(|seq| *seq = (*seq).max(next_change.seq))
                    .or_insert(next_change.seq);
            }
            Err(TryRecvError::Empty) | Err(TryRecvError::Closed) => {
                return ChangeBatch::ChangedTables { changed_tables };
            }
            Err(TryRecvError::Lagged(_)) => return rerun_all_batch(change_rx, change_notifier),
        }
    }
}

fn rerun_all_batch(
    change_rx: &mut tokio::sync::broadcast::Receiver<TableChange>,
    change_notifier: &ChangeNotifier,
) -> ChangeBatch {
    clear_lagged_changes(change_rx);
    ChangeBatch::RerunAll {
        trigger_seq: change_notifier.current_seq(),
    }
}

fn clear_lagged_changes(change_rx: &mut tokio::sync::broadcast::Receiver<TableChange>) {
    while let Ok(_) | Err(TryRecvError::Lagged(_)) = change_rx.try_recv() {}
}

async fn collect_refresh_jobs<S>(
    db: &Db,
    catalog: &CatalogStore,
    subscriptions: &Registry<S>,
    batch: ChangeBatch,
) -> Vec<RefreshJob> {
    match batch {
        ChangeBatch::ChangedTables { changed_tables } => {
            let trigger_seq = changed_tables.values().copied().max().unwrap_or_default();
            match catalog
                .canonicalize_raw_table_sequences(db.pool(), &changed_tables)
                .await
            {
                Ok(changed_targets) => subscriptions.collect_jobs(&changed_targets).await,
                Err(_) => subscriptions.collect_all_jobs(trigger_seq).await,
            }
        }
        ChangeBatch::RerunAll { trigger_seq } => subscriptions.collect_all_jobs(trigger_seq).await,
    }
}

impl<S> Drop for LiveQueryRuntime<S> {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.send(true);
        if let Some(dispatcher) = self.dispatcher.lock().unwrap().take() {
            dispatcher.abort();
        }
    }
}

#[cfg(test)]
mod test_support {
    use std::sync::Arc;
    use std::sync::OnceLock;
    use std::sync::atomic::{AtomicBool, Ordering};

    use tokio::sync::{Mutex, Notify};

    struct Hook {
        reached: AtomicBool,
        reached_notify: Notify,
        released: AtomicBool,
        release_notify: Notify,
    }

    impl Hook {
        fn new() -> Self {
            Self {
                reached: AtomicBool::new(false),
                reached_notify: Notify::new(),
                released: AtomicBool::new(false),
                release_notify: Notify::new(),
            }
        }
    }

    pub(crate) struct HookHandle {
        hook: Arc<Hook>,
    }

    fn initial_payload_hook_slot() -> &'static Mutex<Option<Arc<Hook>>> {
        static SLOT: OnceLock<Mutex<Option<Arc<Hook>>>> = OnceLock::new();
        SLOT.get_or_init(|| Mutex::new(None))
    }

    fn activation_hook_slot() -> &'static Mutex<Option<Arc<Hook>>> {
        static SLOT: OnceLock<Mutex<Option<Arc<Hook>>>> = OnceLock::new();
        SLOT.get_or_init(|| Mutex::new(None))
    }

    pub(crate) async fn install_initial_payload_hook() -> HookHandle {
        let hook = Arc::new(Hook::new());
        *initial_payload_hook_slot().lock().await = Some(Arc::clone(&hook));
        HookHandle { hook }
    }

    pub(crate) async fn install_activation_hook() -> HookHandle {
        let hook = Arc::new(Hook::new());
        *activation_hook_slot().lock().await = Some(Arc::clone(&hook));
        HookHandle { hook }
    }

    pub(crate) async fn before_initial_payload_load() {
        let hook = initial_payload_hook_slot().lock().await.clone();
        let Some(hook) = hook else {
            return;
        };

        reach_and_wait(hook).await;
    }

    pub(crate) async fn before_activation() {
        let hook = activation_hook_slot().lock().await.clone();
        let Some(hook) = hook else {
            return;
        };

        reach_and_wait(hook).await;
    }

    async fn reach_and_wait(hook: Arc<Hook>) {
        hook.reached.store(true, Ordering::SeqCst);
        hook.reached_notify.notify_waiters();
        while !hook.released.load(Ordering::SeqCst) {
            hook.release_notify.notified().await;
        }
    }

    impl HookHandle {
        pub(crate) async fn wait_until_reached(&self) {
            tokio::time::timeout(std::time::Duration::from_secs(1), async {
                while !self.hook.reached.load(Ordering::SeqCst) {
                    self.hook.reached_notify.notified().await;
                }
            })
            .await
            .expect("initial payload hook should be reached");
        }

        pub(crate) async fn release(self) {
            self.hook.released.store(true, Ordering::SeqCst);
            self.hook.release_notify.notify_waiters();
            let mut initial_payload_slot = initial_payload_hook_slot().lock().await;
            if initial_payload_slot
                .as_ref()
                .is_some_and(|hook| Arc::ptr_eq(hook, &self.hook))
            {
                *initial_payload_slot = None;
            }
            drop(initial_payload_slot);

            let mut activation_slot = activation_hook_slot().lock().await;
            if activation_slot
                .as_ref()
                .is_some_and(|hook| Arc::ptr_eq(hook, &self.hook))
            {
                *activation_slot = None;
            }
        }
    }
}

#[cfg(test)]
mod tests;
