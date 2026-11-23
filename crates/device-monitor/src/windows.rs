use crate::DeviceSwitch;
use std::sync::mpsc;

pub(crate) fn monitor_device_change(
    _event_tx: mpsc::SyncSender<DeviceSwitch>,
    stop_rx: mpsc::Receiver<()>,
) {
    tracing::warn!("device_monitoring_unsupported_on_windows");
    let _ = stop_rx.recv();
}
