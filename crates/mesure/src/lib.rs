//! Reprise entre une synthèse générée et la version envoyée (spec de mesure de
//! la bêta, §2). Calcul déterministe, sans IA : normalisation, alignement par
//! titres de section, diff mot à mot, classement lexical ou de fond.
//!
//! Le rapport ne contient que des nombres et des booléens : aucun titre, aucun
//! mot des textes. Les textes ne sont lus que le temps du calcul.

#![forbid(unsafe_code)]

mod docx;
mod normalize;

use std::collections::HashMap;

use serde::Serialize;
use similar::{Algorithm, DiffOp, capture_diff_slices};

pub use docx::{MAX_DOCX_BYTES, docx_to_html};
pub use normalize::Format;
use normalize::{Block, Token};

/// Version de la règle de calcul, à reporter avec chaque résultat.
pub const RULE_VERSION: u32 = 1;
/// Taille maximale d'un texte (4 Mio).
pub const MAX_INPUT_BYTES: usize = 4 * 1024 * 1024;
/// Nombre maximal de mots et de signes d'un texte : borne le diff.
pub const MAX_TOKENS: usize = 40_000;
/// Nombre maximal de termes du dictionnaire.
pub const MAX_DICTIONARY_TERMS: usize = 5_000;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum MeasureError {
    #[error("text too large (more than {MAX_INPUT_BYTES} bytes)")]
    TooLarge,
    #[error("text too long (more than {MAX_TOKENS} words and signs)")]
    TooManyTokens,
    #[error("dictionary too large (more than {MAX_DICTIONARY_TERMS} terms)")]
    DictionaryTooLarge,
    #[error("unreadable document")]
    InvalidDocument,
    #[error("unsupported file type (use .md, .txt, .html or .docx)")]
    UnsupportedFile,
    #[error("file is not UTF-8 text")]
    NotUtf8,
    #[error("cannot read file")]
    Unreadable,
}

/// Texte d'un fichier et son format, d'après l'extension : `.md`, `.txt`,
/// `.html` (UTF-8, 4 Mio au plus) ou `.docx` (lu par `docx_to_html`, 16 Mio au
/// plus). Même lecture pour la CLI et l'application.
pub fn load_file(path: &std::path::Path) -> Result<(String, Format), MeasureError> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or(MeasureError::UnsupportedFile)?;
    let limit = if extension == "docx" {
        MAX_DOCX_BYTES
    } else {
        MAX_INPUT_BYTES
    };
    let format = if extension == "docx" {
        None
    } else {
        Some(Format::from_extension(&extension).ok_or(MeasureError::UnsupportedFile)?)
    };
    let size = std::fs::metadata(path)
        .map_err(|_| MeasureError::Unreadable)?
        .len();
    if size > limit as u64 {
        return Err(MeasureError::TooLarge);
    }
    let bytes = std::fs::read(path).map_err(|_| MeasureError::Unreadable)?;
    match format {
        Some(format) => Ok((
            String::from_utf8(bytes).map_err(|_| MeasureError::NotUtf8)?,
            format,
        )),
        None => Ok((docx_to_html(&bytes)?, Format::Html)),
    }
}

/// Termes du dictionnaire de l'utilisateur, comparés sans tenir compte de la
/// casse.
#[derive(Debug, Default, Clone)]
pub struct Dictionary {
    terms: Vec<Vec<String>>,
}

impl Dictionary {
    pub fn new<'a>(terms: impl IntoIterator<Item = &'a str>) -> Result<Self, MeasureError> {
        let mut out = Vec::new();
        for term in terms {
            let mut tokens = Vec::new();
            normalize::tokens(term, &mut tokens);
            let words: Vec<String> = tokens
                .into_iter()
                .filter(|t| t.word)
                .map(|t| t.text.to_lowercase())
                .collect();
            if !words.is_empty() {
                out.push(words);
            }
            if out.len() > MAX_DICTIONARY_TERMS {
                return Err(MeasureError::DictionaryTooLarge);
            }
        }
        Ok(Self { terms: out })
    }

    fn matches(&self, words: &[&Token]) -> bool {
        let lower: Vec<String> = words.iter().map(|t| t.text.to_lowercase()).collect();
        self.terms.iter().any(|term| {
            term.len() <= lower.len() && lower.windows(term.len()).any(|w| w == term.as_slice())
        })
    }
}

/// Compteurs d'une section ou du total, en mots (la ponctuation est séparée
/// des mots pour le diff mais n'est pas comptée).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Counters {
    /// `G` : mots de la version générée.
    pub generated: u64,
    /// `A` : mots ajoutés.
    pub added: u64,
    /// `S` : mots supprimés.
    pub deleted: u64,
    /// `Rf` : mots remplacés, hors corrections lexicales (fond).
    pub replaced_content: u64,
    /// `Rl` : mots remplacés dans des corrections lexicales.
    pub replaced_lexical: u64,
}

impl Counters {
    fn add(&mut self, other: Counters) {
        self.generated += other.generated;
        self.added += other.added;
        self.deleted += other.deleted;
        self.replaced_content += other.replaced_content;
        self.replaced_lexical += other.replaced_lexical;
    }

    /// `(A + S + Rf) / G × 1000` ; `None` sans mot généré.
    pub fn content_per_mille(&self) -> Option<f64> {
        per_mille(
            self.added + self.deleted + self.replaced_content,
            self.generated,
        )
    }

    /// `Rl / G × 1000` ; `None` sans mot généré.
    pub fn lexical_per_mille(&self) -> Option<f64> {
        per_mille(self.replaced_lexical, self.generated)
    }

    /// `A / G × 1000` ; `None` sans mot généré.
    pub fn added_per_mille(&self) -> Option<f64> {
        per_mille(self.added, self.generated)
    }
}

fn per_mille(count: u64, generated: u64) -> Option<f64> {
    (generated > 0).then(|| count as f64 / generated as f64 * 1000.0)
}

/// Section de la version générée, désignée par son rang (0 : texte avant le
/// premier titre), jamais par son titre.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SectionReport {
    pub index: u32,
    /// Section retrouvée dans la version envoyée (même titre).
    pub matched: bool,
    pub counters: Counters,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Report {
    pub rule_version: u32,
    /// `true` si au moins la moitié des titres générés se retrouvent : mesure
    /// par section. Sinon, mesure globale (`sections` vide).
    pub aligned: bool,
    /// Titres de la version générée, et combien se retrouvent dans l'envoyée.
    pub headings_generated: u32,
    pub headings_matched: u32,
    pub total: Counters,
    pub sections: Vec<SectionReport>,
    /// Mots des sections de la version envoyée absentes de la générée,
    /// comptés comme ajoutés dans le total.
    pub unmatched_sent_words: u64,
    /// `(A + S + Rf) / G × 1000` sur le total.
    pub content_per_mille: Option<f64>,
    /// `Rl / G × 1000` sur le total.
    pub lexical_per_mille: Option<f64>,
}

/// Mesure la reprise entre `generated` et `sent`. Les textes ne sont pas
/// conservés : seul le rapport chiffré est rendu.
pub fn measure(
    generated: &str,
    generated_format: Format,
    sent: &str,
    sent_format: Format,
    dictionary: &Dictionary,
) -> Result<Report, MeasureError> {
    let prepared = prepare(generated, generated_format, sent, sent_format)?;
    let mut total = Counters::default();
    let mut reports = Vec::new();
    let mut unmatched_sent_words = 0;
    for pair in prepared.pairs() {
        let mut counters = Counters {
            generated: word_count(&pair.generated),
            ..Counters::default()
        };
        diff(&pair.generated, &pair.sent, dictionary, |_, _, change| {
            counters.record(change)
        });
        match pair.place {
            Place::Section { index, matched } => reports.push(SectionReport {
                index,
                matched,
                counters,
            }),
            Place::UnmatchedSent => unmatched_sent_words += counters.added,
            Place::Global => {}
        }
        total.add(counters);
    }
    Ok(Report {
        rule_version: RULE_VERSION,
        aligned: prepared.aligned,
        headings_generated: prepared.titles.len() as u32,
        headings_matched: prepared.headings_matched,
        total,
        sections: reports,
        unmatched_sent_words,
        content_per_mille: total.content_per_mille(),
        lexical_per_mille: total.lexical_per_mille(),
    })
}

/// Nature d'une différence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Added,
    Deleted,
    Replaced,
}

/// Une différence classée : nature, classe (un ajout ou une suppression est
/// toujours du fond) et poids en mots.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Change {
    pub kind: ChangeKind,
    pub lexical: bool,
    pub weight: u64,
}

impl Counters {
    fn record(&mut self, change: Change) {
        match change.kind {
            ChangeKind::Added => self.added += change.weight,
            ChangeKind::Deleted => self.deleted += change.weight,
            ChangeKind::Replaced if change.lexical => self.replaced_lexical += change.weight,
            ChangeKind::Replaced => self.replaced_content += change.weight,
        }
    }
}

/// Différence avec ses extraits, pour le calibrage manuel de l'étape 0 :
/// `syntheo mesure --differences` et le mode Calibrage de l'application
/// (plugin `mesure`, extraits rendus à l'écran seulement, jamais enregistrés).
/// Derrière la fonctionnalité `differences`, que seuls ces deux consommateurs
/// activent (test `only_the_cli_and_the_calibration_plugin_enable_differences`).
#[cfg(feature = "differences")]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Difference {
    /// Rang de la section générée ; `None` en mesure globale ou pour une
    /// section envoyée absente de la générée.
    pub section: Option<u32>,
    pub change: Change,
    pub generated: String,
    pub sent: String,
}

#[cfg(feature = "differences")]
pub fn differences(
    generated: &str,
    generated_format: Format,
    sent: &str,
    sent_format: Format,
    dictionary: &Dictionary,
) -> Result<Vec<Difference>, MeasureError> {
    let prepared = prepare(generated, generated_format, sent, sent_format)?;
    let mut out = Vec::new();
    for pair in prepared.pairs() {
        let section = match pair.place {
            Place::Section { index, .. } => Some(index),
            Place::UnmatchedSent | Place::Global => None,
        };
        diff(
            &pair.generated,
            &pair.sent,
            dictionary,
            |old, new, change| {
                out.push(Difference {
                    section,
                    change,
                    generated: join_tokens(old),
                    sent: join_tokens(new),
                })
            },
        );
    }
    Ok(out)
}

/// Extrait lisible : mots séparés par une espace, ponctuation collée au mot
/// qui la précède.
#[cfg(feature = "differences")]
fn join_tokens(tokens: &[Token]) -> String {
    let mut out = String::new();
    for token in tokens {
        if !out.is_empty() && token.word {
            out.push(' ');
        }
        out.push_str(&token.text);
    }
    out
}

struct Prepared {
    generated: Vec<Section>,
    sent: Vec<Section>,
    titles: Vec<String>,
    aligned: bool,
    headings_matched: u32,
}

enum Place {
    Section { index: u32, matched: bool },
    UnmatchedSent,
    Global,
}

struct Pair<'a> {
    place: Place,
    generated: std::borrow::Cow<'a, [Token]>,
    sent: std::borrow::Cow<'a, [Token]>,
}

fn prepare(
    generated: &str,
    generated_format: Format,
    sent: &str,
    sent_format: Format,
) -> Result<Prepared, MeasureError> {
    if generated.len() > MAX_INPUT_BYTES || sent.len() > MAX_INPUT_BYTES {
        return Err(MeasureError::TooLarge);
    }
    let generated = sections(normalize::blocks(generated, generated_format), &[])?;
    let titles: Vec<String> = generated.iter().filter_map(|s| s.title.clone()).collect();
    let sent = sections(normalize::blocks(sent, sent_format), &titles)?;
    let headings_matched = titles
        .iter()
        .filter(|t| sent.iter().any(|s| s.title.as_ref() == Some(*t)))
        .count() as u32;
    let aligned = !titles.is_empty() && headings_matched as usize * 2 >= titles.len();
    Ok(Prepared {
        generated,
        sent,
        titles,
        aligned,
        headings_matched,
    })
}

impl Prepared {
    /// Paires de textes à comparer, dans l'ordre de la version générée.
    fn pairs(&self) -> Vec<Pair<'_>> {
        use std::borrow::Cow;
        if !self.aligned {
            let all = |sections: &[Section]| -> Vec<Token> {
                sections
                    .iter()
                    .flat_map(|s| s.tokens.iter().cloned())
                    .collect()
            };
            return vec![Pair {
                place: Place::Global,
                generated: Cow::Owned(all(&self.generated)),
                sent: Cow::Owned(all(&self.sent)),
            }];
        }
        let sent_by_title: HashMap<&str, &Section> = self
            .sent
            .iter()
            .filter_map(|s| s.title.as_deref().map(|t| (t, s)))
            .collect();
        let mut pairs = Vec::new();
        for (index, section) in self.generated.iter().enumerate() {
            let counterpart = match &section.title {
                Some(title) => sent_by_title.get(title.as_str()).copied(),
                None => self.sent.iter().find(|s| s.title.is_none()),
            };
            pairs.push(Pair {
                place: Place::Section {
                    index: index as u32,
                    matched: counterpart.is_some(),
                },
                generated: Cow::Borrowed(&section.tokens),
                sent: Cow::Borrowed(counterpart.map_or(&[][..], |s| &s.tokens)),
            });
        }
        for section in &self.sent {
            let known = match &section.title {
                Some(title) => self.titles.contains(title),
                None => self.generated.iter().any(|s| s.title.is_none()),
            };
            if !known {
                pairs.push(Pair {
                    place: Place::UnmatchedSent,
                    generated: Cow::Borrowed(&[][..]),
                    sent: Cow::Borrowed(&section.tokens),
                });
            }
        }
        pairs
    }
}

#[derive(Debug, Default)]
struct Section {
    /// Clé d'alignement : titre normalisé (casse ignorée).
    title: Option<String>,
    tokens: Vec<Token>,
}

fn title_key(text: &str) -> String {
    text.trim()
        .trim_end_matches([':', '.'])
        .trim()
        .to_lowercase()
}

/// Découpe en sections. Dans la version envoyée, une ligne identique à un
/// titre généré ouvre aussi une section : un texte collé depuis un wiki perd
/// souvent la mise en forme des titres.
fn sections(blocks: Vec<Block>, known_titles: &[String]) -> Result<Vec<Section>, MeasureError> {
    let mut out = vec![Section::default()];
    let mut count = 0usize;
    for block in blocks {
        let key = title_key(&block.text);
        if block.heading || known_titles.contains(&key) {
            out.push(Section {
                title: Some(key),
                tokens: Vec::new(),
            });
            continue;
        }
        let section = out.last_mut().expect("au moins une section");
        let before = section.tokens.len();
        normalize::tokens(&block.text, &mut section.tokens);
        count += section.tokens.len() - before;
        if count > MAX_TOKENS {
            return Err(MeasureError::TooManyTokens);
        }
    }
    // Section d'introduction vide : retirée.
    if out[0].tokens.is_empty() {
        out.remove(0);
    }
    // Deux sections de même titre : la seconde est fusionnée dans la première.
    let mut merged: Vec<Section> = Vec::new();
    for section in out {
        match merged
            .iter_mut()
            .find(|s| s.title.is_some() && s.title == section.title)
        {
            Some(existing) => existing.tokens.extend(section.tokens),
            None => merged.push(section),
        }
    }
    Ok(merged)
}

fn word_count(tokens: &[Token]) -> u64 {
    tokens.iter().filter(|t| t.word).count() as u64
}

/// Diff mot à mot (plus courte suite d'éditions, Myers) puis classement de
/// chaque différence, transmise à `visit` avec ses deux côtés.
fn diff(
    generated: &[Token],
    sent: &[Token],
    dictionary: &Dictionary,
    mut visit: impl FnMut(&[Token], &[Token], Change),
) {
    let old: Vec<&str> = generated.iter().map(|t| t.text.as_str()).collect();
    let new: Vec<&str> = sent.iter().map(|t| t.text.as_str()).collect();
    // Suppression et insertion adjacentes : un remplacement.
    let mut pending: Option<(std::ops::Range<usize>, std::ops::Range<usize>)> = None;
    let mut ops = capture_diff_slices(Algorithm::Myers, &old, &new);
    ops.push(DiffOp::Equal {
        old_index: old.len(),
        new_index: new.len(),
        len: 0,
    });
    for op in ops {
        match op {
            DiffOp::Equal { .. } => {
                if let Some((o, n)) = pending.take()
                    && let Some(change) =
                        classify(&generated[o.clone()], &sent[n.clone()], dictionary)
                {
                    visit(&generated[o], &sent[n], change);
                }
            }
            DiffOp::Delete {
                old_index,
                old_len,
                new_index,
                ..
            } => {
                let (o, _) = pending.get_or_insert((old_index..old_index, new_index..new_index));
                o.end = old_index + old_len;
            }
            DiffOp::Insert {
                old_index,
                new_index,
                new_len,
            } => {
                let (_, n) = pending.get_or_insert((old_index..old_index, new_index..new_index));
                n.end = new_index + new_len;
            }
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                let (o, n) = pending.get_or_insert((old_index..old_index, new_index..new_index));
                o.end = old_index + old_len;
                n.end = new_index + new_len;
            }
        }
    }
}

/// Classe une différence ; `None` si elle ne touche que la ponctuation.
fn classify(old: &[Token], new: &[Token], dictionary: &Dictionary) -> Option<Change> {
    let old_words: Vec<&Token> = old.iter().filter(|t| t.word).collect();
    let new_words: Vec<&Token> = new.iter().filter(|t| t.word).collect();
    let (o, n) = (old_words.len() as u64, new_words.len() as u64);
    let change = |kind, lexical, weight| {
        Some(Change {
            kind,
            lexical,
            weight,
        })
    };
    match (o, n) {
        (0, 0) => None,
        (0, n) => change(ChangeKind::Added, false, n),
        (o, 0) => change(ChangeKind::Deleted, false, o),
        (o, n) => {
            let short = (1..=3).contains(&o) && (1..=3).contains(&n);
            let lexical = short
                && (old_words
                    .iter()
                    .chain(&new_words)
                    .any(|t| proper_noun_or_acronym(t))
                    || dictionary.matches(&old_words)
                    || dictionary.matches(&new_words));
            change(ChangeKind::Replaced, lexical, o.max(n))
        }
    }
}

/// Forme « nom propre ou sigle » : majuscule hors début de phrase, tout en
/// capitales d'au moins deux lettres, ou mélange de lettres et de chiffres.
fn proper_noun_or_acronym(token: &Token) -> bool {
    let letters: Vec<char> = token.text.chars().filter(|c| c.is_alphabetic()).collect();
    let has_digit = token.text.chars().any(|c| c.is_numeric());
    if !letters.is_empty() && has_digit {
        return true;
    }
    if letters.len() >= 2 && letters.iter().all(|c| c.is_uppercase()) {
        return true;
    }
    !token.sentence_start && token.text.chars().next().is_some_and(char::is_uppercase)
}

#[cfg(test)]
mod tests;
