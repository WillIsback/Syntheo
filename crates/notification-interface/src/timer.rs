use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct DismissTimer {
    total: Duration,
    remaining: Duration,
    running_since: Option<Instant>,
}

impl DismissTimer {
    pub fn new(total: Duration) -> Self {
        Self::at(total, Instant::now())
    }

    pub fn at(total: Duration, now: Instant) -> Self {
        Self {
            total,
            remaining: total,
            running_since: Some(now),
        }
    }

    pub fn total(&self) -> Duration {
        self.total
    }

    pub fn is_running(&self) -> bool {
        self.running_since.is_some()
    }

    pub fn remaining(&self, now: Instant) -> Duration {
        match self.running_since {
            Some(started) => self
                .remaining
                .saturating_sub(now.saturating_duration_since(started)),
            None => self.remaining,
        }
    }

    pub fn progress_ratio(&self, now: Instant) -> f64 {
        if self.total.is_zero() {
            return 0.0;
        }

        self.remaining(now).as_secs_f64() / self.total.as_secs_f64()
    }

    pub fn is_expired(&self, now: Instant) -> bool {
        self.remaining(now).is_zero()
    }

    pub fn pause(&mut self, now: Instant) {
        if let Some(started) = self.running_since.take() {
            self.remaining = self
                .remaining
                .saturating_sub(now.saturating_duration_since(started));
        }
    }

    pub fn resume(&mut self, now: Instant) {
        if self.running_since.is_none() && !self.remaining.is_zero() {
            self.running_since = Some(now);
        }
    }
}
