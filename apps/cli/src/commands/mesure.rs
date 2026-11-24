//! `syntheo mesure` : reprise entre une synthèse générée et la version envoyée
//! (calibrage local de la bêta). N'affiche que des nombres ; aucun texte n'est
//! écrit sur disque. Aucun accès à la base ni au réseau.
//!
//! `--gold` mesure aussi une version envoyée nettoyée à la main (référence du
//! jeu d'or, stratégie de mesure v2) et rend l'écart entre les deux taux,
//! toujours en nombres seulement.
//!
//! Seule exception, demandée explicitement : `--differences` liste chaque
//! différence avec ses extraits, sur la sortie standard seulement (jamais avec
//! `--json`, donc jamais dans un export), pour le classement manuel de
//! l'étape 0.

use std::path::Path;

use syntheo_mesure::{
    ChangeKind, Dictionary, Difference, Format, MAX_INPUT_BYTES, Report, differences, load_file,
    measure,
};

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

fn load(path: &Path, what: &'static str) -> Result<(String, Format)> {
    load_file(path).map_err(|error| Error::operation(what, error.to_string()))
}

struct Inputs {
    generated: String,
    generated_format: Format,
    sent: String,
    sent_format: Format,
    dictionary: Dictionary,
}

fn inputs(generated: &Path, sent: &Path, dictionary: Option<&Path>) -> Result<Inputs> {
    let (generated, generated_format) = load(generated, "read generated summary")?;
    let (sent, sent_format) = load(sent, "read sent version")?;
    let dictionary = match dictionary {
        Some(path) => {
            let text = read_text(path, "read dictionary")?;
            Dictionary::new(text.lines())
                .map_err(|error| Error::operation("read dictionary", error.to_string()))?
        }
        None => Dictionary::default(),
    };
    Ok(Inputs {
        generated,
        generated_format,
        sent,
        sent_format,
        dictionary,
    })
}

pub fn run(generated: &Path, sent: &Path, dictionary: Option<&Path>, json: bool) -> Result<()> {
    let report = {
        let i = inputs(generated, sent, dictionary)?;
        measure(
            &i.generated,
            i.generated_format,
            &i.sent,
            i.sent_format,
            &i.dictionary,
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

/// Mesure automatique et mesure de référence (`--gold`) : même version
/// générée, même dictionnaire ; l'écart est `auto − or`, en ‰.
#[derive(Debug, serde::Serialize)]
struct GoldComparison {
    auto: Report,
    gold: Report,
    delta_content_per_mille: Option<f64>,
    delta_lexical_per_mille: Option<f64>,
}

fn delta(auto: Option<f64>, gold: Option<f64>) -> Option<f64> {
    Some(auto? - gold?)
}

fn compare(
    generated: &Path,
    sent: &Path,
    gold: &Path,
    dictionary: Option<&Path>,
) -> Result<GoldComparison> {
    let i = inputs(generated, sent, dictionary)?;
    let (gold_text, gold_format) = load(gold, "read reference sent version")?;
    let run = |sent: &str, format: Format| {
        measure(
            &i.generated,
            i.generated_format,
            sent,
            format,
            &i.dictionary,
        )
        .map_err(|error| Error::operation("measure", error.to_string()))
    };
    let auto = run(&i.sent, i.sent_format)?;
    let gold = run(&gold_text, gold_format)?;
    Ok(GoldComparison {
        delta_content_per_mille: delta(auto.content_per_mille, gold.content_per_mille),
        delta_lexical_per_mille: delta(auto.lexical_per_mille, gold.lexical_per_mille),
        auto,
        gold,
    })
}

pub fn run_gold(
    generated: &Path,
    sent: &Path,
    gold: &Path,
    dictionary: Option<&Path>,
    json: bool,
) -> Result<()> {
    let comparison = compare(generated, sent, gold, dictionary)?;
    if json {
        output::emit(&output::json("mesure", &comparison, None)?);
    } else {
        output::emit(&gold_human(&comparison));
    }
    Ok(())
}

/// Sortie de `--gold` : les lignes habituelles de la mesure automatique, puis
/// celles de la référence préfixées par `gold_`, puis les écarts.
fn gold_human(comparison: &GoldComparison) -> String {
    let gold = human(&comparison.gold)
        .lines()
        .filter(|line| !line.starts_with("section\t"))
        .map(|line| format!("gold_{line}"))
        .collect::<Vec<_>>()
        .join("\n");
    [
        human(&comparison.auto),
        gold,
        format!(
            "delta_content_per_mille\t{}",
            rate(comparison.delta_content_per_mille)
        ),
        format!(
            "delta_lexical_per_mille\t{}",
            rate(comparison.delta_lexical_per_mille)
        ),
    ]
    .join("\n")
}

/// Différences avec leurs extraits, en TSV sur la sortie standard, précédées
/// d'un avertissement sur la sortie d'erreur.
pub fn run_differences(generated: &Path, sent: &Path, dictionary: Option<&Path>) -> Result<()> {
    let list = {
        let i = inputs(generated, sent, dictionary)?;
        differences(
            &i.generated,
            i.generated_format,
            &i.sent,
            i.sent_format,
            &i.dictionary,
        )
        .map_err(|error| Error::operation("measure", error.to_string()))?
    };
    eprintln!("contient des extraits des textes : ne pas partager");
    output::emit(&differences_tsv(&list));
    Ok(())
}

/// Colonnes : `n`, `section` (rang, `-` hors section), `type`, `classe_auto`,
/// `poids`, `genere`, `envoye`, `classe_vraie` (vide, à remplir à la main).
fn differences_tsv(list: &[Difference]) -> String {
    let cell = |text: &str| text.replace(['\t', '\n', '\r'], " ");
    let mut lines =
        vec!["n\tsection\ttype\tclasse_auto\tpoids\tgenere\tenvoye\tclasse_vraie".to_owned()];
    for (n, d) in list.iter().enumerate() {
        let kind = match d.change.kind {
            ChangeKind::Added => "ajout",
            ChangeKind::Deleted => "suppression",
            ChangeKind::Replaced => "remplacement",
        };
        lines.push(format!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t",
            n + 1,
            d.section.map_or_else(|| "-".to_owned(), |s| s.to_string()),
            kind,
            if d.change.lexical { "lexical" } else { "fond" },
            d.change.weight,
            cell(&d.generated),
            cell(&d.sent),
        ));
    }
    lines.join("\n")
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
    fn differences_are_listed_as_tsv_with_an_empty_true_class() {
        let list = differences(
            "# Résumé\n\nLe projet avance avec Martin.\n",
            Format::Markdown,
            "Résumé\nMerci\tAlice. Le projet avance avec Marten.\n",
            Format::Text,
            &Dictionary::default(),
        )
        .unwrap();
        let tsv = differences_tsv(&list);
        let lines: Vec<&str> = tsv.lines().collect();
        assert_eq!(
            lines[0],
            "n\tsection\ttype\tclasse_auto\tpoids\tgenere\tenvoye\tclasse_vraie"
        );
        assert_eq!(lines[1], "1\t0\tajout\tfond\t2\t\tMerci Alice.\t");
        assert_eq!(lines[2], "2\t0\tremplacement\tlexical\t1\tMartin\tMarten\t");
        assert!(lines.iter().all(|l| l.split('\t').count() == 8));
    }

    #[test]
    fn gold_compares_the_automatic_and_the_reference_measure() {
        let dir = tempfile::tempdir().unwrap();
        let generated = dir.path().join("generee.md");
        let sent = dir.path().join("publiee.txt");
        let gold = dir.path().join("propre.md");
        std::fs::write(
            &generated,
            "# Résumé\n\nLe projet avance avec Martin.\n\n## Actions\n\nRelancer Alice.\n",
        )
        .unwrap();
        // Envoyée : cartouche ajouté, titre « Actions » retouché.
        std::fs::write(
            &sent,
            "Réunion du lundi, diffusion interne\nRésumé\nLe projet avance avec Marten.\nSuites\nRelancer Alice.\n",
        )
        .unwrap();
        // Référence nettoyée : cartouche retiré, titre aligné à la main.
        std::fs::write(
            &gold,
            "# Résumé\n\nLe projet avance avec Marten.\n\n## Actions\n\nRelancer Alice.\n",
        )
        .unwrap();
        let comparison = compare(&generated, &sent, &gold, None).unwrap();
        assert_eq!(comparison.gold.total.replaced_lexical, 1);
        assert_eq!(
            comparison.gold.total.added + comparison.gold.total.deleted,
            0
        );
        let gap = comparison.delta_content_per_mille.unwrap();
        assert!(gap > 0.0, "{gap}");
        let text = gold_human(&comparison);
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
        assert!(text.contains("gold_replaced_lexical\t1"));
        assert!(text.contains("delta_content_per_mille\t"));
        assert!(!text.contains("gold_section"));
        assert!(!text.contains("Martin") && !text.contains("diffusion"));
    }

    #[test]
    fn unsupported_files_are_refused_without_reading_them() {
        assert!(load(Path::new("notes.pdf"), "read sent version").is_err());
        assert!(load(Path::new("notes"), "read sent version").is_err());
    }
}
