use std::collections::BTreeSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

mod labels;

pub use labels::{MINUTES_PLACEHOLDER, NotificationLabels, TIME_PLACEHOLDER};

mod builder;
mod timer;

pub use builder::NotificationBuilder;
pub use timer::DismissTimer;

pub const STARTED_NOTIFICATION_LINGER: Duration = Duration::from_secs(5 * 60);

pub fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn started_notification_remaining(start_time: i64, now_unix: i64) -> Duration {
    let deadline = start_time.saturating_add(STARTED_NOTIFICATION_LINGER.as_secs() as i64);
    Duration::from_secs(deadline.saturating_sub(now_unix).max(0) as u64)
}

pub fn should_dismiss_started_notification(start_time: i64, now_unix: i64) -> bool {
    started_notification_remaining(start_time, now_unix).is_zero()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum NotificationEvent {
    Confirm,
    Accept,
    Dismiss,
    Timeout,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotificationKey {
    MicStarted { apps: BTreeSet<String> },
    MicStopped { apps: BTreeSet<String> },
    CalendarEvent { event_id: String },
    Custom(String),
}

impl NotificationKey {
    pub fn mic_started(app_bundle_ids: impl IntoIterator<Item = String>) -> Self {
        Self::MicStarted {
            apps: app_bundle_ids.into_iter().collect(),
        }
    }

    pub fn mic_stopped(app_bundle_ids: impl IntoIterator<Item = String>) -> Self {
        Self::MicStopped {
            apps: app_bundle_ids.into_iter().collect(),
        }
    }

    pub fn calendar_event(event_id: impl Into<String>) -> Self {
        Self::CalendarEvent {
            event_id: event_id.into(),
        }
    }

    pub fn to_dedup_key(&self) -> String {
        match self {
            Self::MicStarted { apps } => {
                let sorted: Vec<_> = apps.iter().cloned().collect();
                format!("mic-started:{}", sorted.join(","))
            }
            Self::MicStopped { apps } => {
                let sorted: Vec<_> = apps.iter().cloned().collect();
                format!("mic-stopped:{}", sorted.join(","))
            }
            Self::CalendarEvent { event_id } => {
                format!("event:{event_id}")
            }
            Self::Custom(s) => s.clone(),
        }
    }
}

impl From<String> for NotificationKey {
    fn from(s: String) -> Self {
        Self::Custom(s)
    }
}

impl From<&str> for NotificationKey {
    fn from(s: &str) -> Self {
        Self::Custom(s.to_string())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize, specta::Type,
)]
pub enum ParticipantStatus {
    #[default]
    Accepted,
    Maybe,
    Declined,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Participant {
    pub name: Option<String>,
    pub email: String,
    pub status: ParticipantStatus,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct EventDetails {
    pub what: String,
    pub timezone: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationFooter {
    pub text: String,
    pub action_label: String,
    pub icon: Option<NotificationIcon>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "type")]
pub enum NotificationSource {
    #[serde(rename = "calendar_event")]
    CalendarEvent { event_id: String },
    #[serde(rename = "session")]
    Session { session_id: String },
    #[serde(rename = "mic_detected")]
    MicDetected {
        app_names: Vec<String>,
        #[serde(default)]
        app_ids: Vec<String>,
        #[serde(default)]
        event_ids: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "type")]
pub enum NotificationIconAsset {
    #[serde(rename = "app_icon")]
    AppIcon,
    #[serde(rename = "calendar")]
    Calendar,
    #[serde(rename = "system_symbol")]
    SystemSymbol { name: String },
    #[serde(rename = "bundle_id")]
    BundleId { bundle_id: String },
    #[serde(rename = "path")]
    Path { path: String },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "type")]
pub enum NotificationIcon {
    #[serde(rename = "hidden")]
    Hidden,
    #[serde(rename = "bundle_id")]
    BundleId { bundle_id: String },
    #[serde(rename = "system_symbol")]
    SystemSymbol { name: String },
    #[serde(rename = "path")]
    Path { path: String },
    #[serde(rename = "overlay")]
    Overlay {
        base: NotificationIconAsset,
        badge: NotificationIconAsset,
    },
}

#[derive(Debug, Clone)]
pub struct NotificationContext {
    pub key: String,
    pub source: Option<NotificationSource>,
    pub action: Option<NotificationAction>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum NotificationActionVariant {
    Default,
    Destructive,
}

/// An explicit calendar reminder action. These are intentionally semantic so the
/// app can decide whether foregrounding its window is appropriate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum NotificationAction {
    JoinAndRecord,
    OpenMeeting,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationActionMenu {
    pub label: String,
    pub action: NotificationAction,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Notification {
    pub key: Option<String>,
    pub title: String,
    pub message: String,
    pub timeout: Option<std::time::Duration>,
    pub source: Option<NotificationSource>,
    pub start_time: Option<i64>,
    pub participants: Option<Vec<Participant>>,
    pub event_details: Option<EventDetails>,
    pub action_label: Option<String>,
    pub action_variant: Option<NotificationActionVariant>,
    pub action: Option<NotificationAction>,
    pub action_menu: Option<NotificationActionMenu>,
    pub options: Option<Vec<String>>,
    pub footer: Option<NotificationFooter>,
    pub icon: Option<NotificationIcon>,
    /// Libellés traduits des surfaces natives ; facultatifs, anglais sinon.
    #[serde(default)]
    #[specta(optional)]
    pub labels: Option<NotificationLabels>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrimaryAction<'a> {
    Accept { label: &'a str, destructive: bool },
    Options(&'a [String]),
}

impl Notification {
    pub fn builder() -> NotificationBuilder {
        NotificationBuilder::default()
    }

    /// Libellés fournis par l'application, ou les libellés anglais historiques.
    pub fn labels(&self) -> &NotificationLabels {
        self.labels
            .as_ref()
            .unwrap_or_else(|| NotificationLabels::english())
    }

    /// Décompte de la vue dépliée d'un rappel de réunion.
    pub fn expanded_schedule_message(&self, remaining: Duration) -> String {
        self.labels().expanded_schedule(remaining)
    }

    pub fn is_destructive_action(&self) -> bool {
        matches!(
            self.action_variant,
            Some(NotificationActionVariant::Destructive)
        )
    }

    // Le libellé du bouton est traduit par le front : seul le variant
    // destructif et le délai décident du décompte.
    pub fn shows_stop_countdown(&self) -> bool {
        self.is_destructive_action() && self.timeout.is_some_and(|timeout| !timeout.is_zero())
    }

    pub fn has_options(&self) -> bool {
        self.options
            .as_deref()
            .is_some_and(|options| !options.is_empty())
    }

    pub fn has_action_menu(&self) -> bool {
        self.action_menu.is_some()
    }

    pub fn has_expandable_content(&self) -> bool {
        if matches!(self.source, Some(NotificationSource::CalendarEvent { .. })) {
            return false;
        }

        self.participants
            .as_ref()
            .is_some_and(|participants| !participants.is_empty())
            || self.event_details.is_some()
    }

    pub fn default_action_label(&self) -> &str {
        self.action_label.as_deref().unwrap_or("Open Syntheo")
    }

    pub fn expanded_action_label(&self) -> &str {
        self.action_label
            .as_deref()
            .unwrap_or(self.labels().accept.as_str())
    }

    pub fn primary_action(&self) -> PrimaryAction<'_> {
        if let Some(options) = self
            .options
            .as_deref()
            .filter(|options| !options.is_empty())
        {
            return PrimaryAction::Options(options);
        }

        PrimaryAction::Accept {
            label: self.default_action_label(),
            destructive: self.is_destructive_action(),
        }
    }

    pub fn compact_title(&self) -> &str {
        self.title.as_str()
    }

    pub fn expanded_title(&self) -> &str {
        self.event_details
            .as_ref()
            .map(|details| details.what.as_str())
            .filter(|title| !title.is_empty())
            .unwrap_or(self.title.as_str())
    }

    pub fn should_dismiss_started(&self, now_unix: i64) -> bool {
        self.start_time
            .is_some_and(|start_time| should_dismiss_started_notification(start_time, now_unix))
    }

    pub fn compact_message(&self, remaining: Option<Duration>) -> String {
        if self.start_time.is_some() {
            return match remaining {
                Some(value) if value.is_zero() => self.labels().started.clone(),
                Some(value) => self.labels().compact_schedule(value),
                None => self.labels().starting_soon.clone(),
            };
        }

        if self.shows_stop_countdown() {
            return stop_countdown_message(&self.message, remaining.unwrap_or(Duration::ZERO));
        }

        self.message.clone()
    }
}

/// Texte compact anglais historique ; voir [`NotificationLabels::compact_schedule`].
pub fn compact_schedule_text(remaining: Duration) -> String {
    NotificationLabels::english().compact_schedule(remaining)
}

/// Décompte anglais historique ; voir [`Notification::expanded_schedule_message`].
pub fn expanded_schedule_text(remaining: Duration) -> String {
    NotificationLabels::english().expanded_schedule(remaining)
}

pub fn stop_countdown_text(remaining: Duration) -> String {
    let seconds = remaining.as_secs_f64().ceil() as u64;
    format!("Syntheo will stop listening in {seconds} seconds.")
}

/// Repère que le front place dans un message traduit pour recevoir le
/// décompte en secondes.
pub const STOP_COUNTDOWN_SECONDS_PLACEHOLDER: &str = "{seconds}";

/// Décompte d'arrêt : le message traduit fourni par le front s'il contient le
/// repère, sinon le texte anglais historique.
pub fn stop_countdown_message(message: &str, remaining: Duration) -> String {
    if !message.contains(STOP_COUNTDOWN_SECONDS_PLACEHOLDER) {
        return stop_countdown_text(remaining);
    }
    let seconds = remaining.as_secs_f64().ceil() as u64;
    message.replace(STOP_COUNTDOWN_SECONDS_PLACEHOLDER, &seconds.to_string())
}

impl NotificationSource {
    pub fn default_icon(&self) -> Option<NotificationIcon> {
        match self {
            Self::CalendarEvent { .. } => Some(NotificationIcon::Overlay {
                base: NotificationIconAsset::AppIcon,
                badge: NotificationIconAsset::Calendar,
            }),
            Self::Session { .. } => None,
            Self::MicDetected { app_ids, .. } => app_ids
                .iter()
                .find_map(|app_id| NotificationIcon::from_app_id(app_id)),
        }
    }
}

impl NotificationIcon {
    pub fn from_app_id(app_id: &str) -> Option<Self> {
        if app_id.is_empty() || app_id.starts_with("pid:") {
            return None;
        }

        if is_filesystem_path(app_id) {
            return Some(Self::Path {
                path: app_id.to_string(),
            });
        }

        Some(Self::BundleId {
            bundle_id: app_id.to_string(),
        })
    }

    pub fn system_symbol(name: impl Into<String>) -> Self {
        Self::SystemSymbol { name: name.into() }
    }
}

fn is_filesystem_path(value: &str) -> bool {
    value.starts_with('/')
        || value.starts_with("~/")
        || value.starts_with("~\\")
        || value.starts_with("\\\\")
        || is_windows_drive_path(value)
}

fn is_windows_drive_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

#[cfg(test)]
mod tests;
