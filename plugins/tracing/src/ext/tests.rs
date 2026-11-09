use rquickjs::{Context, Runtime};

#[test]
fn cloudsync_log_filters_before_limiting_and_reads_rotated_activity() {
    let temp = tempfile::tempdir().unwrap();
    let native =
        "2026-10-01T00:00:00Z INFO db_core::cloudsync::runtime::background: sync completed";
    let recovery =
        "2026-10-01T00:00:01Z WARN tauri_plugin_db::runtime::recovery: CloudSync recovery delayed";
    let console = "2026-10-01T00:00:02Z WARN syntheo.webview.console: webview_console_event diagnostic=\"[cloudsync] local sync configuration failed\"";
    let multiline = "2026-10-01T00:00:03Z WARN db_core::cloudsync::runtime: CloudSync failed\n  caused by: timed out";
    std::fs::write(
        temp.path().join("app.log.1"),
        (0..110)
            .map(|i| format!("{native} sequence={i}\n"))
            .collect::<String>(),
    )
    .unwrap();
    std::fs::write(
        temp.path().join("app.log"),
        format!(
            "{recovery}\n{console}\n{multiline}\n{}",
            "2026-10-01T00:00:04Z INFO unrelated: cloudsync mentioned in unrelated message\n  unrelated continuation\n"
                .repeat(2_000)
        ),
    )
    .unwrap();
    let filtered = super::read_log_content(temp.path(), true).unwrap();
    let lines: Vec<_> = filtered.lines().collect();
    assert_eq!(lines.len(), 101);
    assert_eq!(lines[0], format!("{native} sequence=13"));
    assert_eq!(
        filtered.split_once(recovery).unwrap().1,
        format!("\n{console}\n{multiline}")
    );
    assert!(lines.iter().all(|line| !line.contains("unrelated")));
    let unfiltered = super::read_log_content(temp.path(), false).unwrap();
    assert_eq!(unfiltered.lines().count(), 600);
    assert!(unfiltered.lines().all(|line| line.contains("unrelated")));
}

#[test]
fn diagnostic_message_keeps_only_allowlisted_leading_literal() {
    let data = vec![
        serde_json::json!("[cloudsync] local sync configuration failed; retrying"),
        serde_json::json!({ "message": "secret" }),
    ];
    assert_eq!(
        super::diagnostic_message(&data).as_deref(),
        Some("[cloudsync] local sync configuration failed; retrying")
    );

    assert_eq!(
        super::diagnostic_message(&[serde_json::json!("user typed something")]),
        None
    );
    assert_eq!(
        super::diagnostic_message(&[serde_json::json!({ "message": "[cloudsync] x" })]),
        None
    );
    assert_eq!(super::diagnostic_message(&[]), None);

    let long = [serde_json::json!(format!(
        "[cloudsync] {}",
        "é".repeat(400)
    ))];
    let truncated = super::diagnostic_message(&long).unwrap();
    assert_eq!(truncated.chars().count(), super::DIAGNOSTIC_MAX_LEN);
}

#[test]
fn diagnostic_message_keeps_render_perf_summaries() {
    let summary = "[render-perf] component seq=3 name=SessionLevelMeter zone=capsule renders=100";
    assert_eq!(
        super::diagnostic_message(&[serde_json::json!(summary)]).as_deref(),
        Some(summary)
    );
}

#[test]
fn diagnostic_message_keeps_code_labels_and_error_kinds_only() {
    // A periodic `console.error("[speaker-context] observation failed", error)`
    // must say where it comes from and what failed (issue #268)…
    let data = vec![
        serde_json::json!("[speaker-context] observation failed for Réunion Alice"),
        serde_json::json!({ "$error": { "name": "Error", "code": "ERR_SQLITE_ERROR" } }),
    ];
    assert_eq!(
        super::diagnostic_message(&data).as_deref(),
        Some("[speaker-context] error=Error(ERR_SQLITE_ERROR)")
    );
    // …without the rest of the message, string errors or anything that
    // does not look like a code identifier.
    assert_eq!(
        super::diagnostic_message(&[
            serde_json::json!("[listener] audio recovery deferred"),
            serde_json::json!("no such table: Réunion Alice"),
            serde_json::json!({ "$error": { "name": "Bonjour Alice", "code": "a b" } }),
            serde_json::json!({ "$error": { "name": "AbortError", "code": 20 } }),
        ])
        .as_deref(),
        Some("[listener] error=AbortError(20)")
    );
    assert_eq!(
        super::diagnostic_message(&[
            serde_json::json!("query failed"),
            serde_json::json!({ "$error": { "name": "TypeError" } }),
        ])
        .as_deref(),
        Some("error=TypeError")
    );
    for not_a_label in [
        "[Réunion avec Alice] notes",
        "[alice bob] x",
        "[] x",
        "[speaker-context]",
        "speaker-context] x",
    ] {
        assert_eq!(
            super::diagnostic_message(&[serde_json::json!(not_a_label)]),
            None,
            "{not_a_label}"
        );
    }
    assert_eq!(
        super::diagnostic_message(&[
            serde_json::json!("[cloudsync] local sync configuration failed"),
            serde_json::json!({ "$error": { "name": "Error" } }),
        ])
        .as_deref(),
        Some("[cloudsync] local sync configuration failed error=Error")
    );
}

#[cfg(not(feature = "console-payload"))]
#[test]
fn console_payload_is_absent_from_release_builds() {
    assert_eq!(
        super::console_payload(&[serde_json::json!("secret meeting title")]),
        None
    );
}

#[cfg(feature = "console-payload")]
#[test]
fn console_payload_keeps_text_errors_and_masks_identifiers() {
    let payload = super::console_payload(&[
        serde_json::json!("[meeting-float] show failed for alice@example.com"),
        serde_json::json!({ "attempt": 2 }),
        serde_json::json!({ "$error": {
            "name": "Error",
            "code": "E1",
            "message": "monitor not found",
            "stack": "at show (floating.ts:12)"
        } }),
    ])
    .unwrap();
    assert_eq!(
        payload,
        "[meeting-float] show failed for [EMAIL_REDACTED] {\"attempt\":2} Error(E1): monitor not found\nat show (floating.ts:12)"
    );
    assert_eq!(super::console_payload(&[]), None);
}

#[cfg(feature = "console-payload")]
#[test]
fn console_payload_is_truncated() {
    let payload = super::console_payload(&[serde_json::json!("é".repeat(5000))]).unwrap();
    assert_eq!(payload.chars().count(), 4001);
    assert!(payload.ends_with('…'));
}

#[cfg(feature = "console-payload")]
#[test]
fn console_override_sends_error_message_and_stack_in_devtools_builds() {
    let (_rt, ctx) = setup_runtime();
    ctx.with(|ctx| {
        ctx.eval::<(), _>(
            r#"
                globalThis.window = globalThis;
                globalThis.setTimeout = function(fn) { fn(); };
                globalThis.console = { log() {}, debug() {}, info() {}, warn() {}, error() {} };
                globalThis.sent = [];
                globalThis.window.__TAURI__ = { core: { invoke: function(_cmd, payload) {
                    globalThis.sent.push(payload);
                    return Promise.resolve();
                } } };
            "#,
        )
        .unwrap();
        ctx.eval::<(), _>(super::JS_INIT_SCRIPT).unwrap();
        let sent: String = ctx
            .eval(
                r#"
                    const error = new TypeError("monitor not found");
                    console.error("[meeting-float] show failed", error);
                    const data = globalThis.sent[0].data;
                    JSON.stringify([data[0], data[1].$error.name, data[1].$error.message, typeof data[1].$error.stack])
                "#,
            )
            .unwrap();
        assert_eq!(
            sent,
            r#"["[meeting-float] show failed","TypeError","monitor not found","string"]"#
        );
    });
}

#[cfg(not(feature = "console-payload"))]
#[test]
fn console_override_sends_error_kind_but_not_error_message() {
    let (_rt, ctx) = setup_runtime();
    ctx.with(|ctx| {
        ctx.eval::<(), _>(
            r#"
                globalThis.window = globalThis;
                globalThis.setTimeout = function(fn) { fn(); };
                globalThis.console = { log() {}, debug() {}, info() {}, warn() {}, error() {} };
                globalThis.sent = [];
                globalThis.window.__TAURI__ = { core: { invoke: function(_cmd, payload) {
                    globalThis.sent.push(payload);
                    return Promise.resolve();
                } } };
            "#,
        )
        .unwrap();
        ctx.eval::<(), _>(super::JS_INIT_SCRIPT).unwrap();
        let sent: String = ctx
            .eval(
                r#"
                    const error = new TypeError("secret meeting title");
                    error.code = "ERR_X";
                    console.error("[speaker-context] observation failed", error);
                    JSON.stringify(globalThis.sent)
                "#,
            )
            .unwrap();
        assert_eq!(
            sent,
            r#"[{"level":"ERROR","data":["[speaker-context] observation failed",{"$error":{"name":"TypeError","code":"ERR_X"}}]}]"#
        );
    });
}

fn setup_runtime() -> (Runtime, Context) {
    let runtime = Runtime::new().unwrap();
    let context = Context::full(&runtime).unwrap();
    context.with(|_ctx| {});
    (runtime, context)
}

#[test]
fn test_js_init_script() {
    let (_rt, ctx) = setup_runtime();
    ctx.with(|ctx| {
        let setup = r#"
                globalThis.window = globalThis;
                globalThis.setTimeout = function(fn, delay) { fn(); };
                
                if (typeof globalThis.console === 'undefined') {
                    globalThis.console = {
                        log: function() {},
                        debug: function() {},
                        info: function() {},
                        warn: function() {},
                        error: function() {}
                    };
                }
                
                globalThis.window.__TAURI__ = {
                    core: {
                        invoke: function() { return Promise.resolve(); }
                    }
                };
            "#;
        ctx.eval::<(), _>(setup).unwrap();
        ctx.eval::<(), _>(super::JS_INIT_SCRIPT).unwrap();

        let console_methods_exist: bool = ctx
            .eval(
                r#"
                    typeof console !== 'undefined' && 
                    typeof console.log === 'function' &&
                    typeof console.debug === 'function' &&
                    typeof console.info === 'function' &&
                    typeof console.warn === 'function' &&
                    typeof console.error === 'function'
                "#,
            )
            .unwrap();

        assert!(
            console_methods_exist,
            "All console methods should be defined"
        );
    });
}
