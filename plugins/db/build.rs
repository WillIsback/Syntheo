const COMMANDS: &[&str] = &[
    "execute",
    "execute_proxy",
    "execute_transaction",
    "get_meeting",
    "get_meeting_transcript",
    "get_recurring_meeting_history",
    "list_meetings",
    "apply_session_ingest",
    "subscribe",
    "unsubscribe",
    "get_startup_status",
    "wait_until_ready",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
