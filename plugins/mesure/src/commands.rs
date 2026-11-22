use base64::Engine;
use serde::{Deserialize, Serialize};
use syntheo_mesure::{ChangeKind, Dictionary, Format, MAX_DOCX_BYTES, MeasureError, docx_to_html};

/// Version envoyée : texte collé (avec son format) ou fichier déposé.
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SentInput {
    Text {
        text: String,
        format: SentFormat,
    },
    /// `.docx` choisi ou déposé, lu par l'interface : le plugin ne reçoit
    /// jamais de chemin (revue du lot 0.8.0, constat 1).
    Docx {
        base64: String,
    },
}

#[derive(Debug, Clone, Copy, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SentFormat {
    Text,
    Markdown,
    Html,
}

impl From<SentFormat> for Format {
    fn from(format: SentFormat) -> Self {
        match format {
            SentFormat::Text => Format::Text,
            SentFormat::Markdown => Format::Markdown,
            SentFormat::Html => Format::Html,
        }
    }
}

/// Compteurs, en mots (`Counters` du crate `mesure`).
#[derive(Debug, Clone, Copy, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MeasureCounters {
    pub generated: u32,
    pub added: u32,
    pub deleted: u32,
    pub replaced_content: u32,
    pub replaced_lexical: u32,
}

#[derive(Debug, Clone, Copy, Serialize, specta::Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectionMeasure {
    pub index: u32,
    pub matched: bool,
    pub counters: MeasureCounters,
}

/// Résultat de la mesure : des nombres et des booléens seulement.
#[derive(Debug, Clone, Serialize, specta::Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MeasureResult {
    pub rule_version: u32,
    pub aligned: bool,
    pub headings_generated: u32,
    pub headings_matched: u32,
    pub total: MeasureCounters,
    pub sections: Vec<SectionMeasure>,
    pub unmatched_sent_words: u32,
    pub content_per_mille: Option<f64>,
    pub lexical_per_mille: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DifferenceKind {
    Added,
    Deleted,
    Replaced,
}

/// Différence avec ses extraits, pour le mode Calibrage : rendue à l'écran,
/// jamais enregistrée.
#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DifferenceRow {
    pub section: Option<u32>,
    pub kind: DifferenceKind,
    pub lexical: bool,
    pub weight: u32,
    pub generated: String,
    pub sent: String,
}

fn n(value: u64) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

fn counters(c: &syntheo_mesure::Counters) -> MeasureCounters {
    MeasureCounters {
        generated: n(c.generated),
        added: n(c.added),
        deleted: n(c.deleted),
        replaced_content: n(c.replaced_content),
        replaced_lexical: n(c.replaced_lexical),
    }
}

/// Message d'erreur fixe, sans contenu des textes.
fn error(error: MeasureError) -> String {
    error.to_string()
}

fn sent_text(sent: SentInput) -> Result<(String, Format), String> {
    match sent {
        SentInput::Text { text, format } => Ok((text, format.into())),
        SentInput::Docx { base64 } => {
            if base64.len() > MAX_DOCX_BYTES / 3 * 4 + 4 {
                return Err(error(MeasureError::TooLarge));
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(base64.as_bytes())
                .map_err(|_| error(MeasureError::InvalidDocument))?;
            Ok((docx_to_html(&bytes).map_err(error)?, Format::Html))
        }
    }
}

fn dictionary(terms: &[String]) -> Result<Dictionary, String> {
    Dictionary::new(terms.iter().map(String::as_str)).map_err(error)
}

pub(crate) fn run_measure(
    generated: &str,
    sent: SentInput,
    terms: &[String],
) -> Result<MeasureResult, String> {
    let (sent, sent_format) = sent_text(sent)?;
    let report = syntheo_mesure::measure(
        generated,
        Format::Markdown,
        &sent,
        sent_format,
        &dictionary(terms)?,
    )
    .map_err(error)?;
    Ok(MeasureResult {
        rule_version: report.rule_version,
        aligned: report.aligned,
        headings_generated: report.headings_generated,
        headings_matched: report.headings_matched,
        total: counters(&report.total),
        sections: report
            .sections
            .iter()
            .map(|s| SectionMeasure {
                index: s.index,
                matched: s.matched,
                counters: counters(&s.counters),
            })
            .collect(),
        unmatched_sent_words: n(report.unmatched_sent_words),
        content_per_mille: report.content_per_mille,
        lexical_per_mille: report.lexical_per_mille,
    })
}

pub(crate) fn run_differences(
    generated: &str,
    sent: SentInput,
    terms: &[String],
) -> Result<Vec<DifferenceRow>, String> {
    let (sent, sent_format) = sent_text(sent)?;
    let list = syntheo_mesure::differences(
        generated,
        Format::Markdown,
        &sent,
        sent_format,
        &dictionary(terms)?,
    )
    .map_err(error)?;
    Ok(list
        .into_iter()
        .map(|d| DifferenceRow {
            section: d.section,
            kind: match d.change.kind {
                ChangeKind::Added => DifferenceKind::Added,
                ChangeKind::Deleted => DifferenceKind::Deleted,
                ChangeKind::Replaced => DifferenceKind::Replaced,
            },
            lexical: d.change.lexical,
            weight: n(d.change.weight),
            generated: d.generated,
            sent: d.sent,
        })
        .collect())
}

/// Réglage booléen effectif, lu dans `app_settings` (un réglage géré y est
/// écrit et verrouillé au démarrage, il l'emporte donc). Absent : faux.
fn setting_enabled(value_json: Option<&str>) -> bool {
    value_json.is_some_and(|v| v.trim() == "true")
}

/// Contrôle côté Rust des réglages de la bêta (revue du lot 0.8.0, constat
/// 13) : la mesure exige `measurement_enabled`, les extraits du Calibrage
/// exigent en plus `calibration_enabled`. Lecture seule.
pub(crate) fn check_enabled(
    measurement: Option<&str>,
    calibration: Option<&str>,
    need_calibration: bool,
) -> Result<(), String> {
    if !setting_enabled(measurement) {
        return Err("rework measurement is disabled".to_owned());
    }
    if need_calibration && !setting_enabled(calibration) {
        return Err("calibration mode is disabled".to_owned());
    }
    Ok(())
}

async fn ensure_enabled<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    need_calibration: bool,
) -> Result<(), String> {
    use tauri::Manager;
    let Some(db) = app.try_state::<tauri_plugin_db::ManagedState>() else {
        return Err("database unavailable".to_owned());
    };
    let pool = db.pool().clone();
    let read = |id: &'static str| {
        let pool = pool.clone();
        async move {
            syntheo_db_app::get_app_setting_json(&pool, id)
                .await
                .map_err(|_| "settings unavailable".to_owned())
        }
    };
    let measurement = read("measurement_enabled").await?;
    let calibration = read("calibration_enabled").await?;
    check_enabled(
        measurement.as_deref(),
        calibration.as_deref(),
        need_calibration,
    )
}

/// Mesure la reprise de `generated` (Markdown de la synthèse) par rapport à la
/// version envoyée. Ne rend que des nombres.
#[tauri::command]
#[specta::specta]
pub(crate) async fn measure<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    generated: String,
    sent: SentInput,
    dictionary: Vec<String>,
) -> Result<MeasureResult, String> {
    ensure_enabled(&app, false).await?;
    tauri::async_runtime::spawn_blocking(move || run_measure(&generated, sent, &dictionary))
        .await
        .map_err(|_| "measure task failed".to_owned())?
}

/// Différences avec leurs extraits, pour le mode Calibrage.
#[tauri::command]
#[specta::specta]
pub(crate) async fn measure_differences<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    generated: String,
    sent: SentInput,
    dictionary: Vec<String>,
) -> Result<Vec<DifferenceRow>, String> {
    ensure_enabled(&app, true).await?;
    tauri::async_runtime::spawn_blocking(move || run_differences(&generated, sent, &dictionary))
        .await
        .map_err(|_| "measure task failed".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const GENERATED: &str = "# Résumé\n\nLe projet avance bien. Le budget est validé par la direction.\n\n## Décisions\n\n- Lancer le pilote en janvier avec Martin.\n- Garder le serveur actuel.\n\n## Actions\n\n- Envoyer le compte rendu à l'équipe.\n";
    const SENT: &str = "Résumé\nLe projet avance bien. Le budget est validé par le comité de direction.\nDécisions\nLancer le pilote en février avec Marten.\nGarder le serveur actuel.\nFormer les testeurs.\nActions\nEnvoyer le compte rendu.\n";

    fn text(format: SentFormat) -> SentInput {
        SentInput::Text {
            text: SENT.to_owned(),
            format,
        }
    }

    // Paire de référence : mêmes nombres que `syntheo mesure` (référence CLI).
    #[test]
    fn reference_pair_gives_the_cli_numbers() {
        let result = run_measure(GENERATED, text(SentFormat::Text), &[]).unwrap();
        assert!(result.aligned);
        assert_eq!(
            result.total,
            MeasureCounters {
                generated: 28,
                added: 3,
                deleted: 2,
                replaced_content: 4,
                replaced_lexical: 1
            }
        );
        assert_eq!(result.sections.len(), 3);
        assert_eq!(result.sections[1].counters.added, 3);
        let report = syntheo_mesure::measure(
            GENERATED,
            Format::Markdown,
            SENT,
            Format::Text,
            &Dictionary::default(),
        )
        .unwrap();
        assert_eq!(result.content_per_mille, report.content_per_mille);
    }

    // Revue du lot 0.8.0, constat 7 : la synthèse collée telle quelle
    // (Markdown, sans HTML) donne une reprise nulle.
    #[test]
    fn pasting_the_summary_itself_gives_no_rework() {
        let result = run_measure(
            GENERATED,
            SentInput::Text {
                text: GENERATED.to_owned(),
                format: SentFormat::Markdown,
            },
            &[],
        )
        .unwrap();
        assert!(result.aligned);
        assert_eq!(result.total.generated, 28);
        assert_eq!(
            (
                result.total.added,
                result.total.deleted,
                result.total.replaced_content,
                result.total.replaced_lexical
            ),
            (0, 0, 0, 0)
        );
    }

    #[test]
    fn a_dropped_docx_is_read_by_the_crate_reader() {
        use base64::Engine;
        let refused = run_measure(
            GENERATED,
            SentInput::Docx {
                base64: base64::engine::general_purpose::STANDARD.encode(b"not a zip"),
            },
            &[],
        );
        assert!(refused.is_err());
    }

    // Revue du lot 0.8.0, constat 13 : réglages vérifiés côté Rust.
    #[test]
    fn commands_require_the_beta_settings() {
        assert!(check_enabled(None, None, false).is_err());
        assert!(check_enabled(Some("false"), Some("true"), false).is_err());
        assert!(check_enabled(Some("true"), None, false).is_ok());
        assert!(check_enabled(Some("true"), None, true).is_err());
        assert!(check_enabled(Some("true"), Some("false"), true).is_err());
        assert!(check_enabled(Some("true"), Some("true"), true).is_ok());
    }

    // Le résultat de `measure` ne contient aucune chaîne : nombres, booléens et
    // clés fixes seulement.
    #[test]
    fn measure_result_contains_no_free_text() {
        fn walk(value: &serde_json::Value) {
            match value {
                serde_json::Value::String(s) => panic!("chaîne dans le résultat : {s:?}"),
                serde_json::Value::Array(items) => items.iter().for_each(walk),
                serde_json::Value::Object(map) => map.values().for_each(walk),
                _ => {}
            }
        }
        let result = run_measure(GENERATED, text(SentFormat::Text), &[]).unwrap();
        walk(&serde_json::to_value(&result).unwrap());
    }

    #[test]
    fn differences_match_the_counters() {
        let rows = run_differences(GENERATED, text(SentFormat::Text), &[]).unwrap();
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[2].generated, "Martin");
        assert!(rows[2].lexical);
        let lexical: u32 = rows.iter().filter(|r| r.lexical).map(|r| r.weight).sum();
        assert_eq!(lexical, 1);
    }
}
