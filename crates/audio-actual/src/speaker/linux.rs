use std::sync::Arc;
use std::sync::Once;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::Stream;
use futures_util::task::AtomicWaker;
use libpulse_binding as pulse;
use pin_project::pin_project;
use pipewire as pw;
use pulse::context::{Context as PaContext, FlagSet as ContextFlagSet};
use pulse::mainloop::threaded::Mainloop;
use pulse::sample::{Format, Spec};
use pulse::stream::{FlagSet as StreamFlagSet, Stream as PaStream};
use pw::properties::properties;
use pw::spa::utils::Direction;
use ringbuf::{HeapCons, HeapProd, HeapRb, traits::Split};

use crate::async_ring::RingbufAsyncReader;
use crate::rt_ring::push_f32le_bytes_first_channel_to_ringbuf;

use super::{BUFFER_SIZE, CHUNK_SIZE, CaptureThreadHandles};

const DEFAULT_SAMPLE_RATE: u32 = 48_000;

pub struct SpeakerInput {
    sample_rate: u32,
    /// Sortie choisie dans les réglages (issue 450) ; `None` suit la sortie par défaut.
    preferred: Option<String>,
}

#[pin_project(PinnedDrop)]
pub struct SpeakerStream {
    reader: RingbufAsyncReader<HeapCons<f32>>,
    current_sample_rate: Arc<AtomicU32>,
    backend_control: BackendControl,
}

enum BackendControl {
    PipeWire {
        shutdown: pw::channel::Sender<()>,
        capture_thread: Option<thread::JoinHandle<()>>,
    },
    PulseAudio {
        running: Arc<AtomicBool>,
        capture_thread: Option<thread::JoinHandle<()>>,
    },
}

struct PipeWireUserData {
    format: pw::spa::param::audio::AudioInfoRaw,
    init_tx: Option<std::sync::mpsc::Sender<Result<()>>>,
    producer: HeapProd<f32>,
    waker: Arc<AtomicWaker>,
    wake_pending: Arc<AtomicBool>,
    dropped_samples: Arc<AtomicUsize>,
    current_sample_rate: Arc<AtomicU32>,
    scratch: Vec<f32>,
}

fn update_pipewire_initialization(
    init_tx: &mut Option<std::sync::mpsc::Sender<Result<()>>>,
    state: &pw::stream::StreamState,
    sample_rate: u32,
) {
    match state {
        pw::stream::StreamState::Streaming if sample_rate > 0 => {
            if let Some(init_tx) = init_tx.take() {
                tracing::info!(
                    syntheo.audio.sample_rate_hz = sample_rate,
                    "pipewire_capture_initialized"
                );
                let _ = init_tx.send(Ok(()));
            }
        }
        pw::stream::StreamState::Error(error) => {
            if let Some(init_tx) = init_tx.take() {
                // Initialization failures can recover through the PulseAudio fallback.
                tracing::warn!(error = %error, "pipewire_stream_init_failed");
                let _ = init_tx.send(Err(anyhow::anyhow!(
                    "PipeWire stream entered an error state: {error}"
                )));
            } else {
                tracing::error!(error = %error, "pipewire_stream_error");
            }
        }
        _ => {}
    }
}

impl SpeakerInput {
    pub fn new(preferred: Option<String>) -> Result<Self> {
        Ok(Self {
            sample_rate: DEFAULT_SAMPLE_RATE,
            preferred,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn stream(self) -> Result<SpeakerStream> {
        // Nom du sink choisi, seulement s'il est présent : sinon la capture suit la sortie par
        // défaut, et PipeWire la déplace quand le défaut change (casque branché ou débranché).
        let target = super::output::explicit_output_id(self.preferred.as_deref());
        match SpeakerStream::try_pipewire(self.sample_rate, target.clone()) {
            Ok(stream) => Ok(stream),
            Err(pipewire_err) => {
                tracing::warn!(error = ?pipewire_err, "pipewire_capture_unavailable");
                SpeakerStream::try_pulseaudio(self.sample_rate, target).map_err(|pulse_err| {
                    anyhow::anyhow!(
                        "PipeWire speaker capture failed: {pipewire_err:#}; PulseAudio speaker capture failed: {pulse_err:#}"
                    )
                })
            }
        }
    }
}

impl SpeakerStream {
    fn try_pipewire(initial_rate: u32, target: Option<String>) -> Result<Self> {
        let rb = HeapRb::<f32>::new(BUFFER_SIZE);
        let (producer, consumer) = rb.split();

        let waker = Arc::new(AtomicWaker::new());
        let wake_pending = Arc::new(AtomicBool::new(false));
        let alive = Arc::new(AtomicBool::new(true));
        let current_sample_rate = Arc::new(AtomicU32::new(initial_rate));
        let dropped_samples = Arc::new(AtomicUsize::new(0));
        let (init_tx, init_rx) = std::sync::mpsc::channel();
        let (shutdown_tx, shutdown_rx) = pw::channel::channel::<()>();

        let capture_thread = {
            let waker = waker.clone();
            let wake_pending = wake_pending.clone();
            let alive = alive.clone();
            let current_sample_rate = current_sample_rate.clone();
            let dropped_samples = dropped_samples.clone();

            thread::spawn(move || {
                let result = pipewire_capture_loop(
                    CaptureThreadHandles {
                        producer,
                        waker: Arc::clone(&waker),
                        wake_pending,
                        alive: Arc::clone(&alive),
                        current_sample_rate,
                        dropped_samples,
                    },
                    shutdown_rx,
                    init_tx,
                    target,
                );

                if let Err(err) = result {
                    tracing::error!(error = ?err, "pipewire_capture_thread_failed");
                }

                alive.store(false, Ordering::Release);
                waker.wake();
            })
        };

        match init_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => {}
            Ok(Err(err)) => {
                let _ = shutdown_tx.send(());
                let _ = capture_thread.join();
                return Err(err);
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                let _ = shutdown_tx.send(());
                let _ = capture_thread.join();
                anyhow::bail!("Timed out initializing PipeWire speaker capture");
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                let _ = capture_thread.join();
                anyhow::bail!("PipeWire speaker capture stopped during initialization");
            }
        }

        Ok(Self {
            reader: RingbufAsyncReader::new(consumer, waker, wake_pending, vec![0.0; CHUNK_SIZE])
                .with_alive(alive)
                .with_dropped_samples(dropped_samples, "samples_dropped"),
            current_sample_rate,
            backend_control: BackendControl::PipeWire {
                shutdown: shutdown_tx,
                capture_thread: Some(capture_thread),
            },
        })
    }

    fn try_pulseaudio(initial_rate: u32, target: Option<String>) -> Result<Self> {
        let rb = HeapRb::<f32>::new(BUFFER_SIZE);
        let (producer, consumer) = rb.split();

        let waker = Arc::new(AtomicWaker::new());
        let wake_pending = Arc::new(AtomicBool::new(false));
        let alive = Arc::new(AtomicBool::new(true));
        let running = Arc::new(AtomicBool::new(true));
        let current_sample_rate = Arc::new(AtomicU32::new(initial_rate));
        let dropped_samples = Arc::new(AtomicUsize::new(0));
        let (init_tx, init_rx) = std::sync::mpsc::channel();

        let capture_thread = {
            let waker = waker.clone();
            let wake_pending = wake_pending.clone();
            let alive = alive.clone();
            let running = running.clone();
            let current_sample_rate = current_sample_rate.clone();
            let dropped_samples = dropped_samples.clone();

            thread::spawn(move || {
                let result = pulseaudio_capture_loop(
                    CaptureThreadHandles {
                        producer,
                        waker: Arc::clone(&waker),
                        wake_pending,
                        alive: Arc::clone(&alive),
                        current_sample_rate,
                        dropped_samples,
                    },
                    running,
                    init_tx,
                    target,
                );

                if let Err(err) = result {
                    tracing::error!(error = ?err, "pulseaudio_capture_thread_failed");
                }

                alive.store(false, Ordering::Release);
                waker.wake();
            })
        };

        match init_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => {}
            Ok(Err(err)) => {
                running.store(false, Ordering::Release);
                let _ = capture_thread.join();
                return Err(err);
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                running.store(false, Ordering::Release);
                let _ = capture_thread.join();
                anyhow::bail!("Timed out initializing PulseAudio speaker capture");
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                let _ = capture_thread.join();
                anyhow::bail!("PulseAudio speaker capture stopped during initialization");
            }
        }

        Ok(Self {
            reader: RingbufAsyncReader::new(consumer, waker, wake_pending, vec![0.0; CHUNK_SIZE])
                .with_alive(alive)
                .with_dropped_samples(dropped_samples, "samples_dropped"),
            current_sample_rate,
            backend_control: BackendControl::PulseAudio {
                running,
                capture_thread: Some(capture_thread),
            },
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.current_sample_rate.load(Ordering::Acquire)
    }
}

fn pipewire_capture_loop(
    handles: CaptureThreadHandles,
    shutdown_rx: pw::channel::Receiver<()>,
    init_tx: std::sync::mpsc::Sender<Result<()>>,
    target: Option<String>,
) -> Result<()> {
    // `init_tx` moves into the listener's user data partway through setup, so any
    // failure would otherwise just drop the sender and reach the parent as a bare
    // "stopped during initialization". This clone carries the real error instead.
    // After a successful init the receiver is gone and the send is a no-op.
    let setup_err_tx = init_tx.clone();

    let result = pipewire_capture_setup(handles, shutdown_rx, init_tx, target);

    if let Err(error) = result {
        let _ = setup_err_tx.send(Err(anyhow::anyhow!(error.to_string())));
    }

    Ok(())
}

fn pipewire_capture_setup(
    handles: CaptureThreadHandles,
    shutdown_rx: pw::channel::Receiver<()>,
    init_tx: std::sync::mpsc::Sender<Result<()>>,
    target: Option<String>,
) -> Result<()> {
    let CaptureThreadHandles {
        producer,
        waker,
        wake_pending,
        alive,
        current_sample_rate,
        dropped_samples,
    } = handles;

    ensure_pipewire_initialized();

    let mainloop =
        pw::main_loop::MainLoopRc::new(None).context("Failed to create PipeWire main loop")?;
    let context = pw::context::ContextBox::new(mainloop.loop_(), None)
        .context("Failed to create PipeWire context")?;
    let core = context
        .connect(None)
        .context("Failed to connect to PipeWire core")?;

    let mut stream_props = properties! {
        *pw::keys::MEDIA_TYPE => "Audio",
        *pw::keys::MEDIA_CATEGORY => "Capture",
        *pw::keys::MEDIA_ROLE => "Music",
        *pw::keys::STREAM_CAPTURE_SINK => "true",
    };
    match target {
        Some(target) => {
            tracing::info!(syntheo.audio.device = %target, "pipewire_targeting_sink");
            stream_props.insert("target.object", target);
        }
        None => tracing::info!("pipewire_following_default_sink"),
    }

    let stream = pw::stream::StreamBox::new(&core, "syntheo-speaker-capture", stream_props)
        .context("Failed to create PipeWire stream")?;

    let _shutdown = shutdown_rx.attach(mainloop.loop_(), {
        let mainloop = mainloop.clone();
        move |_| mainloop.quit()
    });

    let _listener = stream
        .add_local_listener_with_user_data(PipeWireUserData {
            format: Default::default(),
            init_tx: Some(init_tx),
            producer,
            waker,
            wake_pending,
            dropped_samples,
            current_sample_rate,
            scratch: vec![0.0f32; crate::rt_ring::DEFAULT_SCRATCH_LEN],
        })
        .state_changed({
            let mainloop = mainloop.clone();
            move |_, user_data, old, new| {
                tracing::debug!(?old, ?new, "pipewire_stream_state_changed");
                update_pipewire_initialization(
                    &mut user_data.init_tx,
                    &new,
                    user_data.format.rate(),
                );
                if matches!(new, pw::stream::StreamState::Error(_)) {
                    mainloop.quit();
                }
            }
        })
        .param_changed(|_, user_data, id, param| {
            let Some(param) = param else {
                return;
            };
            if id != pw::spa::param::ParamType::Format.as_raw() {
                return;
            }

            let Ok((media_type, media_subtype)) = pw::spa::param::format_utils::parse_format(param)
            else {
                return;
            };
            if media_type != pw::spa::param::format::MediaType::Audio
                || media_subtype != pw::spa::param::format::MediaSubtype::Raw
            {
                return;
            }

            if user_data.format.parse(param).is_ok() {
                let rate = user_data.format.rate();
                if rate > 0 {
                    user_data.current_sample_rate.store(rate, Ordering::Release);
                }
            }
        })
        .process(|stream, user_data| {
            let Some(mut buffer) = stream.dequeue_buffer() else {
                return;
            };

            let datas = buffer.datas_mut();
            if datas.is_empty() {
                return;
            }

            let data = &mut datas[0];
            let chunk_size = data.chunk().size() as usize;
            let Some(bytes) = data.data() else {
                return;
            };

            let chunk_len = chunk_size.min(bytes.len());
            if chunk_len == 0 {
                return;
            }

            let channels = user_data.format.channels().max(1) as usize;
            let stats = push_f32le_bytes_first_channel_to_ringbuf(
                &bytes[..chunk_len],
                channels,
                &mut user_data.scratch,
                &mut user_data.producer,
            );

            if stats.dropped > 0 {
                user_data
                    .dropped_samples
                    .fetch_add(stats.dropped, Ordering::Relaxed);
            }

            if stats.pushed > 0 && user_data.wake_pending.load(Ordering::Acquire) {
                user_data.wake_pending.store(false, Ordering::Release);
                user_data.waker.wake();
            }
        })
        .register()
        .context("Failed to register PipeWire stream listener")?;

    let mut audio_info = pw::spa::param::audio::AudioInfoRaw::new();
    audio_info.set_format(pw::spa::param::audio::AudioFormat::F32LE);
    let format_object = pw::spa::pod::Object {
        type_: pw::spa::utils::SpaTypes::ObjectParamFormat.as_raw(),
        id: pw::spa::param::ParamType::EnumFormat.as_raw(),
        properties: audio_info.into(),
    };
    let values: Vec<u8> = pw::spa::pod::serialize::PodSerializer::serialize(
        std::io::Cursor::new(Vec::new()),
        &pw::spa::pod::Value::Object(format_object),
    )
    .context("Failed to serialize PipeWire format pod")?
    .0
    .into_inner();
    let mut params = [
        pw::spa::pod::Pod::from_bytes(&values).context("Failed to build PipeWire format pod")?
    ];

    stream
        .connect(
            Direction::Input,
            None,
            pw::stream::StreamFlags::AUTOCONNECT
                | pw::stream::StreamFlags::MAP_BUFFERS
                | pw::stream::StreamFlags::RT_PROCESS,
            &mut params,
        )
        .context("Failed to connect PipeWire capture stream")?;

    mainloop.run();

    alive.store(false, Ordering::Release);
    Ok(())
}

fn ensure_pipewire_initialized() {
    // Permission probes and capture restarts create a second main loop in the
    // same process. pw_deinit() is not safely reversible, so init once and leave
    // the library loaded.
    static INIT: Once = Once::new();
    INIT.call_once(pw::init);
}

fn pulseaudio_capture_loop(
    handles: CaptureThreadHandles,
    running: Arc<AtomicBool>,
    init_tx: std::sync::mpsc::Sender<Result<()>>,
    target: Option<String>,
) -> Result<()> {
    let CaptureThreadHandles {
        mut producer,
        waker,
        wake_pending,
        alive,
        current_sample_rate,
        dropped_samples,
    } = handles;

    let mut mainloop = Mainloop::new().context("Failed to create PulseAudio mainloop")?;
    let mut context = PaContext::new(&mainloop, "syntheo-speaker-capture")
        .context("Failed to create PulseAudio context")?;

    context
        .connect(None, ContextFlagSet::NOFLAGS, None)
        .map_err(|_| anyhow::anyhow!("Failed to connect to PulseAudio"))?;

    mainloop
        .start()
        .map_err(|_| anyhow::anyhow!("Failed to start PulseAudio mainloop"))?;

    let setup_result = (|| -> Result<_> {
        wait_for_context_ready(&mut mainloop, &context)?;

        let spec = Spec {
            format: Format::F32le,
            channels: 1,
            rate: DEFAULT_SAMPLE_RATE,
        };
        if !spec.is_valid() {
            anyhow::bail!("Invalid PulseAudio sample spec");
        }

        let monitor_device = resolve_monitor_device(&mut mainloop, &context, target.as_deref())
            .context("Failed to resolve PulseAudio monitor source")?;
        tracing::info!(syntheo.audio.device = %monitor_device, "connecting_to_monitor_device");

        mainloop.lock();
        let stream_result = (|| -> Result<_> {
            let mut stream = PaStream::new(&mut context, "syntheo-capture", &spec, None)
                .context("Failed to create PulseAudio stream")?;
            stream
                .connect_record(
                    Some(&monitor_device),
                    None,
                    StreamFlagSet::ADJUST_LATENCY | StreamFlagSet::AUTO_TIMING_UPDATE,
                )
                .map_err(|_| anyhow::anyhow!("Failed to connect PulseAudio record stream"))?;
            Ok(stream)
        })();
        mainloop.unlock();
        let mut stream = stream_result?;

        wait_for_stream_ready(&mut mainloop, &stream)?;

        mainloop.lock();
        let actual_rate = stream
            .get_sample_spec()
            .map(|sample_spec| sample_spec.rate)
            .unwrap_or(DEFAULT_SAMPLE_RATE);
        mainloop.unlock();

        Ok((stream, actual_rate))
    })();

    let (mut stream, actual_rate) = match setup_result {
        Ok(values) => values,
        Err(err) => {
            tracing::warn!(error = %err, "pulseaudio_capture_setup_failed");
            let _ = init_tx.send(Err(anyhow::anyhow!(err.to_string())));
            mainloop.stop();
            return Ok(());
        }
    };

    current_sample_rate.store(actual_rate, Ordering::Release);
    tracing::info!(
        syntheo.audio.sample_rate_hz = actual_rate,
        "pulseaudio_capture_initialized"
    );
    let _ = init_tx.send(Ok(()));

    let mut scratch = vec![0.0f32; crate::rt_ring::DEFAULT_SCRATCH_LEN];

    while running.load(Ordering::Acquire) {
        mainloop.lock();

        let readable = stream.readable_size().unwrap_or(0);
        if readable == 0 {
            mainloop.unlock();
            thread::sleep(Duration::from_millis(5));
            continue;
        }

        match stream.peek() {
            Ok(pulse::stream::PeekResult::Data(data)) => {
                let bytes = data.to_vec();
                let _ = stream.discard();
                mainloop.unlock();

                let stats = push_f32le_bytes_first_channel_to_ringbuf(
                    &bytes,
                    1,
                    &mut scratch,
                    &mut producer,
                );
                if stats.dropped > 0 {
                    dropped_samples.fetch_add(stats.dropped, Ordering::Relaxed);
                }

                if stats.pushed > 0 && wake_pending.load(Ordering::Acquire) {
                    wake_pending.store(false, Ordering::Release);
                    waker.wake();
                }
            }
            Ok(pulse::stream::PeekResult::Hole(_)) => {
                let _ = stream.discard();
                mainloop.unlock();
            }
            Ok(pulse::stream::PeekResult::Empty) => {
                mainloop.unlock();
                thread::sleep(Duration::from_millis(5));
            }
            Err(_) => {
                mainloop.unlock();
                thread::sleep(Duration::from_millis(10));
            }
        }
    }

    mainloop.lock();
    let _ = stream.disconnect();
    mainloop.unlock();
    mainloop.stop();
    alive.store(false, Ordering::Release);

    Ok(())
}

fn wait_for_context_ready(mainloop: &mut Mainloop, context: &PaContext) -> Result<()> {
    let timeout = Duration::from_secs(5);
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > timeout {
            anyhow::bail!("Timeout waiting for PulseAudio context");
        }

        mainloop.lock();
        let state = context.get_state();
        mainloop.unlock();

        match state {
            pulse::context::State::Ready => return Ok(()),
            pulse::context::State::Failed | pulse::context::State::Terminated => {
                anyhow::bail!("PulseAudio context entered {:?} state", state);
            }
            _ => thread::sleep(Duration::from_millis(10)),
        }
    }
}

fn wait_for_stream_ready(mainloop: &mut Mainloop, stream: &PaStream) -> Result<()> {
    let timeout = Duration::from_secs(5);
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > timeout {
            anyhow::bail!("Timeout waiting for PulseAudio stream");
        }

        mainloop.lock();
        let state = stream.get_state();
        mainloop.unlock();

        match state {
            pulse::stream::State::Ready => return Ok(()),
            pulse::stream::State::Failed | pulse::stream::State::Terminated => {
                anyhow::bail!("PulseAudio stream entered {:?} state", state);
            }
            _ => thread::sleep(Duration::from_millis(10)),
        }
    }
}

#[derive(Clone, Debug)]
struct SinkTarget {
    name: String,
    monitor: String,
}

// PipeWire systems serve this API through pipewire-pulse, so one introspection path covers both
// backends.
fn with_pulse_context<T>(
    name: &str,
    query: impl FnOnce(&mut Mainloop, &PaContext) -> T,
) -> Option<T> {
    let mut mainloop = Mainloop::new()?;
    let mut context = PaContext::new(&mainloop, name)?;
    if context
        .connect(None, ContextFlagSet::NOFLAGS, None)
        .is_err()
    {
        return None;
    }
    if mainloop.start().is_err() {
        return None;
    }
    if wait_for_context_ready(&mut mainloop, &context).is_err() {
        mainloop.stop();
        return None;
    }

    let result = query(&mut mainloop, &context);
    mainloop.lock();
    context.disconnect();
    mainloop.unlock();
    mainloop.stop();
    Some(result)
}

fn collect_list<T>(rx: &std::sync::mpsc::Receiver<Option<T>>) -> Vec<T> {
    let mut items = Vec::new();
    let timeout = Duration::from_secs(2);
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(Some(item)) => items.push(item),
            Ok(None) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    items
}

fn query_sink_targets(mainloop: &mut Mainloop, context: &PaContext) -> Vec<SinkTarget> {
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    mainloop.lock();
    let introspector = context.introspect();
    introspector.get_sink_info_list(move |list_result| match list_result {
        pulse::callbacks::ListResult::Item(sink_info) => {
            let Some(name) = sink_info.name.as_ref() else {
                return;
            };
            let monitor = sink_info
                .monitor_source_name
                .as_ref()
                .map(|value| value.to_string())
                .unwrap_or_else(|| format!("{name}.monitor"));
            let _ = tx.send(Some(SinkTarget {
                name: name.to_string(),
                monitor,
            }));
        }
        pulse::callbacks::ListResult::End | pulse::callbacks::ListResult::Error => {
            let _ = tx.send(None);
        }
    });
    mainloop.unlock();

    collect_list(&rx)
}

fn resolve_monitor_device(
    mainloop: &mut Mainloop,
    context: &PaContext,
    target: Option<&str>,
) -> Option<String> {
    target
        .and_then(|target| {
            query_sink_targets(mainloop, context)
                .into_iter()
                .find(|sink| sink.name == target)
                .map(|sink| sink.monitor)
        })
        .or_else(|| get_default_sink_name(mainloop, context).map(|name| format!("{name}.monitor")))
}

/// Sink auquel la capture du son système de ce processus est branchée en ce moment : le flux
/// d'enregistrement de Syntheo qui lit le moniteur d'un sink. Le micro, lui, lit une vraie
/// source et n'est donc pas confondu.
pub(super) fn captured_sink_name() -> Option<String> {
    with_pulse_context("syntheo-speaker-captured", |mainloop, context| {
        let streams = query_record_streams(mainloop, context);
        let monitors = query_monitor_sources(mainloop, context);
        pick_captured_sink(&streams, &monitors, &std::process::id().to_string())
    })
    .flatten()
}

#[derive(Clone, Debug)]
struct RecordStream {
    source: u32,
    pid: Option<String>,
}

#[derive(Clone, Debug)]
struct MonitorSource {
    index: u32,
    sink_name: String,
}

fn pick_captured_sink(
    streams: &[RecordStream],
    monitors: &[MonitorSource],
    self_pid: &str,
) -> Option<String> {
    streams
        .iter()
        .filter(|stream| stream.pid.as_deref() == Some(self_pid))
        .find_map(|stream| {
            monitors
                .iter()
                .find(|monitor| monitor.index == stream.source)
                .map(|monitor| monitor.sink_name.clone())
        })
}

fn query_record_streams(mainloop: &mut Mainloop, context: &PaContext) -> Vec<RecordStream> {
    let (tx, rx) = std::sync::mpsc::channel();

    mainloop.lock();
    let introspector = context.introspect();
    introspector.get_source_output_info_list(move |list_result| match list_result {
        pulse::callbacks::ListResult::Item(output) => {
            let _ = tx.send(Some(RecordStream {
                source: output.source,
                pid: output
                    .proplist
                    .get_str(pulse::proplist::properties::APPLICATION_PROCESS_ID),
            }));
        }
        pulse::callbacks::ListResult::End | pulse::callbacks::ListResult::Error => {
            let _ = tx.send(None);
        }
    });
    mainloop.unlock();

    collect_list(&rx)
}

fn query_monitor_sources(mainloop: &mut Mainloop, context: &PaContext) -> Vec<MonitorSource> {
    let (tx, rx) = std::sync::mpsc::channel();

    mainloop.lock();
    let introspector = context.introspect();
    introspector.get_source_info_list(move |list_result| match list_result {
        pulse::callbacks::ListResult::Item(source) => {
            if let Some(sink_name) = source.monitor_of_sink_name.as_ref() {
                let _ = tx.send(Some(MonitorSource {
                    index: source.index,
                    sink_name: sink_name.to_string(),
                }));
            }
        }
        pulse::callbacks::ListResult::End | pulse::callbacks::ListResult::Error => {
            let _ = tx.send(None);
        }
    });
    mainloop.unlock();

    collect_list(&rx)
}

fn get_default_sink_name(mainloop: &mut Mainloop, context: &PaContext) -> Option<String> {
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    mainloop.lock();
    let introspector = context.introspect();
    introspector.get_server_info(move |info| {
        let _ = tx.send(info.default_sink_name.as_ref().map(|name| name.to_string()));
    });
    mainloop.unlock();

    rx.recv_timeout(Duration::from_secs(2)).ok().flatten()
}

impl Stream for SpeakerStream {
    type Item = Vec<f32>;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.reader.poll_next_chunk(cx)
    }
}

#[pin_project::pinned_drop]
impl PinnedDrop for SpeakerStream {
    fn drop(self: std::pin::Pin<&mut Self>) {
        let this = self.project();

        match this.backend_control {
            BackendControl::PipeWire {
                shutdown,
                capture_thread,
            } => {
                let _ = shutdown.send(());
                if let Some(thread) = capture_thread.take()
                    && let Err(err) = thread.join()
                {
                    tracing::error!(error = ?err, "failed_to_join_pipewire_thread");
                }
            }
            BackendControl::PulseAudio {
                running,
                capture_thread,
            } => {
                running.store(false, Ordering::Release);
                if let Some(thread) = capture_thread.take()
                    && let Err(err) = thread.join()
                {
                    tracing::error!(error = ?err, "failed_to_join_pulseaudio_thread");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{MonitorSource, RecordStream, pick_captured_sink, update_pipewire_initialization};
    use pipewire::stream::StreamState;
    use std::sync::mpsc::{self, TryRecvError};

    #[test]
    fn negotiated_format_does_not_hide_a_pipewire_startup_failure() {
        let (tx, rx) = mpsc::channel();
        let mut init_tx = Some(tx);
        update_pipewire_initialization(&mut init_tx, &StreamState::Paused, 48_000);
        assert!(matches!(rx.try_recv(), Err(TryRecvError::Empty)));

        update_pipewire_initialization(
            &mut init_tx,
            &StreamState::Error("negotiation failed".into()),
            48_000,
        );
        let error = rx.try_recv().unwrap().unwrap_err();
        assert!(error.to_string().contains("negotiation failed"));
    }

    #[test]
    fn pipewire_is_ready_only_when_streaming_with_a_valid_format() {
        let (tx, rx) = mpsc::channel();
        let mut init_tx = Some(tx);
        update_pipewire_initialization(&mut init_tx, &StreamState::Connecting, 0);
        update_pipewire_initialization(&mut init_tx, &StreamState::Streaming, 0);
        assert!(matches!(rx.try_recv(), Err(TryRecvError::Empty)));

        update_pipewire_initialization(&mut init_tx, &StreamState::Streaming, 48_000);
        assert!(rx.try_recv().unwrap().is_ok());
        update_pipewire_initialization(&mut init_tx, &StreamState::Paused, 48_000);
        update_pipewire_initialization(&mut init_tx, &StreamState::Streaming, 48_000);
        assert!(matches!(rx.try_recv(), Err(TryRecvError::Disconnected)));
    }

    fn stream(source: u32, pid: &str) -> RecordStream {
        RecordStream {
            source,
            pid: Some(pid.to_string()),
        }
    }

    fn monitor(index: u32, sink_name: &str) -> MonitorSource {
        MonitorSource {
            index,
            sink_name: sink_name.to_string(),
        }
    }

    #[test]
    fn captured_sink_is_the_monitor_our_stream_reads() {
        let monitors = vec![monitor(10, "hdmi"), monitor(11, "headset")];
        // Le micro (source 3) et le flux d'un autre processus sur le moniteur HDMI.
        let streams = vec![stream(3, "42"), stream(10, "7"), stream(11, "42")];
        assert_eq!(
            pick_captured_sink(&streams, &monitors, "42").as_deref(),
            Some("headset")
        );
    }

    #[test]
    fn no_capture_running_reports_nothing() {
        let monitors = vec![monitor(10, "hdmi")];
        assert!(pick_captured_sink(&[stream(3, "42")], &monitors, "42").is_none());
        assert!(pick_captured_sink(&[stream(10, "7")], &monitors, "42").is_none());
        let unknown_pid = RecordStream {
            source: 10,
            pid: None,
        };
        assert!(pick_captured_sink(&[unknown_pid], &monitors, "42").is_none());
    }
}
