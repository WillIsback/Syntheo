use std::sync::Arc;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::*;
use rmcp::{ErrorData as McpError, ServiceExt, tool, tool_router};
use serde::Serialize;

use crate::Error;
use syntheo_agent_access as access;

mod handler;

#[derive(Clone)]
struct SyntheoMcpServer {
    db: Arc<syntheo_db_core::Db>,
}

#[derive(Debug, PartialEq, Eq)]
enum ResourceRequest {
    Meeting {
        meeting_id: String,
    },
    Transcript {
        meeting_id: String,
        offset: u32,
        limit: u32,
    },
    Series {
        series_id: String,
    },
}

impl SyntheoMcpServer {
    fn new(db: Arc<syntheo_db_core::Db>) -> Self {
        Self { db }
    }
}

#[tool_router]
impl SyntheoMcpServer {
    #[tool(
        title = "Import recording",
        description = "Create a meeting from a local audio file using the running Syntheo desktop app and its configured providers. May send audio to the configured transcription provider and use paid quota. file_path is on this computer, not a remote host. Returns durable job and meeting IDs. Reuse request_key on retries; poll get_recording_import until done or failed.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::RecordingImport>(),
        annotations(read_only_hint = false, destructive_hint = false, idempotent_hint = false, open_world_hint = true)
    )]
    async fn import_recording(
        &self,
        Parameters(input): Parameters<access::ImportRecordingInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        structured(
            &access::import_recording(self.db.pool(), input)
                .await
                .map_err(command_error)?,
        )
    }

    #[tool(
        title = "Get recording import",
        description = "Get durable recording import processing_status, summary_status and error. A failed summary preserves the meeting and transcript. queued requires the desktop app to run.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::RecordingImport>(),
        annotations(read_only_hint = true, destructive_hint = false, idempotent_hint = true, open_world_hint = false)
    )]
    async fn get_recording_import(
        &self,
        Parameters(input): Parameters<access::GetRecordingImportInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        structured(
            &access::get_recording_import(self.db.pool(), &input.job_id)
                .await
                .map_err(command_error)?,
        )
    }

    #[tool(
        title = "List meetings",
        description = "List recent Syntheo meetings with pagination metadata. Use query to narrow by title or meeting id and folder_path to scope to a folder and its subfolders, then pass next_offset as offset to continue.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::MeetingPage>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn list_meetings(
        &self,
        Parameters(input): Parameters<access::ListMeetingsInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let page = access::list_meetings(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        structured(&page)
    }

    #[tool(
        title = "List folders",
        description = "List Syntheo meeting folders, including empty and parent folders, with pagination metadata. Pass a returned path as list_meetings folder_path. Query matches a case-insensitive path substring.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::FolderPage>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn list_folders(
        &self,
        Parameters(input): Parameters<access::ListFoldersInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let page = access::list_folders(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        structured(&page)
    }

    #[tool(
        title = "Get meeting",
        description = "Get one Syntheo meeting with its canonical note, summaries, participants, and action items. Use get_meeting_transcript separately for transcript words.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::LocalMeeting>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_meeting(
        &self,
        Parameters(input): Parameters<access::GetMeetingInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let meeting = access::get_meeting(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        let meeting = access::local_meeting(self.db.pool(), meeting)
            .await
            .map_err(command_error)?;
        structured(&meeting)
    }

    #[tool(
        title = "Get meeting transcript",
        description = "Get a bounded page of transcript words and readable text for an Syntheo meeting. Pass pagination.next_offset as offset to continue.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::TranscriptPage>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_meeting_transcript(
        &self,
        Parameters(input): Parameters<access::GetMeetingTranscriptInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let page = access::get_meeting_transcript(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        structured(&page)
    }

    #[tool(
        title = "Get recurring meeting history",
        description = "List meetings in the same recurring series as the supplied meeting, newest first, with pagination metadata.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::MeetingPage>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_recurring_meeting_history(
        &self,
        Parameters(input): Parameters<access::GetRecurringMeetingHistoryInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let page = access::get_recurring_meeting_history(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        structured(&page)
    }

    #[tool(
        title = "Export meeting",
        description = "Get a complete Syntheo meeting export with notes, summaries, participants, action items, and transcripts.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::MeetingExport>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn export_meeting(
        &self,
        Parameters(input): Parameters<access::GetMeetingInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let export = access::get_meeting_export(self.db.pool(), input.meeting_id)
            .await
            .map_err(command_error)?;
        structured(&export)
    }

    #[tool(
        title = "Propose summary edit",
        description = "Propose a complete summary replacement. The proposal stays pending until a human applies it in the Syntheo desktop app. Specify target_id when the meeting has multiple summaries.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::Proposal>(),
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn propose_summary_edit(
        &self,
        Parameters(input): Parameters<ProposeSummaryInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let proposal = access::create_proposal(
            self.db.pool(),
            access::CreateProposalInput {
                meeting_id: input.meeting_id,
                kind: "summary_replace".to_string(),
                target_id: input.target_id,
                content: input.content,
                source: Some("mcp".to_string()),
            },
        )
        .await
        .map_err(command_error)?;
        structured(&proposal)
    }

    #[tool(
        title = "Propose memo edit",
        description = "Propose a complete memo replacement. The proposal stays pending until a human applies it in the Syntheo desktop app.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::Proposal>(),
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn propose_memo_edit(
        &self,
        Parameters(input): Parameters<ProposeMemoInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let proposal = access::create_proposal(
            self.db.pool(),
            access::CreateProposalInput {
                meeting_id: input.meeting_id,
                kind: "memo_replace".to_string(),
                target_id: None,
                content: input.content,
                source: Some("mcp".to_string()),
            },
        )
        .await
        .map_err(command_error)?;
        structured(&proposal)
    }

    #[tool(
        title = "List proposals",
        description = "List staged Syntheo meeting proposals. Defaults to pending proposals. Pass status all to include applied and declined rows, and next_offset as offset to continue.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::ProposalPage>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn list_proposals(
        &self,
        Parameters(input): Parameters<access::ListProposalsInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let page = access::list_proposals(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        structured(&page)
    }

    #[tool(
        title = "Get proposal",
        description = "Get one staged Syntheo proposal, including its unified diff. The proposal is not applied.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::Proposal>(),
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_proposal(
        &self,
        Parameters(input): Parameters<access::GetProposalInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let proposal = access::get_proposal(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        structured(&proposal)
    }

    #[tool(
        title = "Decline proposal",
        description = "Decline a pending proposal without changing the meeting. Applied proposals cannot be declined.",
        output_schema = rmcp::handler::server::tool::schema_for_type::<access::Proposal>(),
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn decline_proposal(
        &self,
        Parameters(input): Parameters<access::DeclineProposalInput>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let proposal = access::decline_proposal(self.db.pool(), input)
            .await
            .map_err(command_error)?;
        structured(&proposal)
    }
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
struct ProposeSummaryInput {
    meeting_id: String,
    content: String,
    target_id: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
struct ProposeMemoInput {
    meeting_id: String,
    content: String,
}

pub async fn serve(db: Arc<syntheo_db_core::Db>) -> crate::Result<()> {
    let running = SyntheoMcpServer::new(db)
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|error| Error::operation("start MCP server", error.to_string()))?;
    running
        .waiting()
        .await
        .map_err(|error| Error::operation("run MCP server", error.to_string()))?;
    Ok(())
}

fn structured(value: &impl Serialize) -> std::result::Result<CallToolResult, McpError> {
    serde_json::to_value(value)
        .map(CallToolResult::structured)
        .map_err(internal_error)
}

fn internal_error(error: impl std::fmt::Display) -> McpError {
    McpError::internal_error(error.to_string(), None)
}

fn command_error(error: access::Error) -> McpError {
    match error {
        access::Error::NotFound(what) => {
            McpError::invalid_params(format!("{what} not found"), None)
        }
        other => internal_error(other),
    }
}

#[cfg(test)]
mod tests;
