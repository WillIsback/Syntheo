use super::*;

#[test]
fn bluetooth_capture_restores_its_default_but_preserves_later_user_selections() {
    let requested = named_input("a2dp", "AirPods", TransportType::Bluetooth);
    let handsfree = named_input("sco", "AirPods Hands-Free", TransportType::Bluetooth);
    let usb = named_input("usb", "USB Microphone", TransportType::Usb);
    for current in [&requested, &handsfree] {
        for user_changed in [false, true] {
            let ownership = std::sync::Arc::new(BluetoothDefaultOwnership {
                requested: requested.clone(),
                endpoint_ids: std::sync::Mutex::new(None),
                active: std::sync::atomic::AtomicBool::new(true),
            });
            ownership.finish_handoff(Some(current), None);
            let mut activation = BluetoothInputActivation {
                name: (current.id != requested.id).then(|| current.name.clone()),
                previous_default: Some(DeviceId("builtin".into())),
                ownership: Some(ownership.clone()),
            };
            assert!(ownership.owns_default(Some(current)));
            if user_changed {
                assert!(!ownership.owns_default(Some(&usb)));
                // Returning to the headset before capture teardown must not reclaim
                // the earlier app-selected default over the user's newer selection.
                assert!(!ownership.owns_default(Some(current)));
            }
            let mut selected = current.id.clone();
            activation.restore_previous_default(Some(current), |previous| {
                selected = previous.clone();
                Ok(())
            });
            assert_eq!(
                selected,
                if user_changed {
                    current.id.clone()
                } else {
                    DeviceId("builtin".into())
                }
            );
        }
    }
}

#[test]
fn same_named_headset_selection_is_not_owned_or_restored() {
    for handoff_name in ["AirPods", "AirPods Hands-Free"] {
        let requested = named_input("headset-a", "AirPods", TransportType::Bluetooth);
        let captured = named_input("headset-a-hfp", handoff_name, TransportType::Bluetooth);
        let other = named_input("headset-b", handoff_name, TransportType::Bluetooth);
        let ownership = std::sync::Arc::new(BluetoothDefaultOwnership {
            requested,
            endpoint_ids: std::sync::Mutex::new(None),
            active: std::sync::atomic::AtomicBool::new(true),
        });
        ownership.finish_handoff(Some(&captured), None);
        assert!(ownership.owns_default(Some(&captured)));
        let mut activation = BluetoothInputActivation {
            name: Some(captured.name.clone()),
            previous_default: Some(DeviceId("builtin".into())),
            ownership: Some(ownership.clone()),
        };
        let mut selected = other.id.clone();
        activation.restore_previous_default(Some(&other), |previous| {
            selected = previous.clone();
            Ok(())
        });
        assert_eq!(selected, other.id);
        assert!(!ownership.owns_default(Some(&other)));
    }
}

fn output(id: &str, headphone: bool) -> AudioDevice {
    let name = if headphone { "Headphones" } else { "Speakers" };
    AudioDevice::new(id, name, AudioDirection::Output, TransportType::Unknown)
}

fn is_headphone(device: &AudioDevice) -> bool {
    device.name == "Headphones"
}

#[test]
fn falls_back_to_default_output_when_nothing_is_playing() {
    let result = resolve_headphone_only_output(Some(output("hp", true)), Vec::new(), is_headphone);
    assert_eq!(result.map(|d| d.id.0), Some("hp".to_string()));

    let result =
        resolve_headphone_only_output(Some(output("spk", false)), Vec::new(), is_headphone);
    assert!(result.is_none());
}

#[test]
fn any_running_speaker_disqualifies_headphone_default() {
    let result = resolve_headphone_only_output(
        Some(output("hp", true)),
        vec![output("hp", true), output("spk", false)],
        is_headphone,
    );
    assert!(result.is_none());
}

#[test]
fn running_headphones_win_over_speaker_default() {
    let result = resolve_headphone_only_output(
        Some(output("spk", false)),
        vec![output("hp", true)],
        is_headphone,
    );
    assert_eq!(result.map(|d| d.id.0), Some("hp".to_string()));
}

#[test]
fn prefers_default_among_running_headphones() {
    let result = resolve_headphone_only_output(
        Some(output("hp-default", true)),
        vec![output("hp-other", true), output("hp-default", true)],
        is_headphone,
    );
    assert_eq!(result.map(|d| d.id.0), Some("hp-default".to_string()));
}

fn input(id: &str, transport: TransportType) -> AudioDevice {
    AudioDevice::new(id, id, AudioDirection::Input, transport)
}

#[test]
fn wired_default_input_needs_no_replacement() {
    let result = resolve_wired_input_replacement(
        &input("builtin", TransportType::BuiltIn),
        vec![
            input("builtin", TransportType::BuiltIn),
            input("usb", TransportType::Usb),
        ],
    );
    assert!(result.is_none());
}

#[test]
fn bluetooth_default_input_prefers_built_in_then_usb() {
    let inputs = vec![
        input("headset", TransportType::Bluetooth),
        input("usb", TransportType::Usb),
        input("builtin", TransportType::BuiltIn),
    ];
    let result =
        resolve_wired_input_replacement(&input("headset", TransportType::Bluetooth), inputs);
    assert_eq!(result.map(|d| d.id.0), Some("builtin".to_string()));

    let inputs = vec![
        input("headset", TransportType::Bluetooth),
        input("usb", TransportType::Usb),
    ];
    let result =
        resolve_wired_input_replacement(&input("headset", TransportType::Bluetooth), inputs);
    assert_eq!(result.map(|d| d.id.0), Some("usb".to_string()));
}

#[test]
fn pci_onboard_input_ranks_with_built_in_over_usb() {
    let inputs = vec![
        input("headset", TransportType::Bluetooth),
        input("usb", TransportType::Usb),
        input("onboard", TransportType::Pci),
    ];
    let result =
        resolve_wired_input_replacement(&input("headset", TransportType::Bluetooth), inputs);
    assert_eq!(result.map(|d| d.id.0), Some("onboard".to_string()));
}

fn named_input(id: &str, name: &str, transport: TransportType) -> AudioDevice {
    AudioDevice::new(id, name, AudioDirection::Input, transport)
}

#[test]
fn line_in_and_loopback_inputs_never_replace_bluetooth() {
    let headset = input("headset", TransportType::Bluetooth);
    let inputs = vec![
        headset.clone(),
        named_input(
            "mix",
            "Stereo Mix (Realtek(R) Audio)",
            TransportType::BuiltIn,
        ),
        named_input("line", "Line In (Realtek(R) Audio)", TransportType::BuiltIn),
        named_input(
            "array",
            "Microphone Array (Realtek(R) Audio)",
            TransportType::BuiltIn,
        ),
    ];
    let result = resolve_wired_input_replacement(&headset, inputs);
    assert_eq!(result.map(|d| d.id.0), Some("array".to_string()));

    let inputs = vec![
        headset.clone(),
        named_input(
            "mix",
            "Stereo Mix (Realtek(R) Audio)",
            TransportType::BuiltIn,
        ),
        named_input("line", "Line In (Realtek(R) Audio)", TransportType::BuiltIn),
    ];
    assert!(resolve_wired_input_replacement(&headset, inputs).is_none());
}

#[test]
fn microphone_wins_ties_within_a_transport_but_not_across() {
    let headset = input("headset", TransportType::Bluetooth);
    let inputs = vec![
        headset.clone(),
        named_input("jack", "Built-in Input", TransportType::BuiltIn),
        named_input("mic", "Built-in Microphone", TransportType::BuiltIn),
    ];
    let result = resolve_wired_input_replacement(&headset, inputs);
    assert_eq!(result.map(|d| d.id.0), Some("mic".to_string()));

    let inputs = vec![
        headset.clone(),
        named_input("yeti", "Yeti Stereo Microphone", TransportType::Usb),
        named_input("jack", "Built-in Input", TransportType::BuiltIn),
    ];
    let result = resolve_wired_input_replacement(&headset, inputs);
    assert_eq!(result.map(|d| d.id.0), Some("jack".to_string()));
}

#[test]
fn bluetooth_default_input_never_falls_back_to_bluetooth_or_virtual() {
    let inputs = vec![
        input("headset", TransportType::Bluetooth),
        input("earbuds", TransportType::Bluetooth),
        input("aggregate", TransportType::Virtual),
        AudioDevice::new(
            "speakers",
            "speakers",
            AudioDirection::Output,
            TransportType::BuiltIn,
        ),
    ];
    let result =
        resolve_wired_input_replacement(&input("headset", TransportType::Bluetooth), inputs);
    assert!(result.is_none());
}

#[test]
fn bluetooth_input_named_requires_bluetooth_transport() {
    let inputs = vec![
        named_input("usb", "AirPods", TransportType::Usb),
        named_input("bt", "AirPods", TransportType::Bluetooth),
        named_input("other", "WH-1000XM5", TransportType::Bluetooth),
    ];
    assert_eq!(
        bluetooth_input_named("AirPods", &inputs).map(|device| device.id.0.as_str()),
        Some("bt")
    );
    assert!(bluetooth_input_named("MacBook Pro Microphone", &inputs).is_none());
}

#[test]
fn capture_name_follows_the_live_bluetooth_default_after_handoff() {
    let requested = named_input("a2dp", "AirPods", TransportType::Bluetooth);
    let handsfree = named_input("tsco", "AirPods Hands-Free", TransportType::Bluetooth);
    assert_eq!(
        resolved_capture_name(&requested, Some(&handsfree), None).as_deref(),
        Some("AirPods Hands-Free")
    );

    let renamed = named_input("a2dp", "AirPods Hands-Free", TransportType::Bluetooth);
    assert_eq!(
        resolved_capture_name(&requested, Some(&renamed), None).as_deref(),
        Some("AirPods Hands-Free")
    );

    let builtin = named_input("mic", "MacBook Pro Microphone", TransportType::BuiltIn);
    assert_eq!(
        resolved_capture_name(&requested, Some(&builtin), None),
        None
    );
    assert_eq!(
        resolved_capture_name(&requested, Some(&requested), None),
        None
    );
    assert_eq!(resolved_capture_name(&requested, None, None), None);
    assert_eq!(
        resolved_capture_name(
            &requested,
            Some(&requested),
            Some(&[
                requested.clone(),
                named_input("tsco", "AirPods Hands-Free", TransportType::Bluetooth),
            ])
        )
        .as_deref(),
        Some("AirPods Hands-Free")
    );
}

#[test]
fn bluetooth_handoff_ignores_the_a2dp_device_just_selected() {
    let requested = named_input("a2dp", "AirPods", TransportType::Bluetooth);
    assert!(!bluetooth_handoff_ready(&requested, &requested));
    assert!(bluetooth_handoff_ready(
        &requested,
        &named_input("tsco", "AirPods Hands-Free", TransportType::Bluetooth)
    ));
    assert!(!bluetooth_handoff_ready(
        &requested,
        &named_input("mic", "MacBook Pro Microphone", TransportType::BuiltIn)
    ));
    assert!(!bluetooth_handoff_ready(
        &requested,
        &named_input("other", "WH-1000XM5", TransportType::Bluetooth)
    ));
}

#[test]
fn listed_hands_free_endpoint_is_preferred_over_a2dp_default() {
    let requested = named_input("a2dp", "AirPods", TransportType::Bluetooth);
    let inputs = vec![
        requested.clone(),
        named_input("tsco", "AirPods Hands-Free", TransportType::Bluetooth),
        named_input("other", "WH-1000XM5 Hands-Free", TransportType::Bluetooth),
    ];
    assert_eq!(
        listed_hands_free_capture(&requested, &inputs).map(|device| device.id.0.as_str()),
        Some("tsco")
    );
    assert_eq!(
        bluetooth_base_name("AirPods Hands-Free"),
        bluetooth_base_name("AirPods")
    );
    assert_ne!(
        bluetooth_base_name("AirPods Pro"),
        bluetooth_base_name("AirPods")
    );
}
