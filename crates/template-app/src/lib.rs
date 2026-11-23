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
