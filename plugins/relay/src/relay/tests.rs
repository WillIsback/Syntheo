use super::{
    MAX_EVENT_SUBSCRIPTIONS, PendingResults, can_register_event_subscription, event_handler_id,
    send_reply, send_reply_with_timeout, try_send_event,
};

#[test]
fn reads_tauri_event_id_for_unlisten_requests() {
    assert_eq!(event_handler_id(&serde_json::json!({ "eventId": 42 })), 42);
    assert_eq!(event_handler_id(&serde_json::json!({ "handler": 43 })), 43);
}

#[tokio::test]
async fn signals_connection_close_instead_of_dropping_an_event_silently() {
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let (overflow_tx, overflow_rx) = tokio::sync::watch::channel(false);

    assert!(try_send_event(&tx, &overflow_tx, "first".to_string()));
    assert!(!try_send_event(&tx, &overflow_tx, "second".to_string()));
    assert!(*overflow_rx.borrow());
    assert_eq!(rx.recv().await.as_deref(), Some("first"));
}

#[tokio::test]
async fn replies_wait_for_capacity_instead_of_being_dropped() {
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let (overflow_tx, overflow_rx) = tokio::sync::watch::channel(false);
    assert!(try_send_event(&tx, &overflow_tx, "event".to_string()));

    let reply_tx = tx.clone();
    let reply_overflow_tx = overflow_tx.clone();
    let reply = tokio::spawn(async move {
        send_reply(&reply_tx, &reply_overflow_tx, "reply".to_string()).await
    });
    tokio::task::yield_now().await;
    assert!(!reply.is_finished());

    assert_eq!(rx.recv().await.as_deref(), Some("event"));
    assert!(reply.await.unwrap());
    assert!(!*overflow_rx.borrow());
    assert_eq!(rx.recv().await.as_deref(), Some("reply"));
}

#[tokio::test]
async fn reply_timeout_signals_connection_close() {
    let (tx, _rx) = tokio::sync::mpsc::channel(1);
    tx.send("first".to_string()).await.unwrap();
    let (overflow_tx, overflow_rx) = tokio::sync::watch::channel(false);

    assert!(
        !send_reply_with_timeout(
            &tx,
            &overflow_tx,
            "reply".to_string(),
            std::time::Duration::from_millis(25),
        )
        .await
    );
    assert!(*overflow_rx.borrow());
}

#[tokio::test]
async fn pending_results_use_server_unique_internal_ids() {
    let pending = PendingResults::default();
    let (first_tx, first_rx) = tokio::sync::oneshot::channel();
    let (second_tx, second_rx) = tokio::sync::oneshot::channel();

    let first_id = pending.register(first_tx).await;
    let second_id = pending.clone().register(second_tx).await;

    assert_ne!(first_id, second_id);
    pending
        .take(first_id)
        .await
        .unwrap()
        .send(serde_json::json!(1))
        .unwrap();
    pending
        .take(second_id)
        .await
        .unwrap()
        .send(serde_json::json!(2))
        .unwrap();
    assert_eq!(first_rx.await.unwrap(), serde_json::json!(1));
    assert_eq!(second_rx.await.unwrap(), serde_json::json!(2));
}

#[test]
fn event_subscription_limit_allows_replacements_but_rejects_growth() {
    assert!(can_register_event_subscription(
        MAX_EVENT_SUBSCRIPTIONS,
        true
    ));
    assert!(!can_register_event_subscription(
        MAX_EVENT_SUBSCRIPTIONS,
        false
    ));
}

// Issue 645 : commandes jamais transmises par le relay.
// Issue 664 : liste d'autorisation. Une commande absente est refusée,
// qu'elle soit dangereuse ou simplement inconnue.
#[test]
fn only_listed_commands_pass_the_relay() {
    let none = serde_json::json!({});
    for cmd in [
        "plugin:local-api|run_automation_command",
        "plugin:store2|get_secret",
        "plugin:opener2|open_path",
        "plugin:export|export_text",
        "plugin:dictation|insert_text",
        "plugin:detect|send_meeting_chat_message",
        "install_agent_skill",
        "plugin:mesure|measure",
        "plugin:transcription|on_device_commission",
        // Inconnues : jamais transmises.
        "plugin:shell|execute",
        "plugin:fs|write_file",
        "plugin:relay|relay_result",
        "plugin:process|exit",
        "plugin:clipboard-manager|read_text",
        "made_up_command",
    ] {
        assert!(super::is_denied_command(cmd, &none), "{cmd}");
    }
    for cmd in [
        "plugin:db|execute",
        "plugin:store2|get_str",
        "plugin:event|listen",
        "plugin:event|unlisten",
        "plugin:window|set_title",
        "plugin:process|restart",
        "get_pinned_tabs",
    ] {
        assert!(!super::is_denied_command(cmd, &none), "{cmd}");
    }
}

// Contre-visite de l'issue 645 : `open_url` avec `openWith` lançait le
// programme de son choix. Sans `openWith`, l'adresse s'ouvre normalement.
#[test]
fn open_url_passes_only_without_a_chosen_program() {
    let cmd = "plugin:opener2|open_url";
    assert!(!super::is_denied_command(
        cmd,
        &serde_json::json!({ "url": "https://exemple.fr" })
    ));
    assert!(!super::is_denied_command(
        cmd,
        &serde_json::json!({ "url": "https://exemple.fr", "openWith": null })
    ));
    for args in [
        serde_json::json!({ "url": "/tmp/x.sh", "openWith": "sh" }),
        serde_json::json!({ "url": "/tmp/x.sh", "open_with": "sh" }),
    ] {
        assert!(super::is_denied_command(cmd, &args), "{args}");
    }
}

// Chaque commande des liaisons générées est classée : autorisée ou exclue
// avec sa raison. Une commande nouvelle sans décision fait échouer ce test.
#[test]
fn every_bound_command_is_allowed_or_excluded() {
    use crate::allowlist::{ALLOWED_COMMANDS, EXCLUDED_COMMANDS};
    use std::collections::BTreeSet;

    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut files = vec![root.join("apps/desktop/src/types/tauri.gen.ts")];
    for plugin in std::fs::read_dir(root.join("plugins")).unwrap() {
        let bindings = plugin.unwrap().path().join("js/bindings.gen.ts");
        if bindings.exists() {
            files.push(bindings);
        }
    }
    let mut bound = BTreeSet::new();
    for file in files {
        let text = std::fs::read_to_string(&file).unwrap();
        for part in text.split("TAURI_INVOKE(\"").skip(1) {
            bound.insert(part.split('"').next().unwrap().to_string());
        }
    }
    assert!(bound.len() > 200, "{} commandes lues", bound.len());

    let excluded: BTreeSet<String> = EXCLUDED_COMMANDS
        .iter()
        .map(|(cmd, _)| cmd.to_string())
        .collect();
    let allowed: BTreeSet<String> = ALLOWED_COMMANDS
        .iter()
        .filter(|cmd| {
            !cmd.starts_with("plugin:process|") && !cmd.starts_with("plugin:clipboard-manager|")
        })
        .map(|cmd| cmd.to_string())
        .collect();
    assert!(allowed.is_disjoint(&excluded));
    let classified: BTreeSet<String> = allowed.union(&excluded).cloned().collect();
    let unclassified: Vec<_> = bound.difference(&classified).collect();
    let stale: Vec<_> = classified.difference(&bound).collect();
    assert!(
        unclassified.is_empty(),
        "à classer dans allowlist.rs : {unclassified:?}"
    );
    assert!(
        stale.is_empty(),
        "commandes disparues des liaisons : {stale:?}"
    );
}
