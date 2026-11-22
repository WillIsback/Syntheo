// Normalisation (spec de mesure de la bêta, §2, étape 1) : retrait du Markdown
// et du HTML, Unicode NFC, espaces fusionnés, ponctuation séparée des mots,
// casse conservée. Les deux lecteurs travaillent ligne à ligne ou par balise,
// sans arbre ni récursion : la profondeur d'imbrication ne compte pas, et ils
// ne résolvent aucune entité externe ni ne font de requête.

use unicode_normalization::UnicodeNormalization;

/// Bloc de texte : un titre ou une ligne de corps.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Block {
    pub heading: bool,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Markdown,
    Html,
    Text,
}

impl Format {
    /// Format d'après l'extension du fichier (`md`, `markdown`, `html`, `htm`,
    /// `txt`) ; `None` pour toute autre extension.
    pub fn from_extension(extension: &str) -> Option<Self> {
        match extension.to_ascii_lowercase().as_str() {
            "md" | "markdown" => Some(Self::Markdown),
            "html" | "htm" => Some(Self::Html),
            "txt" | "text" => Some(Self::Text),
            _ => None,
        }
    }
}

pub(crate) fn blocks(input: &str, format: Format) -> Vec<Block> {
    // Marque d'ordre UTF-8 (BOM) en tête, fréquente sous Windows : retirée.
    let input = input.strip_prefix('\u{feff}').unwrap_or(input);
    let input: String = input.nfc().collect();
    let raw = match format {
        Format::Markdown => markdown_blocks(&input),
        Format::Html => html_blocks(&input),
        Format::Text => input
            .lines()
            .map(|line| Block {
                heading: false,
                text: line.to_owned(),
            })
            .collect(),
    };
    raw.into_iter()
        .map(|block| Block {
            heading: block.heading,
            text: collapse_spaces(&block.text),
        })
        .filter(|block| !block.text.is_empty())
        .collect()
}

fn collapse_spaces(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

// --- Markdown -------------------------------------------------------------

fn markdown_blocks(input: &str) -> Vec<Block> {
    let lines: Vec<&str> = input.lines().collect();
    let mut out = Vec::new();
    let mut in_fence = false;
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim();
        i += 1;
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            out.push(body(line.to_owned()));
            continue;
        }
        if trimmed.is_empty() || is_rule(trimmed) || is_table_separator(trimmed) {
            continue;
        }
        if let Some(text) = atx_heading(trimmed) {
            out.push(Block {
                heading: true,
                text: inline(text),
            });
            continue;
        }
        // Titre souligné (Setext) : `===` ou `---` sous une ligne de texte.
        if let Some(next) = lines.get(i).map(|l| l.trim())
            && !next.is_empty()
            && (next.chars().all(|c| c == '=')
                || (next.len() >= 2 && next.chars().all(|c| c == '-')))
        {
            i += 1;
            out.push(Block {
                heading: true,
                text: inline(strip_block_markers(trimmed)),
            });
            continue;
        }
        let text = strip_block_markers(trimmed).replace('|', " ");
        out.push(body(inline(&text)));
    }
    out
}

fn body(text: String) -> Block {
    Block {
        heading: false,
        text,
    }
}

fn is_rule(line: &str) -> bool {
    let compact: String = line.chars().filter(|c| !c.is_whitespace()).collect();
    compact.len() >= 3
        && ["-", "*", "_"]
            .iter()
            .any(|m| compact.chars().all(|c| c.to_string() == *m))
}

fn is_table_separator(line: &str) -> bool {
    line.contains('-')
        && line
            .chars()
            .all(|c| matches!(c, '|' | '-' | ':' | ' ' | '\t'))
}

fn atx_heading(line: &str) -> Option<&str> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[hashes..];
    if !rest.is_empty() && !rest.starts_with([' ', '\t']) {
        return None;
    }
    Some(rest.trim().trim_end_matches('#').trim())
}

/// Retire citation (`>`), puce ou numéro de liste, et case à cocher.
fn strip_block_markers(line: &str) -> &str {
    let mut rest = line.trim_start();
    loop {
        let before = rest;
        rest = rest.trim_start_matches('>').trim_start();
        for marker in ["- ", "* ", "+ ", "• "] {
            if let Some(after) = rest.strip_prefix(marker) {
                rest = after.trim_start();
            }
        }
        let digits = rest.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits > 0 && digits <= 9 {
            let after = &rest[digits..];
            if let Some(after) = after
                .strip_prefix(". ")
                .or_else(|| after.strip_prefix(") "))
            {
                rest = after.trim_start();
            }
        }
        for checkbox in ["[ ] ", "[x] ", "[X] "] {
            if let Some(after) = rest.strip_prefix(checkbox) {
                rest = after.trim_start();
            }
        }
        if rest == before {
            return rest;
        }
    }
}

/// Mise en forme en ligne : image → texte alternatif, lien → texte du lien,
/// balises HTML retirées, marques d'emphase et de code retirées.
fn inline(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' if i + 1 < chars.len() && chars[i + 1].is_ascii_punctuation() => {
                out.push(chars[i + 1]);
                i += 2;
            }
            '!' if chars.get(i + 1) == Some(&'[') => {
                i += 1;
            }
            '[' => {
                if let Some((label_end, after)) = link_parts(&chars, i) {
                    out.extend(&chars[i + 1..label_end]);
                    i = after;
                } else {
                    out.push(c);
                    i += 1;
                }
            }
            '<' => {
                // Balise HTML ou lien automatique : retiré entièrement.
                match chars[i + 1..].iter().position(|&c| c == '>') {
                    Some(end)
                        if chars
                            .get(i + 1)
                            .is_some_and(|c| c.is_ascii_alphabetic() || *c == '/' || *c == '!') =>
                    {
                        out.push(' ');
                        i += end + 2;
                    }
                    _ => {
                        out.push(c);
                        i += 1;
                    }
                }
            }
            '*' | '`' | '~' => i += 1,
            '_' => {
                let prev = i.checked_sub(1).map(|p| chars[p]);
                let next = chars.get(i + 1).copied();
                // Le souligné interne d'un mot (`snake_case`) est gardé.
                if prev.is_some_and(char::is_alphanumeric)
                    && next.is_some_and(char::is_alphanumeric)
                {
                    out.push(c);
                }
                i += 1;
            }
            _ => {
                out.push(c);
                i += 1;
            }
        }
    }
    out
}

/// `[texte](cible)` à partir de `start` : fin du texte et position après la
/// parenthèse fermante.
fn link_parts(chars: &[char], start: usize) -> Option<(usize, usize)> {
    let label_end = start + 1 + chars[start + 1..].iter().position(|&c| c == ']')?;
    if chars.get(label_end + 1) != Some(&'(') {
        return None;
    }
    let target_end = label_end + 2 + chars[label_end + 2..].iter().position(|&c| c == ')')?;
    Some((label_end, target_end + 1))
}

// --- HTML -----------------------------------------------------------------

const BLOCK_TAGS: &[&str] = &[
    "p",
    "div",
    "br",
    "li",
    "ul",
    "ol",
    "tr",
    "td",
    "th",
    "table",
    "section",
    "article",
    "blockquote",
    "pre",
    "hr",
    "header",
    "footer",
    "dd",
    "dt",
    "figcaption",
];

fn html_blocks(input: &str) -> Vec<Block> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut heading = false;
    let mut skip_until: Option<&'static str> = None;
    let mut rest = input;
    let flush = |out: &mut Vec<Block>, current: &mut String, heading: bool| {
        let text = decode_entities(current);
        for line in text.lines() {
            out.push(Block {
                heading,
                text: line.to_owned(),
            });
        }
        current.clear();
    };
    while let Some(lt) = rest.find('<') {
        if skip_until.is_none() {
            current.push_str(&rest[..lt]);
        }
        rest = &rest[lt..];
        if rest.starts_with("<!--") {
            rest = rest.find("-->").map_or("", |end| &rest[end + 3..]);
            continue;
        }
        let Some(gt) = rest.find('>') else {
            if skip_until.is_none() {
                current.push_str(rest);
            }
            rest = "";
            break;
        };
        let tag = &rest[1..gt];
        rest = &rest[gt + 1..];
        let closing = tag.starts_with('/');
        let name: String = tag
            .trim_start_matches('/')
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();
        if let Some(end) = skip_until {
            if closing && name == end {
                skip_until = None;
            }
            continue;
        }
        match name.as_str() {
            "script" | "style" | "head" | "template" if !closing => {
                skip_until = Some(match name.as_str() {
                    "script" => "script",
                    "style" => "style",
                    "head" => "head",
                    _ => "template",
                });
            }
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                flush(&mut out, &mut current, heading);
                heading = !closing;
            }
            name if BLOCK_TAGS.contains(&name) => flush(&mut out, &mut current, heading),
            _ => current.push(' '),
        }
    }
    if skip_until.is_none() {
        current.push_str(rest);
    }
    flush(&mut out, &mut current, heading);
    out
}

fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        let end = rest[..rest.len().min(12)].find(';');
        let decoded = end.and_then(|end| {
            let entity = &rest[1..end];
            let c = match entity {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some(' '),
                _ => entity
                    .strip_prefix("#x")
                    .or_else(|| entity.strip_prefix("#X"))
                    .and_then(|hex| u32::from_str_radix(hex, 16).ok())
                    .or_else(|| entity.strip_prefix('#').and_then(|dec| dec.parse().ok()))
                    .and_then(char::from_u32),
            };
            c.map(|c| (c, end))
        });
        match decoded {
            Some((c, end)) => {
                out.push(c);
                rest = &rest[end + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

// --- Mots -----------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Token {
    pub text: String,
    pub word: bool,
    /// Premier mot d'un bloc ou d'une phrase : une majuscule n'y signale pas
    /// un nom propre.
    pub sentence_start: bool,
}

/// Mots et signes de ponctuation séparés. L'apostrophe et le trait d'union
/// entre deux lettres restent dans le mot (`l'équipe`, `peut-être`).
pub(crate) fn tokens(text: &str, out: &mut Vec<Token>) {
    let chars: Vec<char> = text.chars().collect();
    let mut sentence_start = true;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c.is_alphanumeric() {
            let start = i;
            while i < chars.len() {
                let c = chars[i];
                let joiner = matches!(c, '\'' | '’' | '-')
                    && chars.get(i + 1).is_some_and(|n| n.is_alphanumeric())
                    && i > start;
                if c.is_alphanumeric() || joiner {
                    i += 1;
                } else {
                    break;
                }
            }
            out.push(Token {
                text: chars[start..i].iter().collect(),
                word: true,
                sentence_start,
            });
            sentence_start = false;
        } else {
            out.push(Token {
                text: c.to_string(),
                word: false,
                sentence_start: false,
            });
            if matches!(c, '.' | '!' | '?' | '…' | ':') {
                sentence_start = true;
            }
            i += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(input: &str, format: Format) -> Vec<(bool, String)> {
        blocks(input, format)
            .into_iter()
            .map(|b| (b.heading, b.text))
            .collect()
    }

    #[test]
    fn markdown_keeps_text_and_headings() {
        let md = "# Résumé\n\nLe **projet** avance, voir [la note](https://x.example/n).\n\n## Décisions\n\n- Valider le *budget* ![schéma](a.png)\n1. Relancer `Alice`\n\n---\n| A | B |\n|---|---|\n| x | y |\nTitre souligné\n====";
        assert_eq!(
            texts(md, Format::Markdown),
            vec![
                (true, "Résumé".into()),
                (false, "Le projet avance, voir la note.".into()),
                (true, "Décisions".into()),
                (false, "Valider le budget schéma".into()),
                (false, "Relancer Alice".into()),
                (false, "A B".into()),
                (false, "x y".into()),
                (true, "Titre souligné".into()),
            ]
        );
    }

    #[test]
    fn html_keeps_text_and_headings_without_scripts() {
        let html = "<html><head><title>t</title></head><body><h2>Actions</h2><p>Relancer &amp; <b>valider</b>&nbsp;le&#32;devis</p><script>alert(1)</script><!-- note --><ul><li>Point&#x21;</li></ul></body></html>";
        assert_eq!(
            texts(html, Format::Html),
            vec![
                (true, "Actions".into()),
                (false, "Relancer & valider le devis".into()),
                (false, "Point!".into()),
            ]
        );
    }

    #[test]
    fn deep_nesting_is_read_without_recursion() {
        let depth = 100_000;
        let html = format!("{}texte{}", "<div>".repeat(depth), "</div>".repeat(depth));
        assert_eq!(texts(&html, Format::Html), vec![(false, "texte".into())]);
        let md = format!("{} citation", ">".repeat(depth));
        assert_eq!(
            texts(&md, Format::Markdown),
            vec![(false, "citation".into())]
        );
    }

    #[test]
    fn punctuation_is_split_and_elisions_kept() {
        let mut out = Vec::new();
        tokens("L'équipe valide. Peut-être, demain : OK?", &mut out);
        let words: Vec<_> = out
            .iter()
            .map(|t| (t.text.as_str(), t.word, t.sentence_start))
            .collect();
        assert_eq!(
            words,
            vec![
                ("L'équipe", true, true),
                ("valide", true, false),
                (".", false, false),
                ("Peut-être", true, true),
                (",", false, false),
                ("demain", true, false),
                (":", false, false),
                ("OK", true, true),
                ("?", false, false),
            ]
        );
    }

    #[test]
    fn utf8_bom_is_ignored() {
        assert_eq!(
            texts("\u{feff}# Résumé\nTexte", Format::Markdown),
            vec![(true, "Résumé".into()), (false, "Texte".into())]
        );
    }

    #[test]
    fn unicode_is_normalized_to_nfc() {
        let decomposed = "e\u{301}quipe";
        assert_eq!(
            texts(decomposed, Format::Text),
            vec![(false, "équipe".into())]
        );
    }
}
