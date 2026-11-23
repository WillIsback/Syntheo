const MAX_MENU_BAR_LABEL_WIDTH: usize = 30;

use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

/// Titre affiché à côté de l'icône : le titre de l'enregistrement en cours,
/// raccourci à la largeur de la barre de menus, et rien sinon.
pub fn menu_bar_title(is_recording: bool, recording_title: Option<&str>) -> Option<String> {
    if !is_recording {
        return None;
    }

    let title = recording_title?.trim();
    if title.is_empty() {
        return None;
    }

    Some(compact_title(title, MAX_MENU_BAR_LABEL_WIDTH))
}

fn compact_title(title: &str, max_width: usize) -> String {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");

    if title.width() <= max_width {
        return title;
    }

    if max_width <= 1 {
        return "…".to_string();
    }

    let mut compact = String::new();
    let mut width = 0;
    for character in title.chars() {
        let character_width = character.width().unwrap_or(0);
        if width + character_width >= max_width {
            break;
        }
        compact.push(character);
        width += character_width;
    }

    format!("{compact}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shows_the_recording_title_only_while_recording() {
        assert_eq!(
            menu_bar_title(true, Some("Customer call")),
            Some("Customer call".to_string())
        );
        assert_eq!(menu_bar_title(false, Some("Customer call")), None);
        assert_eq!(menu_bar_title(true, None), None);
        assert_eq!(menu_bar_title(true, Some("  ")), None);
    }

    #[test]
    fn caps_menu_bar_titles_by_display_width() {
        for (title, expected) in [
            (
                "  Sprint   retrospective and planning for the next quarter  ",
                "Sprint retrospective and plan…",
            ),
            (
                "[실뻘한] char 정치현 대표님 컨콜 회의록 정리",
                "[실뻘한] char 정치현 대표님 …",
            ),
        ] {
            let label = menu_bar_title(true, Some(title)).unwrap();

            assert_eq!(label, expected);
            assert!(label.width() <= MAX_MENU_BAR_LABEL_WIDTH);
        }
    }
}
