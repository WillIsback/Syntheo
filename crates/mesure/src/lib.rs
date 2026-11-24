//! Reprise entre une synthèse générée et la version envoyée (spec de mesure de
//! la bêta, §2). Calcul déterministe, sans IA : normalisation, alignement par
//! titres de section, diff mot à mot, classement lexical ou de fond.
//!
//! Le rapport ne contient que des nombres et des booléens : aucun titre, aucun
//! mot des textes. Les textes ne sont lus que le temps du calcul.

#![forbid(unsafe_code)]

mod docx;
mod entities;
mod normalize;

use std::collections::HashMap;

use serde::Serialize;
use similar::{Algorithm, DiffOp, capture_diff_slices};

pub use docx::{MAX_DOCX_BYTES, docx_to_html};
pub use normalize::Format;
use normalize::{Block, Token};

/// Version de la règle de calcul, à reporter avec chaque résultat.
///
/// - 1 : version de la 0.8.0.
/// - 2 (0.8.1) : entités HTML5 et clé de comparaison normalisée (issue
///   729), appariement ordonné des sections et mots des titres comptés
///   (issue 730), diff de patience, fusion par mots-outils et appariement
///   mot à mot dans un remplacement (issue 732).
pub const RULE_VERSION: u32 = 2;
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
#[derive(Default, Clone)]
pub struct Dictionary {
    terms: Vec<Vec<String>>,
    /// Clé locale des empreintes de termes (bêta, issue 672) : tirée à
    /// l'inscription, détruite à l'effacement. Sans clé, aucun terme n'est
    /// suivi.
    term_key: Option<[u8; 32]>,
}

// La clé des empreintes n'apparaît jamais dans un journal ni un message.
impl std::fmt::Debug for Dictionary {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Dictionary")
            .field("terms", &self.terms.len())
            .field("term_key", &self.term_key.map(|_| "<masquée>"))
            .finish()
    }
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
                .map(|t| t.key.to_lowercase())
                .collect();
            if !words.is_empty() {
                out.push(words);
            }
            if out.len() > MAX_DICTIONARY_TERMS {
                return Err(MeasureError::DictionaryTooLarge);
            }
        }
        Ok(Self {
            terms: out,
            term_key: None,
        })
    }

    /// Active le suivi des termes avec la clé locale de l'inscription.
    pub fn with_term_key(mut self, key: [u8; 32]) -> Self {
        self.term_key = Some(key);
        self
    }

    /// Empreintes de chaque mot des entrées, triées et sans doublon (voir
    /// `term_hash`) ; vide sans clé. Les termes suivis sont des mots : un
    /// terme contenu dans une entrée y est reconnu (« Dupont » corrigé, puis
    /// « Jean Dupont » ajouté au dictionnaire). Limite connue : un mot à
    /// majuscule d'une entrée compte comme couvert même dans un autre sens
    /// (« Jean » de « Lycée Jean Moulin »).
    pub fn hashes(&self) -> Vec<String> {
        let Some(key) = &self.term_key else {
            return Vec::new();
        };
        let mut out: Vec<String> = self
            .terms
            .iter()
            .flatten()
            .map(|word| term_hash(key, std::slice::from_ref(word)))
            .collect();
        out.sort();
        out.dedup();
        out
    }

    /// Termes corrigés d'un remplacement lexical, côté envoyé, toujours mot
    /// par mot : chaque nom propre ou sigle, et chaque mot d'une entrée du
    /// dictionnaire qu'il contient. En minuscules, comme les entrées du
    /// dictionnaire. Une entrée de plusieurs mots n'est jamais suivie entière :
    /// « Jean Dupont » ajouté au dictionnaire, « Dupont » reste le même terme.
    fn corrected_terms(&self, new_words: &[&Token]) -> Vec<Vec<String>> {
        let lower: Vec<String> = new_words.iter().map(|t| t.key.to_lowercase()).collect();
        let mut covered = vec![false; lower.len()];
        for term in &self.terms {
            if term.len() > lower.len() {
                continue;
            }
            for start in 0..=lower.len() - term.len() {
                if lower[start..start + term.len()] == term[..] {
                    covered[start..start + term.len()].fill(true);
                }
            }
        }
        let mut out: Vec<Vec<String>> = Vec::new();
        for (i, token) in new_words.iter().enumerate() {
            if covered[i] || proper_noun_or_acronym(token) {
                let term = vec![lower[i].clone()];
                if !out.contains(&term) {
                    out.push(term);
                }
            }
        }
        out
    }

    fn matches(&self, words: &[&Token]) -> bool {
        let lower: Vec<String> = words.iter().map(|t| t.key.to_lowercase()).collect();
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
    /// Rôle de la section dans le modèle de compte rendu, déduit de son titre
    /// (le titre lui-même n'est jamais rendu).
    pub role: SectionRole,
    /// Section retrouvée dans la version envoyée : même titre, ou titre
    /// proche entre deux titres identiques (issue 730).
    pub matched: bool,
    pub counters: Counters,
}

/// Rôle d'une section, pour le garde-fou Décisions et Actions de la bêta
/// (spec §4) ; liste fermée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SectionRole {
    Decisions,
    Actions,
    Other,
}

impl SectionRole {
    /// Déduit d'un titre de section, par correspondance exacte avec une liste
    /// fermée de titres normalisés (casse, espaces et apostrophe typographique
    /// ignorées), tirée des modèles par défaut de Syntheo en français et en
    /// anglais. Un titre inconnu donne `Other`.
    pub fn from_title(title: Option<&str>) -> Self {
        let Some(title) = title else {
            return Self::Other;
        };
        let key = title
            .replace('\u{2019}', "'")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .trim_end_matches([':', '.'])
            .trim()
            .to_lowercase();
        if DECISION_TITLES.contains(&key.as_str()) {
            Self::Decisions
        } else if ACTION_TITLES.contains(&key.as_str()) {
            Self::Actions
        } else {
            Self::Other
        }
    }
}

/// Titres de sections Décisions (modèles par défaut, et formes courtes).
const DECISION_TITLES: &[&str] = &[
    "décisions",
    "décisions du conseil",
    "décisions majeures",
    "décisions prises",
    "décisions actées",
    "décisions et actions",
    "decisions",
    "board decisions",
    "major decisions",
    "decisions made",
    "decisions & action items",
    "decisions and action items",
];

/// Titres de sections Actions (modèles par défaut, et formes courtes).
const ACTION_TITLES: &[&str] = &[
    "actions",
    "actions à suivre",
    "plan d'action",
    "prochaines étapes",
    "prochaine étape",
    "à faire",
    "éléments à fournir",
    "suites à donner",
    "suite à donner",
    "action items",
    "action plan",
    "next steps",
    "next step",
    "follow-up items",
    "follow-ups",
    "to-do",
    "to do",
];

/// Terme corrigé (côté envoyé d'une correction lexicale), désigné par une
/// empreinte HMAC-SHA-256 à clé locale : son texte n'est jamais rendu.
/// Sert au suivi des termes de la bêta (spec §3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CorrectedTerm {
    pub hash: String,
    pub count: u32,
}

/// Empreinte d'un terme : HMAC-SHA-256, avec la clé locale, de ses mots en
/// minuscules séparés par une espace. Même calcul pour un terme corrigé et
/// pour un terme du dictionnaire. Sans la clé, une empreinte ne se relie à
/// aucun terme, même par une liste de noms.
fn term_hash(key: &[u8; 32], words: &[String]) -> String {
    use hmac::{Hmac, KeyInit, Mac};
    let mut mac = <Hmac<sha2::Sha256> as KeyInit>::new_from_slice(key)
        .expect("hmac accepts keys of any length");
    mac.update(words.join(" ").as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Report {
    pub rule_version: u32,
    /// `true` si au moins la moitié des titres générés se retrouvent : mesure
    /// par section. Sinon, mesure globale (`sections` vide).
    pub aligned: bool,
    /// Titres de la version générée, et combien se retrouvent dans l'envoyée
    /// (titre identique ou proche). Les mots des titres sont comptés.
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
    /// Termes corrigés par une correction lexicale, par empreinte, triés.
    pub corrected_terms: Vec<CorrectedTerm>,
    /// Empreintes des termes du dictionnaire au moment de la mesure, triées.
    pub dictionary_hashes: Vec<String>,
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
    let mut corrected = std::collections::BTreeMap::<String, u32>::new();
    for pair in prepared.pairs() {
        let mut counters = Counters {
            generated: pair.generated_words(),
            ..Counters::default()
        };
        pair.diff(dictionary, |_, new, change| {
            counters.record(change);
            if let Some(key) = &dictionary.term_key
                && change.kind == ChangeKind::Replaced
                && change.lexical
            {
                let words: Vec<&Token> = new.iter().filter(|t| t.word).collect();
                for term in dictionary.corrected_terms(&words) {
                    *corrected.entry(term_hash(key, &term)).or_default() += 1;
                }
            }
        });
        match pair.place {
            Place::Section {
                index,
                role,
                matched,
            } => reports.push(SectionReport {
                index,
                role,
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
        headings_generated: prepared.titles as u32,
        headings_matched: prepared.headings_matched,
        total,
        sections: reports,
        unmatched_sent_words,
        content_per_mille: total.content_per_mille(),
        lexical_per_mille: total.lexical_per_mille(),
        corrected_terms: corrected
            .into_iter()
            .map(|(hash, count)| CorrectedTerm { hash, count })
            .collect(),
        dictionary_hashes: dictionary.hashes(),
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
        pair.diff(dictionary, |old, new, change| {
            out.push(Difference {
                section,
                change,
                generated: join_tokens(old),
                sent: join_tokens(new),
            })
        });
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
    /// Pour chaque section générée, le rang de sa correspondante envoyée.
    matches: Vec<Option<usize>>,
    titles: usize,
    aligned: bool,
    headings_matched: u32,
}

enum Place {
    Section {
        index: u32,
        role: SectionRole,
        matched: bool,
    },
    UnmatchedSent,
    Global,
}

/// Deux textes à comparer : les titres d'abord, puis les corps, en deux diffs
/// séparés pour qu'une retouche de titre reste une différence de titre.
struct Pair<'a> {
    place: Place,
    generated_title: &'a [Token],
    sent_title: &'a [Token],
    generated: std::borrow::Cow<'a, [Token]>,
    sent: std::borrow::Cow<'a, [Token]>,
}

impl Pair<'_> {
    fn diff(&self, dictionary: &Dictionary, mut visit: impl FnMut(&[Token], &[Token], Change)) {
        diff(
            self.generated_title,
            self.sent_title,
            dictionary,
            &mut visit,
        );
        diff(&self.generated, &self.sent, dictionary, &mut visit);
    }

    fn generated_words(&self) -> u64 {
        word_count(self.generated_title) + word_count(&self.generated)
    }
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
    let generated = sections(normalize::blocks(generated, generated_format), &[], false)?;
    let titles: Vec<String> = generated.iter().filter_map(|s| s.title.clone()).collect();
    let known: Vec<KnownTitle> = generated
        .iter()
        .filter_map(|s| {
            s.title.as_ref().map(|key| KnownTitle {
                key: key.clone(),
                words: s.title_words.clone(),
            })
        })
        .collect();
    let sent = sections(
        normalize::blocks(sent, sent_format),
        &known,
        sent_format == Format::Text,
    )?;
    let matches = match_sections(&generated, &sent);
    let headings_matched = generated
        .iter()
        .zip(&matches)
        .filter(|(section, matched)| section.title.is_some() && matched.is_some())
        .count() as u32;
    let aligned = !titles.is_empty() && headings_matched as usize * 2 >= titles.len();
    Ok(Prepared {
        generated,
        sent,
        matches,
        titles: titles.len(),
        aligned,
        headings_matched,
    })
}

/// Appariement des sections (issue 730), déterministe et sans flottant :
///
/// 1. la section sans titre (texte avant le premier titre) avec son
///    homologue, et chaque titre identique (clé `title_key`) avec le sien,
///    même hors de l'ordre ;
/// 2. les paires exactes qui respectent l'ordre des deux textes (plus longue
///    sous-suite croissante) servent d'ancres ; entre deux ancres, une section
///    générée restée seule est appariée, dans l'ordre, à une section envoyée
///    restée seule au titre proche (`title_match`).
///
/// Une section sans correspondante compte entièrement en suppressions ou en
/// ajouts : on préfère manquer un appariement (reprise surestimée) qu'en
/// inventer un (reprise minorée).
fn match_sections(generated: &[Section], sent: &[Section]) -> Vec<Option<usize>> {
    let mut matches: Vec<Option<usize>> = generated
        .iter()
        .map(|section| match &section.title {
            Some(title) => sent.iter().position(|s| s.title.as_ref() == Some(title)),
            None => sent.iter().position(|s| s.title.is_none()),
        })
        .collect();
    // `sections` fusionne les titres en double de chaque côté : une section
    // envoyée n'est jamais visée deux fois (sinon la reprise serait minorée).
    let mut taken = vec![false; sent.len()];
    for j in matches.iter().flatten() {
        debug_assert!(!taken[*j], "section envoyée appariée deux fois");
        taken[*j] = true;
    }
    // Ancres : bornes de fenêtre, en plus du début et de la fin des textes.
    let mut anchors: Vec<(usize, usize)> = vec![];
    for i in increasing_subsequence(&matches) {
        anchors.push((i, matches[i].expect("ancre appariée")));
    }
    let mut bounds = vec![(None, None)];
    bounds.extend(anchors.iter().map(|&(i, j)| (Some(i), Some(j))));
    bounds.push((None, None));
    for window in bounds.windows(2) {
        let ((gi, sj), (gi_end, sj_end)) = (window[0], window[1]);
        let g_range = gi.map_or(0, |i| i + 1)..gi_end.unwrap_or(generated.len());
        let s_range = sj.map_or(0, |j| j + 1)..sj_end.unwrap_or(sent.len());
        let mut next_sent = s_range.start;
        for i in g_range {
            if matches[i].is_some() || generated[i].title.is_none() {
                continue;
            }
            let best = (next_sent..s_range.end)
                .filter(|&j| !taken[j] && sent[j].title.is_some())
                .filter_map(|j| title_match(&generated[i], &sent[j]).map(|quality| (quality, j)))
                // Meilleure qualité, puis la plus proche dans l'ordre.
                .min_by_key(|&(quality, j)| (std::cmp::Reverse(quality), j));
            if let Some((_, j)) = best {
                matches[i] = Some(j);
                taken[j] = true;
                next_sent = j + 1;
            }
        }
    }
    matches
}

/// Rangs des paires qui forment la plus longue sous-suite croissante des
/// rangs envoyés (en O(n log n), plus petit rang en cas d'égalité).
fn increasing_subsequence(matches: &[Option<usize>]) -> Vec<usize> {
    let pairs: Vec<(usize, usize)> = matches
        .iter()
        .enumerate()
        .filter_map(|(i, j)| j.map(|j| (i, j)))
        .collect();
    // tails[k] : indice dans `pairs` de la fin de la meilleure sous-suite de
    // longueur k + 1 ; previous : chaînage pour la reconstruire.
    let mut tails: Vec<usize> = Vec::new();
    let mut previous: Vec<Option<usize>> = vec![None; pairs.len()];
    for (k, &(_, j)) in pairs.iter().enumerate() {
        let at = tails.partition_point(|&t| pairs[t].1 < j);
        previous[k] = at.checked_sub(1).map(|p| tails[p]);
        if at == tails.len() {
            tails.push(k);
        } else {
            tails[at] = k;
        }
    }
    let mut out = Vec::with_capacity(tails.len());
    let mut cursor = tails.last().copied();
    while let Some(k) = cursor {
        out.push(pairs[k].0);
        cursor = previous[k];
    }
    out.reverse();
    out
}

/// Qualité d'un appariement par titre proche ; `None` si les titres ne sont
/// pas assez proches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum TitleMatch {
    /// Au moins la moitié des mots du titre le plus long en commun, et au
    /// moins la moitié des mots de la section la plus longue en commun.
    SharedWords { common: usize },
    /// Même nombre de mots, un seul mot différent, à faible distance
    /// d'édition (« Dupond » et « Dupont »).
    OneWordEdit,
}

fn title_match(generated: &Section, sent: &Section) -> Option<TitleMatch> {
    let (a, b) = (&generated.title_words, &sent.title_words);
    if a.is_empty() || b.is_empty() {
        return None;
    }
    if one_word_edit(a, b) {
        return Some(TitleMatch::OneWordEdit);
    }
    let common = common_count(a, b);
    if common * 2 < a.len().max(b.len()) {
        return None;
    }
    let (gw, sw) = (
        content_words(&generated.tokens),
        content_words(&sent.tokens),
    );
    let longest = gw.len().max(sw.len());
    (longest > 0 && common_count(&gw, &sw) * 2 >= longest)
        .then_some(TitleMatch::SharedWords { common })
}

/// Critère (a) des titres proches : même nombre de mots, un seul mot
/// différent, à distance d'édition d'au plus 2 et d'au plus le tiers du mot
/// le plus long (« Dupond » et « Dupont »).
fn one_word_edit(a: &[String], b: &[String]) -> bool {
    if a.is_empty() || a.len() != b.len() {
        return false;
    }
    let differing: Vec<(&String, &String)> = a.iter().zip(b).filter(|(x, y)| x != y).collect();
    let [(x, y)] = differing[..] else {
        return false;
    };
    let distance = edit_distance(x, y);
    let longest = x.chars().count().max(y.chars().count());
    distance <= 2 && distance * 3 <= longest
}

/// Mots d'un corps, clé en minuscules, pour le recouvrement de contenu.
fn content_words(tokens: &[Token]) -> Vec<String> {
    tokens
        .iter()
        .filter(|t| t.word)
        .map(|t| t.key.to_lowercase())
        .collect()
}

/// Nombre de mots communs aux deux listes, répétitions comprises.
fn common_count(a: &[String], b: &[String]) -> usize {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for word in a {
        *counts.entry(word).or_default() += 1;
    }
    b.iter()
        .filter(|word| {
            counts.get_mut(word.as_str()).is_some_and(|n| {
                *n > 0 && {
                    *n -= 1;
                    true
                }
            })
        })
        .count()
}

/// Distance de Levenshtein, en caractères.
fn edit_distance(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let substitution = diagonal + usize::from(ca != cb);
            diagonal = row[j + 1];
            row[j + 1] = substitution.min(row[j] + 1).min(row[j + 1] + 1);
        }
    }
    row[b.len()]
}

impl Prepared {
    /// Paires de textes à comparer, dans l'ordre de la version générée, puis
    /// les sections envoyées restées seules.
    fn pairs(&self) -> Vec<Pair<'_>> {
        use std::borrow::Cow;
        if !self.aligned {
            // Mesure globale : titres et corps à la suite, dans l'ordre.
            let all = |sections: &[Section]| -> Vec<Token> {
                sections
                    .iter()
                    .flat_map(|s| s.title_tokens.iter().chain(&s.tokens).cloned())
                    .collect()
            };
            return vec![Pair {
                place: Place::Global,
                generated_title: &[],
                sent_title: &[],
                generated: Cow::Owned(all(&self.generated)),
                sent: Cow::Owned(all(&self.sent)),
            }];
        }
        let mut pairs = Vec::new();
        for (index, (section, matched)) in self.generated.iter().zip(&self.matches).enumerate() {
            let counterpart = matched.map(|j| &self.sent[j]);
            pairs.push(Pair {
                place: Place::Section {
                    index: index as u32,
                    role: SectionRole::from_title(section.title.as_deref()),
                    matched: counterpart.is_some(),
                },
                generated_title: &section.title_tokens,
                sent_title: counterpart.map_or(&[][..], |s| &s.title_tokens),
                generated: Cow::Borrowed(&section.tokens),
                sent: Cow::Borrowed(counterpart.map_or(&[][..], |s| &s.tokens)),
            });
        }
        for (j, section) in self.sent.iter().enumerate() {
            if !self.matches.contains(&Some(j)) {
                pairs.push(Pair {
                    place: Place::UnmatchedSent,
                    generated_title: &[],
                    sent_title: &section.title_tokens,
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
    /// Clé d'alignement : titre normalisé (`title_key`).
    title: Option<String>,
    /// Mots du titre (clé en minuscules), pour l'appariement approché.
    title_words: Vec<String>,
    /// Mots et signes du titre, numérotation de tête retirée : comptés
    /// comme ceux du corps (issue 730).
    title_tokens: Vec<Token>,
    tokens: Vec<Token>,
}

/// Clé d'un titre : clé de comparaison des mots (NFKC, repli typographique),
/// espaces fusionnées, numérotation de tête retirée (`2.`, `1.3`, `IV.`,
/// `b)`), deux-points ou point final retirés, casse ignorée.
fn title_key(text: &str) -> String {
    let folded = normalize::comparison_key(text);
    let mut words: Vec<&str> = folded.split_whitespace().collect();
    if words.len() > 1 && is_heading_number(words[0]) {
        words.remove(0);
    }
    words
        .join(" ")
        .trim_end_matches([':', '.'])
        .trim()
        .to_lowercase()
}

/// Texte d'un titre sans sa numérotation de tête, pour le compte des mots.
fn strip_heading_number(text: &str) -> &str {
    let trimmed = text.trim_start();
    match trimmed.split_once(char::is_whitespace) {
        Some((first, rest))
            if !rest.trim().is_empty() && is_heading_number(&normalize::comparison_key(first)) =>
        {
            rest
        }
        _ => trimmed,
    }
}

/// Numéro de titre : chiffres séparés par des points (`2`, `2.`, `1.3`,
/// `1.3)`), chiffres romains en capitales suivis de `.` ou `)` (`IV.`), ou
/// une lettre minuscule suivie de `)` (`b)`).
fn is_heading_number(word: &str) -> bool {
    let trimmed = word.trim_end_matches(['.', ')']);
    let delimited = trimmed.len() < word.len();
    if trimmed.is_empty() {
        return false;
    }
    let decimal = trimmed
        .split('.')
        .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()));
    let roman = delimited && trimmed.chars().all(|c| "IVXLCDM".contains(c));
    let letter =
        word.len() == 2 && word.ends_with(')') && trimmed.chars().all(|c| c.is_ascii_lowercase());
    decimal || roman || letter
}

/// Titre de la version générée, connu au découpage de la version envoyée.
struct KnownTitle {
    key: String,
    words: Vec<String>,
}

/// Découpe en sections. Dans la version envoyée, une ligne identique à un
/// titre généré ouvre aussi une section : un texte collé depuis un wiki perd
/// souvent la mise en forme des titres. Dans un texte brut (`plain`), une
/// ligne qui remplit le critère (a) des titres proches (`one_word_edit`)
/// face à un titre généré pas encore retrouvé en ouvre une aussi : un titre
/// corrigé d'un mot reste un titre. Le critère (b), trop permissif pour une
/// ligne de corps, ne s'applique pas ici.
fn sections(
    blocks: Vec<Block>,
    known: &[KnownTitle],
    plain: bool,
) -> Result<Vec<Section>, MeasureError> {
    let mut out = vec![Section::default()];
    let mut found = vec![false; known.len()];
    let mut count = 0usize;
    for block in blocks {
        let key = title_key(&block.text);
        let exact = known.iter().position(|title| title.key == key);
        let near = (plain && !block.heading && exact.is_none())
            .then(|| {
                let mut tokens = Vec::new();
                normalize::tokens(&key, &mut tokens);
                let words = content_words(&tokens);
                known
                    .iter()
                    .enumerate()
                    .position(|(i, title)| !found[i] && one_word_edit(&title.words, &words))
            })
            .flatten();
        if let Some(i) = exact.or(near) {
            found[i] = true;
        }
        if block.heading || exact.is_some() || near.is_some() {
            let mut title_tokens = Vec::new();
            normalize::tokens(strip_heading_number(&block.text), &mut title_tokens);
            count += title_tokens.len();
            if count > MAX_TOKENS {
                return Err(MeasureError::TooManyTokens);
            }
            out.push(Section {
                title: Some(key),
                title_words: content_words(&title_tokens),
                title_tokens,
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
    // Deux sections de même titre : la seconde, titre compris, est fusionnée
    // dans le corps de la première.
    let mut merged: Vec<Section> = Vec::new();
    for section in out {
        match merged
            .iter_mut()
            .find(|s| s.title.is_some() && s.title == section.title)
        {
            Some(existing) => {
                existing.tokens.extend(section.title_tokens);
                existing.tokens.extend(section.tokens);
            }
            None => merged.push(section),
        }
    }
    Ok(merged)
}

fn word_count(tokens: &[Token]) -> u64 {
    tokens.iter().filter(|t| t.word).count() as u64
}

/// Mots-outils français et anglais (liste fermée, en minuscules, clé de
/// comparaison) : articles, prépositions, conjonctions, pronoms et
/// auxiliaires courants. Un mot-outil ne forme jamais une paire de mots
/// proches avec un autre mot (« les » et « des », « sur » et « sous ») :
/// sinon il découperait un remplacement de fond en morceaux courts, classés
/// lexicaux dès qu'ils touchent un nom propre (règle v2, issue 732). Les
/// mots élidés (`l'équipe`) restent d'un seul tenant et n'y figurent pas.
const FUNCTION_WORDS: &[&str] = &[
    // Français.
    "à", "au", "aux", "avec", "ce", "ces", "cet", "cette", "chez", "dans", "de", "des", "du",
    "elle", "elles", "en", "entre", "est", "et", "il", "ils", "je", "la", "le", "les", "leur",
    "leurs", "lui", "ma", "mais", "me", "mes", "mon", "ne", "ni", "nos", "notre", "nous", "on",
    "ont", "ou", "où", "par", "pour", "qu", "que", "qui", "sa", "sans", "se", "ses", "son", "sont",
    "sous", "sur", "ta", "te", "tes", "ton", "tu", "un", "une", "vers", "vos", "votre", "vous",
    "y", // Anglais.
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "has", "have",
    "he", "her", "his", "i", "in", "into", "is", "it", "its", "my", "nor", "of", "or", "our",
    "she", "so", "than", "that", "the", "their", "them", "these", "they", "this", "those", "to",
    "was", "we", "were", "which", "who", "will", "with", "you", "your",
];

/// Au-delà de ce nombre de paires de mots (mots anciens × mots nouveaux),
/// un remplacement n'est pas apparié mot à mot : il est classé d'un bloc,
/// comme en v1. Borne fixe : le résultat ne dépend pas du temps de calcul.
const MAX_PAIRING_CELLS: usize = 250_000;

fn is_function_word(token: &Token) -> bool {
    FUNCTION_WORDS.contains(&token.key.to_lowercase().as_str())
}

/// Diff mot à mot puis classement de chaque différence, transmise à `visit`
/// avec ses deux côtés. Règle v2 (issue 732) :
///
/// 1. diff de patience (`Algorithm::Patience`), stable sur les mots répétés
///    (articles, statuts d'un tableau) ;
/// 2. dans une différence qui a des mots des deux côtés, appariement mot à
///    mot (`pair_words`) : un mot identique ne compte pas, un mot proche
///    (même mot à la casse près, ou à faible distance d'édition) est un
///    remplacement d'un mot, classé seul ; le reste, entre deux paires, est
///    classé comme en v1 (ajout, suppression ou remplacement).
///
/// « Dupond » → « Durand, Dupont » : « Dupond » et « Dupont » s'apparient
/// (1 mot lexical), « Durand » est ajouté (1 mot de fond).
///
/// Pas de fusion de deux différences par-dessus des mots-outils : la
/// relecture a montré qu'elle minore la reprise (le mot-outil de l'écart
/// s'apparie à une autre occurrence, un écart de ponctuation seule fait d'un
/// ajout et d'une suppression un remplacement), et que, rendue sûre en
/// ancrant les mots de l'écart, elle ne change plus aucun compteur.
fn diff(
    generated: &[Token],
    sent: &[Token],
    dictionary: &Dictionary,
    visit: &mut impl FnMut(&[Token], &[Token], Change),
) {
    // Comparaison sur la clé normalisée (issue 729) : `’` et `'`, `‑` et `-`
    // ne font pas deux mots différents.
    let old: Vec<&str> = generated.iter().map(|t| t.key.as_str()).collect();
    let new: Vec<&str> = sent.iter().map(|t| t.key.as_str()).collect();
    // Différences : suppression et insertion adjacentes forment une seule
    // différence (remplacement).
    let mut hunks: Vec<(std::ops::Range<usize>, std::ops::Range<usize>)> = Vec::new();
    let mut open = false;
    for op in capture_diff_slices(Algorithm::Patience, &old, &new) {
        let (o, n) = match op {
            DiffOp::Equal { .. } => {
                open = false;
                continue;
            }
            DiffOp::Delete {
                old_index,
                old_len,
                new_index,
            } => (old_index..old_index + old_len, new_index..new_index),
            DiffOp::Insert {
                old_index,
                new_index,
                new_len,
            } => (old_index..old_index, new_index..new_index + new_len),
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => (
                old_index..old_index + old_len,
                new_index..new_index + new_len,
            ),
        };
        match hunks.last_mut() {
            Some(last) if open => {
                last.0.end = o.end;
                last.1.end = n.end;
            }
            _ => hunks.push((o, n)),
        }
        open = true;
    }
    for (o, n) in hunks {
        classify_hunk(&generated[o], &sent[n], dictionary, visit);
    }
}

/// Classe une différence : appariement mot à mot, puis chaque paire proche
/// et chaque reste entre deux paires classés séparément.
fn classify_hunk(
    old: &[Token],
    new: &[Token],
    dictionary: &Dictionary,
    visit: &mut impl FnMut(&[Token], &[Token], Change),
) {
    let mut emit = |o: &[Token], n: &[Token]| {
        if let Some(change) = classify(o, n, dictionary) {
            visit(o, n, change);
        }
    };
    let (mut prev_o, mut prev_n) = (0, 0);
    for (i, j) in pair_words(old, new) {
        emit(&old[prev_o..i], &new[prev_n..j]);
        if old[i].key != new[j].key {
            emit(&old[i..=i], &new[j..=j]);
        }
        (prev_o, prev_n) = (i + 1, j + 1);
    }
    emit(&old[prev_o..], &new[prev_n..]);
}

/// Distance d'édition entre deux mots si elle est d'au plus `MAX_NEAR_EDITS`,
/// en temps borné : préfixe et suffixe communs retirés, puis Levenshtein sur
/// ce qui reste, au plus `MAX_NEAR_CORE` caractères de chaque côté (au-delà,
/// les mots ne sont pas proches). Le coût ne croît pas avec la longueur des
/// mots (relecture de l'issue 732).
fn near_distance(a: &[char], b: &[char]) -> Option<usize> {
    let prefix = a.iter().zip(b).take_while(|(x, y)| x == y).count();
    let (a, b) = (&a[prefix..], &b[prefix..]);
    let suffix = a
        .iter()
        .rev()
        .zip(b.iter().rev())
        .take_while(|(x, y)| x == y)
        .count();
    let (a, b) = (&a[..a.len() - suffix], &b[..b.len() - suffix]);
    if a.len().abs_diff(b.len()) > MAX_NEAR_EDITS || a.len().max(b.len()) > MAX_NEAR_CORE {
        return None;
    }
    let distance = edit_distance(&a.iter().collect::<String>(), &b.iter().collect::<String>());
    (distance <= MAX_NEAR_EDITS).then_some(distance)
}

/// Distance d'édition maximale entre deux mots proches.
const MAX_NEAR_EDITS: usize = 2;
/// Longueur maximale de la partie qui diffère entre deux mots proches.
const MAX_NEAR_CORE: usize = 16;
/// Longueur minimale (en caractères) du plus long de deux mots proches non
/// identiques à la casse près : en dessous, « 15h » et « 16h », « CRI » et
/// « CRM » restent dans le reste, classé comme en v1.
const MIN_NEAR_LENGTH: usize = 4;

/// Deux mots proches et leur distance : même clé à la casse près (distance
/// 0), ou distance d'édition d'au plus 2 et d'au plus le tiers du mot le plus
/// long, d'au moins 4 caractères, aucun des deux n'étant un mot-outil
/// (« Dupond » et « Dupont », « gpt » et « GPT4 » ; pas « 15h » et « 16h »,
/// ni « les » et « des »).
fn near_words(a: &Token, b: &Token) -> Option<usize> {
    let (a_key, b_key) = (a.key.to_lowercase(), b.key.to_lowercase());
    if a_key == b_key {
        return Some(0);
    }
    if is_function_word(a) || is_function_word(b) {
        return None;
    }
    let (a_chars, b_chars): (Vec<char>, Vec<char>) =
        (a_key.chars().collect(), b_key.chars().collect());
    let longest = a_chars.len().max(b_chars.len());
    if longest < MIN_NEAR_LENGTH {
        return None;
    }
    near_distance(&a_chars, &b_chars).filter(|distance| distance * 3 <= longest)
}

/// Appariement mot à mot d'un remplacement, dans l'ordre : paires (indices
/// de jetons) qui maximisent d'abord les mots identiques, puis les mots
/// proches, puis minimisent la distance cumulée des paires proches (« Dupond »
/// va avec « Dupont » plutôt qu'avec « Durand », dans tous les ordres). Vide
/// si un côté n'a pas de mot, ou au-delà de `MAX_PAIRING_CELLS`
/// (classement d'un bloc).
fn pair_words(old: &[Token], new: &[Token]) -> Vec<(usize, usize)> {
    let ow: Vec<usize> = (0..old.len()).filter(|&i| old[i].word).collect();
    let nw: Vec<usize> = (0..new.len()).filter(|&j| new[j].word).collect();
    if ow.is_empty() || nw.is_empty() || ow.len().saturating_mul(nw.len()) > MAX_PAIRING_CELLS {
        return Vec::new();
    }
    use std::cmp::Reverse;
    // score[i][j] : (identiques, proches, distance cumulée inversée) sur
    // ow[..i] × nw[..j], ordre lexicographique.
    type Score = (u32, u32, Reverse<u32>);
    let add = |(s, t, Reverse(d)): Score, (x, y, Reverse(e)): Score| -> Score {
        (s + x, t + y, Reverse(d + e))
    };
    let width = nw.len() + 1;
    let mut score: Vec<Score> = vec![(0, 0, Reverse(0)); (ow.len() + 1) * width];
    let at = |i: usize, j: usize| i * width + j;
    let gain = |i: usize, j: usize| -> Option<Score> {
        let (a, b) = (&old[ow[i]], &new[nw[j]]);
        if a.key == b.key {
            return Some((1, 0, Reverse(0)));
        }
        near_words(a, b).map(|distance| (0, 1, Reverse(distance as u32)))
    };
    for i in 1..=ow.len() {
        for j in 1..=nw.len() {
            let mut best = score[at(i - 1, j)].max(score[at(i, j - 1)]);
            if let Some(g) = gain(i - 1, j - 1) {
                best = best.max(add(score[at(i - 1, j - 1)], g));
            }
            score[at(i, j)] = best;
        }
    }
    // Reconstruction, de la fin vers le début : la paire d'abord quand elle
    // atteint le score, sinon le mot ancien sauté, sinon le nouveau.
    let mut pairs = Vec::new();
    let (mut i, mut j) = (ow.len(), nw.len());
    while i > 0 && j > 0 {
        let here = score[at(i, j)];
        if let Some(g) = gain(i - 1, j - 1)
            && add(score[at(i - 1, j - 1)], g) == here
        {
            pairs.push((ow[i - 1], nw[j - 1]));
            i -= 1;
            j -= 1;
            continue;
        }
        if score[at(i - 1, j)] == here {
            i -= 1;
        } else {
            j -= 1;
        }
    }
    pairs.reverse();
    pairs
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
mod corpus_tests;
#[cfg(test)]
mod tests;
