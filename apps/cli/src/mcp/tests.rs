use super::handler::parse_resource_uri;
use super::*;
use rmcp::ServerHandler;
use rmcp::transport::{IntoTransport, Transport};
use serde_json::Value;

#[test]
fn parses_supported_resource_uris_and_bounds_transcript_limit() {
    assert_eq!(
        parse_resource_uri("syntheo://meetings/meeting-1").unwrap(),
        ResourceRequest::Meeting {
            meeting_id: "meeting-1".to_string()
        }
    );
    assert_eq!(
        parse_resource_uri("syntheo://meetings/meeting-1/transcript?offset=4&limit=900").unwrap(),
        ResourceRequest::Transcript {
            meeting_id: "meeting-1".to_string(),
            offset: 4,
            limit: access::MAX_TRANSCRIPT_LIMIT,
        }
    );
    assert!(parse_resource_uri("file:///tmp/meeting").is_err());
}

#[tokio::test]
async fn list_tool_returns_structured_meeting_data() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, title, started_at, folder_path)
             VALUES
             ('meeting-1', 'Planning', '2026-07-13', 'Clients/ACME'),
             ('meeting-2', 'Planning retro', '2026-07-12', '')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let server = SyntheoMcpServer::new(Arc::new(db));

    let result = server
        .list_meetings(Parameters(access::ListMeetingsInput {
            query: Some("plan".to_string()),
            series_id: None,
            folder_path: Some("Clients".to_string()),
            limit: None,
            offset: None,
        }))
        .await
        .unwrap();

    let meetings = result.structured_content.unwrap();
    assert_eq!(meetings["meetings"][0]["id"], "meeting-1");
    assert_eq!(meetings["meetings"][0]["title"], "Planning");
    assert_eq!(meetings["meetings"][0]["folder_path"], "Clients/ACME");
    assert_eq!(meetings["pagination"]["returned"], 1);
    assert!(meetings["pagination"]["next_offset"].is_null());

    let unfiled = server
        .get_meeting(Parameters(access::GetMeetingInput {
            meeting_id: "meeting-2".to_string(),
        }))
        .await
        .unwrap()
        .structured_content
        .unwrap();
    assert!(unfiled["folder_path"].is_null());

    let folders = server
        .list_folders(Parameters(access::ListFoldersInput::default()))
        .await
        .unwrap()
        .structured_content
        .unwrap();
    assert_eq!(folders["folders"][1]["path"], "Clients/ACME");
    assert_eq!(folders["folders"][1]["name"], "ACME");
    assert_eq!(folders["folders"][1]["parent_path"], "Clients");
    assert!(folders["folders"][0]["parent_path"].is_null());

    let invalid = server
        .list_meetings(Parameters(access::ListMeetingsInput {
            folder_path: Some("/Clients".to_string()),
            ..Default::default()
        }))
        .await;
    assert!(invalid.is_err());
}

#[tokio::test]
async fn client_server_handshake_lists_tools_and_resources() {
    let db = syntheo_db_core::Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, title, started_at) VALUES ('meeting-1', 'Planning', '2026-07-13')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let (server_transport, client_transport) = tokio::io::duplex(64 * 1024);
    let server = SyntheoMcpServer::new(Arc::new(db));
    let info = server.get_info();
    let server_handle = tokio::spawn(async move { server.serve(server_transport).await });

    let client = ().serve(client_transport).await.unwrap();
    let tools = client.list_all_tools().await.unwrap();
    let templates = client.list_all_resource_templates().await.unwrap();
    let resources = client.list_all_resources().await.unwrap();
    insta::assert_json_snapshot!(
        "mcp_contract",
        canonicalize_json(serde_json::json!({
            "protocol_version": info.protocol_version,
            "instructions": info.instructions,
            "tools": tools,
            "resource_templates": templates,
        }))
    );

    let mut tool_names = tools
        .iter()
        .map(|tool| tool.name.to_string())
        .collect::<Vec<_>>();
    tool_names.sort();
    assert_eq!(
        tool_names,
        [
            "decline_proposal",
            "export_meeting",
            "get_meeting",
            "get_meeting_transcript",
            "get_proposal",
            "get_recording_import",
            "get_recurring_meeting_history",
            "import_recording",
            "list_folders",
            "list_meetings",
            "list_proposals",
            "propose_memo_edit",
            "propose_summary_edit",
        ]
    );
    let mcp_docs = include_str!("../../../../docs/reference/mcp.mdx");
    let mcp_skill = include_str!("../../../../skills/syntheo/references/mcp.md");
    for tool_name in &tool_names {
        assert!(
            mcp_docs.contains(tool_name),
            "MCP docs are missing `{tool_name}`"
        );
        assert!(
            mcp_skill.contains(tool_name),
            "Syntheo skill is missing `{tool_name}`"
        );
    }
    for tool in tools {
        let properties = tool
            .input_schema
            .get("properties")
            .and_then(Value::as_object)
            .expect("tool input properties");
        for parameter in properties.keys() {
            assert!(
                mcp_docs.contains(&format!("`{parameter}`")),
                "MCP docs are missing `{parameter}`"
            );
        }
        assert_eq!(
            tool.output_schema
                .as_ref()
                .and_then(|schema| schema.get("type"))
                .and_then(Value::as_str),
            Some("object")
        );
        let annotations = tool.annotations.expect("tool annotations");
        let write_tool = matches!(
            tool.name.as_ref(),
            "propose_summary_edit" | "propose_memo_edit" | "decline_proposal" | "import_recording"
        );
        assert_eq!(annotations.read_only_hint, Some(!write_tool));
        assert_eq!(annotations.destructive_hint, Some(false));
        assert_eq!(annotations.idempotent_hint, Some(!write_tool));
        assert_eq!(
            annotations.open_world_hint,
            Some(tool.name == "import_recording")
        );
    }

    let mut template_contract = templates
        .iter()
        .map(|template| {
            (
                template.name.clone(),
                template.uri_template.clone(),
                template.annotations.clone(),
            )
        })
        .collect::<Vec<_>>();
    template_contract.sort_by(|left, right| left.1.cmp(&right.1));
    assert_eq!(
        template_contract,
        [
            (
                "Syntheo meeting".to_string(),
                "syntheo://meetings/{meeting_id}".to_string(),
                None,
            ),
            (
                "Syntheo meeting transcript".to_string(),
                "syntheo://meetings/{meeting_id}/transcript{?offset,limit}".to_string(),
                None,
            ),
            (
                "Syntheo meeting series".to_string(),
                "syntheo://series/{series_id}".to_string(),
                None,
            ),
        ]
    );
    for (_, uri, _) in &template_contract {
        assert!(mcp_docs.contains(uri), "MCP docs are missing `{uri}`");
        assert!(mcp_skill.contains(uri), "Syntheo skill is missing `{uri}`");
    }
    assert_eq!(resources.len(), 1);
    assert_eq!(resources[0].name, "Planning");
    assert_eq!(resources[0].uri, "syntheo://meetings/meeting-1");
    assert!(resources[0].annotations.is_none());

    client.cancel().await.unwrap();
    let server = server_handle.await.unwrap().unwrap();
    server.cancel().await.unwrap();
}

#[tokio::test]
async fn current_client_discovers_and_lists_tools_without_initialize() {
    let db = Arc::new(syntheo_db_core::Db::connect_memory_plain().await.unwrap());
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    let (server_transport, client_transport) = tokio::io::duplex(64 * 1024);
    let server = SyntheoMcpServer::new(db);
    let server_task = tokio::spawn(async move { server.serve(server_transport).await.unwrap() });
    let mut client = IntoTransport::<rmcp::RoleClient, _, _>::into_transport(client_transport);

    let mut discover = DiscoverRequest::new(DiscoverRequestParams {});
    discover.extensions.insert(current_client_meta());
    client
        .send(ClientJsonRpcMessage::request(
            ClientRequest::DiscoverRequest(discover),
            RequestId::Number(1),
        ))
        .await
        .unwrap();
    let discover = client.receive().await.unwrap();
    let discover = serde_json::to_value(discover).unwrap();
    assert!(
        discover["result"]["supportedVersions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|version| version == "2026-07-28")
    );

    let mut list_tools = ListToolsRequest {
        method: Default::default(),
        params: None,
        extensions: Default::default(),
    };
    list_tools.extensions.insert(current_client_meta());
    client
        .send(ClientJsonRpcMessage::request(
            ClientRequest::ListToolsRequest(list_tools),
            RequestId::Number(2),
        ))
        .await
        .unwrap();
    let tools = client.receive().await.unwrap();
    let tools = serde_json::to_value(tools).unwrap();
    assert_eq!(tools["result"]["resultType"], "complete");
    assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 13);

    drop(client);
    server_task.await.unwrap().cancel().await.unwrap();
}

fn current_client_meta() -> RequestMetaObject {
    RequestMetaObject::with_client_context(
        ProtocolVersion::V_2026_07_28,
        Implementation::new("syntheo-test", "1.0.0"),
        ClientCapabilities::default(),
    )
}

fn canonicalize_json(value: Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .into_iter()
                .map(|(key, value)| (key, canonicalize_json(value)))
                .collect::<std::collections::BTreeMap<_, _>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize_json).collect()),
        value => value,
    }
}
