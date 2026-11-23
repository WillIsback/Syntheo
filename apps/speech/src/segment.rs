//! Découpage en énoncés et en mots, indépendant du modèle : des jetons datés
//! (trame d'émission dans la tranche) entrent, des événements du protocole
//! sortent. Testé sans modèle sur des suites de jetons synthétiques.
//!
//! - Instant d'un jeton : début de sa tranche + trame × 80 ms.
//! - Silence de fin d'énoncé : mesuré jeton par jeton, entre l'instant du
//!   dernier jeton de mot et celui du mot suivant ; une ponctuation ne le
//!   repousse jamais.
//! - Un nouveau mot après ce silence ferme l'énoncé ouvert. Sans aucun jeton
//!   de mot pendant le silence plus une tranche de grâce, comptés depuis la
//!   fin de la tranche du dernier jeton, l'énoncé se ferme à la fin de la
//!   tranche (le modèle émet parfois la fin d'un mot plus d'une seconde après
//!   son début).
//! - Une ponctuation rejoint le dernier mot de l'énoncé ouvert ; arrivée après
//!   sa fermeture, elle est écartée (elle n'ouvre pas de phrase).
//! - Fin d'un mot : instant de son dernier jeton + une trame, bornée par le
//!   début du mot suivant et par l'audio réellement reçu.

use crate::protocol::{Event, Word};

/// Une trame de l'encodeur : 80 ms.
pub const FRAME_SECONDS: f64 = 0.08;

/// Jeton émis par le modèle dans une tranche.
#[derive(Debug, Clone)]
pub struct Token {
    /// Morceau SentencePiece ; `▁` marque un début de mot.
    pub text: String,
    /// Trame d'émission, comptée depuis le début de la tranche.
    pub frame: usize,
    pub logprob: f32,
}

impl Token {
    pub fn new(text: &str, frame: usize) -> Self {
        Self {
            text: text.to_owned(),
            frame,
            logprob: 0.0,
        }
    }
}

struct OpenWord {
    text: String,
    start: f64,
    /// Instant du dernier jeton alphanumérique du mot.
    last_at: f64,
    logprob_sum: f32,
    tokens: u32,
}

pub struct Segmenter {
    silence: f64,
    grace: f64,
    words: Vec<OpenWord>,
    /// Instant du dernier jeton de mot de l'énoncé ouvert.
    last_word_at: f64,
    /// Fin de la tranche de ce dernier jeton : la grâce part de là, le
    /// modèle émettant parfois la suite d'un mot plus d'une seconde après.
    last_word_chunk_end: f64,
    /// Le dernier jeton était un « ▁ » seul : le suivant ouvre un mot.
    word_pending: bool,
}

impl Segmenter {
    /// `silence` : silence de fin d'énoncé ; `grace` : délai de plus sans
    /// aucun jeton avant de fermer à la fin d'une tranche (le modèle émet
    /// parfois la fin d'un mot ou la ponctuation une tranche plus tard).
    pub fn new(silence: f64, grace: f64) -> Self {
        Self {
            silence,
            grace,
            words: Vec::new(),
            last_word_at: 0.0,
            last_word_chunk_end: 0.0,
            word_pending: false,
        }
    }

    /// Jetons d'une tranche `[start, end)` (secondes depuis le début du flux).
    /// `speaker(t)` donne l'intervenant à l'instant `t`, s'il est connu.
    pub fn chunk(
        &mut self,
        start: f64,
        end: f64,
        tokens: &[Token],
        speaker: &mut dyn FnMut(f64) -> Option<u32>,
    ) -> Vec<Event> {
        let mut events = Vec::new();
        let mut delta = String::new();
        for token in tokens {
            // Étiquette de langue (`<fr-FR>`) en détection automatique.
            if token.text.starts_with('<') && token.text.ends_with('>') {
                continue;
            }
            let piece = token.text.replace('\u{2581}', " ");
            let text = piece.trim_start();
            if text.is_empty() {
                if !piece.is_empty() {
                    self.word_pending = true;
                }
                continue;
            }
            let at = start + token.frame as f64 * FRAME_SECONDS;
            if !text.chars().any(char::is_alphanumeric) {
                // Ponctuation : rejoint le dernier mot, sans repousser le
                // silence ; écartée si l'énoncé est déjà fermé.
                if let Some(word) = self.words.last_mut() {
                    word.text.push_str(text);
                    delta.push_str(text);
                }
                continue;
            }
            // Le drapeau est toujours consommé, même quand le jeton porte déjà
            // sa propre espace.
            let pending = std::mem::take(&mut self.word_pending);
            let starts_word = piece.starts_with(' ') || pending || self.words.is_empty();
            if starts_word && !self.words.is_empty() && at - self.last_word_at >= self.silence {
                if !delta.is_empty() {
                    events.push(Event::Delta(std::mem::take(&mut delta)));
                }
                events.push(self.close(at, speaker));
            }
            if starts_word {
                if !self.words.is_empty() {
                    delta.push(' ');
                }
                self.words.push(OpenWord {
                    text: text.to_owned(),
                    start: at,
                    last_at: at,
                    logprob_sum: token.logprob,
                    tokens: 1,
                });
            } else if let Some(word) = self.words.last_mut() {
                word.text.push_str(text);
                word.last_at = at;
                word.logprob_sum += token.logprob;
                word.tokens += 1;
            }
            delta.push_str(text);
            self.last_word_at = at;
            self.last_word_chunk_end = end;
        }
        if !delta.is_empty() {
            events.push(Event::Delta(delta));
        }
        if !self.words.is_empty() && end - self.last_word_chunk_end >= self.silence + self.grace {
            events.push(self.close(end, speaker));
        }
        events
    }

    /// Fin du flux : ferme l'énoncé ouvert ; aucune fin de mot au-delà de
    /// `audio_end`, la durée réellement reçue.
    pub fn finish(
        &mut self,
        audio_end: f64,
        speaker: &mut dyn FnMut(f64) -> Option<u32>,
    ) -> Vec<Event> {
        if self.words.is_empty() {
            Vec::new()
        } else {
            vec![self.close(audio_end, speaker)]
        }
    }

    /// Ferme l'énoncé ouvert ; aucun mot ne finit après `limit`.
    fn close(&mut self, limit: f64, speaker: &mut dyn FnMut(f64) -> Option<u32>) -> Event {
        let open = std::mem::take(&mut self.words);
        let starts: Vec<f64> = open.iter().map(|w| w.start.min(limit)).collect();
        let words: Vec<Word> = open
            .into_iter()
            .enumerate()
            .map(|(i, word)| {
                let start = starts[i];
                let next = starts.get(i + 1).copied().unwrap_or(limit);
                let end = (word.last_at + FRAME_SECONDS)
                    .min(next)
                    .min(limit)
                    .max(start);
                let confidence = f64::from((word.logprob_sum / word.tokens as f32).exp());
                Word {
                    speaker: speaker((start + end) / 2.0),
                    word: word.text,
                    start,
                    end,
                    confidence: confidence.clamp(0.0, 1.0),
                }
            })
            .collect();
        let transcript = words
            .iter()
            .map(|w| w.word.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        Event::Completed { transcript, words }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHUNK: f64 = 0.56;

    fn none(_: f64) -> Option<u32> {
        None
    }

    /// Passe des tranches successives de jetons ; rend tous les événements.
    fn run(segmenter: &mut Segmenter, chunks: &[Vec<Token>]) -> Vec<Event> {
        let mut events = Vec::new();
        for (i, tokens) in chunks.iter().enumerate() {
            let start = i as f64 * CHUNK;
            events.extend(segmenter.chunk(start, start + CHUNK, tokens, &mut none));
        }
        events
    }

    fn completed(events: &[Event]) -> Vec<(String, Vec<(f64, f64)>)> {
        events
            .iter()
            .filter_map(|e| match e {
                Event::Completed { transcript, words } => Some((
                    transcript.clone(),
                    words.iter().map(|w| (w.start, w.end)).collect(),
                )),
                Event::Delta(_) => None,
            })
            .collect()
    }

    fn close_enough(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    // Revue 0.8.0 (module), constat 4 : une ponctuation tardive dans la même
    // tranche que le mot suivant ne retient pas l'énoncé.
    #[test]
    fn late_punctuation_does_not_keep_the_utterance_open() {
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        let events = run(
            &mut segmenter,
            &[
                vec![Token::new("▁réunion", 2)],
                vec![],
                vec![],
                vec![Token::new(".", 0), Token::new("▁Bonjour", 3)],
            ],
        );
        let events = [events, segmenter.finish(4.0 * CHUNK, &mut none)].concat();
        let texts: Vec<String> = completed(&events).into_iter().map(|c| c.0).collect();
        assert_eq!(texts, ["réunion.", "Bonjour"]);
    }

    // Constat 6 : le silence de fin d'énoncé est mesuré entre jetons, à une
    // trame près, pas en tranches entières.
    #[test]
    fn endpointing_is_measured_between_tokens() {
        // 0,16 s puis 1,20 s : 1,04 s entre les deux mots, fermé.
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        let events = run(
            &mut segmenter,
            &[
                vec![Token::new("▁un", 2)],
                vec![],
                vec![Token::new("▁deux", 1)],
            ],
        );
        assert_eq!(completed(&events).len(), 1);
        // 0,24 s puis 1,20 s : 0,96 s, même énoncé.
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        let events = run(
            &mut segmenter,
            &[
                vec![Token::new("▁un", 3)],
                vec![],
                vec![Token::new("▁deux", 1)],
            ],
        );
        assert!(completed(&events).is_empty());
    }

    #[test]
    fn grace_closes_after_silence_without_tokens() {
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        // Dernier jeton dans la première tranche (fin à 0,56 s) : 1,56 s de
        // silence et de grâce atteintes à la fin de la quatrième (2,24 s).
        let events = run(
            &mut segmenter,
            &[vec![Token::new("▁seul", 1)], vec![], vec![], vec![]],
        );
        assert_eq!(completed(&events).len(), 1);
    }

    #[test]
    fn a_word_continues_across_chunks_and_ends_one_frame_after_its_last_token() {
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        let events = run(
            &mut segmenter,
            &[
                vec![Token::new("▁Bon", 6)],
                vec![Token::new("jour", 1), Token::new("▁toi", 4)],
            ],
        );
        let events = [events, segmenter.finish(2.0, &mut none)].concat();
        let all = completed(&events);
        assert_eq!(all[0].0, "Bonjour toi");
        let (start, end) = all[0].1[0];
        assert!(close_enough(start, 0.48));
        assert!(close_enough(end, 0.56 + 0.08 + 0.08));
    }

    // Constat 7 : au commit, aucune fin de mot au-delà de l'audio reçu.
    #[test]
    fn the_last_word_never_ends_after_the_received_audio() {
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        // Jeton émis dans la tranche de silence ajoutée au commit.
        let events = run(
            &mut segmenter,
            &[vec![Token::new("▁fin", 5)], vec![Token::new("ale", 3)]],
        );
        let events = [events, segmenter.finish(0.5, &mut none)].concat();
        let all = completed(&events);
        for (start, end) in &all[0].1 {
            assert!(*start <= 0.5 && *end <= 0.5 && start <= end);
        }
    }

    #[test]
    fn punctuation_after_the_close_is_dropped_and_deltas_rebuild_each_utterance() {
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        let events = run(
            &mut segmenter,
            &[
                vec![
                    Token::new("▁un", 0),
                    Token::new("▁", 2),
                    Token::new("deux", 3),
                ],
                vec![],
                vec![],
                vec![],
                vec![Token::new(",", 0), Token::new("▁trois", 2)],
            ],
        );
        let events = [events, segmenter.finish(3.0, &mut none)].concat();
        let mut open = String::new();
        let mut rebuilt = Vec::new();
        for event in &events {
            match event {
                Event::Delta(delta) => open.push_str(delta),
                Event::Completed { transcript, .. } => {
                    assert_eq!(&std::mem::take(&mut open), transcript);
                    rebuilt.push(transcript.clone());
                }
            }
        }
        assert_eq!(rebuilt, ["un deux", "trois"]);
    }

    // Suite réelle du modèle : « . », « ▁ » seul, étiquette de langue, puis
    // « ▁A » et « près » : un seul mot « Après ».
    #[test]
    fn a_pending_word_start_is_consumed_by_a_spaced_token() {
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        let events = run(
            &mut segmenter,
            &[
                vec![
                    Token::new("▁pas", 1),
                    Token::new(".", 6),
                    Token::new("▁", 6),
                    Token::new("<fr-FR>", 6),
                ],
                vec![
                    Token::new("▁A", 2),
                    Token::new("près", 3),
                    Token::new(",", 4),
                ],
            ],
        );
        let events = [events, segmenter.finish(2.0, &mut none)].concat();
        let texts: Vec<String> = completed(&events).into_iter().map(|c| c.0).collect();
        assert_eq!(texts, ["pas. Après,"]);
    }

    #[test]
    fn speakers_come_from_the_word_middle() {
        let mut segmenter = Segmenter::new(1.0, CHUNK);
        let mut speaker = |t: f64| Some(if t < 0.3 { 1 } else { 2 });
        let mut events = segmenter.chunk(
            0.0,
            CHUNK,
            &[Token::new("▁a", 0), Token::new("▁b", 5)],
            &mut speaker,
        );
        events.extend(segmenter.finish(CHUNK, &mut speaker));
        let Some(Event::Completed { words, .. }) = events.last() else {
            panic!("expected a completed utterance")
        };
        assert_eq!(
            words.iter().map(|w| w.speaker).collect::<Vec<_>>(),
            [Some(1), Some(2)]
        );
    }
}
