use anyhow::Result;
#[cfg(any(test, not(target_os = "macos")))]
use futures_util::Stream;
#[cfg(any(target_os = "linux", target_os = "windows"))]
use futures_util::task::AtomicWaker;
#[cfg(any(test, not(target_os = "macos")))]
use pin_project::pin_project;
#[cfg(any(target_os = "linux", target_os = "windows"))]
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU32, AtomicUsize},
};

pub(super) const CHUNK_SIZE: usize = 256;
pub(super) const BUFFER_SIZE: usize = CHUNK_SIZE * 256;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
type PlatformSpeakerInput = macos::SpeakerInput;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
type PlatformSpeakerInput = windows::SpeakerInput;
#[cfg(target_os = "windows")]
type PlatformSpeakerStream = windows::SpeakerStream;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
type PlatformSpeakerInput = linux::SpeakerInput;
#[cfg(target_os = "linux")]
type PlatformSpeakerStream = linux::SpeakerStream;

#[cfg(test)]
mod mock;

/// Producer-side handles moved into a Linux or Windows capture thread.
///
/// They are grouped once, before the thread starts, so the real-time path neither allocates nor
/// clones anything more than when they were passed one by one.
#[cfg(any(target_os = "linux", target_os = "windows"))]
struct CaptureThreadHandles {
    producer: ringbuf::HeapProd<f32>,
    waker: Arc<AtomicWaker>,
    wake_pending: Arc<AtomicBool>,
    alive: Arc<AtomicBool>,
    current_sample_rate: Arc<AtomicU32>,
    dropped_samples: Arc<AtomicUsize>,
}

// The real platform stream stays compiled and reachable in test builds too, so clippy checks it in
// every configuration. Tests add a mock variant to drive `SpeakerStream` without audio hardware.
#[cfg(any(test, not(target_os = "macos")))]
#[pin_project(project = InnerStreamProj)]
enum InnerStream {
    #[cfg(not(target_os = "macos"))]
    Platform(#[pin] PlatformSpeakerStream),
    #[cfg(test)]
    Mock(#[pin] mock::MockInnerStream),
}

#[cfg(any(test, not(target_os = "macos")))]
impl InnerStream {
    fn sample_rate(&self) -> u32 {
        match self {
            #[cfg(not(target_os = "macos"))]
            Self::Platform(inner) => inner.sample_rate(),
            #[cfg(test)]
            Self::Mock(inner) => inner.sample_rate(),
        }
    }
}

#[cfg(any(test, not(target_os = "macos")))]
impl Stream for InnerStream {
    type Item = Vec<f32>;

    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        match self.project() {
            #[cfg(not(target_os = "macos"))]
            InnerStreamProj::Platform(inner) => inner.poll_next(cx),
            #[cfg(test)]
            InnerStreamProj::Mock(inner) => inner.poll_next(cx),
        }
    }
}

// https://github.com/floneum/floneum/blob/50afe10/interfaces/kalosm-sound/src/source/mic.rs#L41
pub struct SpeakerInput {
    inner: PlatformSpeakerInput,
}

#[cfg(all(target_os = "macos", not(test)))]
pub type SpeakerStream = macos::SpeakerStream;

impl SpeakerInput {
    pub fn new() -> Result<Self> {
        let inner = PlatformSpeakerInput::new()?;
        Ok(Self { inner })
    }

    pub fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }

    #[cfg(all(target_os = "macos", not(test)))]
    pub fn stream(self) -> Result<SpeakerStream> {
        self.inner.stream()
    }

    #[cfg(not(target_os = "macos"))]
    pub fn stream(self) -> Result<SpeakerStream> {
        let inner = self.inner.stream()?;
        let initial_rate = inner.sample_rate();
        Ok(SpeakerStream {
            inner: InnerStream::Platform(inner),
            buffer: Vec::new(),
            buffer_idx: 0,
            buffer_rate: initial_rate,
        })
    }

    // The macOS platform stream does not go through this wrapper, so macOS test builds keep the
    // mock-backed stream they always had.
    #[cfg(all(target_os = "macos", test))]
    pub fn stream(self) -> Result<SpeakerStream> {
        let initial_rate = self.inner.sample_rate();
        Ok(SpeakerStream {
            inner: InnerStream::Mock(mock::MockInnerStream::new(vec![], initial_rate)),
            buffer: Vec::new(),
            buffer_idx: 0,
            buffer_rate: initial_rate,
        })
    }
}

// https://github.com/floneum/floneum/blob/50afe10/interfaces/kalosm-sound/src/source/mic.rs#L140
#[cfg(any(test, not(target_os = "macos")))]
#[pin_project]
pub struct SpeakerStream {
    #[pin]
    inner: InnerStream,
    buffer: Vec<f32>,
    buffer_idx: usize,
    buffer_rate: u32,
}

#[cfg(test)]
impl SpeakerStream {
    pub fn new_mock(
        chunks: Vec<Vec<f32>>,
        initial_rate: u32,
    ) -> (Self, std::sync::Arc<std::sync::atomic::AtomicU32>) {
        let mock = mock::MockInnerStream::new(chunks, initial_rate);
        let handle = mock.rate_handle();
        let rate = mock.sample_rate();
        (
            Self {
                inner: InnerStream::Mock(mock),
                buffer: Vec::new(),
                buffer_idx: 0,
                buffer_rate: rate,
            },
            handle,
        )
    }
}

#[cfg(any(test, not(target_os = "macos")))]
impl Stream for SpeakerStream {
    type Item = f32;

    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        let mut this = self.project();

        if *this.buffer_idx < this.buffer.len() {
            let sample = this.buffer[*this.buffer_idx];
            *this.buffer_idx += 1;
            return std::task::Poll::Ready(Some(sample));
        }

        match this.inner.as_mut().poll_next(cx) {
            std::task::Poll::Ready(Some(chunk)) => {
                *this.buffer = chunk;
                *this.buffer_idx = 0;
                *this.buffer_rate = this.inner.sample_rate();
                if !this.buffer.is_empty() {
                    let sample = this.buffer[0];
                    *this.buffer_idx = 1;
                    std::task::Poll::Ready(Some(sample))
                } else {
                    std::task::Poll::Pending
                }
            }
            std::task::Poll::Ready(None) => std::task::Poll::Ready(None),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}

#[cfg(any(test, not(target_os = "macos")))]
impl syntheo_audio_interface::AsyncSource for SpeakerStream {
    fn as_stream(&mut self) -> impl Stream<Item = f32> + '_ {
        self
    }

    fn sample_rate(&self) -> u32 {
        self.buffer_rate
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    use std::sync::atomic::Ordering;
    use syntheo_audio_interface::AsyncSource;

    #[tokio::test]
    async fn test_buffer_rate_preserved_after_rate_change() {
        let (mut stream, rate_handle) = SpeakerStream::new_mock(
            vec![vec![1.0, 2.0, 3.0, 4.0], vec![5.0, 6.0, 7.0, 8.0]],
            48000,
        );

        assert_eq!(stream.sample_rate(), 48000);

        let s1 = stream.next().await.unwrap();
        assert_eq!(s1, 1.0);
        assert_eq!(stream.sample_rate(), 48000);

        rate_handle.store(44100, Ordering::Release);

        let s2 = stream.next().await.unwrap();
        assert_eq!(s2, 2.0);
        assert_eq!(
            stream.sample_rate(),
            48000,
            "Rate should stay 48000 for buffered samples"
        );

        let s3 = stream.next().await.unwrap();
        assert_eq!(s3, 3.0);
        assert_eq!(stream.sample_rate(), 48000);

        let s4 = stream.next().await.unwrap();
        assert_eq!(s4, 4.0);
        assert_eq!(stream.sample_rate(), 48000);

        let s5 = stream.next().await.unwrap();
        assert_eq!(s5, 5.0);
        assert_eq!(
            stream.sample_rate(),
            44100,
            "Rate should update to 44100 after new chunk is fetched"
        );

        let s6 = stream.next().await.unwrap();
        assert_eq!(s6, 6.0);
        assert_eq!(stream.sample_rate(), 44100);
    }
}
