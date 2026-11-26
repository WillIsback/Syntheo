mod chat;
mod enhance;
mod title;
mod types;
mod validate;

pub use chat::*;
pub use enhance::*;
pub use title::*;
pub use types::*;
pub use validate::*;

#[macro_export]
macro_rules! common_derives {
    ($item:item) => {
        #[derive(Clone, serde::Deserialize, serde::Serialize, specta::Type)]
        #[serde(rename_all = "camelCase")]
        $item
    };
}

common_derives! {
    pub enum EditableTemplate {
        EnhanceFormat,
        EnhanceUser,
        TitleUser,
    }
}

common_derives! {
    pub enum Template {
        EnhanceSystem(EnhanceSystem),
        EnhanceUser(Box<EnhanceUser>),
        TitleSystem(TitleSystem),
        TitleUser(TitleUser),
        ChatSystem(ChatSystem),
        ContextBlock(ContextBlock),
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    AskamaError(#[from] askama::Error),
    #[error(transparent)]
    JinjaError(#[from] minijinja::Error),
    #[error("parse error: {0}")]
    ParseError(String),
    #[error("validation error: {0}")]
    ValidationError(ValidationError),
}

pub fn render(t: Template) -> Result<String, Error> {
    match t {
        Template::EnhanceSystem(t) => render_enhance_system(&t),
        Template::EnhanceUser(t) => Ok(askama::Template::render(&*t)?),
        Template::TitleSystem(t) => Ok(askama::Template::render(&t)?),
        Template::TitleUser(t) => Ok(askama::Template::render(&t)?),
        Template::ChatSystem(t) => Ok(askama::Template::render(&t)?),
        Template::ContextBlock(t) => Ok(askama::Template::render(&t)?),
    }
}

pub fn template_source(template: EditableTemplate) -> &'static str {
    match template {
        EditableTemplate::EnhanceFormat => include_str!("../assets/enhance.format.md.jinja"),
        EditableTemplate::EnhanceUser => include_str!("../assets/enhance.user.md.jinja"),
        EditableTemplate::TitleUser => include_str!("../assets/title.user.md.jinja"),
    }
}

// Issue 772 : les prompts sont du texte brut destiné au modèle, pas du HTML.
// Aucun gabarit ne doit échapper apostrophes, guillemets, & ou chevrons.
// Les prompts système n'interpolent que la date et un nom de langue ISO 639-1
// (aucun caractère échappable) et le texte littéral n'est jamais échappé :
// seuls les gabarits qui interpolent du contenu utilisateur sont testés.
#[cfg(test)]
mod escaping_tests {
    use super::*;

    const RAW: &str = r#"l'équipe & <test> "x""#;
    const HTML_ENTITIES: [&str; 5] = ["&#", "&amp;", "&lt;", "&gt;", "&quot;"];

    fn assert_intact(rendered: &str) {
        assert!(rendered.contains(RAW), "texte altéré :\n{rendered}");
        for entity in HTML_ENTITIES {
            assert!(!rendered.contains(entity), "entité {entity} :\n{rendered}");
        }
    }

    #[test]
    fn enhance_user_keeps_raw_text() {
        let rendered = render(Template::EnhanceUser(Box::new(EnhanceUser {
            session: Session {
                title: Some(RAW.to_string()),
                started_at: None,
                ended_at: None,
                event: Some(Event {
                    name: RAW.to_string(),
                }),
            },
            participants: vec![Participant {
                name: RAW.to_string(),
                job_title: Some(RAW.to_string()),
            }],
            template: Some(EnhanceTemplate {
                title: RAW.to_string(),
                description: Some(RAW.to_string()),
                sections: vec![TemplateSection {
                    title: RAW.to_string(),
                    description: Some(RAW.to_string()),
                }],
            }),
            transcripts: vec![Transcript {
                segments: vec![Segment {
                    text: RAW.to_string(),
                    speaker: "Orion".to_string(),
                    start_ms: None,
                }],
                started_at: None,
                ended_at: None,
                now_ms: None,
            }],
            pre_meeting_memo: RAW.to_string(),
            post_meeting_memo: RAW.to_string(),
        })))
        .unwrap();

        assert_intact(&rendered);
        assert!(rendered.contains(&format!("Orion: {RAW}")));
        assert!(rendered.contains(&format!("Meeting: {RAW}")));
        assert!(rendered.contains(&format!("- {RAW} ({RAW})")));
    }

    #[test]
    fn title_user_keeps_raw_text() {
        let rendered = render(Template::TitleUser(TitleUser {
            enhanced_note: RAW.to_string(),
        }))
        .unwrap();
        assert_intact(&rendered);
    }

    #[test]
    fn context_block_keeps_raw_text() {
        let rendered = render(Template::ContextBlock(ContextBlock {
            contexts: vec![SessionContext {
                session_id: Some("s1".to_string()),
                title: Some(RAW.to_string()),
                date: Some(RAW.to_string()),
                raw_content: None,
                enhanced_content: Some(RAW.to_string()),
                meeting_chat: Some(RAW.to_string()),
                transcript: Some(Transcript {
                    segments: vec![Segment {
                        text: RAW.to_string(),
                        speaker: RAW.to_string(),
                        start_ms: Some(61_000),
                    }],
                    started_at: None,
                    ended_at: None,
                    now_ms: None,
                }),
                participants: vec![Participant {
                    name: RAW.to_string(),
                    job_title: None,
                }],
                event: Some(Event {
                    name: RAW.to_string(),
                }),
            }],
            current_session_id: Some("s1".to_string()),
        }))
        .unwrap();
        assert_intact(&rendered);
        assert!(rendered.contains(&format!("[01:01] {RAW}: {RAW}")));
    }
}
