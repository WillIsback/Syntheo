// Corpus synthétique versionné et tests de propriétés (issue 734). Les
// comptes rendus de `corpus/` sont fictifs ; ils sont rendus ici en
// Markdown, HTML (UTF-8, entités nommées, décimales et hexadécimales), texte
// et `.docx`, puis mesurés contre leur Markdown d'origine.

use sha2::{Digest, Sha256};

use super::*;
use crate::docx::tests::{document, zip_with};

const CORPUS: [(&str, &str); 5] = [
    (
        "comite-pilotage",
        include_str!("../corpus/comite-pilotage.md"),
    ),
    (
        "atelier-donnees",
        include_str!("../corpus/atelier-donnees.md"),
    ),
    ("board-review", include_str!("../corpus/board-review.md")),
    // Tableau d'actions, avec des valeurs répétées que les rendus « fusionné »
    // regroupent en cellules fusionnées (issue 731).
    (
        "revue-chantier",
        include_str!("../corpus/revue-chantier.md"),
    ),
    // Titre du document repris tel quel par une ligne du corps : une copie
    // identique ne compte aucune retouche (règle v4, issue 767).
    (
        "jardin-partage",
        include_str!("../corpus/jardin-partage.md"),
    ),
];

/// Documents du corpus des garde-fous, figé à `GUARD_VERSION` 1 : les
/// documents et les rendus ajoutés ensuite entrent dans l'empreinte de la
/// règle, pas dans celle des garde-fous, dont aucun seuil n'a changé.
const GUARD_CORPUS_LEN: usize = 3;
const GUARD_RENDERINGS: [&str; 7] = [
    "markdown",
    "html",
    "html-named",
    "html-decimal",
    "html-hex",
    "text",
    "docx",
];

const FINGERPRINTS: &str = include_str!("../corpus/FINGERPRINTS");

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Title,
    Heading,
    Bullet,
    Paragraph,
    /// Rangée de tableau ; la première d'un tableau est l'en-tête.
    Row,
    /// Ligne de séparation sous l'en-tête (`| --- |`), Markdown seulement.
    Separator,
}

struct Line {
    kind: Kind,
    text: String,
}

/// Sous-ensemble du Markdown du corpus : `#`, `##`, `- `, paragraphes,
/// tableaux (`| a | b |`, une ligne de séparation sous l'en-tête).
fn parse(markdown: &str) -> Vec<Line> {
    markdown
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let (kind, text) = if line.starts_with('|') {
                let separator = line.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '));
                (
                    if separator {
                        Kind::Separator
                    } else {
                        Kind::Row
                    },
                    line,
                )
            } else if let Some(text) = line.strip_prefix("## ") {
                (Kind::Heading, text)
            } else if let Some(text) = line.strip_prefix("# ") {
                (Kind::Title, text)
            } else if let Some(text) = line.strip_prefix("- ") {
                (Kind::Bullet, text)
            } else {
                (Kind::Paragraph, line)
            };
            Line {
                kind,
                text: text.to_owned(),
            }
        })
        .collect()
}

fn to_markdown(lines: &[Line]) -> String {
    let mut out = String::new();
    for (i, line) in lines.iter().enumerate() {
        let prefix = match line.kind {
            Kind::Title => "# ",
            Kind::Heading => "## ",
            Kind::Bullet => "- ",
            Kind::Paragraph | Kind::Row | Kind::Separator => "",
        };
        out.push_str(prefix);
        out.push_str(&line.text);
        // Les lignes d'un tableau se suivent sans ligne vide.
        let in_table =
            |l: Option<&Line>| l.is_some_and(|l| matches!(l.kind, Kind::Row | Kind::Separator));
        if in_table(Some(line)) && in_table(lines.get(i + 1)) {
            out.push('\n');
        } else {
            out.push_str("\n\n");
        }
    }
    out
}

fn cells(row: &str) -> Vec<String> {
    row.trim()
        .trim_start_matches('|')
        .trim_end_matches('|')
        .split('|')
        .map(|cell| cell.trim().to_owned())
        .collect()
}

/// Cellules d'un tableau, et pour chacune sa fusion : `Some((rangées,
/// colonnes))` pour la cellule d'origine, `None` pour une cellule couverte.
/// Sans fusion, chaque cellule couvre une rangée et une colonne ; avec, les
/// valeurs identiques voisines sont regroupées, hors en-tête : d'abord sur la
/// rangée, puis vers le bas tant que toutes les colonnes couvertes répètent
/// la même valeur.
type Grid = Vec<Vec<(String, Option<(usize, usize)>)>>;

fn grid(rows: &[&Line], merged: bool) -> Grid {
    let values: Vec<Vec<String>> = rows.iter().map(|r| cells(&r.text)).collect();
    let mut grid: Grid = values
        .iter()
        .map(|row| row.iter().map(|v| (v.clone(), Some((1, 1)))).collect())
        .collect();
    if !merged {
        return grid;
    }
    for i in 1..values.len() {
        for j in 0..values[i].len() {
            if grid[i][j].1.is_none() {
                continue;
            }
            let value = &values[i][j];
            let mut columns = 1;
            while values[i].get(j + columns) == Some(value) && grid[i][j + columns].1.is_some() {
                columns += 1;
            }
            let mut rows_spanned = 1;
            while i + rows_spanned < values.len()
                && (j..j + columns).all(|c| {
                    values[i + rows_spanned].get(c) == Some(value)
                        && grid[i + rows_spanned][c].1.is_some()
                })
            {
                rows_spanned += 1;
            }
            for row in &mut grid[i..i + rows_spanned] {
                for cell in &mut row[j..j + columns] {
                    cell.1 = None;
                }
            }
            grid[i][j].1 = Some((rows_spanned, columns));
        }
    }
    grid
}

/// Groupes de lignes consécutives : un tableau entier, ou une autre ligne.
fn groups(lines: &[Line]) -> Vec<Vec<&Line>> {
    let mut out: Vec<Vec<&Line>> = Vec::new();
    for line in lines {
        let table = matches!(line.kind, Kind::Row | Kind::Separator);
        let previous_table = out
            .last()
            .and_then(|g| g.last())
            .is_some_and(|l| matches!(l.kind, Kind::Row | Kind::Separator));
        if table && previous_table {
            out.last_mut().unwrap().push(line);
        } else {
            out.push(vec![line]);
        }
    }
    out
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Entité nommée d'un caractère, la plus courte de la table HTML5.
fn named_entity(c: char) -> String {
    let target = c.to_string();
    crate::entities::NAMED_ENTITIES
        .iter()
        .filter(|(_, value)| *value == target)
        .map(|(name, _)| *name)
        .min_by_key(|name| (name.len(), *name))
        .map_or_else(|| format!("&#{};", c as u32), |name| format!("&{name};"))
}

#[derive(Clone, Copy)]
enum Encoding {
    Utf8,
    Named,
    Decimal,
    Hex,
}

fn to_html(lines: &[Line], encoding: Encoding, merged: bool) -> String {
    let encode = |text: &str| -> String {
        escape(text)
            .chars()
            .map(|c| match (c.is_ascii(), encoding) {
                (true, _) | (_, Encoding::Utf8) => c.to_string(),
                (_, Encoding::Named) => named_entity(c),
                (_, Encoding::Decimal) => format!("&#{};", c as u32),
                (_, Encoding::Hex) => format!("&#x{:X};", c as u32),
            })
            .collect()
    };
    let mut out = String::from("<html><body>");
    let mut in_list = false;
    for group in groups(lines) {
        let line = group[0];
        if in_list && line.kind != Kind::Bullet {
            out.push_str("</ul>");
            in_list = false;
        }
        if line.kind == Kind::Row {
            let rows: Vec<&Line> = group.into_iter().filter(|l| l.kind == Kind::Row).collect();
            out.push_str("<table>\n");
            for (i, row) in grid(&rows, merged).into_iter().enumerate() {
                out.push_str("<tr>");
                let cell = if i == 0 { "th" } else { "td" };
                for (value, span) in row {
                    let Some((rows_spanned, columns)) = span else {
                        continue;
                    };
                    let mut attributes = String::new();
                    if rows_spanned > 1 {
                        attributes.push_str(&format!(" rowspan=\"{rows_spanned}\""));
                    }
                    if columns > 1 {
                        attributes.push_str(&format!(" colspan={columns}"));
                    }
                    out.push_str(&format!("<{cell}{attributes}>{}</{cell}>", encode(&value)));
                }
                out.push_str("</tr>\n");
            }
            out.push_str("</table>\n");
            continue;
        }
        let text = encode(&line.text);
        match line.kind {
            Kind::Title => out.push_str(&format!("<h1>{text}</h1>\n")),
            Kind::Heading => out.push_str(&format!("<h2>{text}</h2>\n")),
            Kind::Paragraph => out.push_str(&format!("<p>{text}</p>\n")),
            Kind::Bullet => {
                if !in_list {
                    out.push_str("<ul>");
                    in_list = true;
                }
                out.push_str(&format!("<li>{text}</li>\n"));
            }
            Kind::Row | Kind::Separator => unreachable!("tableau rendu plus haut"),
        }
    }
    if in_list {
        out.push_str("</ul>");
    }
    out.push_str("</body></html>");
    out
}

/// Texte brut collé : titres sans mise en forme, puces sans marque,
/// cellules d'une rangée séparées par une tabulation.
fn to_text(lines: &[Line]) -> String {
    lines
        .iter()
        .filter(|line| line.kind != Kind::Separator)
        .map(|line| match line.kind {
            Kind::Row => cells(&line.text).join("\t"),
            _ => line.text.clone(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn to_docx(lines: &[Line], merged: bool) -> String {
    let mut body = String::new();
    for group in groups(lines) {
        let line = group[0];
        if line.kind != Kind::Row {
            let style = match line.kind {
                Kind::Title | Kind::Heading => "Heading1",
                _ => "",
            };
            let xml = document(&[(style, &escape(&line.text))]);
            body.push_str(paragraphs_of(&xml));
            continue;
        }
        let rows: Vec<&Line> = group.into_iter().filter(|l| l.kind == Kind::Row).collect();
        body.push_str(&docx_table(&grid(&rows, merged)));
    }
    let xml = document(&[]).replace("</w:body>", &format!("{body}</w:body>"));
    docx_to_html(&zip_with("word/document.xml", xml.as_bytes(), true)).unwrap()
}

/// Paragraphes `<w:p>` d'un document produit par `document`.
fn paragraphs_of(xml: &str) -> &str {
    let start = xml.find("<w:body>").unwrap() + "<w:body>".len();
    let end = xml.rfind("</w:body>").unwrap();
    &xml[start..end]
}

/// Tableau Word : l'en-tête en style de titre (piège : une cellule n'ouvre
/// jamais de section), `w:gridSpan` et `w:vMerge` pour les fusions ; chaque
/// cellule couverte par une fusion verticale est présente, vide, comme dans
/// Word.
fn docx_table(grid: &Grid) -> String {
    let mut xml = String::from("<w:tbl><w:tblPr/>");
    // Fusion verticale encore ouverte, par colonne : colonne de sa cellule
    // d'origine et dernière rangée couverte.
    let mut open: Vec<Option<(usize, usize)>> = vec![None; grid.first().map_or(0, Vec::len)];
    for (i, row) in grid.iter().enumerate() {
        xml.push_str("<w:tr>");
        let mut j = 0;
        while j < row.len() {
            let (value, span) = &row[j];
            let (columns, properties, text) = match span {
                Some((rows_spanned, columns)) => {
                    let mut properties = String::new();
                    if *columns > 1 {
                        properties.push_str(&format!(r#"<w:gridSpan w:val="{columns}"/>"#));
                    }
                    if *rows_spanned > 1 {
                        properties.push_str(r#"<w:vMerge w:val="restart"/>"#);
                        for slot in &mut open[j..j + columns] {
                            *slot = Some((j, i + rows_spanned - 1));
                        }
                    }
                    (*columns, properties, escape(value))
                }
                None => {
                    // Couverte : par une fusion verticale (cellule vide
                    // `w:vMerge`), sinon par la cellule de gauche (sautée).
                    if open[j].is_some_and(|(_, last)| i <= last) {
                        let columns = (j + 1..row.len())
                            .take_while(|&c| row[c].1.is_none() && open[c] == open[j])
                            .count()
                            + 1;
                        let mut properties = String::from("<w:vMerge/>");
                        if columns > 1 {
                            properties = format!(r#"<w:gridSpan w:val="{columns}"/>{properties}"#);
                        }
                        (columns, properties, String::new())
                    } else {
                        j += 1;
                        continue;
                    }
                }
            };
            let style = if i == 0 {
                r#"<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>"#
            } else {
                ""
            };
            xml.push_str(&format!(
                r#"<w:tc><w:tcPr>{properties}</w:tcPr><w:p>{style}<w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p></w:tc>"#
            ));
            j += columns;
        }
        xml.push_str("</w:tr>");
    }
    xml.push_str("</w:tbl>");
    xml
}

/// Toutes les formes d'un même texte : (nom, texte, format).
fn renderings(markdown: &str) -> Vec<(&'static str, String, Format)> {
    let lines = parse(markdown);
    vec![
        ("markdown", to_markdown(&lines), Format::Markdown),
        ("html", to_html(&lines, Encoding::Utf8, false), Format::Html),
        (
            "html-named",
            to_html(&lines, Encoding::Named, false),
            Format::Html,
        ),
        (
            "html-decimal",
            to_html(&lines, Encoding::Decimal, false),
            Format::Html,
        ),
        (
            "html-hex",
            to_html(&lines, Encoding::Hex, false),
            Format::Html,
        ),
        ("text", to_text(&lines), Format::Text),
        ("docx", to_docx(&lines, false), Format::Html),
        // Cellules fusionnées (issue 731) : valeurs répétées regroupées.
        (
            "html-merged",
            to_html(&lines, Encoding::Utf8, true),
            Format::Html,
        ),
        ("docx-merged", to_docx(&lines, true), Format::Html),
    ]
}

fn report(generated: &str, sent: &str, format: Format) -> Report {
    measure(
        generated,
        Format::Markdown,
        sent,
        format,
        &Dictionary::default(),
    )
    .unwrap()
}

fn zero(generated: u64) -> Counters {
    Counters {
        generated,
        ..Counters::default()
    }
}

/// Retouches typographiques seules : apostrophes et guillemets courbes,
/// espaces insécables et fines, trait d'union insécable, trait d'union
/// conditionnel et espace sans chasse au milieu des mots longs.
fn typographic(markdown: &str) -> String {
    let mut out = String::new();
    for line in markdown.lines() {
        let line = line
            .replace('\'', "\u{2019}")
            .replace(" ;", "\u{202f};")
            .replace(" :", "\u{a0}:")
            .replace(" %", "\u{202f}%");
        let chars: Vec<char> = line.chars().collect();
        let mut word_len = 0;
        for (i, c) in chars.iter().enumerate() {
            let joined_hyphen = *c == '-'
                && i > 0
                && chars[i - 1].is_alphabetic()
                && chars.get(i + 1).is_some_and(|n| n.is_alphabetic());
            out.push(if joined_hyphen { '\u{2011}' } else { *c });
            word_len = if c.is_alphabetic() { word_len + 1 } else { 0 };
            if word_len == 4 && chars.get(i + 4).is_some_and(|n| n.is_alphabetic()) {
                out.push('\u{ad}');
            }
        }
        out.push('\n');
    }
    out
}

/// Un mot du premier titre de section corrigé d'une lettre.
fn title_typo(markdown: &str) -> String {
    let mut done = false;
    markdown
        .lines()
        .map(|line| {
            let Some(title) = line.strip_prefix("## ").filter(|_| !done) else {
                return line.to_owned();
            };
            done = true;
            let mut words: Vec<String> = title.split(' ').map(str::to_owned).collect();
            let word = words
                .iter_mut()
                .rev()
                .find(|w| w.chars().count() >= 6 && w.chars().all(char::is_alphabetic))
                .expect("un mot de 6 lettres dans le titre");
            let mut chars: Vec<char> = word.chars().collect();
            chars[2] = if chars[2] == 'x' { 'z' } else { 'x' };
            *word = chars.into_iter().collect();
            format!("## {}", words.join(" "))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Dernière section supprimée (titre et corps).
fn without_last_section(markdown: &str) -> String {
    let at = markdown.rfind("\n## ").expect("au moins une section");
    markdown[..at].to_owned()
}

/// Retouches injectées : dans le premier paragraphe, un nom propre corrigé
/// d'une lettre suivi d'un nom ajouté (remplacement mixte) ; un mot ajouté
/// dans la première puce, une puce ajoutée, la deuxième puce supprimée.
fn injected(markdown: &str) -> String {
    let mut bullets = 0;
    let mut paragraph_done = false;
    let mut out = Vec::new();
    for line in markdown.lines() {
        let is_paragraph = !line.is_empty() && !line.starts_with('#') && !line.starts_with("- ");
        if is_paragraph && !paragraph_done {
            paragraph_done = true;
            let mut words: Vec<String> = line.split(' ').map(str::to_owned).collect();
            let at = words
                .iter()
                .enumerate()
                .skip(1)
                .find(|(_, w)| {
                    w.chars().count() >= 6
                        && w.chars().next().is_some_and(char::is_uppercase)
                        && w.chars().all(char::is_alphabetic)
                })
                .map(|(i, _)| i)
                .expect("un nom propre dans le premier paragraphe");
            let mut chars: Vec<char> = words[at].chars().collect();
            let last = chars.len() - 1;
            chars[last] = if chars[last] == 'x' { 'z' } else { 'x' };
            words[at] = format!("{} Durandeau", chars.into_iter().collect::<String>());
            out.push(words.join(" "));
            continue;
        }
        if let Some(text) = line.strip_prefix("- ") {
            bullets += 1;
            match bullets {
                1 => {
                    let (head, last) = text.rsplit_once(' ').unwrap();
                    out.push(format!("- {head} Zéphyrine {last}"));
                    out.push("- Point ajouté en séance par Ilona Brévin.".to_owned());
                    continue;
                }
                2 => continue,
                _ => {}
            }
        }
        out.push(line.to_owned());
    }
    out.join("\n")
}

#[test]
fn the_same_content_in_every_format_gives_no_rework() {
    for (name, markdown) in CORPUS {
        let generated = report(markdown, markdown, Format::Markdown).total.generated;
        assert!(generated > 50, "{name}");
        for (format, sent, sent_format) in renderings(markdown) {
            let r = report(markdown, &sent, sent_format);
            assert!(r.aligned, "{name} {format}");
            assert_eq!(r.headings_matched, r.headings_generated, "{name} {format}");
            assert_eq!(r.total, zero(generated), "{name} {format}");
        }
    }
}

#[test]
fn typographic_changes_alone_give_no_rework() {
    for (name, markdown) in CORPUS {
        let generated = report(markdown, markdown, Format::Markdown).total.generated;
        let edited = typographic(markdown);
        assert_ne!(edited, markdown, "{name}");
        for (format, sent, sent_format) in renderings(&edited) {
            let r = report(markdown, &sent, sent_format);
            assert_eq!(r.total, zero(generated), "{name} {format}");
        }
    }
}

// Dans tous les formats, texte brut compris : une ligne corrigée d'un mot
// face à un titre généré pas encore retrouvé ouvre une section (issue 730).
#[test]
fn a_title_corrected_by_one_word_counts_one_word() {
    for (name, markdown) in CORPUS {
        let generated = report(markdown, markdown, Format::Markdown).total.generated;
        for (format, sent, sent_format) in renderings(&title_typo(markdown)) {
            let r = report(markdown, &sent, sent_format);
            assert!(r.sections.iter().all(|s| s.matched), "{name} {format}");
            assert_eq!(r.total.added + r.total.deleted, 0, "{name} {format}");
            assert_eq!(
                r.total.replaced_content + r.total.replaced_lexical,
                1,
                "{name} {format}"
            );
            assert_eq!(r.total.generated, generated, "{name} {format}");
        }
    }
}

#[test]
fn a_deleted_section_always_counts_as_deleted() {
    for (name, markdown) in CORPUS {
        let full = report(markdown, markdown, Format::Markdown);
        let last = full.sections.last().unwrap().counters.generated;
        for (format, sent, sent_format) in renderings(&without_last_section(markdown)) {
            let r = report(markdown, &sent, sent_format);
            assert!(!r.sections.last().unwrap().matched, "{name} {format}");
            assert_eq!(
                r.total,
                Counters {
                    deleted: last,
                    ..zero(full.total.generated)
                },
                "{name} {format}"
            );
        }
    }
}

// Sensibilité : sans elle, une normalisation qui effacerait tout passerait
// les tests d'invariance.
#[test]
fn injected_edits_give_the_same_counters_in_every_format() {
    for (name, markdown) in CORPUS {
        let edited = injected(markdown);
        let reference = report(markdown, &edited, Format::Markdown).total;
        assert!(
            reference.added + reference.deleted + reference.replaced_content > 0,
            "{name}"
        );
        for (format, sent, sent_format) in renderings(&edited) {
            assert_eq!(
                report(markdown, &sent, sent_format).total,
                reference,
                "{name} {format}"
            );
        }
    }
}

// Garde-fous sur le corpus (issue 733) : le même contenu, les retouches
// typographiques et un titre corrigé restent « ok » ; une section supprimée
// est signalée, sans refus.
#[test]
fn corpus_statuses_follow_the_guards() {
    for (name, markdown) in CORPUS {
        for (scenario, sent) in [
            ("identite", markdown.to_owned()),
            ("typographie", typographic(markdown)),
            ("titre", title_typo(markdown)),
            ("retouches", injected(markdown)),
        ] {
            for (format, text, sent_format) in renderings(&sent) {
                let r = report(markdown, &text, sent_format);
                assert_eq!(r.status, MeasureStatus::Ok, "{name} {scenario} {format}");
                assert!(r.status_reasons.is_empty(), "{name} {scenario} {format}");
                assert_eq!(
                    r.controls.residual_entities, 0,
                    "{name} {scenario} {format}"
                );
            }
        }
        let r = report(markdown, &title_typo(markdown), Format::Markdown);
        assert_eq!(r.controls.sections_matched_near, 1, "{name}");
        let r = report(markdown, &without_last_section(markdown), Format::Markdown);
        assert_ne!(r.status, MeasureStatus::Refused, "{name}");
        assert_eq!(
            r.controls.deleted_section_words,
            r.sections.last().unwrap().counters.generated,
            "{name}"
        );
    }
}

/// Partie « calcul » d'un rapport, liée à `RULE_VERSION` : compteurs,
/// alignement et sections. Les garde-fous (statut, raisons, contrôles) ont
/// leur propre empreinte, liée à `GUARD_VERSION` (issue 733).
fn calculation(r: &Report) -> String {
    serde_json::json!({
        "aligned": r.aligned,
        "headings_generated": r.headings_generated,
        "headings_matched": r.headings_matched,
        "total": r.total,
        "sections": r.sections,
        "unmatched_sent_words": r.unmatched_sent_words,
    })
    .to_string()
}

/// Partie « garde-fous » d'un rapport, liée à `GUARD_VERSION`.
fn guards(r: &Report) -> String {
    serde_json::json!({
        "status": r.status,
        "status_reasons": r.status_reasons,
        "controls": r.controls,
    })
    .to_string()
}

/// Empreinte SHA-256 d'une projection des rapports du corpus, dans un ordre
/// fixe : chaque scénario en Markdown, et les retouches injectées dans
/// chaque format. `guards_only` restreint au corpus figé des garde-fous
/// (documents et rendus de `GUARD_VERSION` 1).
fn corpus_fingerprint(project: fn(&Report) -> String, guards_only: bool) -> String {
    let mut lines = Vec::new();
    let documents = if guards_only {
        &CORPUS[..GUARD_CORPUS_LEN]
    } else {
        &CORPUS[..]
    };
    for &(name, markdown) in documents {
        let scenarios = [
            ("identite", markdown.to_owned()),
            ("typographie", typographic(markdown)),
            ("titre", title_typo(markdown)),
            ("section", without_last_section(markdown)),
            ("retouches", injected(markdown)),
        ];
        for (scenario, sent) in scenarios {
            let r = report(markdown, &sent, Format::Markdown);
            lines.push(format!("{name}\t{scenario}\t{}", project(&r)));
        }
        for (format, sent, sent_format) in renderings(&injected(markdown)) {
            if guards_only && !GUARD_RENDERINGS.contains(&format) {
                continue;
            }
            let r = report(markdown, &sent, sent_format);
            lines.push(format!("{name}\tretouches-{format}\t{}", project(&r)));
        }
    }
    Sha256::digest(lines.join("\n").as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Lignes `<genre> <version>\t<empreinte>` de `corpus/FINGERPRINTS` pour un
/// genre (`rule` ou `guard`) : versions croissantes, empreintes distinctes.
fn recorded(kind: &str) -> Vec<(u32, &'static str)> {
    let lines: Vec<(u32, &str)> = FINGERPRINTS
        .lines()
        .filter(|line| !line.starts_with('#') && !line.trim().is_empty())
        .filter_map(|line| {
            let (label, hash) = line
                .split_once('\t')
                .expect("<genre> <version><TAB>empreinte");
            let (genre, version) = label.split_once(' ').expect("<genre> <version>");
            (genre == kind).then(|| (version.parse().expect("version entière"), hash))
        })
        .collect();
    assert!(lines.windows(2).all(|w| w[0].0 < w[1].0), "{kind}");
    let mut hashes: Vec<&str> = lines.iter().map(|(_, hash)| *hash).collect();
    hashes.sort_unstable();
    hashes.dedup();
    assert_eq!(
        hashes.len(),
        lines.len(),
        "{kind} : deux versions, une même empreinte"
    );
    lines
}

fn assert_fingerprint(kind: &str, constant: &str, version: u32, fingerprint: &str) {
    let current = recorded(kind)
        .into_iter()
        .find(|(v, _)| *v == version)
        .map(|(_, hash)| hash);
    assert_eq!(
        current,
        Some(fingerprint),
        "Les sorties du corpus ne correspondent pas à {constant} = {version}. \
         Si elles devaient changer : incrémentez {constant}, datez la spec, puis ajoutez \
         la ligne « {kind} {}\\t{fingerprint} » à corpus/FINGERPRINTS. Ne modifiez \
         jamais une ligne existante.",
        version + u32::from(current.is_some())
    );
}

// Toute sortie du calcul modifiée exige une nouvelle version de la règle
// (stratégie de mesure v2, principe 5) : la CI échoue si les compteurs du
// corpus changent sans ligne `rule <RULE_VERSION>` correspondante.
#[test]
fn corpus_outputs_match_the_rule_version_fingerprint() {
    assert_fingerprint(
        "rule",
        "RULE_VERSION",
        RULE_VERSION,
        &corpus_fingerprint(calculation, false),
    );
}

// Les statuts, raisons et contrôles du corpus sont liés à `GUARD_VERSION`
// (issue 733) : régler un seuil change cette version, pas la règle.
#[test]
fn corpus_guards_match_the_guard_version_fingerprint() {
    assert_fingerprint(
        "guard",
        "GUARD_VERSION",
        GUARD_VERSION,
        &corpus_fingerprint(guards, true),
    );
}
