use super::*;

#[test]
fn timed_map_evicts_the_oldest_entry_at_capacity() {
    let now = Instant::now();
    let mut map = BoundedTimedMap::default();

    map.insert("first".to_string(), 1, now, 2);
    map.insert("second".to_string(), 2, now, 2);
    map.insert("third".to_string(), 3, now, 2);

    assert!(map.get("first").is_none());
    assert_eq!(map.get("second").map(|entry| entry.value), Some(2));
    assert_eq!(map.get("third").map(|entry| entry.value), Some(3));
}

#[test]
fn replacing_an_entry_refreshes_its_eviction_order() {
    let now = Instant::now();
    let mut map = BoundedTimedMap::default();

    map.insert("first".to_string(), 1, now, 2);
    map.insert("second".to_string(), 2, now, 2);
    map.insert("first".to_string(), 3, now, 2);
    map.insert("third".to_string(), 4, now, 2);

    assert_eq!(map.get("first").map(|entry| entry.value), Some(3));
    assert!(map.get("second").is_none());
    assert_eq!(map.get("third").map(|entry| entry.value), Some(4));
}

#[test]
fn timed_map_removes_expired_entries() {
    let now = Instant::now();
    let mut map = BoundedTimedMap::default();

    map.insert("expired".to_string(), 1, now - Duration::from_secs(2), 2);
    map.insert("current".to_string(), 2, now, 2);
    map.retain_recent(now, Duration::from_secs(1));

    assert!(map.get("expired").is_none());
    assert_eq!(map.get("current").map(|entry| entry.value), Some(2));
}

#[test]
fn insert_without_eviction_rejects_new_keys_but_refreshes_existing_at_capacity() {
    let now = Instant::now();
    let refreshed_at = now + Duration::from_secs(1);
    let mut map = BoundedTimedMap::default();

    assert!(map.insert_without_eviction("first".to_string(), 1, now, 2));
    assert!(map.insert_without_eviction("second".to_string(), 2, now, 2));
    assert!(!map.insert_without_eviction("third".to_string(), 3, now, 2));

    assert_eq!(map.get("first").map(|entry| entry.value), Some(1));
    assert_eq!(map.get("second").map(|entry| entry.value), Some(2));
    assert!(map.get("third").is_none());

    assert!(map.insert_without_eviction("first".to_string(), 3, refreshed_at, 2));

    let first = map.get("first").unwrap();
    assert_eq!(first.value, 3);
    assert_eq!(first.timestamp, refreshed_at);
    assert_eq!(map.get("second").map(|entry| entry.value), Some(2));
    assert_eq!(map.entries.len(), 2);
}

#[test]
fn stored_context_routes_the_source() {
    let notification = Notification::builder()
        .title("Design sync")
        .message("Summary ready")
        .source(NotificationSource::Session {
            session_id: "session-1".to_string(),
        })
        .build();

    assert!(store_context("session-summary", &notification));
    let context = get_context("session-summary");
    assert_eq!(context.key, "session-summary");
    assert!(matches!(
        context.source,
        Some(NotificationSource::Session { session_id }) if session_id == "session-1"
    ));
    assert!(get_context("session-summary").source.is_none());
}
