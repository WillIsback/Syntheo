use super::*;

#[derive(Clone)]
struct TestSink;

impl QueryEventSink for TestSink {
    fn send_result(&self, _rows: Vec<serde_json::Value>) -> std::result::Result<(), String> {
        Ok(())
    }

    fn send_error(&self, _error: String) -> std::result::Result<(), String> {
        Ok(())
    }
}

#[tokio::test]
async fn activation_ignores_stale_broadcasts_and_enqueues_newer_ones() {
    let registry = Registry::<TestSink>::default();
    let registered = registry
        .register(
            "SELECT id FROM daily_notes".to_string(),
            vec![],
            TestSink,
            DependencyAnalysis::Reactive {
                targets: HashSet::from([DependencyTarget::Table("daily_notes".to_string())]),
            },
        )
        .await;
    let watch_id = registered.reactive_watch_id.unwrap();

    assert!(registry.activate(watch_id, 11).await);

    let jobs = registry
        .collect_jobs(&HashMap::from([(
            DependencyTarget::Table("daily_notes".to_string()),
            11,
        )]))
        .await;

    assert!(jobs.is_empty());

    let jobs = registry
        .collect_jobs(&HashMap::from([(
            DependencyTarget::Table("daily_notes".to_string()),
            12,
        )]))
        .await;

    assert_eq!(jobs.len(), 1);
}

#[tokio::test]
async fn non_reactive_registrations_report_reason_and_unregister_cleanly() {
    let registry = Registry::<TestSink>::default();
    let registered = registry
        .register(
            "SELECT 1".to_string(),
            vec![],
            TestSink,
            DependencyAnalysis::NonReactive {
                reason: "query has no reactive dependencies".to_string(),
            },
        )
        .await;

    assert!(registered.reactive_watch_id.is_none());
    assert_eq!(
        registry
            .dependency_analysis(&registered.registration.id)
            .await,
        Some(DependencyAnalysis::NonReactive {
            reason: "query has no reactive dependencies".to_string(),
        })
    );

    assert!(registry.unregister(&registered.registration.id).await);
    assert!(
        registry
            .dependency_analysis(&registered.registration.id)
            .await
            .is_none()
    );
}

#[tokio::test]
async fn collect_all_jobs_only_returns_active_subscriptions() {
    let registry = Registry::<TestSink>::default();
    let initializing = registry
        .register(
            "SELECT id FROM daily_notes".to_string(),
            vec![],
            TestSink,
            DependencyAnalysis::Reactive {
                targets: HashSet::from([DependencyTarget::Table("daily_notes".to_string())]),
            },
        )
        .await;
    let active = registry
        .register(
            "SELECT id FROM daily_summaries".to_string(),
            vec![],
            TestSink,
            DependencyAnalysis::Reactive {
                targets: HashSet::from([DependencyTarget::Table("daily_summaries".to_string())]),
            },
        )
        .await;
    let active_watch_id = active.reactive_watch_id.unwrap();

    assert!(registry.activate(active_watch_id, 3).await);

    let jobs = registry.collect_all_jobs(4).await;

    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].watch_id, active_watch_id);
    assert_eq!(jobs[0].sql, "SELECT id FROM daily_summaries");
    assert!(jobs[0].params.is_empty());
    assert_ne!(initializing.reactive_watch_id, Some(active_watch_id));
}
