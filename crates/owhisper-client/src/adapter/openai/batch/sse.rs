use openai_transcription::batch::{ParsedTranscriptionStreamEvent, TranscriptionStreamEventParser};
use owhisper_interface::batch_stream::BatchStreamEvent;

use crate::adapter::StreamingBatchEvent;
use crate::error::Error;

use super::response::convert_text_response;
use super::{
    MAX_SSE_DELIMITER_BYTES, MAX_SSE_FRAME_BYTES, OPENAI_PROGRESS_CAP, SSE_READ_AHEAD_BYTES,
};

pub(super) struct OpenAISseParserState<S> {
    pub(super) stream: S,
    pub(super) buffer: Vec<u8>,
    pub(super) pending_events: std::collections::VecDeque<Result<StreamingBatchEvent, Error>>,
    pub(super) pending_chunk: Option<bytes::Bytes>,
    pending_chunk_offset: usize,
    pub(super) parser: TranscriptionStreamEventParser,
    progress: OpenAISyntheticProgress,
    pub(super) stream_finished: bool,
    pub(super) terminated: bool,
}

impl<S> OpenAISseParserState<S> {
    pub(super) fn new(stream: S) -> Self {
        Self {
            stream,
            buffer: Vec::new(),
            pending_events: std::collections::VecDeque::new(),
            pending_chunk: None,
            pending_chunk_offset: 0,
            parser: TranscriptionStreamEventParser::new(),
            progress: OpenAISyntheticProgress::default(),
            stream_finished: false,
            terminated: false,
        }
    }

    pub(super) fn push_chunk(&mut self, chunk: bytes::Bytes) {
        if self.terminated {
            return;
        }
        debug_assert!(self.pending_chunk.is_none());
        self.pending_chunk = Some(chunk);
        self.pending_chunk_offset = 0;
        self.fill_pending_event();
    }

    pub(super) fn fill_pending_event(&mut self) {
        while self.pending_events.is_empty() && !self.terminated {
            if let Some(event) = self.parse_next_buffer_event() {
                self.pending_events.push_back(event);
                return;
            }

            let Some(chunk) = self.pending_chunk.as_ref() else {
                return;
            };
            if self.pending_chunk_offset >= chunk.len() {
                self.pending_chunk = None;
                self.pending_chunk_offset = 0;
                continue;
            }

            let capacity =
                (MAX_SSE_FRAME_BYTES + MAX_SSE_DELIMITER_BYTES).saturating_sub(self.buffer.len());
            if capacity == 0 {
                self.fail("OpenAI batch SSE frame exceeded 8 MiB");
                return;
            }

            let end = self.pending_chunk_offset + capacity.min(SSE_READ_AHEAD_BYTES);
            let end = end.min(chunk.len());
            self.buffer
                .extend_from_slice(&chunk[self.pending_chunk_offset..end]);
            self.pending_chunk_offset = end;
            if end == chunk.len() {
                self.pending_chunk = None;
                self.pending_chunk_offset = 0;
            }
        }
    }

    pub(super) fn parse_next_buffer_event(&mut self) -> Option<Result<StreamingBatchEvent, Error>> {
        while !self.terminated {
            let text = match std::str::from_utf8(&self.buffer) {
                Ok(text) => text,
                Err(error) if error.error_len().is_none() => return None,
                Err(_) => {
                    self.fail("OpenAI batch SSE frame contained invalid UTF-8");
                    return None;
                }
            };
            let (end, delimiter_len) = find_sse_block_end(text)?;
            if end > MAX_SSE_FRAME_BYTES {
                self.fail("OpenAI batch SSE frame exceeded 8 MiB");
                return None;
            }

            let block = text[..end].to_string();
            self.buffer.drain(..end + delimiter_len);

            if let Some(event) = self.parse_sse_block(&block) {
                return Some(event);
            }
        }
        None
    }

    pub(super) fn finish(&mut self) {
        if self.terminated {
            return;
        }
        self.fill_pending_event();
        if !self.pending_events.is_empty() {
            return;
        }
        if !self.buffer.is_empty() {
            self.fail("OpenAI batch SSE stream ended with an incomplete frame");
        } else {
            self.terminated = true;
        }
    }

    pub(super) fn fail(&mut self, message: &'static str) {
        if self.terminated {
            return;
        }
        self.buffer = Vec::new();
        self.pending_chunk = None;
        self.pending_chunk_offset = 0;
        self.terminated = true;
        self.pending_events
            .push_back(Err(Error::WebSocket(message.to_string())));
    }

    pub(super) fn parse_sse_block(
        &mut self,
        block: &str,
    ) -> Option<Result<StreamingBatchEvent, Error>> {
        let event = match self.parser.parse_sse_block(block) {
            Ok(Some(event)) => event,
            Ok(None) => return None,
            Err(error) => {
                return Some(Err(Error::WebSocket(format!(
                    "failed to parse OpenAI batch stream event: {error}"
                ))));
            }
        };

        match event {
            ParsedTranscriptionStreamEvent::TextDelta { partial_text, .. } => {
                Some(Ok(BatchStreamEvent::Progress {
                    percentage: self.progress.observe_delta(&partial_text),
                    partial_text: Some(partial_text),
                }))
            }
            ParsedTranscriptionStreamEvent::TextDone { text, usage, .. } => {
                Some(Ok(BatchStreamEvent::Result {
                    response: convert_text_response(text.trim().to_string(), usage),
                }))
            }
        }
    }
}

#[derive(Debug, Clone, Default)]
pub(super) struct OpenAISyntheticProgress {
    last_percentage: f64,
    delta_count: usize,
}

impl OpenAISyntheticProgress {
    pub(super) const CHAR_SCALE: f64 = 160.0;
    pub(super) const CHAR_PROGRESS_CAP: f64 = 0.85;
    pub(super) const TRICKLE_SCALE: f64 = 32.0;
    pub(super) const TRICKLE_PROGRESS_CAP: f64 = 0.9;

    pub(super) fn observe_delta(&mut self, partial_text: &str) -> f64 {
        self.delta_count += 1;

        let char_count = partial_text.chars().count() as f64;
        let char_progress =
            (char_count / (char_count + Self::CHAR_SCALE)).min(Self::CHAR_PROGRESS_CAP);
        let trickle_progress = ((self.delta_count as f64)
            / (self.delta_count as f64 + Self::TRICKLE_SCALE))
            .min(Self::TRICKLE_PROGRESS_CAP);

        self.last_percentage = char_progress
            .max(trickle_progress)
            .max(self.last_percentage)
            .min(OPENAI_PROGRESS_CAP);
        self.last_percentage
    }
}

fn find_sse_block_end(text: &str) -> Option<(usize, usize)> {
    let lf = text.find("\n\n").map(|index| (index, 2));
    let crlf = text.find("\r\n\r\n").map(|index| (index, 4));

    match (lf, crlf) {
        (Some(left), Some(right)) => Some(if left.0 <= right.0 { left } else { right }),
        (Some(found), None) | (None, Some(found)) => Some(found),
        (None, None) => None,
    }
}
