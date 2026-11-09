use super::{
    EventDetails, Notification, NotificationAction, NotificationActionMenu,
    NotificationActionVariant, NotificationFooter, NotificationIcon, NotificationLabels,
    NotificationSource, Participant,
};

#[derive(Default)]
pub struct NotificationBuilder {
    key: Option<String>,
    title: Option<String>,
    message: Option<String>,
    timeout: Option<std::time::Duration>,
    source: Option<NotificationSource>,
    start_time: Option<i64>,
    participants: Option<Vec<Participant>>,
    event_details: Option<EventDetails>,
    action_label: Option<String>,
    action_variant: Option<NotificationActionVariant>,
    action: Option<NotificationAction>,
    action_menu: Option<NotificationActionMenu>,
    options: Option<Vec<String>>,
    footer: Option<NotificationFooter>,
    icon: Option<NotificationIcon>,
    labels: Option<NotificationLabels>,
}

impl NotificationBuilder {
    pub fn key(mut self, key: impl Into<String>) -> Self {
        self.key = Some(key.into());
        self
    }

    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    pub fn message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }

    pub fn timeout(mut self, timeout: std::time::Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn source(mut self, source: NotificationSource) -> Self {
        self.source = Some(source);
        self
    }

    pub fn start_time(mut self, start_time: i64) -> Self {
        self.start_time = Some(start_time);
        self
    }

    pub fn participants(mut self, participants: Vec<Participant>) -> Self {
        self.participants = Some(participants);
        self
    }

    pub fn event_details(mut self, event_details: EventDetails) -> Self {
        self.event_details = Some(event_details);
        self
    }

    pub fn action_label(mut self, action_label: impl Into<String>) -> Self {
        self.action_label = Some(action_label.into());
        self
    }

    pub fn action_variant(mut self, action_variant: NotificationActionVariant) -> Self {
        self.action_variant = Some(action_variant);
        self
    }

    pub fn action(mut self, action: NotificationAction) -> Self {
        self.action = Some(action);
        self
    }

    pub fn action_menu(mut self, label: impl Into<String>, action: NotificationAction) -> Self {
        self.action_menu = Some(NotificationActionMenu {
            label: label.into(),
            action,
        });
        self
    }

    pub fn options(mut self, options: Vec<String>) -> Self {
        self.options = Some(options);
        self
    }

    pub fn footer(mut self, footer: NotificationFooter) -> Self {
        self.footer = Some(footer);
        self
    }

    pub fn icon(mut self, icon: NotificationIcon) -> Self {
        self.icon = Some(icon);
        self
    }

    pub fn labels(mut self, labels: NotificationLabels) -> Self {
        self.labels = Some(labels);
        self
    }

    pub fn build(self) -> Notification {
        let source = self.source;
        let icon = self
            .icon
            .or_else(|| source.as_ref().and_then(NotificationSource::default_icon));

        Notification {
            key: self.key,
            title: self.title.unwrap(),
            message: self.message.unwrap(),
            timeout: self.timeout,
            source,
            start_time: self.start_time,
            participants: self.participants,
            event_details: self.event_details,
            action_label: self.action_label,
            action_variant: self.action_variant,
            action: self.action,
            action_menu: self.action_menu,
            options: self.options,
            footer: self.footer,
            icon,
            labels: self.labels,
        }
    }
}
