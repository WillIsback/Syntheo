use crate::TemplatePluginExt;
use std::str::FromStr;
use tauri::Manager;

#[derive(serde::Deserialize, specta::Type)]
pub struct DominantLanguageRequest {
    pub texts: Vec<String>,
    pub candidates: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub fn summary_length_policy(
    request: syntheo_summary::SummaryLengthPolicyRequest,
) -> Result<Option<syntheo_summary::SummaryLengthPolicy>, String> {
    Ok(syntheo_summary::summary_length_policy_for_texts(
        &request.transcript_texts,
        request.template_section_count as usize,
    ))
}

#[tauri::command]
#[specta::specta]
pub fn dominant_language(request: DominantLanguageRequest) -> Result<Option<String>, String> {
    // Un code illisible est écarté plutôt que d'empêcher la détection.
    let languages = request
        .candidates
        .iter()
        .filter_map(|candidate| {
            syntheo_language::Language::from_str(candidate)
                .ok()
                .map(|language| (candidate, language))
        })
        .collect::<Vec<_>>();
    let candidate_codes = languages
        .iter()
        .map(|(_, language)| language.iso639())
        .collect::<Vec<_>>();
    let dominant = syntheo_language::dominant_language(
        request.texts.iter().map(String::as_str),
        &candidate_codes,
    );

    Ok(dominant.and_then(|dominant| {
        languages
            .iter()
            .find(|(_, language)| language.iso639() == dominant)
            .map(|(candidate, _)| (*candidate).clone())
    }))
}

#[tauri::command]
#[specta::specta]
pub fn prepare_generated_summary(
    request: syntheo_summary::PrepareGeneratedSummaryRequest,
) -> Result<Option<syntheo_summary::PreparedGeneratedSummary>, String> {
    Ok(syntheo_summary::prepare_generated_summary(request))
}

#[tauri::command]
#[specta::specta]
pub fn compose_generated_summary(
    request: syntheo_summary::ComposeGeneratedSummaryRequest,
) -> Result<String, String> {
    Ok(syntheo_summary::compose_generated_summary(request))
}

#[tauri::command]
#[specta::specta]
pub async fn save_generated_summary<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: crate::generated_summary::SaveGeneratedSummaryRequest,
) -> Result<(), String> {
    let runtime = app
        .try_state::<tauri_plugin_db::ManagedState>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "database is not ready yet".to_string())?;
    let _guard = runtime.synced_write_guard().await;
    crate::generated_summary::save_generated_summary(runtime.pool(), request).await
}

#[tauri::command]
#[specta::specta]
pub async fn save_generated_title<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: crate::session_content::SaveGeneratedTitleRequest,
) -> Result<(), String> {
    let runtime = app
        .try_state::<tauri_plugin_db::ManagedState>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "database is not ready yet".to_string())?;
    let _guard = runtime.synced_write_guard().await;
    crate::session_content::save_generated_title(runtime.pool(), request).await
}

#[tauri::command]
#[specta::specta]
pub async fn apply_session_content_corrections<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: crate::session_content::SessionContentCorrectionsRequest,
) -> Result<(), String> {
    let runtime = app
        .try_state::<tauri_plugin_db::ManagedState>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "database is not ready yet".to_string())?;
    let _guard = runtime.synced_write_guard().await;
    crate::session_content::apply_session_content_corrections(runtime.pool(), request).await
}

#[tauri::command]
#[specta::specta]
pub async fn render<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    tpl: syntheo_template_app::Template,
) -> Result<String, String> {
    syntheo_template_app::render(tpl).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn render_custom<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    template_content: String,
    ctx: serde_json::Map<String, serde_json::Value>,
) -> Result<String, String> {
    app.template().render_custom(&template_content, ctx)
}

#[tauri::command]
#[specta::specta]
pub async fn get_template_source<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    template: syntheo_template_app::EditableTemplate,
) -> Result<String, String> {
    Ok(syntheo_template_app::template_source(template).to_string())
}

#[cfg(test)]
mod dominant_language_tests {
    use super::*;

    // Issue 570 : en détection automatique, toutes les langues de l'app sont
    // candidates, y compris celles que la détection ne sait pas reconnaître.
    #[test]
    fn detects_french_among_all_candidates_and_returns_the_candidate_code() {
        let detected = dominant_language(DominantLanguageRequest {
            texts: vec!["Bonjour à tous, merci d'être venus à cette réunion.".to_string()],
            candidates: ["bs", "en", "fr", "ms", "pas-une-langue"]
                .map(String::from)
                .to_vec(),
        })
        .unwrap();
        assert_eq!(detected.as_deref(), Some("fr"));
    }

    #[test]
    fn returns_nothing_for_an_empty_transcript() {
        let detected = dominant_language(DominantLanguageRequest {
            texts: vec![String::new()],
            candidates: ["en", "fr"].map(String::from).to_vec(),
        })
        .unwrap();
        assert_eq!(detected, None);
    }
}
