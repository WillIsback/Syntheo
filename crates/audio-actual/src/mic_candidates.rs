//! Resolves a microphone chosen by name to the listed cpal devices that can open it.
//!
//! The name shown to the user is the first line of the device description. On Linux, cpal
//! enumerates ALSA PCMs, and one sound card yields several of them: `sysdefault:`, `front:`,
//! `dsnoop:`, `hw:`, `plughw:`, and for USB cards `usbstream:` (issue 433). Their descriptions
//! differ: `usbstream:CARD=Edition` is the only one described by the bare card name
//! ("BRIO 4K Stream Edition"); the others read "BRIO 4K Stream Edition, USB Audio".
//! `usbstream` is an output-only plugin, so opening the bare card name for capture always fails
//! with `DeviceNotAvailable`, even though the card itself can record. The fix is to try every
//! PCM of the chosen card, capture-friendly ones first, before falling back to the default.

/// Value of the `CARD=` argument of an ALSA PCM id (`hw:CARD=Edition,DEV=0` → `Edition`).
fn alsa_arg<'a>(pcm_id: &'a str, key: &str) -> Option<&'a str> {
    let (_, args) = pcm_id.split_once(':')?;
    args.split(',').find_map(|arg| {
        let (k, v) = arg.split_once('=')?;
        k.trim()
            .eq_ignore_ascii_case(key)
            .then(|| v.trim().trim_matches('"'))
            .filter(|v| !v.is_empty())
    })
}

pub(crate) fn alsa_card(pcm_id: &str) -> Option<&str> {
    alsa_arg(pcm_id, "CARD")
}

fn alsa_dev(pcm_id: &str) -> Option<&str> {
    alsa_arg(pcm_id, "DEV")
}

/// Lower is tried first. Unknown ids (macOS, Windows, virtual ALSA PCMs) share one rank, so
/// their listing order is kept.
fn capture_preference(id: Option<&str>) -> u8 {
    let plugin = id
        .and_then(|id| id.split_once(':').map(|(plugin, _)| plugin))
        .unwrap_or_default();
    match plugin {
        "sysdefault" => 0,
        "plughw" => 1,
        "dsnoop" => 2,
        "front" => 3,
        "hw" => 4,
        // Output-only USB stream plugin: it never opens for capture.
        "usbstream" => 9,
        _ => 5,
    }
}

/// Indices in `listed_names` to try, in order, for the ranked candidate `name`.
///
/// Every listed device described exactly as `name` is a candidate, plus the other ALSA PCMs of
/// the same card (and device number, when known). Candidates are sorted capture-friendly first.
/// The default device is a special case on ALSA: `host.default_input_device()` returns a
/// synthetic device whose description ("Default Audio Device") never matches the real hint
/// description of the listed `default` pcm, so when nothing matches by name it is resolved by
/// stable device id (`cpal::Device::id()`).
pub(crate) fn candidate_indices(
    name: &str,
    is_default: bool,
    default_id: Option<&str>,
    listed_names: &[String],
    listed_ids: &[Option<String>],
) -> Vec<usize> {
    let id_at = |index: usize| listed_ids.get(index).and_then(|id| id.as_deref());
    let exact: Vec<usize> = listed_names
        .iter()
        .enumerate()
        .filter(|(_, listed)| listed.as_str() == name)
        .map(|(index, _)| index)
        .collect();

    if exact.is_empty() {
        if !is_default {
            return Vec::new();
        }
        let Some(id) = default_id else {
            return Vec::new();
        };
        return listed_ids
            .iter()
            .position(|listed_id| listed_id.as_deref() == Some(id))
            .into_iter()
            .collect();
    }

    let cards: Vec<&str> = exact
        .iter()
        .filter_map(|&index| id_at(index).and_then(alsa_card))
        .collect();
    let devs: Vec<&str> = exact
        .iter()
        .filter_map(|&index| id_at(index).and_then(alsa_dev))
        .collect();

    let mut indices = exact.clone();
    for index in 0..listed_names.len() {
        if indices.contains(&index) {
            continue;
        }
        let Some(id) = id_at(index) else {
            continue;
        };
        let same_card = alsa_card(id).is_some_and(|card| cards.contains(&card));
        let same_dev = devs.is_empty() || alsa_dev(id).is_none_or(|dev| devs.contains(&dev));
        if same_card && same_dev {
            indices.push(index);
        }
    }

    // Stable sort: equal ranks keep exact matches first, then listing order.
    indices.sort_by_key(|&index| capture_preference(id_at(index)));
    indices
}

/// The requested device when capture opened another one instead.
pub(crate) fn fallback_from<'a>(requested: Option<&'a str>, opened: &str) -> Option<&'a str> {
    requested.filter(|requested| !requested.is_empty() && *requested != opened)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_string()).collect()
    }

    fn ids(items: &[Option<&str>]) -> Vec<Option<String>> {
        items.iter().map(|id| id.map(str::to_string)).collect()
    }

    #[test]
    fn alsa_card_reads_the_card_argument() {
        assert_eq!(alsa_card("hw:CARD=Edition,DEV=0"), Some("Edition"));
        assert_eq!(alsa_card("usbstream:CARD=Edition"), Some("Edition"));
        assert_eq!(alsa_card("plughw:CARD=2,DEV=0"), Some("2"));
        assert_eq!(alsa_card("hw:CARD=\"Edition\",DEV=0"), Some("Edition"));
        assert_eq!(alsa_card("default"), None);
        assert_eq!(alsa_card("pipewire"), None);
        assert_eq!(alsa_card("BuiltInMicrophoneDevice"), None);
        assert_eq!(alsa_dev("front:CARD=Edition,DEV=1"), Some("1"));
    }

    /// `arecord -L` on a PipeWire system with a Logitech BRIO plugged in (issue 433).
    fn brio_listing() -> (Vec<String>, Vec<Option<String>>) {
        (
            strings(&[
                "Discard all samples (playback) or generate zero samples (capture)",
                "PipeWire Sound Server",
                "Default ALSA Output (currently PipeWire Media Server)",
                "BRIO 4K Stream Edition, USB Audio",
                "BRIO 4K Stream Edition, USB Audio",
                "BRIO 4K Stream Edition, USB Audio",
                "BRIO 4K Stream Edition, USB Audio",
                "BRIO 4K Stream Edition, USB Audio",
                "BRIO 4K Stream Edition",
                "HDA Intel PCH, ALC3246 Analog",
            ]),
            ids(&[
                Some("null"),
                Some("pipewire"),
                Some("default"),
                Some("sysdefault:CARD=Edition"),
                Some("front:CARD=Edition,DEV=0"),
                Some("dsnoop:CARD=Edition,DEV=0"),
                Some("hw:CARD=Edition,DEV=0"),
                Some("plughw:CARD=Edition,DEV=0"),
                Some("usbstream:CARD=Edition"),
                Some("sysdefault:CARD=PCH"),
            ]),
        )
    }

    #[test]
    fn bare_card_name_tries_the_card_capture_pcms_before_usbstream() {
        let (names, ids) = brio_listing();
        let indices = candidate_indices("BRIO 4K Stream Edition", false, None, &names, &ids);
        let opened: Vec<&str> = indices
            .iter()
            .map(|&index| ids[index].as_deref().unwrap())
            .collect();
        assert_eq!(
            opened,
            [
                "sysdefault:CARD=Edition",
                "plughw:CARD=Edition,DEV=0",
                "dsnoop:CARD=Edition,DEV=0",
                "front:CARD=Edition,DEV=0",
                "hw:CARD=Edition,DEV=0",
                "usbstream:CARD=Edition",
            ]
        );
    }

    #[test]
    fn full_card_name_never_reaches_other_cards() {
        let (names, ids) = brio_listing();
        let indices = candidate_indices(
            "BRIO 4K Stream Edition, USB Audio",
            false,
            None,
            &names,
            &ids,
        );
        assert_eq!(indices.first(), Some(&3));
        assert!(!indices.contains(&9), "other card must not be tried");
        assert!(!indices.contains(&2), "the default pcm must not be tried");
    }

    #[test]
    fn siblings_keep_the_chosen_device_number() {
        let names = strings(&["Card, Analog", "Card, Digital", "Card, Analog"]);
        let ids = ids(&[
            Some("hw:CARD=PCH,DEV=0"),
            Some("hw:CARD=PCH,DEV=1"),
            Some("plughw:CARD=PCH,DEV=0"),
        ]);
        assert_eq!(
            candidate_indices("Card, Analog", false, None, &names, &ids),
            [2, 0]
        );
    }

    #[test]
    fn non_alsa_ids_keep_listing_order() {
        let names = strings(&["MacBook Pro Microphone", "USB Mic", "USB Mic"]);
        let ids = ids(&[Some("BuiltIn"), Some("AppleUSB:1"), Some("AppleUSB:2")]);
        assert_eq!(
            candidate_indices("USB Mic", false, None, &names, &ids),
            [1, 2]
        );
    }

    #[test]
    fn default_candidate_cases() {
        type Case<'a> = (
            &'a str,
            &'a str,
            bool,
            Option<&'a str>,
            &'a [&'a str],
            &'a [Option<&'a str>],
            Option<usize>,
        );
        let cases: [Case<'_>; 4] = [
            (
                "matches default by id when description differs",
                "Default Audio Device",
                true,
                Some("default"),
                &[
                    "Discard all samples (playback) or generate zero samples (capture)",
                    "Default ALSA Output (currently PipeWire Media Server)",
                    "USB Microphone",
                ],
                &[Some("null"), Some("default"), Some("hw:CARD=1,DEV=0")],
                Some(1),
            ),
            (
                "prefers name match over id match",
                "USB Microphone",
                false,
                Some("default"),
                &["USB Microphone", "Built-in Audio"],
                &[Some("hw:CARD=1,DEV=0"), Some("default")],
                Some(0),
            ),
            (
                "does not id-match non-default candidates",
                "Some Other Name",
                false,
                Some("default"),
                &["Default ALSA Output"],
                &[Some("default")],
                None,
            ),
            (
                "returns none when default id is unavailable",
                "Default Audio Device",
                true,
                None,
                &["USB Microphone"],
                &[Some("hw:CARD=1,DEV=0")],
                None,
            ),
        ];

        for (label, name, is_default, default_id, names, listed_ids, expected) in cases {
            let names = strings(names);
            let listed_ids = ids(listed_ids);
            assert_eq!(
                candidate_indices(name, is_default, default_id, &names, &listed_ids)
                    .first()
                    .copied(),
                expected,
                "{label}"
            );
        }
    }

    #[test]
    fn fallback_is_reported_only_when_another_device_opened() {
        assert_eq!(
            fallback_from(Some("BRIO 4K Stream Edition"), "Default Audio Device"),
            Some("BRIO 4K Stream Edition")
        );
        assert_eq!(
            fallback_from(Some("BRIO 4K Stream Edition"), "BRIO 4K Stream Edition"),
            None
        );
        assert_eq!(fallback_from(None, "Default Audio Device"), None);
        assert_eq!(fallback_from(Some(""), "Default Audio Device"), None);
    }
}
