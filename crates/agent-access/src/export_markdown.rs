//! Markdown export written to the user's folders (automations), in the
//! interface language (issue 454). `Meeting::to_markdown` stays the stable
//! English format read by agents, the CLI and MCP.

use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc};

use crate::{Meeting, MeetingExport, transcript_render};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportLocale {
    En,
    Fr,
}

fn primary_language(tag: Option<&str>) -> String {
    let tag = tag.unwrap_or("").trim().to_ascii_lowercase();
    tag.split(['-', '_']).next().unwrap_or("").to_string()
}

impl ExportLocale {
    /// Rule used before the `ui_language` setting (issue 549), mirroring the
    /// desktop `legacyDisplayLocale`: English only when the main language is
    /// English, French otherwise.
    pub fn from_language(language: Option<&str>) -> Self {
        if primary_language(language) == "en" {
            Self::En
        } else {
            Self::Fr
        }
    }

    /// Mirrors the desktop `resolveDisplayLocale` (issue 549): an explicit
    /// `ui_language` (`fr`, `en`) wins; `auto` follows the system locale,
    /// French only for a French system and English otherwise. A profile that
    /// has not stored `ui_language` yet keeps the legacy rule.
    pub fn from_interface_language(
        ui_language: Option<&str>,
        ai_language: Option<&str>,
        system_locale: Option<&str>,
    ) -> Self {
        let Some(ui_language) = ui_language else {
            return Self::from_language(ai_language);
        };
        let explicit = primary_language(Some(ui_language));
        let resolved = if explicit == "fr" || explicit == "en" {
            explicit
        } else {
            primary_language(system_locale)
        };
        if resolved == "fr" { Self::Fr } else { Self::En }
    }

    fn labels(self) -> &'static Labels {
        match self {
            Self::En => &EN,
            Self::Fr => &FR,
        }
    }
}

struct Labels {
    untitled: &'static str,
    created: &'static str,
    duration: &'static str,
    series: &'static str,
    folder: &'static str,
    participants: &'static str,
    memo: &'static str,
    summary: &'static str,
    action_items: &'static str,
    transcript: &'static str,
    speaker: &'static str,
    you: &'static str,
    colon: &'static str,
}

const EN: Labels = Labels {
    untitled: "Untitled",
    created: "Created",
    duration: "Duration",
    series: "Series",
    folder: "Folder",
    participants: "Participants",
    memo: "Memo",
    summary: "Summary",
    action_items: "Action items",
    transcript: "Transcript",
    speaker: "Speaker",
    you: "You",
    colon: ":",
};

// Espace insécable avant les deux-points, comme dans l'export du bureau.
const FR: Labels = Labels {
    untitled: "Sans titre",
    created: "Créé le",
    duration: "Durée",
    series: "Série",
    folder: "Dossier",
    participants: "Participants",
    memo: "Mémo",
    summary: "Synthèse",
    action_items: "Actions",
    transcript: "Transcription",
    speaker: "Locuteur",
    you: "Vous",
    colon: "\u{a0}:",
};

/// Prefixes of the line that follows the ID line in an export, in every
/// format this app has written (legacy English `Date`, then localized).
const DATE_LINE_PREFIXES: [&str; 3] = ["- Date: ", "- Created: ", "- Créé le\u{a0}: "];

fn field(labels: &Labels, label: &str, value: &str) -> String {
    format!("- {label}{} {value}", labels.colon)
}

/// True when `content` is a markdown export of `meeting_id` written by this
/// app, in English or French.
pub fn is_markdown_export_for(content: &str, meeting_id: &str) -> bool {
    let markers = [EN.colon, FR.colon].map(|colon| format!("- ID{colon} `{meeting_id}`"));
    let mut lines = content.lines();
    let Some(id_line) = lines.find(|line| {
        [EN.colon, FR.colon]
            .iter()
            .any(|colon| line.starts_with(&format!("- ID{colon} `")))
    }) else {
        return false;
    };
    markers.iter().any(|marker| marker == id_line)
        && lines
            .next()
            .is_some_and(|line| DATE_LINE_PREFIXES.iter().any(|p| line.starts_with(p)))
}

/// Renders an ISO date in the meeting time zone (the local one when unknown):
/// « dimanche 8 novembre 2026 à 22:28 », « Sunday, November 8, 2026 at 10:28 PM ».
pub fn format_export_date(value: &str, timezone: &str, locale: ExportLocale) -> String {
    let value = value.trim();
    if let Some(utc) = parse_utc(value) {
        let local = match timezone.parse::<chrono_tz::Tz>() {
            Ok(tz) => tz.from_utc_datetime(&utc.naive_utc()).naive_local(),
            Err(_) => utc.with_timezone(&chrono::Local).naive_local(),
        };
        return format_local_datetime(local, locale);
    }
    match NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        Ok(date) => format_day(date, locale),
        Err(_) => value.to_string(),
    }
}

fn parse_utc(value: &str) -> Option<DateTime<Utc>> {
    if let Ok(date) = DateTime::parse_from_rfc3339(value) {
        return Some(date.with_timezone(&Utc));
    }
    ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.f"]
        .iter()
        .find_map(|format| NaiveDateTime::parse_from_str(value, format).ok())
        .map(|naive| naive.and_utc())
}

const FR_WEEKDAYS: [&str; 7] = [
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
];
const FR_MONTHS: [&str; 12] = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
];

fn format_day(date: NaiveDate, locale: ExportLocale) -> String {
    match locale {
        ExportLocale::Fr => format!(
            "{} {} {} {}",
            FR_WEEKDAYS[date.weekday().num_days_from_monday() as usize],
            date.day(),
            FR_MONTHS[date.month0() as usize],
            date.year()
        ),
        ExportLocale::En => date.format("%A, %B %-d, %Y").to_string(),
    }
}

pub(crate) fn format_local_datetime(local: NaiveDateTime, locale: ExportLocale) -> String {
    let day = format_day(local.date(), locale);
    match locale {
        ExportLocale::Fr => format!("{day} à {:02}:{:02}", local.hour(), local.minute()),
        ExportLocale::En => format!("{day} at {}", local.format("%-I:%M %p")),
    }
}

/// « 11 min », « 1 h 05 », like the desktop export.
pub fn format_export_duration(started_at: &str, ended_at: &str) -> Option<String> {
    let start = parse_utc(started_at.trim())?;
    let end = parse_utc(ended_at.trim())?;
    let minutes = (end - start).num_minutes();
    if minutes < 0 {
        return None;
    }
    let hours = minutes / 60;
    Some(if hours > 0 {
        format!("{hours} h {:02}", minutes % 60)
    } else {
        format!("{minutes} min")
    })
}

/// Mirrors the desktop `displaySpeakerLabel`: translates the anonymous labels
/// produced by the transcript renderer and keeps names as they are.
pub fn localize_speaker_label(label: &str, locale: ExportLocale) -> String {
    let labels = locale.labels();
    if label == "You" {
        return labels.you.to_string();
    }
    match label.strip_prefix("Speaker ") {
        Some(rest)
            if (!rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
                || matches!(rest, "A" | "B" | "C") =>
        {
            format!("{} {rest}", labels.speaker)
        }
        _ => label.to_string(),
    }
}

fn push_section(sections: &mut Vec<String>, title: &str, body: &str) {
    if !body.trim().is_empty() {
        sections.push(format!("## {title}\n\n{}", body.trim()));
    }
}

impl Meeting {
    /// The meeting as written to the user's export folder, in `locale`.
    pub fn to_export_markdown(&self, locale: ExportLocale) -> String {
        let labels = locale.labels();
        let title = match self.title.trim() {
            "" => labels.untitled,
            title => title,
        };
        let mut sections = vec![format!("# {title}"), self.export_metadata(locale)];

        if let Some(note) = &self.note {
            push_section(&mut sections, labels.memo, &note.markdown);
        }
        for summary in &self.summaries {
            let heading = match summary.title.trim() {
                "" => labels.summary,
                heading => heading,
            };
            push_section(&mut sections, heading, &summary.markdown);
        }
        if !self.action_items.is_empty() {
            let body = self
                .action_items
                .iter()
                .map(|item| {
                    let checked = matches!(item.status.as_str(), "done" | "completed");
                    format!("- [{}] {}", if checked { "x" } else { " " }, item.text)
                })
                .collect::<Vec<_>>()
                .join("\n");
            push_section(&mut sections, labels.action_items, &body);
        }

        sections.join("\n\n").trim().to_string()
    }

    fn export_metadata(&self, locale: ExportLocale) -> String {
        let labels = locale.labels();
        let occurred_at = if self.started_at.is_empty() {
            &self.created_at
        } else {
            &self.started_at
        };
        let mut lines = vec![
            field(labels, "ID", &format!("`{}`", self.id)),
            field(
                labels,
                labels.created,
                &format_export_date(occurred_at, &self.timezone, locale),
            ),
        ];
        if let Some(duration) = format_export_duration(&self.started_at, &self.ended_at) {
            lines.push(field(labels, labels.duration, &duration));
        }
        if !self.series_id.is_empty() {
            lines.push(field(
                labels,
                labels.series,
                &format!("`{}`", self.series_id),
            ));
        }
        if let Some(folder_path) = &self.folder_path {
            lines.push(field(labels, labels.folder, &format!("`{folder_path}`")));
        }
        let people = self
            .participants
            .iter()
            .filter_map(|participant| {
                let name = participant.display_name.trim();
                (!name.is_empty()).then_some(name)
            })
            .collect::<Vec<_>>();
        if !people.is_empty() {
            lines.push(field(labels, labels.participants, &people.join(", ")));
        }
        lines.join("\n")
    }
}

impl MeetingExport {
    /// The export written to the user's folder, in `locale`.
    pub fn to_export_markdown(&self, locale: ExportLocale) -> String {
        let labels = locale.labels();
        let mut markdown = self.meeting.to_export_markdown(locale);
        let transcript = transcript_render::render_transcripts_markdown_with(self, |speaker| {
            format!(
                "{}{} ",
                localize_speaker_label(speaker, locale),
                labels.colon
            )
        });
        if !transcript.is_empty() {
            markdown.push_str(&format!("\n\n## {}\n\n", labels.transcript));
            markdown.push_str(&transcript);
        }
        markdown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_locale_like_the_desktop() {
        assert_eq!(ExportLocale::from_language(Some("en")), ExportLocale::En);
        assert_eq!(ExportLocale::from_language(Some("en-US")), ExportLocale::En);
        assert_eq!(ExportLocale::from_language(Some("fr")), ExportLocale::Fr);
        assert_eq!(ExportLocale::from_language(Some("de")), ExportLocale::Fr);
        assert_eq!(ExportLocale::from_language(None), ExportLocale::Fr);
    }

    #[test]
    fn resolves_the_interface_language_like_the_desktop() {
        let resolve = ExportLocale::from_interface_language;
        assert_eq!(
            resolve(Some("fr"), Some("en"), Some("en-US")),
            ExportLocale::Fr
        );
        assert_eq!(
            resolve(Some("en"), Some("fr"), Some("fr-FR")),
            ExportLocale::En
        );
        assert_eq!(
            resolve(Some("auto"), Some("fr"), Some("fr-FR")),
            ExportLocale::Fr
        );
        assert_eq!(
            resolve(Some("auto"), Some("fr"), Some("en-US")),
            ExportLocale::En
        );
        assert_eq!(
            resolve(Some("auto"), Some("fr"), Some("zh-CN")),
            ExportLocale::En
        );
        assert_eq!(resolve(Some("auto"), Some("fr"), None), ExportLocale::En);
        // Not migrated yet: the legacy rule keeps the language shown so far.
        assert_eq!(resolve(None, Some("de"), Some("en-US")), ExportLocale::Fr);
        assert_eq!(resolve(None, Some("en"), Some("fr-FR")), ExportLocale::En);
    }

    #[test]
    fn formats_dates_in_the_meeting_time_zone() {
        let at = "2026-11-08T21:28:00Z";
        assert_eq!(
            format_export_date(at, "Europe/Paris", ExportLocale::Fr),
            "dimanche 8 novembre 2026 à 22:28"
        );
        assert_eq!(
            format_export_date(at, "Europe/Paris", ExportLocale::En),
            "Sunday, November 8, 2026 at 10:28 PM"
        );
        assert_eq!(
            format_export_date("2026-07-13", "", ExportLocale::Fr),
            "lundi 13 juillet 2026"
        );
        assert_eq!(format_export_date("soon", "", ExportLocale::Fr), "soon");
    }

    #[test]
    fn formats_durations() {
        let start = "2026-11-08T21:28:00Z";
        assert_eq!(
            format_export_duration(start, "2026-11-08T21:39:30Z").as_deref(),
            Some("11 min")
        );
        assert_eq!(
            format_export_duration(start, "2026-11-08T22:33:00Z").as_deref(),
            Some("1 h 05")
        );
        assert_eq!(format_export_duration(start, ""), None);
    }

    #[test]
    fn localizes_anonymous_speakers_only() {
        let fr = ExportLocale::Fr;
        assert_eq!(localize_speaker_label("Speaker 2", fr), "Locuteur 2");
        assert_eq!(localize_speaker_label("Speaker B", fr), "Locuteur B");
        assert_eq!(localize_speaker_label("You", fr), "Vous");
        assert_eq!(localize_speaker_label("Alice", fr), "Alice");
        assert_eq!(localize_speaker_label("Speaker 2 bis", fr), "Speaker 2 bis");
        assert_eq!(
            localize_speaker_label("Speaker 2", ExportLocale::En),
            "Speaker 2"
        );
    }

    #[test]
    fn recognizes_exports_in_both_languages() {
        assert!(is_markdown_export_for(
            "# A\n\n- ID: `m-1`\n- Date: 2026-07-13\n",
            "m-1"
        ));
        assert!(is_markdown_export_for(
            "# A\n\n- ID: `m-1`\n- Created: Monday, July 13, 2026\n",
            "m-1"
        ));
        assert!(is_markdown_export_for(
            "# A\n\n- ID\u{a0}: `m-1`\n- Créé le\u{a0}: lundi 13 juillet 2026\n",
            "m-1"
        ));
        assert!(!is_markdown_export_for(
            "# A\n\n- ID\u{a0}: `m-2`\n- Créé le\u{a0}: lundi 13 juillet 2026\n",
            "m-1"
        ));
        assert!(!is_markdown_export_for("# A\n\n- ID: `m-1`\n", "m-1"));
    }
}
