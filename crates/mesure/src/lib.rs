//! Reprise entre une synthèse générée et la version envoyée (spec de mesure de
//! la bêta, §2). Calcul déterministe, sans IA : normalisation, alignement par
//! titres de section, diff mot à mot, classement lexical ou de fond.
//!
//! Le rapport ne contient que des nombres et des booléens : aucun titre, aucun
//! mot des textes. Les textes ne sont lus que le temps du calcul.

#![forbid(unsafe_code)]

mod normalize;

use std::collections::HashMap;

use serde::Serialize;
use similar::{Algorithm, DiffOp, capture_diff_slices};

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
    if generated.len() > MAX_INPUT_BYTES || sent.len() > MAX_INPUT_BYTES {
        return Err(MeasureError::TooLarge);
    }
    let generated = sections(normalize::blocks(generated, generated_format), &[])?;
    let titles: Vec<String> = generated.iter().filter_map(|s| s.title.clone()).collect();
    let sent = sections(normalize::blocks(sent, sent_format), &titles)?;

    let headings_generated = titles.len() as u32;
    let sent_by_title: HashMap<&str, &Section> = sent
        .iter()
        .filter_map(|s| s.title.as_deref().map(|t| (t, s)))
        .collect();
    let headings_matched = titles
        .iter()
        .filter(|t| sent_by_title.contains_key(t.as_str()))
        .count() as u32;
    let aligned = headings_generated > 0 && headings_matched * 2 >= headings_generated;

    let mut total = Counters::default();
    let mut reports = Vec::new();
    let mut unmatched_sent_words = 0;
    if aligned {
        let empty = Section::default();
        for (index, section) in generated.iter().enumerate() {
            let counterpart = match &section.title {
                Some(title) => sent_by_title.get(title.as_str()).copied(),
                None => sent.iter().find(|s| s.title.is_none()),
            };
            let counters = diff(
                &section.tokens,
                &counterpart.unwrap_or(&empty).tokens,
                dictionary,
            );
            total.add(counters);
            reports.push(SectionReport {
                index: index as u32,
                matched: counterpart.is_some(),
                counters,
            });
        }
        let generated_titles: Vec<&str> = titles.iter().map(String::as_str).collect();
        for section in &sent {
            let known = match &section.title {
                Some(title) => generated_titles.contains(&title.as_str()),
                None => generated.iter().any(|s| s.title.is_none()),
            };
            if !known {
                unmatched_sent_words += word_count(&section.tokens);
            }
        }
        total.added += unmatched_sent_words;
    } else {
        let all = |sections: &[Section]| -> Vec<Token> {
            sections
                .iter()
                .flat_map(|s| s.tokens.iter().cloned())
                .collect()
        };
        total = diff(&all(&generated), &all(&sent), dictionary);
    }

    Ok(Report {
        rule_version: RULE_VERSION,
        aligned,
        headings_generated,
        headings_matched,
        total,
        sections: reports,
        unmatched_sent_words,
        content_per_mille: total.content_per_mille(),
        lexical_per_mille: total.lexical_per_mille(),
    })
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

/// Diff mot à mot (plus courte suite d'éditions, Myers) puis classement.
fn diff(generated: &[Token], sent: &[Token], dictionary: &Dictionary) -> Counters {
    let old: Vec<&str> = generated.iter().map(|t| t.text.as_str()).collect();
    let new: Vec<&str> = sent.iter().map(|t| t.text.as_str()).collect();
    let mut counters = Counters {
        generated: word_count(generated),
        ..Counters::default()
    };
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
                if let Some((o, n)) = pending.take() {
                    classify(&generated[o], &sent[n], dictionary, &mut counters);
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
    counters
}

fn classify(old: &[Token], new: &[Token], dictionary: &Dictionary, counters: &mut Counters) {
    let old_words: Vec<&Token> = old.iter().filter(|t| t.word).collect();
    let new_words: Vec<&Token> = new.iter().filter(|t| t.word).collect();
    let (o, n) = (old_words.len() as u64, new_words.len() as u64);
    match (o, n) {
        (0, 0) => {}
        (0, n) => counters.added += n,
        (o, 0) => counters.deleted += o,
        (o, n) => {
            let weight = o.max(n);
            let short = (1..=3).contains(&o) && (1..=3).contains(&n);
            let lexical = short
                && (old_words
                    .iter()
                    .chain(&new_words)
                    .any(|t| proper_noun_or_acronym(t))
                    || dictionary.matches(&old_words)
                    || dictionary.matches(&new_words));
            if lexical {
                counters.replaced_lexical += weight;
            } else {
                counters.replaced_content += weight;
            }
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
