use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};

use futures_util::Stream;
use futures_util::StreamExt;

use crate::error::Error;
use crate::events::{Input, RunStreamedResult, ThreadEvent, Turn};
use crate::exec::{CodexExec, CodexExecArgs};
use crate::options::{CodexOptions, ThreadOptions, TurnOptions};
use crate::output_schema::{OutputSchemaFile, create_output_schema_file};

#[derive(Debug, Clone)]
pub struct Codex {
    exec: Arc<CodexExec>,
    options: CodexOptions,
}

impl Codex {
    pub fn new(options: CodexOptions) -> Self {
        let exec = CodexExec::new(
            options.codex_path_override.clone(),
            options.env.clone(),
            options.config.clone(),
        );
        Self {
            exec: Arc::new(exec),
            options,
        }
    }

    pub fn start_thread(&self, options: ThreadOptions) -> Thread {
        Thread::new(self.exec.clone(), self.options.clone(), options, None)
    }

    pub fn resume_thread(&self, id: impl Into<String>, options: ThreadOptions) -> Thread {
        Thread::new(
            self.exec.clone(),
            self.options.clone(),
            options,
            Some(id.into()),
        )
    }
}

#[derive(Debug, Clone)]
pub struct Thread {
    exec: Arc<CodexExec>,
    options: CodexOptions,
    thread_options: ThreadOptions,
    id: Arc<Mutex<Option<String>>>,
}

impl Thread {
    pub(crate) fn new(
        exec: Arc<CodexExec>,
        options: CodexOptions,
        thread_options: ThreadOptions,
        id: Option<String>,
    ) -> Self {
        Self {
            exec,
            options,
            thread_options,
            id: Arc::new(Mutex::new(id)),
        }
    }

    pub fn id(&self) -> Result<Option<String>, Error> {
        self.id
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| Error::Poisoned)
    }

    pub async fn run_streamed<I>(
        &self,
        input: I,
        turn_options: TurnOptions,
    ) -> Result<RunStreamedResult, Error>
    where
        I: Into<Input>,
    {
        let input = input.into();
        let thread_id = self.id()?;
        let (prompt, images) = input.normalize();
        let output_schema = create_output_schema_file(turn_options.output_schema.as_ref())?;
        let output_schema_path = output_schema
            .as_ref()
            .map(|schema_file| schema_file.path().to_path_buf());
        let stream = self.exec.run(CodexExecArgs {
            input: prompt,
            base_url: self.options.base_url.clone(),
            api_key: self.options.api_key.clone(),
            thread_id,
            images,
            model: self.thread_options.model.clone(),
            sandbox_mode: self.thread_options.sandbox_mode,
            working_directory: self.thread_options.working_directory.clone(),
            additional_directories: self.thread_options.additional_directories.clone(),
            skip_git_repo_check: self.thread_options.skip_git_repo_check,
            output_schema_file: output_schema_path,
            model_reasoning_effort: self.thread_options.model_reasoning_effort,
            network_access_enabled: self.thread_options.network_access_enabled,
            web_search_mode: self.thread_options.web_search_mode,
            approval_mode: self.thread_options.approval_mode,
            cancellation_token: turn_options.cancellation_token,
        })?;
        Ok(RunStreamedResult {
            events: Box::pin(ManagedEventStream {
                inner: stream,
                _output_schema: output_schema,
                thread_id: self.id.clone(),
            }),
        })
    }

    pub async fn run<I>(&self, input: I, turn_options: TurnOptions) -> Result<Turn, Error>
    where
        I: Into<Input>,
    {
        let streamed = self.run_streamed(input, turn_options).await?;
        let mut items = Vec::new();
        let mut final_response = String::new();
        let mut usage = None;
        let mut events = streamed.events;

        while let Some(event) = events.next().await {
            let event = event?;
            match event {
                ThreadEvent::ThreadStarted { thread_id } => {
                    let mut id = self.id.lock().map_err(|_| Error::Poisoned)?;
                    *id = Some(thread_id);
                }
                ThreadEvent::ItemCompleted { item } => {
                    if item.item_type == "agent_message"
                        && let Some(text) = item.text()
                    {
                        final_response = text.to_string();
                    }
                    items.push(item);
                }
                ThreadEvent::TurnCompleted { usage: turn_usage } => {
                    usage = Some(turn_usage);
                }
                ThreadEvent::TurnFailed { error } => {
                    return Err(Error::TurnFailed(error.message));
                }
                ThreadEvent::Error { message } => {
                    return Err(Error::ProcessFailed { detail: message });
                }
                ThreadEvent::TurnStarted
                | ThreadEvent::ItemStarted { .. }
                | ThreadEvent::ItemUpdated { .. } => {}
            }
        }

        Ok(Turn {
            items,
            final_response,
            usage,
        })
    }
}

// Dropping the inner StreamProcess shuts the child down, so no explicit Drop
// is needed here.
struct ManagedEventStream {
    inner: crate::exec::CodexExecRun,
    _output_schema: Option<OutputSchemaFile>,
    thread_id: Arc<Mutex<Option<String>>>,
}

impl Stream for ManagedEventStream {
    type Item = Result<ThreadEvent, Error>;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        match std::pin::Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(ThreadEvent::ThreadStarted { thread_id }))) => {
                let thread_id = thread_id.clone();
                if let Ok(mut guard) = self.thread_id.lock() {
                    *guard = Some(thread_id.clone());
                }
                Poll::Ready(Some(Ok(ThreadEvent::ThreadStarted { thread_id })))
            }
            other => other,
        }
    }
}

#[cfg(test)]
mod tests;
