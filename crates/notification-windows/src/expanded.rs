//! Texte de la vue dépliée de l'overlay Windows, séparé du code Win32 pour être
//! testé sous Linux. Le décompte vient des libellés fournis par l'application,
//! en anglais à défaut (issue 412).

use std::time::Duration;

use syntheo_notification_interface::Notification;

pub(crate) fn expanded_body(notification: &Notification, remaining: Option<Duration>) -> String {
    match remaining {
        Some(remaining) => notification.expanded_schedule_message(remaining),
        None => notification.message.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use syntheo_notification_interface::NotificationLabels;

    #[test]
    fn schedule_uses_the_labels_sent_by_the_app() {
        let mut labels = NotificationLabels::english().clone();
        labels.begins_in = "Début dans {time}".to_string();
        let notification = Notification::builder()
            .title("Réunion")
            .message("Bientôt")
            .labels(labels)
            .build();
        assert_eq!(
            expanded_body(&notification, Some(Duration::from_secs(75))),
            "Début dans 1:15"
        );
    }

    #[test]
    fn without_schedule_the_message_is_kept() {
        let notification = Notification::builder()
            .title("Résumé")
            .message("Prêt")
            .build();
        assert_eq!(expanded_body(&notification, None), "Prêt");
    }
}
