use aspasia::{Subtitle as SubtitleTrait, TimedSubtitleFile, WebVttSubtitle};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Token {
    text: String,
    start_time: u64,
    end_time: u64,
    speaker: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Subtitle {
    tokens: Vec<Token>,
}

impl From<TimedSubtitleFile> for Subtitle {
    fn from(sub: TimedSubtitleFile) -> Self {
        let vtt: WebVttSubtitle = sub.into();

        let tokens = vtt
            .events()
            .iter()
            .flat_map(|cue| {
                cue_tokens(
                    &cue.text,
                    i64::from(cue.start) as u64,
                    i64::from(cue.end) as u64,
                )
            })
            .collect();

        Self { tokens }
    }
}

/// Une portion de cue dite par une même voix.
#[derive(Debug, PartialEq)]
struct VoiceRun {
    speaker: Option<String>,
    text: String,
}

/// Les jetons d'un cue : un par voix, dans l'ordre du texte.
///
/// L'identifiant du cue n'est pas un locuteur : la conversion SubRip y met le
/// numéro de ligne. Seules les balises de voix `<v Nom>` nomment un
/// intervenant. Quand un cue porte plusieurs voix, sa durée est partagée entre
/// elles au prorata de la longueur du texte, pour garder leur ordre.
fn cue_tokens(text: &str, start_time: u64, end_time: u64) -> Vec<Token> {
    let runs = parse_cue_text(text);
    let total_chars: u64 = runs.iter().map(|run| run.text.chars().count() as u64).sum();
    let duration = end_time.saturating_sub(start_time);

    let mut tokens = Vec::with_capacity(runs.len());
    let mut elapsed_chars = 0;
    let last = runs.len().saturating_sub(1);
    for (index, run) in runs.into_iter().enumerate() {
        let run_start = start_time + duration * elapsed_chars / total_chars.max(1);
        elapsed_chars += run.text.chars().count() as u64;
        let run_end = if index == last {
            end_time
        } else {
            start_time + duration * elapsed_chars / total_chars.max(1)
        };
        tokens.push(Token {
            text: run.text,
            start_time: run_start,
            end_time: run_end,
            speaker: run.speaker,
        });
    }
    tokens
}

/// Lit le texte d'un cue WebVTT : retire les balises (voix `<v>`, classe
/// `<c>`, `<i>`, `<b>`, `<u>`, `<lang>`, `<ruby>`, horodatages
/// `<00:00:01.000>`), ignore les annotations `<rt>`, décode les entités et
/// découpe le texte par voix.
fn parse_cue_text(input: &str) -> Vec<VoiceRun> {
    let mut runs: Vec<VoiceRun> = vec![VoiceRun {
        speaker: None,
        text: String::new(),
    }];
    let mut in_ruby_text = false;
    let mut rest = input;

    while !rest.is_empty() {
        let Some(open) = rest.find('<') else {
            push_text(&mut runs, rest, in_ruby_text);
            break;
        };
        push_text(&mut runs, &rest[..open], in_ruby_text);
        let after_open = &rest[open + 1..];
        let Some(close) = after_open.find('>') else {
            // Balise non fermée : le parseur WebVTT l'ignore jusqu'à la fin.
            break;
        };
        let tag = &after_open[..close];
        rest = &after_open[close + 1..];

        if let Some(end_tag) = tag.strip_prefix('/') {
            match tag_name(end_tag) {
                "v" => start_run(&mut runs, None),
                "rt" => in_ruby_text = false,
                _ => {}
            }
            continue;
        }

        match tag_name(tag) {
            "v" => {
                let annotation = tag
                    .split_once(|c: char| c.is_whitespace())
                    .map(|(_, name)| name.trim())
                    .unwrap_or_default();
                let speaker = (!annotation.is_empty()).then(|| decode_entities(annotation));
                start_run(&mut runs, speaker);
            }
            "rt" => in_ruby_text = true,
            _ => {}
        }
    }

    let mut cleaned: Vec<VoiceRun> = Vec::with_capacity(runs.len());
    for run in runs {
        let text = run.text.trim();
        // Un tiret ou une ponctuation seule entre deux voix n'est pas une réplique.
        if !text.chars().any(char::is_alphanumeric) {
            continue;
        }
        match cleaned.last_mut() {
            Some(previous) if previous.speaker == run.speaker => {
                previous.text.push(' ');
                previous.text.push_str(text);
            }
            _ => cleaned.push(VoiceRun {
                speaker: run.speaker,
                text: text.to_string(),
            }),
        }
    }
    cleaned
}

/// Nom d'une balise, sans ses classes (`v.loud Alice` -> `v`).
fn tag_name(tag: &str) -> &str {
    tag.split(|c: char| c == '.' || c.is_whitespace())
        .next()
        .unwrap_or_default()
}

fn start_run(runs: &mut Vec<VoiceRun>, speaker: Option<String>) {
    runs.push(VoiceRun {
        speaker,
        text: String::new(),
    });
}

fn push_text(runs: &mut [VoiceRun], text: &str, in_ruby_text: bool) {
    if in_ruby_text || text.is_empty() {
        return;
    }
    if let Some(run) = runs.last_mut() {
        run.text.push_str(&decode_entities(text));
    }
}

fn decode_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", "\u{a0}")
        .replace("&lrm;", "\u{200e}")
        .replace("&rlm;", "\u{200f}")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

pub fn parse_subtitle_from_path<P: AsRef<std::path::Path>>(
    path: P,
) -> std::result::Result<Subtitle, String> {
    let sub = TimedSubtitleFile::new(path.as_ref()).map_err(|e| e.to_string())?;
    Ok(sub.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn parse(extension: &str, content: &str) -> Vec<(Option<String>, String, u64, u64)> {
        let mut file = tempfile::Builder::new()
            .suffix(extension)
            .tempfile()
            .unwrap();
        file.write_all(content.as_bytes()).unwrap();
        parse_subtitle_from_path(file.path())
            .unwrap()
            .tokens
            .into_iter()
            .map(|token| (token.speaker, token.text, token.start_time, token.end_time))
            .collect()
    }

    fn some(name: &str) -> Option<String> {
        Some(name.to_string())
    }

    #[test]
    fn vtt_voice_tags_name_the_speakers_and_leave_the_text() {
        let tokens = parse(
            ".vtt",
            "WEBVTT\n\n\
             1\n00:00:00.000 --> 00:00:02.000\n<v Alice>Bonjour à tous.</v>\n\n\
             2\n00:00:02.000 --> 00:00:04.000\n<v.loud Bruno>Salut <i>Alice</i> &amp; merci.\n\n\
             00:00:04.000 --> 00:00:06.000\n<v Alice Martin><c.yellow>On</c> <00:00:04.500>commence <b>maintenant</b>.</v>\n",
        );

        assert_eq!(
            tokens,
            vec![
                (some("Alice"), "Bonjour à tous.".to_string(), 0, 2000),
                (
                    some("Bruno"),
                    "Salut Alice & merci.".to_string(),
                    2000,
                    4000
                ),
                (
                    some("Alice Martin"),
                    "On commence maintenant.".to_string(),
                    4000,
                    6000
                ),
            ]
        );
    }

    #[test]
    fn vtt_cue_with_several_voices_is_split_in_order() {
        let tokens = parse(
            ".vtt",
            "WEBVTT\n\n00:00:10.000 --> 00:00:14.000\n- <v Alice>Tu viens ?</v>\n- <v Bruno>Oui, j'arrive.</v>\n",
        );

        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].0, some("Alice"));
        assert_eq!(tokens[0].1, "Tu viens ?");
        assert_eq!(tokens[1].0, some("Bruno"));
        assert_eq!(tokens[1].1, "Oui, j'arrive.");
        assert_eq!(tokens[0].2, 10_000);
        assert!(tokens[0].3 <= tokens[1].2);
        assert!(tokens[1].2 > 10_000);
        assert_eq!(tokens[1].3, 14_000);
    }

    #[test]
    fn vtt_other_inline_tags_are_removed() {
        let tokens = parse(
            ".vtt",
            "WEBVTT\n\nNOTE commentaire\n\nintro\n00:00:00.000 --> 00:00:01.000 align:start\n<lang en>Hello</lang> <u>world</u> <ruby>漢<rt>kan</rt></ruby>&lt;3&nbsp;!\n",
        );

        assert_eq!(
            tokens,
            vec![(None, "Hello world 漢<3\u{a0}!".to_string(), 0, 1000)]
        );
    }

    #[test]
    fn vtt_without_voice_keeps_one_anonymous_token_per_cue() {
        let tokens = parse(
            ".vtt",
            "WEBVTT\n\nintro\n00:00:00.000 --> 00:00:01.500\nPremière ligne\nseconde ligne\n\n00:00:01.500 --> 00:00:03.000\nSuite.\n",
        );

        assert_eq!(
            tokens,
            vec![
                (None, "Première ligne\nseconde ligne".to_string(), 0, 1500),
                (None, "Suite.".to_string(), 1500, 3000),
            ]
        );
    }

    #[test]
    fn srt_cue_numbers_are_not_speakers() {
        let tokens = parse(
            ".srt",
            "1\n00:00:00,000 --> 00:00:01,000\nBonjour <i>tout le monde</i>.\n\n2\n00:00:01,000 --> 00:00:02,500\nDeuxième réplique.\n",
        );

        assert_eq!(
            tokens,
            vec![
                (None, "Bonjour tout le monde.".to_string(), 0, 1000),
                (None, "Deuxième réplique.".to_string(), 1000, 2500),
            ]
        );
    }
}
