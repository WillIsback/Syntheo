use std::sync::mpsc::{self, Receiver};

use ractor::ActorRef;

use crate::{SessionErrorEvent, actors::ChannelMode};
use syntheo_audio::AudioProvider;

use syntheo_device_monitor::{DeviceMonitorHandle, DeviceSwitch, DeviceSwitchMonitor};

use super::{OUTPUT_ROUTING_POLL_INTERVAL, POLLS_OUTPUT_ROUTING, SourceMsg, SourceState, stream};

pub(super) struct DeviceChangeWatcher {
    _handle: DeviceMonitorHandle,
    _thread: std::thread::JoinHandle<()>,
}

impl DeviceChangeWatcher {
    pub(super) fn spawn(actor: ActorRef<SourceMsg>, headphone_output: bool) -> Self {
        let (event_tx, event_rx) = mpsc::sync_channel(1);
        let handle = DeviceSwitchMonitor::spawn_debounced_bounded(event_tx);
        let routing = POLLS_OUTPUT_ROUTING.then(|| OutputRoutingTracker::new(headphone_output));
        let thread = std::thread::spawn(move || Self::event_loop(event_rx, actor, routing));

        Self {
            _handle: handle,
            _thread: thread,
        }
    }

    pub(super) fn event_loop(
        event_rx: Receiver<DeviceSwitch>,
        actor: ActorRef<SourceMsg>,
        mut routing: Option<OutputRoutingTracker>,
    ) {
        loop {
            let event = match routing {
                Some(_) => event_rx.recv_timeout(OUTPUT_ROUTING_POLL_INTERVAL),
                None => event_rx
                    .recv()
                    .map_err(|_| mpsc::RecvTimeoutError::Disconnected),
            };
            match event {
                Ok(DeviceSwitch::DeviceListChanged) => {}
                Ok(event)
                    if !device_switch_updates_capture(
                        &event,
                        syntheo_audio_device::bluetooth_input_owns_system_defaults(),
                    ) =>
                {
                    tracing::info!(?event, "device_switch_ignored_bluetooth_handoff");
                }
                Ok(DeviceSwitch::DefaultInputChanged) => {
                    tracing::info!("default_input_changed_retrying_microphone");
                    let _ = actor.cast(SourceMsg::InputChanged);
                }
                Ok(DeviceSwitch::DefaultOutputChanged { .. }) => {
                    tracing::info!("default_output_changed_retrying_speaker");
                    let _ = actor.cast(SourceMsg::OutputChanged);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let Some(routing) = routing.as_mut() else {
                        continue;
                    };
                    let observed = headphone_only_output();
                    if routing.observe(observed) {
                        if syntheo_audio_device::bluetooth_input_owns_system_defaults() {
                            tracing::info!(
                                headphone_output = observed,
                                "output_routing_ignored_bluetooth_handoff"
                            );
                            continue;
                        }
                        tracing::info!(
                            headphone_output = observed,
                            "output_routing_changed_retrying_speaker"
                        );
                        let _ = actor.cast(SourceMsg::OutputChanged);
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    }
}

fn headphone_only_output() -> bool {
    syntheo_audio_device::headphone_only_output().is_some()
}

// The same mic-isolation verdict `start_source_loop` emits as `MicIsolated`, recomputed
// for callers that need it without a running source (e.g. listener spawn).
pub(crate) fn mic_isolated(mic_device: &Option<String>, audio: &dyn AudioProvider) -> bool {
    let mic_swapped =
        mic_device.is_none() && stream::active_mic_device(mic_device.clone(), audio).is_some();
    headphone_only_output() && !mic_swapped
}

// Holding a Bluetooth headset in HFP/SCO sets the system default input and can also move
// the default output. Those Core Audio events must not bounce the source we just opened.
pub(super) fn device_switch_updates_capture(
    event: &DeviceSwitch,
    bluetooth_owns_defaults: bool,
) -> bool {
    match event {
        DeviceSwitch::DeviceListChanged => false,
        DeviceSwitch::DefaultInputChanged | DeviceSwitch::DefaultOutputChanged { .. } => {
            !bluetooth_owns_defaults
        }
    }
}

// A meeting app can start playing through speakers after capture began, flipping the AEC and
// mic-isolation verdict the streams were opened with. Requiring two consecutive polls keeps a
// one-off system sound from interrupting capture.
pub(super) struct OutputRoutingTracker {
    expected: bool,
    pending: Option<bool>,
}

impl OutputRoutingTracker {
    pub(super) fn new(expected: bool) -> Self {
        Self {
            expected,
            pending: None,
        }
    }

    pub(super) fn observe(&mut self, observed: bool) -> bool {
        if observed == self.expected {
            self.pending = None;
            return false;
        }
        if self.pending == Some(observed) {
            self.expected = observed;
            self.pending = None;
            return true;
        }
        self.pending = Some(observed);
        false
    }
}

pub(super) fn capturing_mic_device(st: &SourceState) -> Option<String> {
    if st.current_mode == ChannelMode::SpeakerOnly {
        return None;
    }
    match st.capture_health.mic {
        Some(false) => None,
        None if st.capture_health.speaker.is_some() => None,
        _ => st.active_mic_device.clone(),
    }
}

pub(super) fn emit_mic_isolation(st: &SourceState) {
    st.runtime.emit_data(crate::SessionDataEvent::MicIsolated {
        session_id: st.session_id.clone(),
        value: st.capture_mic_isolated,
    });
    if let Some(session) =
        ractor::registry::where_is(crate::actors::session_supervisor_name(&st.session_id))
    {
        let session: ActorRef<crate::actors::SessionMsg> = session.into();
        let _ = session.cast(crate::actors::SessionMsg::SourceRoutingChanged);
    }
}

pub(super) fn emit_channel_status(st: &SourceState, error: String) {
    st.runtime.emit_error(SessionErrorEvent::AudioError {
        session_id: st.session_id.clone(),
        error,
        device: st.active_mic_device.clone(),
        is_fatal: false,
    });
}
