use base64::Engine;
use serde::{Deserialize, Serialize};
use syntheo_mesure::{
    ChangeKind, Dictionary, Format, MAX_DOCX_BYTES, MeasureError, docx_to_html, load_file,
};

/// Version envoyée : texte collé (avec son format) ou fichier déposé.
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SentInput {
    Text {
        text: String,
        format: SentFormat,
    },
    File {
        path: String,
    },
    /// `.docx` déposé dans la fenêtre (le navigateur ne donne pas son chemin).
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
        SentInput::File { path } => load_file(std::path::Path::new(&path)).map_err(error),
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

/// Mesure la reprise de `generated` (Markdown de la synthèse) par rapport à la
/// version envoyée. Ne rend que des nombres.
#[tauri::command]
#[specta::specta]
pub(crate) async fn measure<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    generated: String,
    sent: SentInput,
    dictionary: Vec<String>,
) -> Result<MeasureResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_measure(&generated, sent, &dictionary))
        .await
        .map_err(|_| "measure task failed".to_owned())?
}

/// Différences avec leurs extraits, pour le mode Calibrage.
#[tauri::command]
#[specta::specta]
pub(crate) async fn measure_differences<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    generated: String,
    sent: SentInput,
    dictionary: Vec<String>,
) -> Result<Vec<DifferenceRow>, String> {
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

    #[test]
    fn dropped_files_use_the_same_reader_as_the_cli() {
        let dir = std::env::temp_dir().join(format!("mesure-plugin-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let txt = dir.join("publiee.txt");
        std::fs::write(&txt, SENT).unwrap();
        let from_file = run_measure(
            GENERATED,
            SentInput::File {
                path: txt.to_string_lossy().into_owned(),
            },
            &[],
        )
        .unwrap();
        let pdf = dir.join("publiee.pdf");
        std::fs::write(&pdf, b"%PDF").unwrap();
        let refused = run_measure(
            GENERATED,
            SentInput::File {
                path: pdf.to_string_lossy().into_owned(),
            },
            &[],
        );
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(
            from_file,
            run_measure(GENERATED, text(SentFormat::Text), &[]).unwrap()
        );
        assert!(refused.is_err());
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
