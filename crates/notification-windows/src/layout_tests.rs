use super::*;
use std::time::Duration;
use syntheo_notification_interface::{NotificationFooter, NotificationIcon, NotificationSource};

fn compact_notification() -> Notification {
    Notification::builder()
        .title("Upcoming event")
        .message("Starting soon")
        .timeout(Duration::from_secs(8))
        .build()
}

fn footer_notification() -> Notification {
    let mut notification = compact_notification();
    notification.footer = Some(NotificationFooter {
        text: "Ignorer cette application".to_string(),
        action_label: "Ignorer".to_string(),
        icon: None,
    });
    notification
}

fn intersects(a: Rect, b: Rect) -> bool {
    a.x < b.right() && b.x < a.right() && a.y < b.bottom() && b.y < a.bottom()
}

fn assert_inside(inner: Rect, outer: Rect) {
    assert!(
        inner.x >= outer.x
            && inner.y >= outer.y
            && inner.right() <= outer.right()
            && inner.bottom() <= outer.bottom(),
        "{inner:?} n'est pas dans {outer:?}"
    );
}

fn card(layout: &NotificationLayout) -> Rect {
    Rect {
        x: 0,
        y: 0,
        width: layout.width,
        height: layout.height,
    }
}

#[test]
fn compact_layout_keeps_actions_and_progress_in_bounds() {
    let notification = compact_notification();
    let layout = NotificationLayout::compact(&notification);
    assert_eq!(layout.height, COMPACT_HEIGHT);
    assert!(layout.close.contains(10, 10));
    assert_eq!(layout.hit_test(10, 10), HitTarget::Close);
    assert_eq!(
        layout.action_hit(
            &notification,
            layout.action.unwrap().x + 4,
            layout.action.unwrap().y + 4
        ),
        HitTarget::Action
    );
    assert!(layout.progress.is_some());
}

#[test]
fn compact_mockup_positions_icon_text_and_button() {
    let layout = NotificationLayout::compact(&compact_notification());
    assert_eq!((layout.width, layout.height), (360, 72));
    assert_eq!(
        layout.icon,
        Some(Rect {
            x: 14,
            y: 22,
            width: 28,
            height: 28
        })
    );
    assert_eq!(
        layout.title,
        Rect {
            x: 54,
            y: 16,
            width: 168,
            height: 20
        }
    );
    assert_eq!(
        layout.message,
        Rect {
            x: 54,
            y: 37,
            width: 168,
            height: 18
        }
    );
    assert_eq!(
        layout.action,
        Some(Rect {
            x: 234,
            y: 20,
            width: 112,
            height: 32
        })
    );
    assert_eq!(
        layout.progress,
        Some(Rect {
            x: 14,
            y: 66,
            width: 332,
            height: 3
        })
    );
    assert_eq!(
        layout.close,
        Rect {
            x: 4,
            y: 4,
            width: 20,
            height: 20
        }
    );
}

#[test]
fn compact_spacing_is_symmetric_and_text_never_touches_the_icon_or_button() {
    for dpi in [96, 120, 144, 192] {
        let layout = NotificationLayout::compact(&compact_notification()).at_dpi(dpi);
        let icon = layout.icon.unwrap();
        let action = layout.action.unwrap();
        let padding = layout.scale(COMPACT_PADDING);
        assert_eq!(icon.x, padding, "dpi {dpi}");
        assert!(
            (layout.width - action.right() - padding).abs() <= 1,
            "dpi {dpi}"
        );
        for rect in [layout.title, layout.message] {
            assert!(rect.x >= icon.right() + layout.scale(CONTENT_GAP) - 1);
            assert!(rect.right() <= action.x - layout.scale(CONTENT_GAP) + 1);
            assert!(!intersects(rect, icon) && !intersects(rect, action));
            assert_inside(rect, card(&layout));
        }
        assert!(layout.title.bottom() <= layout.message.y);
        // Icône et bouton centrés verticalement dans la bande compacte.
        let band = layout.scale(COMPACT_HEIGHT);
        assert!((icon.y * 2 + icon.height - band).abs() <= 2);
        assert!((action.y * 2 + action.height - band).abs() <= 2);
        let progress = layout.progress.unwrap();
        assert!(progress.y >= layout.message.bottom());
        assert!(progress.bottom() < layout.height);
    }
}

#[test]
fn hidden_icon_starts_the_text_at_the_padding() {
    let mut notification = compact_notification();
    notification.icon = Some(NotificationIcon::Hidden);
    let layout = NotificationLayout::compact(&notification);
    assert!(layout.icon.is_none());
    assert_eq!(layout.title.x, COMPACT_PADDING);
    assert_eq!(layout.message.x, COMPACT_PADDING);
}

#[test]
fn footer_band_holds_text_link_and_progress_without_overlap() {
    for dpi in [96, 144, 192] {
        let layout = NotificationLayout::compact(&footer_notification()).at_dpi(dpi);
        assert_eq!(
            layout.height,
            layout.scale(COMPACT_HEIGHT + COMPACT_FOOTER_HEIGHT)
        );
        let footer = layout.footer_action.unwrap();
        let text = layout.footer_text.unwrap();
        let band_top = layout.scale(COMPACT_HEIGHT);
        assert!(footer.y >= band_top && text.y >= band_top);
        assert!(!intersects(footer, text));
        assert!(text.right() <= footer.x);
        assert_inside(footer, card(&layout));
        let progress = layout.progress.unwrap();
        assert!(progress.y >= footer.bottom());
        assert!(progress.bottom() < layout.height);
        assert_eq!(
            layout.hit_test(footer.x + 1, footer.y + 1),
            HitTarget::Footer
        );
    }
}

#[test]
fn radii_follow_the_app_tokens_and_scale_with_dpi() {
    let layout = NotificationLayout::compact(&compact_notification());
    assert_eq!(layout.corner_radius(), 14.0);
    assert_eq!(layout.button_radius(), 8.0);
    assert_eq!(layout.border_width(), 1);
    let scaled = layout.clone().at_dpi(144);
    assert_eq!(scaled.corner_radius(), 21.0);
    assert_eq!(scaled.button_radius(), 12.0);
    assert_eq!(scaled.border_width(), 2);
    for layout in [layout, scaled] {
        let action = layout.action.unwrap();
        assert!(layout.button_radius() * 2.0 <= action.height as f32);
        assert!(layout.corner_radius() * 2.0 <= layout.height as f32);
        // La croix de fermeture reste dans le quart arrondi sans le déborder.
        assert!(layout.close.x >= 0 && layout.close.y >= 0);
    }
}

#[test]
fn window_adds_a_shadow_margin_around_the_card() {
    let notification = compact_notification();
    let layout = NotificationLayout::compact(&notification);
    assert_eq!(layout.window_size(), (380, 92));
    assert_eq!(layout.card_origin(), (10, 10));
    assert_eq!(layout.window_origin(100, 50), (90, 40));
    assert_eq!(
        layout.card_rect(),
        Rect {
            x: 10,
            y: 10,
            width: 360,
            height: 72
        }
    );
    let scaled = layout.at_dpi(192);
    assert_eq!(scaled.window_size(), (760, 184));
    assert_eq!(scaled.window_hit(&notification, 5, 5), HitTarget::Outside);
    assert_eq!(
        scaled.window_hit(&notification, 20 + 20, 20 + 20),
        HitTarget::Close
    );
    assert_eq!(
        scaled.window_hit(&notification, 20 + 720, 20 + 60),
        HitTarget::Outside
    );
}

#[test]
fn shadow_never_spills_onto_a_neighbour_or_off_the_window() {
    const {
        assert!(SHADOW_OFFSET_Y + SHADOW_BLUR < SHADOW_MARGIN);
        assert!(SHADOW_MARGIN <= NOTIFICATION_SPACING);
        assert!(SHADOW_MARGIN <= TOP_MARGIN);
        assert!(SHADOW_MARGIN <= RIGHT_MARGIN);
    }
    for dpi in [96, 120, 144, 168, 192] {
        let layout = NotificationLayout::compact(&compact_notification()).at_dpi(dpi);
        let reach = layout.shadow_offset_y() + layout.shadow_blur();
        assert!(reach + 0.5 <= layout.shadow_margin() as f32, "dpi {dpi}");
        assert!(layout.shadow_margin() <= layout.scale(NOTIFICATION_SPACING));
    }
}

#[test]
fn options_map_the_primary_button_to_the_options_hit_target() {
    let notification = Notification::builder()
        .title("Choose a meeting")
        .message("")
        .options(vec!["Design sync".to_string()])
        .build();
    let layout = NotificationLayout::compact(&notification);
    let action = layout.action.unwrap();
    assert_eq!(
        layout.action_hit(&notification, action.x + 2, action.y + 2),
        HitTarget::Options
    );
}

#[test]
fn hidpi_notifications_keep_text_and_click_targets_inside_the_scaled_window() {
    let notification = Notification::builder()
        .title("Design sync")
        .message("Starting soon")
        .build();

    let layout = NotificationLayout::compact(&notification).at_dpi(192);
    assert_eq!((layout.width, layout.height), (720, 144));
    assert!(layout.title.height >= 28);
    assert!(layout.message.height >= 22);
    assert_eq!(layout.action_hit(&notification, 480, 60), HitTarget::Action);
    assert_eq!(layout.action_hit(&notification, 640, 60), HitTarget::Action);
}

#[test]
fn expanded_mockup_keeps_padding_around_title_body_and_action() {
    let layout = NotificationLayout::expanded(&compact_notification());
    let action = layout.action.unwrap();
    let collapse = layout.collapse.unwrap();
    assert_eq!(
        action,
        Rect {
            x: 16,
            y: 328,
            width: 328,
            height: 36
        }
    );
    assert_eq!(layout.height - action.bottom(), EXPANDED_PADDING);
    assert_eq!(layout.width - collapse.right(), EXPANDED_PADDING);
    assert!(!intersects(layout.title, collapse));
    assert!(layout.title.bottom() <= layout.message.y);
    assert!(layout.message.bottom() <= action.y);
}

#[test]
fn expanded_hidpi_stack_keeps_every_action_on_a_short_work_area() {
    let notification = compact_notification();
    let mut layouts = vec![NotificationLayout::expanded(&notification).at_dpi(192)];
    layouts.extend((0..4).map(|_| NotificationLayout::compact(&notification).at_dpi(192)));
    assert_eq!(fit_stack(&mut layouts, 1080), 0);
    let mut occupied = 0;
    for layout in &layouts {
        let (_, y) = stacked_origin(0, 0, 1920, occupied, layout);
        assert!(y + layout.height <= 1080);
        for control in [Some(layout.close), layout.collapse, layout.action]
            .into_iter()
            .flatten()
        {
            assert!(control.y >= 0 && control.bottom() <= layout.height);
        }
        if layout.collapse.is_some() {
            let action = layout.action.unwrap();
            assert!(layout.message.bottom() <= action.y);
            assert_eq!(
                layout.height - action.bottom(),
                layout.scale(EXPANDED_PADDING)
            );
        }
        occupied += layout.height + layout.scale(NOTIFICATION_SPACING);
    }
    assert!(layouts[0].message.height > 0);
    assert!(fit_stack(&mut layouts, 500) > 0);
}

#[test]
fn fitting_compact_notifications_do_not_require_an_unused_bottom_margin() {
    let notification = compact_notification();
    let mut layouts = vec![NotificationLayout::compact(&notification).at_dpi(192); 5];
    assert_eq!(fit_stack(&mut layouts, 846), 0);
    let last = layouts.last().unwrap();
    let (_, y) = stacked_origin(0, 0, 1920, 4 * (144 + 24), last);
    assert_eq!(y + last.height, 846);
    assert!(fit_stack(&mut layouts, 845) > 0);
}

#[test]
fn fractional_dpi_rounds_the_progress_bottom_and_adjacent_hit_boundary_consistently() {
    let notification = compact_notification();
    let layout = NotificationLayout::compact(&notification).at_dpi(144);
    let progress = layout.progress.unwrap();
    assert_eq!(progress.y, 99);
    assert_eq!(progress.bottom(), 104);
    assert_eq!(progress.height, 5);
    let action = layout.action.unwrap();
    assert_eq!(
        layout.hit_test(action.right() - 1, action.y),
        HitTarget::Action
    );
    assert_eq!(layout.hit_test(action.right(), action.y), HitTarget::Body);
}

#[test]
fn expanded_layout_exposes_collapse_and_accept_targets() {
    let notification = Notification::builder()
        .title("Design sync")
        .message("")
        .source(NotificationSource::Session {
            session_id: "sess".to_string(),
        })
        .build();
    let layout = NotificationLayout::expanded(&notification);
    assert_eq!(layout.height, EXPANDED_HEIGHT);
    assert_eq!(
        layout.hit_test(layout.collapse.unwrap().x + 1, 16),
        HitTarget::Collapse
    );
    assert_eq!(
        layout.hit_test(layout.action.unwrap().x + 8, layout.action.unwrap().y + 8),
        HitTarget::Action
    );
}
