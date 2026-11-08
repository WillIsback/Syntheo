//! Texte de la vue dépliée de l'overlay Windows, séparé du code Win32 pour être
//! testé sous Linux. Les intitulés (« What: », « Where: »…) viennent des
//! libellés fournis par l'application, en anglais à défaut (issue 412).

use std::time::Duration;

use syntheo_notification_interface::Notification;

pub(crate) fn expanded_body(notification: &Notification, remaining: Option<Duration>) -> String {
    let labels = notification.labels();
    let mut lines = Vec::new();
    if let Some(details) = &notification.event_details {
        lines.push(format!("{} {}", labels.what, details.what));
        if let Some(timezone) = &details.timezone {
            lines.push(format!("{} {timezone}", labels.invitee_time_zone));
        }
        if let Some(location) = &details.location {
            lines.push(format!("{} {location}", labels.location));
        }
    }
    if let Some(participants) = &notification.participants {
        for participant in participants {
            let name = participant.name.clone().unwrap_or_default();
            let display = if name.is_empty() {
                participant.email.clone()
            } else {
                format!("{name} ({})", participant.email)
            };
            lines.push(display);
        }
    }
    if let Some(remaining) = remaining {
        lines.push(notification.expanded_schedule_message(remaining));
    }
    if lines.is_empty() {
        notification.message.clone()
    } else {
        lines.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use syntheo_notification_interface::{EventDetails, NotificationLabels};

    fn invite() -> Notification {
        Notification::builder()
            .title("Invite")
            .message("Fallback")
            .event_details(EventDetails {
                what: "Design sync".to_string(),
                timezone: Some("Europe/Paris".to_string()),
                location: Some("Salle 2".to_string()),
            })
            .build()
    }

    #[test]
    fn english_details_keep_the_historical_copy() {
        assert_eq!(
            expanded_body(&invite(), None),
            "What: Design sync\nInvitee Time Zone: Europe/Paris\nWhere: Salle 2"
        );
    }

    #[test]
    fn details_use_the_labels_sent_by_the_app() {
        let mut labels = NotificationLabels::english().clone();
        labels.what = "Quoi :".to_string();
        labels.invitee_time_zone = "Fuseau horaire de l'invité :".to_string();
        labels.location = "Où :".to_string();
        let mut notification = invite();
        notification.labels = Some(labels);
        assert_eq!(
            expanded_body(&notification, None),
            "Quoi : Design sync\nFuseau horaire de l'invité : Europe/Paris\nOù : Salle 2"
        );
    }

    #[test]
    fn without_details_the_message_is_kept() {
        let notification = Notification::builder()
            .title("Résumé")
            .message("Prêt")
            .build();
        assert_eq!(expanded_body(&notification, None), "Prêt");
    }
}
