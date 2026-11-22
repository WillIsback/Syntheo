//! `syntheo mesure` : reprise entre une synthèse générée et la version envoyée
//! (calibrage local de la bêta). N'affiche que des nombres ; aucun texte n'est
//! écrit, ni à l'écran ni sur disque. Aucun accès à la base ni au réseau.

use std::path::Path;

use syntheo_mesure::{Dictionary, Format, MAX_INPUT_BYTES, Report, measure};

use crate::output;
use crate::{Error, Result};

fn read_text(path: &Path, what: &'static str) -> Result<String> {
    let size = std::fs::metadata(path)
        .map_err(|error| Error::operation(what, error.to_string()))?
        .len();
    if size > MAX_INPUT_BYTES as u64 {
        return Err(Error::operation(what, "file too large"));
    }
    let bytes = std::fs::read(path).map_err(|error| Error::operation(what, error.to_string()))?;
    String::from_utf8(bytes).map_err(|_| Error::operation(what, "file is not UTF-8 text"))
}

fn format_of(path: &Path, what: &'static str) -> Result<Format> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .and_then(Format::from_extension)
        .ok_or_else(|| Error::operation(what, "unsupported file type (use .md, .txt or .html)"))
}

pub fn run(generated: &Path, sent: &Path, dictionary: Option<&Path>, json: bool) -> Result<()> {
    let generated_format = format_of(generated, "read generated summary")?;
    let sent_format = format_of(sent, "read sent version")?;
    let dictionary = match dictionary {
        Some(path) => {
            let text = read_text(path, "read dictionary")?;
            Dictionary::new(text.lines())
                .map_err(|error| Error::operation("read dictionary", error.to_string()))?
        }
        None => Dictionary::default(),
    };
    let report = {
        let generated = read_text(generated, "read generated summary")?;
        let sent = read_text(sent, "read sent version")?;
        measure(
            &generated,
            generated_format,
            &sent,
            sent_format,
            &dictionary,
        )
        .map_err(|error| Error::operation("measure", error.to_string()))?
    };
    if json {
        output::emit(&output::json("mesure", &report, None)?);
    } else {
        output::emit(&human(&report));
    }
    Ok(())
}

fn rate(value: Option<f64>) -> String {
    value.map_or_else(|| "-".to_owned(), |v| format!("{v:.1}"))
}

/// Une valeur par ligne, `clé<TAB>nombre` : facile à relire et à agréger.
fn human(report: &Report) -> String {
    let t = &report.total;
    let mut lines = vec![
        format!("rule_version\t{}", report.rule_version),
        format!("aligned\t{}", u8::from(report.aligned)),
        format!("headings_generated\t{}", report.headings_generated),
        format!("headings_matched\t{}", report.headings_matched),
        format!("generated\t{}", t.generated),
        format!("added\t{}", t.added),
        format!("deleted\t{}", t.deleted),
        format!("replaced_content\t{}", t.replaced_content),
        format!("replaced_lexical\t{}", t.replaced_lexical),
        format!("unmatched_sent_words\t{}", report.unmatched_sent_words),
        format!("content_per_mille\t{}", rate(report.content_per_mille)),
        format!("lexical_per_mille\t{}", rate(report.lexical_per_mille)),
    ];
    for section in &report.sections {
        let c = &section.counters;
        lines.push(format!(
            "section\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            section.index,
            u8::from(section.matched),
            c.generated,
            c.added,
            c.deleted,
            c.replaced_content,
            c.replaced_lexical,
            rate(c.added_per_mille()),
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn human_output_is_numbers_only() {
        let dir = tempfile::tempdir().unwrap();
        let generated = dir.path().join("generee.md");
        let sent = dir.path().join("publiee.txt");
        std::fs::write(&generated, "# Résumé\n\nLe projet avance avec Martin.\n").unwrap();
        std::fs::write(
            &sent,
            "Résumé\nMerci Alice. Le projet avance avec Marten.\n",
        )
        .unwrap();
        let report = measure(
            &std::fs::read_to_string(&generated).unwrap(),
            Format::Markdown,
            &std::fs::read_to_string(&sent).unwrap(),
            Format::Text,
            &Dictionary::default(),
        )
        .unwrap();
        let text = human(&report);
        for line in text.lines() {
            let mut fields = line.split('\t');
            let key = fields.next().unwrap();
            assert!(
                key.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
                "{line}"
            );
            for value in fields {
                assert!(value == "-" || value.parse::<f64>().is_ok(), "{line}");
            }
        }
        assert!(!text.contains("Martin") && !text.contains("Alice"));
        assert!(text.contains("replaced_lexical\t1"));
        assert!(text.contains("added\t2"));
    }

    #[test]
    fn unsupported_files_are_refused_without_reading_them() {
        assert!(format_of(Path::new("notes.docx"), "read sent version").is_err());
        assert!(format_of(Path::new("notes"), "read sent version").is_err());
    }
}
