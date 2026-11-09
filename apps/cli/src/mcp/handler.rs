use rmcp::model::*;
use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler, service::RequestContext, tool_handler,
};

use syntheo_agent_access as access;

use super::{ResourceRequest, SyntheoMcpServer, command_error};

#[tool_handler]
impl ServerHandler for SyntheoMcpServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_protocol_version(ProtocolVersion::V_2026_07_28)
        .with_server_info(Implementation::new("syntheo", crate::VERSION))
        .with_instructions(
            "Local access to Syntheo meeting data. Start with list_meetings to resolve a meeting_id; to scope work to a project or client, call list_folders and pass a returned path as folder_path. Then call get_meeting for notes, summaries, participants, and action items. Request transcript pages with get_meeting_transcript and continue with pagination.next_offset; each page is capped at 500 words. Use get_recurring_meeting_history for series context. Use export_meeting only when the task needs the complete record including transcripts. To persist an edit, call propose_summary_edit or propose_memo_edit; the result stays pending until a human applies it in the desktop app. List or inspect staged work with list_proposals and get_proposal. decline_proposal discards a pending proposal without changing the meeting. Never invent meeting titles, dates, or ids. If list_meetings returns no meetings, say so. Never access SQLite directly, or claim a proposal was applied. Documentation: https://github.com/WillIsback/syntheo-desktop/tree/main/docs",
        )
    }

    async fn list_resources(
        &self,
        params: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<ListResourcesResult, McpError> {
        let offset = params
            .and_then(|params| params.cursor)
            .map(|cursor| {
                cursor.parse::<u32>().map_err(|_| {
                    McpError::invalid_params("resource cursor must be an integer", None)
                })
            })
            .transpose()?
            .unwrap_or(0);
        let page = access::list_meetings(
            self.db.pool(),
            access::ListMeetingsInput {
                query: None,
                series_id: None,
                folder_path: None,
                limit: Some(access::DEFAULT_LIST_LIMIT),
                offset: Some(offset),
            },
        )
        .await
        .map_err(command_error)?;
        let next_cursor = page.pagination.next_offset.map(|offset| offset.to_string());
        let resources = page
            .meetings
            .into_iter()
            .map(|meeting| {
                let name = if meeting.title.trim().is_empty() {
                    "Untitled meeting".to_string()
                } else {
                    meeting.title
                };
                Resource::new(format!("syntheo://meetings/{}", meeting.id), name)
                    .with_description("Syntheo meeting context")
                    .with_mime_type("text/markdown")
            })
            .collect();

        let mut result = ListResourcesResult::with_all_items(resources);
        result.next_cursor = next_cursor;
        Ok(result)
    }

    async fn list_resource_templates(
        &self,
        _params: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<ListResourceTemplatesResult, McpError> {
        Ok(ListResourceTemplatesResult::with_all_items(vec![
            ResourceTemplate::new("syntheo://meetings/{meeting_id}", "Syntheo meeting")
                .with_description("Meeting metadata, note, summaries, people, and action items")
                .with_mime_type("text/markdown"),
            ResourceTemplate::new(
                "syntheo://meetings/{meeting_id}/transcript{?offset,limit}",
                "Syntheo meeting transcript",
            )
            .with_description("A bounded page of meeting transcript text")
            .with_mime_type("text/plain"),
            ResourceTemplate::new("syntheo://series/{series_id}", "Syntheo meeting series")
                .with_description("Recurring meeting history")
                .with_mime_type("text/markdown"),
        ]))
    }

    async fn read_resource(
        &self,
        params: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<ReadResourceResponse, McpError> {
        let request = parse_resource_uri(&params.uri)?;
        let contents = match request {
            ResourceRequest::Meeting { meeting_id } => {
                let meeting =
                    access::get_meeting(self.db.pool(), access::GetMeetingInput { meeting_id })
                        .await
                        .map_err(command_error)?;
                ResourceContents::text(meeting.to_markdown(), params.uri)
                    .with_mime_type("text/markdown")
            }
            ResourceRequest::Transcript {
                meeting_id,
                offset,
                limit,
            } => {
                let page = access::get_meeting_transcript(
                    self.db.pool(),
                    access::GetMeetingTranscriptInput {
                        meeting_id,
                        offset: Some(offset),
                        limit: Some(limit),
                    },
                )
                .await
                .map_err(command_error)?;
                ResourceContents::text(page.text, params.uri).with_mime_type("text/plain")
            }
            ResourceRequest::Series { series_id } => {
                let page = access::list_meetings(
                    self.db.pool(),
                    access::ListMeetingsInput {
                        query: None,
                        series_id: Some(series_id),
                        folder_path: None,
                        limit: Some(100),
                        offset: Some(0),
                    },
                )
                .await
                .map_err(command_error)?;
                let text = page
                    .meetings
                    .into_iter()
                    .map(|meeting| {
                        let title = if meeting.title.is_empty() {
                            "Untitled"
                        } else {
                            &meeting.title
                        };
                        let date = if meeting.started_at.is_empty() {
                            &meeting.created_at
                        } else {
                            &meeting.started_at
                        };
                        format!("- {date} — [{title}](syntheo://meetings/{})", meeting.id)
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                ResourceContents::text(text, params.uri).with_mime_type("text/markdown")
            }
        };

        Ok(ReadResourceResult::new(vec![contents]).into())
    }
}

pub(super) fn parse_resource_uri(uri: &str) -> std::result::Result<ResourceRequest, McpError> {
    let url = url::Url::parse(uri)
        .map_err(|_| McpError::invalid_params("invalid Syntheo resource URI", None))?;
    if url.scheme() != "syntheo" {
        return Err(McpError::invalid_params(
            "resource URI must use the syntheo scheme",
            None,
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| McpError::invalid_params("resource URI is missing a type", None))?;
    let segments = url
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    match (host, segments.as_slice()) {
        ("meetings", [meeting_id]) => Ok(ResourceRequest::Meeting {
            meeting_id: (*meeting_id).to_string(),
        }),
        ("meetings", [meeting_id, "transcript"]) => {
            let mut offset = 0;
            let mut limit = access::DEFAULT_TRANSCRIPT_LIMIT;
            for (key, value) in url.query_pairs() {
                match key.as_ref() {
                    "offset" => {
                        offset = value.parse().map_err(|_| {
                            McpError::invalid_params("transcript offset must be an integer", None)
                        })?;
                    }
                    "limit" => {
                        limit = value.parse::<u32>().map_err(|_| {
                            McpError::invalid_params("transcript limit must be an integer", None)
                        })?;
                    }
                    _ => {}
                }
            }
            Ok(ResourceRequest::Transcript {
                meeting_id: (*meeting_id).to_string(),
                offset,
                limit: limit.clamp(1, access::MAX_TRANSCRIPT_LIMIT),
            })
        }
        ("series", [series_id]) => Ok(ResourceRequest::Series {
            series_id: (*series_id).to_string(),
        }),
        _ => Err(McpError::invalid_params(
            "unsupported Syntheo resource URI",
            None,
        )),
    }
}
