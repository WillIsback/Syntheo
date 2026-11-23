pub mod doctor;
pub mod meetings;
pub mod mesure;
pub mod proposals;
pub mod recording_import;

pub mod meeting_delete;
pub mod meeting_hold;
pub mod meeting_pilot;

/// Tronque `value` à `width` caractères, en finissant par « … ».
pub(crate) fn truncate(value: &str, width: usize) -> String {
    if value.chars().count() <= width {
        return value.to_string();
    }
    let mut text = value
        .chars()
        .take(width.saturating_sub(1))
        .collect::<String>();
    text.push('…');
    text
}
