use crate::{SearchRequest, SearchResult, TantivyPluginExt};

#[tauri::command]
#[specta::specta]
pub(crate) async fn search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: SearchRequest,
) -> Result<SearchResult, String> {
    app.tantivy()
        .search(request)
        .await
        .map_err(|e| e.to_string())
}
