use super::*;
use std::time::Instant;

#[test]
fn calendar_notifications_default_to_app_plus_calendar_overlay() {
    let source = NotificationSource::CalendarEvent {
        event_id: "evt-1".to_string(),
    };

    assert_eq!(
        source.default_icon(),
        Some(NotificationIcon::Overlay {
            base: NotificationIconAsset::AppIcon,
            badge: NotificationIconAsset::Calendar,
        })
    );
}

#[test]
fn mic_notifications_default_to_first_resolvable_app_icon() {
    let source = NotificationSource::MicDetected {
        app_names: vec!["Zoom".to_string()],
        app_ids: vec!["pid:42".to_string(), "us.zoom.xos".to_string()],
        event_ids: vec![],
    };

    assert_eq!(
        source.default_icon(),
        Some(NotificationIcon::BundleId {
            bundle_id: "us.zoom.xos".to_string(),
        })
    );
}

#[test]
fn windows_and_unc_paths_are_path_icons() {
    assert_eq!(
        NotificationIcon::from_app_id(r"C:\Program Files\Zoom\Zoom.exe"),
        Some(NotificationIcon::Path {
            path: r"C:\Program Files\Zoom\Zoom.exe".to_string(),
        })
    );
    assert_eq!(
        NotificationIcon::from_app_id("D:/icons/zoom.png"),
        Some(NotificationIcon::Path {
            path: "D:/icons/zoom.png".to_string(),
        })
    );
    assert_eq!(
        NotificationIcon::from_app_id(r"\\server\share\app.exe"),
        Some(NotificationIcon::Path {
            path: r"\\server\share\app.exe".to_string(),
        })
    );
    assert_eq!(
        NotificationIcon::from_app_id(r"~\AppData\Local\Zoom.exe"),
        Some(NotificationIcon::Path {
            path: r"~\AppData\Local\Zoom.exe".to_string(),
        })
    );
    assert_eq!(
        NotificationIcon::from_app_id("us.zoom.xos"),
        Some(NotificationIcon::BundleId {
            bundle_id: "us.zoom.xos".to_string(),
        })
    );
}

#[test]
fn notifications_use_explicit_icon_or_source_default() {
    let default_icon_notification = Notification::builder()
        .title("Title")
        .message("Message")
        .source(NotificationSource::MicDetected {
            app_names: vec!["Zoom".to_string()],
            app_ids: vec!["/Applications/Zoom.app".to_string()],
            event_ids: vec![],
        })
        .build();

    assert_eq!(
        default_icon_notification.icon,
        Some(NotificationIcon::Path {
            path: "/Applications/Zoom.app".to_string(),
        })
    );

    let explicit_icon_notification = Notification::builder()
        .title("Title")
        .message("Message")
        .source(NotificationSource::CalendarEvent {
            event_id: "evt-1".to_string(),
        })
        .icon(NotificationIcon::Hidden)
        .build();

    assert_eq!(
        explicit_icon_notification.icon,
        Some(NotificationIcon::Hidden)
    );
}

#[test]
fn only_session_notifications_with_event_details_expand() {
    let calendar_notification = Notification::builder()
        .title("Standup")
        .message("Starting soon")
        .source(NotificationSource::CalendarEvent {
            event_id: "evt-1".to_string(),
        })
        .participants(vec![Participant {
            name: Some("Ada".to_string()),
            email: "ada@example.com".to_string(),
            status: ParticipantStatus::Accepted,
        }])
        .event_details(EventDetails {
            what: "Standup".to_string(),
            timezone: None,
            location: None,
        })
        .build();

    assert!(!calendar_notification.has_expandable_content());

    let session_notification = Notification::builder()
        .title("Design sync")
        .message("")
        .source(NotificationSource::Session {
            session_id: "sess-1".to_string(),
        })
        .event_details(EventDetails {
            what: "Design sync".to_string(),
            timezone: Some("America/Los_Angeles".to_string()),
            location: Some("Zoom".to_string()),
        })
        .build();

    assert!(session_notification.has_expandable_content());
    assert_eq!(session_notification.expanded_title(), "Design sync");
}

#[test]
fn options_override_the_accept_action() {
    let notification = Notification::builder()
        .title("Choose a meeting")
        .message("")
        .action_label("Ignored")
        .options(vec!["Design sync".to_string(), "Planning".to_string()])
        .build();

    assert_eq!(
        notification.primary_action(),
        PrimaryAction::Options(&["Design sync".to_string(), "Planning".to_string()])
    );
}

#[test]
fn semantic_action_menu_keeps_the_primary_action() {
    let notification = Notification::builder()
        .title("Design sync")
        .message("Starting soon")
        .action_label("Join & record")
        .action(NotificationAction::JoinAndRecord)
        .action_menu("Open meeting", NotificationAction::OpenMeeting)
        .build();

    assert!(notification.has_action_menu());
    assert_eq!(
        notification.primary_action(),
        PrimaryAction::Accept {
            label: "Join & record",
            destructive: false
        }
    );
}

#[test]
fn stop_countdown_copy_matches_macos() {
    let notification = Notification::builder()
        .title("Did your meeting end?")
        .message("Syntheo will stop listening soon.")
        .action_label("Stop")
        .action_variant(NotificationActionVariant::Destructive)
        .timeout(Duration::from_secs(30))
        .build();

    assert!(notification.shows_stop_countdown());
    assert_eq!(
        notification.compact_message(Some(Duration::from_secs_f64(4.2))),
        "Syntheo will stop listening in 5 seconds."
    );
    assert_eq!(
        compact_schedule_text(Duration::from_secs(90)),
        "Starting in 2 minutes"
    );
    assert_eq!(
        expanded_schedule_text(Duration::from_secs(75)),
        "Begins in 1:15"
    );
}

#[test]
fn stop_countdown_uses_translated_label_and_message() {
    let notification = Notification::builder()
        .title("La réunion est-elle terminée ?")
        .message("Syntheo arrêtera l'écoute dans {seconds} s.")
        .action_label("Arrêter")
        .action_variant(NotificationActionVariant::Destructive)
        .timeout(Duration::from_secs(30))
        .build();

    assert!(notification.shows_stop_countdown());
    assert_eq!(
        notification.compact_message(Some(Duration::from_secs_f64(4.2))),
        "Syntheo arrêtera l'écoute dans 5 s."
    );
}

#[test]
fn stop_countdown_requires_a_timeout() {
    let notification = Notification::builder()
        .title("Did your meeting end?")
        .message("Syntheo will stop listening soon.")
        .action_label("Stop")
        .action_variant(NotificationActionVariant::Destructive)
        .build();

    assert!(!notification.shows_stop_countdown());
    assert_eq!(
        notification.compact_message(None),
        "Syntheo will stop listening soon."
    );
}

#[test]
fn dismiss_timer_pauses_and_resumes_without_losing_progress() {
    let start = Instant::now();
    let mut timer = DismissTimer::at(Duration::from_secs(10), start);

    assert!((timer.progress_ratio(start) - 1.0).abs() < f64::EPSILON);

    let halfway = start + Duration::from_secs(4);
    timer.pause(halfway);
    assert!(!timer.is_running());
    assert_eq!(
        timer.remaining(halfway + Duration::from_secs(30)),
        Duration::from_secs(6)
    );

    let resumed = halfway + Duration::from_secs(8);
    timer.resume(resumed);
    assert_eq!(
        timer.remaining(resumed + Duration::from_secs(2)),
        Duration::from_secs(4)
    );
    assert!((timer.progress_ratio(resumed + Duration::from_secs(2)) - 0.4).abs() < 1e-9);
    assert!(timer.is_expired(resumed + Duration::from_secs(6)));
}

#[test]
fn started_notifications_linger_five_minutes_after_start() {
    let start_time = 1_700_000_000;
    let notification = Notification::builder()
        .title("Standup")
        .message("Starting soon")
        .source(NotificationSource::CalendarEvent {
            event_id: "evt-1".to_string(),
        })
        .start_time(start_time)
        .build();

    assert!(!notification.should_dismiss_started(start_time + 4 * 60));
    assert!(notification.should_dismiss_started(start_time + 5 * 60));
    assert_eq!(
        started_notification_remaining(start_time, start_time + 2 * 60),
        Duration::from_secs(3 * 60)
    );
    assert!(
        !Notification::builder()
            .title("Mic")
            .message("")
            .build()
            .should_dismiss_started(start_time + 5 * 60)
    );
}

#[test]
fn schedule_messages_use_the_labels_sent_by_the_app() {
    let start_time = 1_700_000_000;
    let english = Notification::builder()
        .title("Standup")
        .message("")
        .start_time(start_time)
        .build();
    assert_eq!(english.compact_message(None), "Starting soon");
    assert_eq!(english.compact_message(Some(Duration::ZERO)), "Started");

    let french = Notification::builder()
        .title("Standup")
        .message("")
        .start_time(start_time)
        .labels(NotificationLabels {
            options: "Options".to_string(),
            starting_soon: "Démarrage imminent".to_string(),
            started: "En cours".to_string(),
            starting_in_one: "Démarrage dans 1 minute".to_string(),
            starting_in_other: "Démarrage dans {minutes} minutes".to_string(),
            begins_in: "Début dans {time}".to_string(),
            show_less: "Afficher moins".to_string(),
            what: "Quoi :".to_string(),
            who: "Qui :".to_string(),
            location: "Où :".to_string(),
            invitee_time_zone: "Fuseau horaire de l'invité :".to_string(),
            accept: "Accepter".to_string(),
            create_new_note: "Créer une note…".to_string(),
        })
        .build();
    assert_eq!(french.compact_message(None), "Démarrage imminent");
    assert_eq!(french.compact_message(Some(Duration::ZERO)), "En cours");
    assert_eq!(
        french.compact_message(Some(Duration::from_secs(150))),
        "Démarrage dans 3 minutes"
    );
    assert_eq!(
        french.expanded_schedule_message(Duration::from_secs(75)),
        "Début dans 1:15"
    );
    assert_eq!(french.labels().options, "Options");
}

#[test]
fn expanded_action_label_falls_back_to_the_translated_accept() {
    let english = Notification::builder().title("Invite").message("").build();
    assert_eq!(english.expanded_action_label(), "Accept");

    let mut labels = NotificationLabels::english().clone();
    labels.accept = "Accepter".to_string();
    let french = Notification::builder()
        .title("Invite")
        .message("")
        .labels(labels.clone())
        .build();
    assert_eq!(french.expanded_action_label(), "Accepter");

    let explicit = Notification::builder()
        .title("Invite")
        .message("")
        .action_label("Rejoindre")
        .labels(labels)
        .build();
    assert_eq!(explicit.expanded_action_label(), "Rejoindre");
}
