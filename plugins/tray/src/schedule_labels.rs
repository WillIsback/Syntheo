use crate::schedule::TrayScheduleEvent;

/// Libellés traduits par Lingui côté application et envoyés avec le planning.
/// Le calcul des délais reste ici : seuls les gabarits de texte changent.
/// Jetons remplacés : `{duration}`, `{count}`, `{hours}` et `{minutes}`.
#[derive(Debug, Clone, serde::Deserialize, specta::Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrayScheduleLabels {
    pub untitled_event: String,
    pub starts_in: String,
    pub remaining_one: String,
    pub remaining_other: String,
    pub seconds: String,
    pub minutes: String,
    pub hours: String,
    pub hours_minutes: String,
}

impl Default for TrayScheduleLabels {
    fn default() -> Self {
        Self {
            untitled_event: "Untitled event".to_string(),
            starts_in: "in {duration}".to_string(),
            remaining_one: "{duration} left".to_string(),
            remaining_other: "{duration} left".to_string(),
            seconds: "{count}s".to_string(),
            minutes: "{count}m".to_string(),
            hours: "{count}h".to_string(),
            hours_minutes: "{hours}h {minutes}m".to_string(),
        }
    }
}

impl TrayScheduleLabels {
    pub(crate) fn starts_in(&self, diff_ms: f64) -> String {
        let duration = Duration::from_ms(diff_ms);
        self.starts_in.replace("{duration}", &duration.label(self))
    }

    pub(crate) fn remaining(&self, diff_ms: f64) -> String {
        let duration = Duration::from_ms(diff_ms);
        let template = if duration.is_singular() {
            &self.remaining_one
        } else {
            &self.remaining_other
        };
        template.replace("{duration}", &duration.label(self))
    }
}

pub fn apply_untitled_fallback(events: &mut [TrayScheduleEvent], labels: &TrayScheduleLabels) {
    for event in events {
        if event.title.trim().is_empty() {
            event.title = labels.untitled_event.clone();
        }
    }
}

enum Duration {
    Seconds(u64),
    Minutes(u64),
    Hours(u64),
    HoursMinutes(u64, u64),
}

impl Duration {
    fn from_ms(diff_ms: f64) -> Self {
        let total_seconds = (diff_ms / 1000.0).floor().max(1.0) as u64;

        if total_seconds < 60 {
            return Self::Seconds(total_seconds);
        }

        let total_minutes = total_seconds / 60;
        if total_minutes < 60 {
            return Self::Minutes(total_minutes);
        }

        let hours = total_minutes / 60;
        let minutes = total_minutes % 60;
        if minutes == 0 {
            Self::Hours(hours)
        } else {
            Self::HoursMinutes(hours, minutes)
        }
    }

    /// Accord au singulier seulement pour une unité seule valant 1.
    fn is_singular(&self) -> bool {
        matches!(self, Self::Seconds(1) | Self::Minutes(1) | Self::Hours(1))
    }

    fn label(&self, labels: &TrayScheduleLabels) -> String {
        match self {
            Self::Seconds(count) => labels.seconds.replace("{count}", &count.to_string()),
            Self::Minutes(count) => labels.minutes.replace("{count}", &count.to_string()),
            Self::Hours(count) => labels.hours.replace("{count}", &count.to_string()),
            Self::HoursMinutes(hours, minutes) => labels
                .hours_minutes
                .replace("{hours}", &hours.to_string())
                .replace("{minutes}", &minutes.to_string()),
        }
    }
}

#[cfg(test)]
pub(crate) fn fr_labels() -> TrayScheduleLabels {
    TrayScheduleLabels {
        untitled_event: "Événement sans titre".to_string(),
        starts_in: "dans {duration}".to_string(),
        remaining_one: "{duration} restante".to_string(),
        remaining_other: "{duration} restantes".to_string(),
        seconds: "{count} s".to_string(),
        minutes: "{count} min".to_string(),
        hours: "{count} h".to_string(),
        hours_minutes: "{hours} h {minutes} min".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINUTE_MS: f64 = 60_000.0;

    #[test]
    fn formats_delays_with_translated_labels() {
        let labels = fr_labels();

        assert_eq!(labels.starts_in(42_000.0), "dans 42 s");
        assert_eq!(labels.starts_in(5.0 * MINUTE_MS), "dans 5 min");
        assert_eq!(labels.starts_in(180.0 * MINUTE_MS), "dans 3 h");
        assert_eq!(labels.starts_in(125.0 * MINUTE_MS), "dans 2 h 5 min");
    }

    #[test]
    fn agrees_the_remaining_label_with_the_delay() {
        let labels = fr_labels();

        assert_eq!(labels.remaining(90_000.0), "1 min restante");
        assert_eq!(labels.remaining(60.0 * MINUTE_MS), "1 h restante");
        assert_eq!(labels.remaining(1_500.0), "1 s restante");
        assert_eq!(labels.remaining(659_000.0), "10 min restantes");
        assert_eq!(labels.remaining(61.0 * MINUTE_MS), "1 h 1 min restantes");
    }

    #[test]
    fn default_labels_keep_the_english_wording() {
        let labels = TrayScheduleLabels::default();

        assert_eq!(labels.starts_in(5.0 * MINUTE_MS), "in 5m");
        assert_eq!(labels.starts_in(123.0 * MINUTE_MS), "in 2h 3m");
        assert_eq!(labels.remaining(30_000.0), "30s left");
        assert_eq!(labels.remaining(120.0 * MINUTE_MS), "2h left");
    }

    #[test]
    fn names_blank_events_with_the_translated_fallback() {
        let event = |title: &str| TrayScheduleEvent {
            id: title.to_string(),
            title: title.to_string(),
            meeting_link: None,
            starts_at_ms: 1.0,
            ends_at_ms: None,
            day_start_ms: 0.0,
            previous_day_start_ms: 0.0,
            time_label: String::new(),
        };
        let mut events = vec![event("   "), event("Standup")];

        apply_untitled_fallback(&mut events, &fr_labels());

        assert_eq!(events[0].title, "Événement sans titre");
        assert_eq!(events[1].title, "Standup");
    }
}
