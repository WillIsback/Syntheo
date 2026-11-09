use std::collections::VecDeque;

#[cfg(test)]
use crate::actors::SAMPLE_RATE;

use super::BufferedAudio;

pub(super) struct AudioBuffer {
    pub(super) buffer: VecDeque<BufferedAudio>,
    pub(super) max_size: usize,
    pub(super) overflowing: bool,
}

impl AudioBuffer {
    pub(super) fn new(max_size: usize) -> Self {
        Self {
            buffer: VecDeque::new(),
            max_size,
            overflowing: false,
        }
    }

    pub(super) fn push_item(&mut self, item: BufferedAudio) {
        if self.buffer.len() >= self.max_size {
            self.buffer.pop_front();
            if !self.overflowing {
                self.overflowing = true;
                tracing::warn!("audio_buffer_overflow_listener_unavailable");
            }
        }
        self.buffer.push_back(item);
    }

    pub(super) fn push_front(&mut self, item: BufferedAudio) {
        self.buffer.push_front(item);
    }

    pub(super) fn pop(&mut self) -> Option<BufferedAudio> {
        let item = self.buffer.pop_front();
        if self.overflowing && self.buffer.len() < self.max_size {
            self.overflowing = false;
        }
        item
    }

    pub(super) fn len(&self) -> usize {
        self.buffer.len()
    }

    pub(super) fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    pub(super) fn clear(&mut self) {
        self.buffer.clear();
        self.overflowing = false;
    }
}

pub(super) struct ReplayHistory {
    pub(super) buffer: VecDeque<BufferedAudio>,
    pub(super) max_samples: usize,
    pub(super) samples: usize,
}

impl ReplayHistory {
    pub(super) fn new(max_samples: usize) -> Self {
        Self {
            buffer: VecDeque::new(),
            max_samples,
            samples: 0,
        }
    }

    pub(super) fn push(&mut self, item: BufferedAudio) {
        self.samples += item.sample_count();
        self.buffer.push_back(item);

        while self.samples > self.max_samples {
            let Some(item) = self.buffer.pop_front() else {
                self.samples = 0;
                return;
            };
            self.samples = self.samples.saturating_sub(item.sample_count());
        }
    }

    /// The most recent items covering at least `samples` (or all of them), oldest first.
    pub(super) fn tail(&self, samples: usize) -> impl Iterator<Item = BufferedAudio> + '_ {
        let mut covered = 0;
        let start = self
            .buffer
            .iter()
            .rposition(|item| {
                covered += item.sample_count();
                covered >= samples
            })
            .unwrap_or(0);
        self.buffer.iter().skip(start).cloned()
    }

    #[cfg(test)]
    pub(super) fn duration_secs(&self) -> f64 {
        self.samples as f64 / SAMPLE_RATE as f64
    }

    pub(super) fn clear(&mut self) {
        self.buffer.clear();
        self.samples = 0;
    }
}
