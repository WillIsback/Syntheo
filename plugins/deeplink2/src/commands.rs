use crate::pending_deep_link::PendingDeepLinkState;
use crate::types::DeepLink;

#[tauri::command]
#[specta::specta]
pub fn take_pending_deep_links(
    state: tauri::State<'_, PendingDeepLinkState>,
) -> Result<Vec<DeepLink>, String> {
    let deep_links = state
        .take_all()
        .map_err(|_| "pending deep-link queue unavailable".to_string())?;
    if !deep_links.is_empty() {
        tracing::info!(count = deep_links.len(), "pending_deep_links_drained");
    }
    Ok(deep_links)
}
