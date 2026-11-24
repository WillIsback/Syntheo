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
    let generated = sections(normalize::blocks(generated, generated_format), &[])?;
    let titles: Vec<String> = generated.iter().filter_map(|s| s.title.clone()).collect();
    let sent = sections(normalize::blocks(sent, sent_format), &titles)?;
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
    let mut taken = vec![false; sent.len()];
    for j in matches.iter().flatten() {
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
    if a.len() == b.len() {
        let differing: Vec<(&String, &String)> = a.iter().zip(b).filter(|(x, y)| x != y).collect();
        if let [(x, y)] = differing[..] {
            let distance = edit_distance(x, y);
            let longest = x.chars().count().max(y.chars().count());
            if distance <= 2 && distance * 3 <= longest {
                return Some(TitleMatch::OneWordEdit);
            }
        }
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

/// Découpe en sections. Dans la version envoyée, une ligne identique à un
/// titre généré ouvre aussi une section : un texte collé depuis un wiki perd
/// souvent la mise en forme des titres.
fn sections(blocks: Vec<Block>, known_titles: &[String]) -> Result<Vec<Section>, MeasureError> {
    let mut out = vec![Section::default()];
    let mut count = 0usize;
    for block in blocks {
        let key = title_key(&block.text);
        if block.heading || known_titles.contains(&key) {
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

/// Diff mot à mot (plus courte suite d'éditions, Myers) puis classement de
/// chaque différence, transmise à `visit` avec ses deux côtés.
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
