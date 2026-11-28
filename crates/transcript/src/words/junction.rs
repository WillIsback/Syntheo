//! Jonction d'un flux rouvert (issue 629). Au `checkpoint`, le texte
//! provisoire est validé ; le flux suivant retranscrit la parole rejouée avec
//! ses propres horodatages. Le filtre temporel (`dedup`) écarte la plupart des
//! mots rejoués, mais un mot validé avec un horodatage approximatif peut le
//! passer et revenir une seconde fois. La jonction compare donc le début du
//! nouveau flux à la fin du texte déjà livré, et retire la reprise.

use std::collections::VecDeque;

use crate::types::{FinalizedWord, RawWord};

/// Mots livrés gardés pour la comparaison : plus que ce qu'une reprise de
/// quelques secondes peut répéter après le filtre temporel.
const TAIL_WORDS: usize = 32;

/// Seuls les mots qui commencent au plus tard ce délai après la reprise
/// peuvent être une reprise du texte livré ; au-delà, c'est une parole
/// nouvelle, même si elle répète un mot.
const WINDOW_MS: i64 = 2_000;

#[derive(Default)]
pub(crate) struct Junction {
    tail: VecDeque<String>,
    /// Position de la reprise, tant que le nouveau flux n'a pas livré de mot
    /// final au-delà de la reprise.
    open_at: Option<i64>,
}

impl Junction {
    /// Retient les derniers mots livrés.
    pub(crate) fn remember(&mut self, words: &[FinalizedWord]) {
        for word in words {
            self.tail.push_back(word.text.clone());
        }
        while self.tail.len() > TAIL_WORDS {
            self.tail.pop_front();
        }
    }

    /// Un flux va être remplacé : le suivant reprendra à `boundary_ms`.
    pub(crate) fn open(&mut self, boundary_ms: i64) {
        if !self.tail.is_empty() {
            self.open_at = Some(boundary_ms);
        }
    }

    /// Retire du début de `words` les mots qui répètent la fin du texte
    /// livré. Un lot final (`closes`) ferme la jonction dès qu'il apporte un
    /// mot nouveau ou qu'il commence après la fenêtre de reprise.
    pub(crate) fn trim(&mut self, mut words: Vec<RawWord>, closes: bool) -> Vec<RawWord> {
        let Some(boundary) = self.open_at else {
            return words;
        };
        let window = words
            .iter()
            .take_while(|word| word.start_ms <= boundary + WINDOW_MS)
            .count();
        let repeated = self.repeated_prefix(&words[..window], words.get(window));
        words.drain(..repeated);
        if closes && !words.is_empty() {
            self.open_at = None;
        }
        words
    }

    /// Plus long début de `words` dont le texte normalisé termine le texte
    /// livré, coupé à une frontière de mot des deux côtés.
    fn repeated_prefix(&self, words: &[RawWord], after: Option<&RawWord>) -> usize {
        let tail: String = self
            .tail
            .iter()
            .map(|text| normalized(text, true))
            .collect();
        let starts_word = |word: Option<&RawWord>| word.is_none_or(|w| begins_word(&w.text));
        if words.first().is_none_or(|w| !begins_word(&w.text)) {
            return 0;
        }
        for k in (1..=words.len()).rev() {
            let next = if k < words.len() { words.get(k) } else { after };
            if !starts_word(next) {
                continue;
            }
            let prefix: String = words[..k]
                .iter()
                .map(|word| normalized(&word.text, begins_word(&word.text)))
                .collect();
            if prefix.trim().is_empty() {
                continue;
            }
            if tail.ends_with(&prefix) {
                return k;
            }
        }
        0
    }
}

/// Un morceau qui commence par une espace ouvre un mot ; un morceau collé
/// continue le mot précédent.
fn begins_word(text: &str) -> bool {
    text.starts_with(char::is_whitespace)
}

/// Lettres et chiffres en minuscules, précédés d'une espace si le morceau
/// ouvre un mot : la ponctuation et la casse ne distinguent pas une reprise.
fn normalized(text: &str, opens_word: bool) -> String {
    let letters: String = text
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    if opens_word && !letters.is_empty() {
        format!(" {letters}")
    } else {
        letters
    }
}
