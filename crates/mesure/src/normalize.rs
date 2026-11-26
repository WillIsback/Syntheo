// Normalisation (spec de mesure de la bêta, §2, étape 1) : retrait du Markdown
// et du HTML, entités HTML5 décodées, Unicode NFC, caractères invisibles
// retirés, espaces fusionnées, ponctuation séparée des mots, casse conservée.
// Les deux lecteurs travaillent ligne à ligne ou par balise, sans arbre ni
// récursion : la profondeur d'imbrication ne compte pas, et ils ne résolvent
// aucune entité externe ni ne font de requête.
//
// Chaque mot porte deux formes (issue 729) : le texte d'origine, pour la
// détection des majuscules et l'affichage, et une clé de comparaison (NFKC,
// apostrophes, guillemets et tirets typographiques repliés) que lit le diff.

use unicode_normalization::UnicodeNormalization;

use crate::entities::{LEGACY_ENTITIES, NAMED_ENTITIES};

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
    let raw = match format {
        Format::Markdown => markdown_blocks(input),
        Format::Html => html_blocks(input),
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
            text: collapse_spaces(&clean(&block.text)),
        })
        .filter(|block| !block.text.is_empty())
        .collect()
}

fn collapse_spaces(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// NFC, après le décodage des entités (`e&#x301;`), et retrait des
/// caractères invisibles qui couperaient un mot : espace sans chasse
/// (U+200B), trait d'union conditionnel (U+00AD), gluon (U+2060) et
/// U+FEFF hors tête de texte.
fn clean(text: &str) -> String {
    text.nfc()
        .filter(|c| !matches!(c, '\u{200b}' | '\u{ad}' | '\u{2060}' | '\u{feff}'))
        .collect()
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

/// Prochaine position de `target` à partir de `from`, sans rebalayer : les
/// recherches se font à positions croissantes, et un résultat reste valable
/// tant que `from` ne l'a pas dépassé (temps linéaire sur la ligne, revue du
/// lot 0.8.0, constat 15).
struct NextIndex {
    target: char,
    searched_from: usize,
    found: Option<Option<usize>>,
}

impl NextIndex {
    fn new(target: char) -> Self {
        Self {
            target,
            searched_from: 0,
            found: None,
        }
    }

    fn after(&mut self, chars: &[char], from: usize) -> Option<usize> {
        if let Some(found) = self.found
            && from >= self.searched_from
            && found.is_none_or(|at| at >= from)
        {
            return found;
        }
        let found = chars
            .get(from..)
            .and_then(|rest| rest.iter().position(|&c| c == self.target))
            .map(|offset| from + offset);
        self.searched_from = from;
        self.found = Some(found);
        found
    }
}

/// Mise en forme en ligne : image → texte alternatif, lien → texte du lien,
/// balises HTML retirées, marques d'emphase et de code retirées.
fn inline(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut close_bracket = NextIndex::new(']');
    let mut close_paren = NextIndex::new(')');
    let mut close_angle = NextIndex::new('>');
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
                let link = close_bracket.after(&chars, i + 1).and_then(|label_end| {
                    if chars.get(label_end + 1) != Some(&'(') {
                        return None;
                    }
                    let target_end = close_paren.after(&chars, label_end + 2)?;
                    Some((label_end, target_end + 1))
                });
                if let Some((label_end, after)) = link {
                    out.extend(&chars[i + 1..label_end]);
                    i = after;
                } else {
                    out.push(c);
                    i += 1;
                }
            }
            '&' => {
                // Entité HTML (CommonMark la décode aussi dans le texte) : au
                // plus `MAX_ENTITY_CHARS` caractères lus, temps linéaire.
                let window: String = chars[i..chars.len().min(i + MAX_ENTITY_CHARS)]
                    .iter()
                    .collect();
                match entity_at(&window) {
                    Some((decoded, len)) => {
                        out.push_str(&decoded);
                        i += window[..len].chars().count();
                    }
                    None => {
                        out.push(c);
                        i += 1;
                    }
                }
            }
            '<' if chars
                .get(i + 1)
                .is_some_and(|c| c.is_ascii_alphabetic() || *c == '/' || *c == '!') =>
            {
                // Balise HTML ou lien automatique : retiré entièrement. Une
                // balise en ligne (`<b>`, `<span>`) ne sépare pas deux mots ;
                // un retour à la ligne ou une balise de bloc, si.
                match close_angle.after(&chars, i + 1) {
                    Some(end) => {
                        let name: String = chars[i + 1..end]
                            .iter()
                            .skip_while(|c| **c == '/')
                            .take_while(|c| c.is_ascii_alphanumeric())
                            .collect();
                        if separates_words(&name.to_ascii_lowercase()) {
                            out.push(' ');
                        }
                        i = end + 1;
                    }
                    None => {
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

// --- HTML -----------------------------------------------------------------

/// Balises de bloc : chacune ferme le bloc en cours. Les autres balises
/// (en ligne) n'insèrent rien, `<br>` excepté, lu comme une espace.
const BLOCK_TAGS: &[&str] = &[
    "address",
    "article",
    "aside",
    "blockquote",
    "body",
    "caption",
    "dd",
    "details",
    "dialog",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "header",
    "hgroup",
    "hr",
    "legend",
    "li",
    "main",
    "nav",
    "ol",
    "option",
    "p",
    "pre",
    "section",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
];

/// Une balise qui sépare deux mots : retour à la ligne, titre ou bloc.
fn separates_words(name: &str) -> bool {
    matches!(name, "br" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6") || BLOCK_TAGS.contains(&name)
}

/// Nombre maximal de colonnes (`colspan`) ou de rangées (`rowspan`) couvertes
/// par une cellule ; HTML en permet 1 000 et 65 534.
const MAX_HTML_SPAN: usize = 1000;

/// Tableau HTML en cours de lecture (issue 731). Une rangée (`<tr>`) donne
/// un seul bloc, ses cellules dans l'ordre et séparées par une espace, comme
/// une ligne de tableau Markdown. Une cellule fusionnée (`rowspan`,
/// `colspan`) est recopiée dans chaque rangée et chaque colonne qu'elle
/// couvre, comme le tableau Markdown généré, qui répète la valeur.
#[derive(Default)]
struct HtmlTable {
    /// Profondeur des `<table>` : un tableau imbriqué dans une cellule n'est
    /// lu que comme du texte de cette cellule.
    depth: usize,
    in_row: bool,
    /// Texte brut (entités non décodées) de la cellule ouverte.
    cell: Option<String>,
    span: (usize, usize),
    row: Vec<String>,
    /// Cellules des rangées précédentes qui couvrent encore des rangées :
    /// par colonne, rangées restantes et texte.
    carried: Vec<Option<(usize, String)>>,
    /// Caractères encore recopiables : un tableau aux fusions démesurées ne
    /// fait pas exploser la mémoire, ses copies s'arrêtent là.
    copy_budget: usize,
}

impl HtmlTable {
    fn copy(&mut self, text: &str) -> String {
        if text.len() <= self.copy_budget {
            self.copy_budget -= text.len();
            text.to_owned()
        } else {
            String::new()
        }
    }

    /// Recopie les cellules des rangées précédentes qui couvrent la colonne
    /// courante (et les suivantes, tant qu'elles se suivent).
    fn fill_carried(&mut self) {
        while let Some(Some((remaining, text))) = self.carried.get(self.row.len()).cloned() {
            let column = self.row.len();
            let copy = self.copy(&text);
            self.row.push(copy);
            self.carried[column] = (remaining > 1).then(|| (remaining - 1, text));
        }
    }

    fn open_cell(&mut self, tag: &str) {
        self.close_cell();
        self.in_row = true;
        let span = |name: &str| {
            html_attribute(tag, name)
                .and_then(|v| v.trim().parse::<usize>().ok())
                .unwrap_or(1)
                .clamp(1, MAX_HTML_SPAN)
        };
        self.span = (span("rowspan"), span("colspan"));
        self.cell = Some(String::new());
    }

    fn close_cell(&mut self) {
        let Some(raw) = self.cell.take() else {
            return;
        };
        self.fill_carried();
        let (rows, columns) = self.span;
        for i in 0..columns {
            let text = if i == 0 { raw.clone() } else { self.copy(&raw) };
            let column = self.row.len();
            if rows > 1 {
                if self.carried.len() <= column {
                    self.carried.resize(column + 1, None);
                }
                self.carried[column] = Some((rows - 1, raw.clone()));
            }
            self.row.push(text);
        }
    }

    /// Ferme la rangée ouverte : son texte, ou `None` si aucune n'est ouverte.
    fn close_row(&mut self) -> Option<String> {
        self.close_cell();
        if !self.in_row {
            return None;
        }
        self.in_row = false;
        // Colonnes couvertes par une rangée précédente après la dernière
        // cellule de celle-ci.
        while self.row.len() < self.carried.len() {
            if self.carried[self.row.len()].is_some() {
                self.fill_carried();
            } else {
                self.row.push(String::new());
            }
        }
        let text = self.row.join(" ");
        self.row.clear();
        Some(text)
    }
}

/// Valeur d'un attribut d'une balise HTML, entre guillemets ou non.
fn html_attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find(name) {
        let at = from + found;
        from = at + name.len();
        let before_ok = lower[..at].ends_with(|c: char| c.is_whitespace());
        let after = lower[from..].trim_start();
        if !before_ok || !after.starts_with('=') {
            continue;
        }
        let value_start = tag.len() - after.len() + 1;
        let value = tag[value_start..].trim_start();
        return Some(match value.chars().next() {
            Some(q @ ('"' | '\'')) => value[1..].split(q).next().unwrap_or(""),
            _ => value
                .split(|c: char| c.is_whitespace() || c == '>' || c == '/')
                .next()
                .unwrap_or(""),
        });
    }
    None
}

fn html_blocks(input: &str) -> Vec<Block> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut heading = false;
    let mut skip_until: Option<&'static str> = None;
    let mut table = HtmlTable {
        copy_budget: input.len(),
        ..HtmlTable::default()
    };
    // Dans `<pre>`, un retour à la ligne sépare deux blocs ; ailleurs, c'est
    // une espace, comme à l'affichage.
    let mut pre_depth = 0usize;
    let mut rest = input;
    let flush = |out: &mut Vec<Block>, current: &mut String, heading: bool, pre: bool| {
        let text = decode_entities(current);
        if pre {
            for line in text.lines() {
                out.push(Block {
                    heading,
                    text: line.to_owned(),
                });
            }
        } else {
            out.push(Block { heading, text });
        }
        current.clear();
    };
    while let Some(lt) = rest.find('<') {
        if skip_until.is_none() {
            match table.cell.as_mut() {
                Some(cell) => cell.push_str(&rest[..lt]),
                None => current.push_str(&rest[..lt]),
            }
        }
        rest = &rest[lt..];
        if rest.starts_with("<!--") {
            rest = rest.find("-->").map_or("", |end| &rest[end + 3..]);
            continue;
        }
        let Some(gt) = rest.find('>') else {
            if skip_until.is_none() {
                match table.cell.as_mut() {
                    Some(cell) => cell.push_str(rest),
                    None => current.push_str(rest),
                }
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
        if name == "table" {
            if closing {
                if table.depth == 1 {
                    if let Some(text) = table.close_row() {
                        out.push(body(decode_entities(&text)));
                    }
                    table.carried.clear();
                    flush(&mut out, &mut current, false, false);
                } else if let Some(cell) = table.cell.as_mut() {
                    cell.push(' ');
                }
                table.depth = table.depth.saturating_sub(1);
            } else {
                if table.depth == 0 {
                    flush(&mut out, &mut current, heading, pre_depth > 0);
                    heading = false;
                    table.carried.clear();
                } else if let Some(cell) = table.cell.as_mut() {
                    cell.push(' ');
                }
                table.depth += 1;
            }
            continue;
        }
        if table.depth > 0 {
            match name.as_str() {
                "tr" if table.depth == 1 => {
                    if let Some(text) = table.close_row() {
                        out.push(body(decode_entities(&text)));
                    }
                    table.in_row = !closing;
                }
                "td" | "th" if table.depth == 1 => {
                    if closing {
                        table.close_cell();
                    } else {
                        table.open_cell(tag);
                    }
                }
                // Dans une cellule, un titre, un bloc ou un tableau imbriqué
                // sépare deux mots sans ouvrir de section ni de bloc.
                name if table.cell.is_some() && (name == "br" || separates_words(name)) => {
                    if let Some(cell) = table.cell.as_mut() {
                        cell.push(' ');
                    }
                }
                // Hors cellule (légende…) : un bloc ordinaire, jamais un titre.
                name if table.cell.is_none() && BLOCK_TAGS.contains(&name) => {
                    flush(&mut out, &mut current, false, false);
                }
                _ => {}
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
                flush(&mut out, &mut current, heading, pre_depth > 0);
                heading = !closing;
            }
            "br" => current.push(' '),
            name if BLOCK_TAGS.contains(&name) => {
                flush(&mut out, &mut current, heading, pre_depth > 0);
                if name == "pre" {
                    pre_depth = if closing {
                        pre_depth.saturating_sub(1)
                    } else {
                        pre_depth + 1
                    };
                }
            }
            _ => {}
        }
    }
    if skip_until.is_none() {
        match table.cell.as_mut() {
            Some(cell) => cell.push_str(rest),
            None => current.push_str(rest),
        }
    }
    // Tableau non refermé en fin de texte : sa dernière rangée compte.
    if let Some(text) = table.close_row() {
        out.push(body(decode_entities(&text)));
    }
    flush(&mut out, &mut current, heading, pre_depth > 0);
    out
}

/// Longueur maximale lue pour une entité, `&` et `;` compris : la plus longue
/// entité nommée de HTML5 (`&CounterClockwiseContourIntegral;`) en a 33, une
/// référence numérique avec zéros de tête peut en avoir davantage.
const MAX_ENTITY_CHARS: usize = 40;

/// Remplacement des références numériques 0x80 à 0x9F, lues comme du
/// Windows-1252 (HTML5, « numeric character reference end state ») : `&#146;`
/// est une apostrophe typographique.
const WINDOWS_1252: [char; 32] = [
    '\u{20ac}', '\u{81}', '\u{201a}', '\u{192}', '\u{201e}', '\u{2026}', '\u{2020}', '\u{2021}',
    '\u{2c6}', '\u{2030}', '\u{160}', '\u{2039}', '\u{152}', '\u{8d}', '\u{17d}', '\u{8f}',
    '\u{90}', '\u{2018}', '\u{2019}', '\u{201c}', '\u{201d}', '\u{2022}', '\u{2013}', '\u{2014}',
    '\u{2dc}', '\u{2122}', '\u{161}', '\u{203a}', '\u{153}', '\u{9d}', '\u{17e}', '\u{178}',
];

/// Entité en tête de `text` (qui commence par `&`) : texte décodé et
/// longueur lue en octets, `;` compris. Entités nommées de HTML5 (avec leur
/// point-virgule) et références numériques ; `None` sinon, le `&` reste tel
/// quel.
fn entity_at(text: &str) -> Option<(String, usize)> {
    // Fenêtre bornée, coupée sur une frontière de caractère : jamais tout le
    // reste du texte (temps linéaire, voir `pathological_inline_markup_is_linear`).
    let mut cut = text.len().min(MAX_ENTITY_CHARS);
    while !text.is_char_boundary(cut) {
        cut -= 1;
    }
    let end = text[..cut].find(';')?;
    let entity = text.get(1..end)?;
    if let Some(number) = entity.strip_prefix('#') {
        let (digits, radix) = match number.strip_prefix(['x', 'X']) {
            Some(hex) => (hex, 16),
            None => (number, 10),
        };
        if digits.is_empty() || !digits.chars().all(|c| c.is_digit(radix)) {
            return None;
        }
        // Hors de l'Unicode (dépassement compris), demi-codet ou nul : U+FFFD.
        let value = u32::from_str_radix(digits, radix).unwrap_or(u32::MAX);
        let c = match value {
            0x80..=0x9f => WINDOWS_1252[(value - 0x80) as usize],
            0 => '\u{fffd}',
            _ => char::from_u32(value).unwrap_or('\u{fffd}'),
        };
        return Some((c.to_string(), end + 1));
    }
    let at = NAMED_ENTITIES
        .binary_search_by(|(name, _)| name.as_bytes().cmp(entity.as_bytes()))
        .ok()?;
    Some((NAMED_ENTITIES[at].1.to_owned(), end + 1))
}

/// Entités HTML visibles dans un texte déjà décodé (issue 733) : `&nom;`
/// d'une entité HTML5 connue (`NAMED_ENTITIES`) ou `&#…;`. L'appelant ne
/// retient que celles de la version envoyée au-delà de la version générée :
/// une entité citée volontairement des deux côtés ne compte pas. Temps
/// linéaire.
pub(crate) fn residual_entities(text: &str) -> usize {
    let bytes = text.as_bytes();
    let mut count = 0;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'&' {
            i += 1;
            continue;
        }
        let rest = &bytes[i + 1..];
        let (body, digits_ok): (usize, fn(u8) -> bool) = match rest.first() {
            Some(b'#') if matches!(rest.get(1), Some(b'x' | b'X')) => {
                (2, |c: u8| c.is_ascii_hexdigit())
            }
            Some(b'#') => (1, |c: u8| c.is_ascii_digit()),
            _ => (0, |c: u8| c.is_ascii_alphanumeric()),
        };
        let run = rest[body..]
            .iter()
            .take(33)
            .take_while(|c| digits_ok(**c))
            .count();
        let named_starts_with_letter =
            body > 0 || rest.first().is_some_and(u8::is_ascii_alphabetic);
        let known = body > 0
            || NAMED_ENTITIES
                .binary_search_by(|(name, _)| name.as_bytes().cmp(&rest[..run]))
                .is_ok();
        if run > 0
            && run <= 32
            && named_starts_with_letter
            && known
            && rest.get(body + run) == Some(&b';')
        {
            count += 1;
            i += 1 + body + run + 1;
        } else {
            i += 1;
        }
    }
    count
}

fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        match entity_at(rest).or_else(|| legacy_entity_at(rest)) {
            Some((decoded, len)) => {
                out.push_str(&decoded);
                rest = &rest[len..];
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

/// Entité historique sans point-virgule (`&nbsp`, `&eacute`), que HTML5
/// décode dans le texte : le plus long nom de `LEGACY_ENTITIES` en tête.
/// HTML seulement ; le Markdown (CommonMark) exige le point-virgule.
fn legacy_entity_at(text: &str) -> Option<(String, usize)> {
    let name: String = text[1..]
        .chars()
        .take(8)
        .take_while(char::is_ascii_alphanumeric)
        .collect();
    (1..=name.len()).rev().find_map(|len| {
        LEGACY_ENTITIES
            .binary_search_by(|(legacy, _)| legacy.as_bytes().cmp(&name.as_bytes()[..len]))
            .ok()
            .map(|at| (LEGACY_ENTITIES[at].1.to_owned(), len + 1))
    })
}

// --- Mots -----------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Token {
    /// Texte d'origine : majuscules (noms propres) et affichage.
    pub text: String,
    /// Clé de comparaison (`comparison_key`), lue par le diff et le
    /// dictionnaire.
    pub key: String,
    pub word: bool,
    /// Premier mot d'un bloc ou d'une phrase : une majuscule n'y signale pas
    /// un nom propre.
    pub sentence_start: bool,
}

/// Repli typographique d'un caractère : apostrophes et primes vers `'`,
/// guillemets vers `"`, tirets, traits d'union et signe moins vers `-`.
pub(crate) fn fold_char(c: char) -> char {
    match c {
        '\u{2018}' | '\u{2019}' | '\u{201a}' | '\u{201b}' | '\u{2032}' | '\u{2035}' | '\u{2bc}'
        | '\u{2b9}' | '\u{ff07}' => '\'',
        '\u{201c}' | '\u{201d}' | '\u{201e}' | '\u{201f}' | '\u{2033}' | '\u{2036}' | '\u{ab}'
        | '\u{bb}' | '\u{ff02}' => '"',
        '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}'
        | '\u{2212}' | '\u{fe58}' | '\u{fe63}' | '\u{ff0d}' => '-',
        c => c,
    }
}

/// Clé de comparaison d'un mot ou d'un signe : NFKC (ligatures, chiffres en
/// exposant, formes pleine chasse), puis repli typographique. La casse est
/// conservée (spec §2, étape 1).
pub(crate) fn comparison_key(text: &str) -> String {
    text.nfkc().map(fold_char).collect()
}

/// Mots et signes de ponctuation séparés. L'apostrophe et le trait d'union
/// entre deux lettres restent dans le mot (`l'équipe`, `peut-être`), quelle
/// que soit leur forme typographique (`l’équipe`, `peut‑être`).
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
                let joiner = matches!(fold_char(c), '\'' | '-')
                    && chars.get(i + 1).is_some_and(|n| n.is_alphanumeric())
                    && i > start;
                if c.is_alphanumeric() || joiner {
                    i += 1;
                } else {
                    break;
                }
            }
            let text: String = chars[start..i].iter().collect();
            out.push(Token {
                key: comparison_key(&text),
                text,
                word: true,
                sentence_start,
            });
            sentence_start = false;
        } else {
            out.push(Token {
                text: c.to_string(),
                key: comparison_key(&c.to_string()),
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

    // Issue 731 : une rangée HTML donne un bloc, comme une ligne de tableau
    // Markdown ; `rowspan` et `colspan` recopient la valeur ; un titre dans
    // une cellule n'ouvre pas de section.
    #[test]
    fn html_table_rows_repeat_merged_cells() {
        let html = "<h2>Actions</h2><table><caption>Suivi</caption>\
            <tr><th><h3>Action</h3></th><th>Qui</th><th>Quand</th></tr>\
            <tr><td>Commander</td><td rowspan=\"2\">Rémi</td><td ROWSPAN='2'>lundi</td></tr>\
            <tr><td><p>Valider</p><p>le plan</p></td></tr>\
            <tr><td>Planifier</td><td colspan=2>À&nbsp;confirmer</td></tr>\
            </table><p>Fin</p>";
        let markdown = "## Actions\n\nSuivi\n\n| Action | Qui | Quand |\n| --- | --- | --- |\n\
            | Commander | Rémi | lundi |\n| Valider le plan | Rémi | lundi |\n\
            | Planifier | À confirmer | À confirmer |\n\nFin\n";
        let expected = vec![
            (true, "Actions".to_owned()),
            (false, "Suivi".into()),
            (false, "Action Qui Quand".into()),
            (false, "Commander Rémi lundi".into()),
            (false, "Valider le plan Rémi lundi".into()),
            (false, "Planifier À confirmer À confirmer".into()),
            (false, "Fin".into()),
        ];
        assert_eq!(texts(html, Format::Html), expected);
        assert_eq!(texts(markdown, Format::Markdown), expected);
    }

    #[test]
    fn html_rowspan_reaching_past_a_short_row_still_fills_its_column() {
        let html = "<table><tr><td>a</td><td>b</td><td rowspan=3>c</td></tr>\
            <tr><td>d</td></tr><tr><td>e</td><td>f</td></tr></table>";
        assert_eq!(
            texts(html, Format::Html),
            vec![
                (false, "a b c".into()),
                (false, "d c".into()),
                (false, "e f c".into()),
            ]
        );
    }

    #[test]
    fn unclosed_html_table_keeps_its_last_row() {
        assert_eq!(
            texts("<table><tr><td>a<td>b", Format::Html),
            vec![(false, "a b".into())]
        );
    }

    // Des fusions démesurées ne font pas exploser la mémoire : les copies
    // s'arrêtent au budget, proportionnel à la taille du texte.
    #[test]
    fn html_span_copies_are_bounded() {
        let cell = "x".repeat(1000);
        let html = format!(
            "<table><tr><td rowspan=65534 colspan=1000>{cell}</td></tr>{}</table>",
            "<tr></tr>".repeat(2000)
        );
        let total: usize = blocks(&html, Format::Html)
            .iter()
            .map(|b| b.text.len())
            .sum();
        assert!(total <= 3 * html.len(), "{total}");
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

    // Revue du lot 0.8.0, constat 15 : une ligne pathologique (que des `[`,
    // des `<a`, ou des `[x](`) est lue en temps linéaire.
    #[test]
    fn pathological_inline_markup_is_linear() {
        let n = 1_000_000;
        for line in [
            "[".repeat(n),
            "<a".repeat(n / 2),
            "[x](".repeat(n / 4),
            "[x]".repeat(n / 3),
            "&".repeat(n),
            "&é".repeat(n / 2),
            "&#".repeat(n / 2),
        ] {
            let started = std::time::Instant::now();
            let out = blocks(&line, Format::Markdown);
            assert_eq!(out.len(), 1);
            assert_eq!(blocks(&line, Format::Html).len(), 1);
            assert!(
                started.elapsed() < std::time::Duration::from_secs(5),
                "{:?}",
                started.elapsed()
            );
        }
    }

    #[test]
    fn links_and_tags_still_read_after_the_cache() {
        assert_eq!(
            texts(
                "voir [a](u) et [b](v) <b>gras</b> [pas un lien] fin",
                Format::Markdown
            ),
            vec![(false, "voir a et b gras [pas un lien] fin".into())]
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
    fn entity_table_is_complete_and_sorted() {
        assert_eq!(NAMED_ENTITIES.len(), 2125);
        assert!(
            NAMED_ENTITIES
                .windows(2)
                .all(|w| w[0].0.as_bytes() < w[1].0.as_bytes())
        );
        for (entity, expected) in [
            ("&eacute;", "é"),
            ("&Agrave;", "À"),
            ("&rsquo;", "\u{2019}"),
            ("&mdash;", "\u{2014}"),
            ("&rarr;", "\u{2192}"),
            ("&thinsp;", "\u{2009}"),
            ("&NotEqualTilde;", "\u{2242}\u{338}"),
            ("&CounterClockwiseContourIntegral;", "\u{2233}"),
            ("&#233;", "é"),
            ("&#xE9;", "é"),
            ("&#146;", "\u{2019}"),
            ("&#0;", "\u{fffd}"),
            ("&#xD800;", "\u{fffd}"),
            ("&#99999999999;", "\u{fffd}"),
            ("&#00000000000000000000000000233;", "é"),
            // Formes historiques sans point-virgule, décodées par HTML5.
            ("&eacute", "é"),
            ("Le&nbspprojet", "Le\u{a0}projet"),
            ("&notit", "¬it"),
        ] {
            assert_eq!(decode_entities(entity), expected, "{entity}");
        }
        for kept in [
            "&",
            "&;",
            "&#;",
            "&#x;",
            "&#12a;",
            "&inconnue;",
            "R&D",
            "a & b ; c",
        ] {
            assert_eq!(decode_entities(kept), kept);
        }
    }

    #[test]
    fn inline_tags_do_not_split_words_but_blocks_and_breaks_do() {
        assert_eq!(
            texts(
                "<p>D<b>é</b>cisions<br>prises<span> </span>hier</p><p>fin</p>",
                Format::Html
            ),
            vec![
                (false, "Décisions prises hier".into()),
                (false, "fin".into())
            ]
        );
        assert_eq!(
            texts("Dé<b>cisions</b><br>prises", Format::Markdown),
            vec![(false, "Décisions prises".into())]
        );
        // Retour à la ligne : une espace, sauf dans `<pre>`.
        assert_eq!(
            texts("<h2>Plan\nd'action</h2><pre>a\nb</pre>", Format::Html),
            vec![
                (true, "Plan d'action".into()),
                (false, "a".into()),
                (false, "b".into())
            ]
        );
    }

    #[test]
    fn typographic_forms_share_a_comparison_key() {
        let keys = |text: &str| {
            let mut out = Vec::new();
            tokens(text, &mut out);
            out.into_iter().map(|t| t.key).collect::<Vec<_>>()
        };
        assert_eq!(
            keys("L’équipe, peut\u{2011}être «\u{a0}ﬁn\u{a0}» – ２"),
            keys("L'équipe, peut-être \" fin \" - 2")
        );
        let mut out = Vec::new();
        tokens("L’équipe", &mut out);
        assert_eq!(out[0].text, "L’équipe");
        assert_eq!(
            texts("mo\u{ad}t\u{200b} caché", Format::Text),
            vec![(false, "mot caché".into())]
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
