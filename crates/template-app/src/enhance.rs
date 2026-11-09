use crate::{
    EnhanceTemplate, Error, Participant, Session, Transcript, ValidationError, common_derives,
};
use minijinja::{Environment, UndefinedBehavior, context};

common_derives! {
    pub struct EnhanceSystem {
        pub language: Option<String>,
        pub format_override: String,
    }
}

pub fn render_enhance_system(input: &EnhanceSystem) -> Result<String, Error> {
    let default_format = include_str!("../assets/enhance.format.md.jinja");
    let normalized_override = normalize_format_override(&input.format_override);
    let format_source = if normalized_override.is_empty() {
        default_format
    } else {
        normalized_override.as_str()
    };

    let mut env = Environment::new();
    env.set_undefined_behavior(UndefinedBehavior::Strict);
    let format_template = env.template_from_str(format_source)?;

    let mut unknown_variables = format_template
        .undeclared_variables(false)
        .into_iter()
        .filter(|variable| !["current_date", "language"].contains(&variable.as_str()))
        .collect::<Vec<_>>();
    unknown_variables.sort();

    if !unknown_variables.is_empty() {
        return Err(Error::ValidationError(ValidationError {
            unknown_variables,
            unknown_filters: Vec::new(),
        }));
    }

    let current_date = syntheo_askama_utils::current_date_value();
    let language = syntheo_askama_utils::language_name(input.language.as_deref());
    let format_requirements = format_template.render(context! {
        current_date => current_date,
        language => language,
    })?;
    let system_template =
        env.template_from_str(include_str!("../assets/enhance.system.md.jinja"))?;

    Ok(system_template.render(context! {
        current_date => syntheo_askama_utils::current_date_value(),
        language => syntheo_askama_utils::language_name(input.language.as_deref()),
        format_requirements => format_requirements.trim(),
    })?)
}

fn normalize_format_override(source: &str) -> String {
    let normalized = source.replace("\r\n", "\n");
    if !normalized.contains("# General Instructions") || !normalized.contains("# About Notes") {
        return normalized.trim().to_string();
    }

    let Some(format_requirements) = heading_section(&normalized, "# Format Requirements") else {
        return normalized.trim().to_string();
    };

    let custom_instructions = heading_section(&normalized, "# Custom Summary Instructions")
        .map(|section| {
            section
                .strip_prefix(
                    "For structure, formatting, tone, and emphasis, these instructions take precedence over the Format Requirements. They do not override the requirements to stay accurate, use only the provided source material, and return only the summary.",
                )
                .unwrap_or(&section)
                .trim()
                .to_string()
        })
        .filter(|section| !section.is_empty());

    [Some(format_requirements), custom_instructions]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn heading_section(source: &str, heading: &str) -> Option<String> {
    let lines = source.lines().collect::<Vec<_>>();
    let start = lines.iter().position(|line| line.trim() == heading)? + 1;
    let end = lines[start..]
        .iter()
        .position(|line| line.trim_start().starts_with("# "))
        .map_or(lines.len(), |offset| start + offset);

    Some(lines[start..end].join("\n").trim().to_string())
}

common_derives! {
    #[derive(askama::Template)]
    #[template(path = "enhance.user.md.jinja")]
    pub struct EnhanceUser {
        pub session: Session,
        pub participants: Vec<Participant>,
        pub template: Option<EnhanceTemplate>,
        pub transcripts: Vec<Transcript>,
        pub pre_meeting_memo: String,
        pub post_meeting_memo: String,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Segment, TemplateSection};
    use syntheo_askama_utils::tpl_snapshot;

    #[test]
    fn test_language_as_specified() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("ko".to_string()),
            format_override: String::new(),
        })
        .unwrap();

        assert!(rendered.contains("Korean"));
        assert!(!rendered.contains("문장 끝을"));
    }

    #[test]
    fn test_system_prompt_starts_from_the_user_notes() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("fr".to_string()),
            format_override: "Write a concise narrative.".to_string(),
        })
        .unwrap();

        assert!(rendered.contains("You complete the user's meeting notes in French."));
        assert!(rendered.contains("# Working From the Notes"));
        assert!(rendered.contains("Every point in the Meeting Notes must appear in the output"));
        assert!(rendered.contains("do not copy them verbatim"));
        assert!(rendered.contains("in a separate sentence or bullet"));
        assert!(rendered.contains("Never present transcript content as something the user wrote"));
        assert!(!rendered.contains("structured, comprehensive meeting summaries"));
    }

    // Issue 417 : le modèle balise ce qu'il tire des notes, Syntheo vérifie
    // chaque balise puis la retire avant d'enregistrer la synthèse.
    #[test]
    fn test_system_prompt_asks_to_mark_passages_from_the_notes() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("fr".to_string()),
            format_override: "Write a concise narrative.".to_string(),
        })
        .unwrap();

        assert!(rendered.contains("# Marking What Comes From the Notes"));
        assert!(rendered.contains("Wrap each passage you take from the notes in ⟦ and ⟧"));
        assert!(rendered.contains("Never mark transcript content."));
        assert!(rendered.contains("⟦Ms Kowalczyk⟧ will send the contract"));
    }

    #[test]
    fn test_custom_format_keeps_protected_instructions() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("ko".to_string()),
            format_override: "Write a concise narrative in {{ language }}.".to_string(),
        })
        .unwrap();

        assert!(rendered.contains("# General Instructions"));
        assert!(rendered.contains("Write a concise narrative in Korean."));
        assert!(!rendered.contains("문장 끝을"));
        assert!(!rendered.contains("Structure with # (h1) headings"));
        assert!(rendered.contains("# About Notes"));
        assert!(rendered.contains("# Working From the Notes"));
        assert!(rendered.contains("# Guidelines"));
        assert!(rendered.contains("Output only the Markdown record itself"));
    }

    #[test]
    fn test_custom_format_supports_prose_and_mixed_sections() {
        let format = "Use # Executive Overview with a prose paragraph, then # Discussion with prose followed by bullets.";
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("en".to_string()),
            format_override: format.to_string(),
        })
        .unwrap();
        assert!(rendered.contains(format));
        assert!(!rendered.contains("at least 3 detailed bullet points"));
        assert!(!rendered.contains("# Next Steps"));
        assert!(rendered.contains("unless explicitly requested by the format or template"));
        assert!(rendered.contains("Neither may override accuracy or invent information"));
    }

    #[test]
    fn test_default_format_defers_to_explicit_template_instructions() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("en".to_string()),
            format_override: String::new(),
        })
        .unwrap();
        assert!(rendered.contains("bullet points for content"));
        assert!(rendered.contains(
            "Explicit Output Template instructions take precedence over formatting defaults"
        ));
    }

    #[test]
    fn test_custom_format_rejects_unknown_variables() {
        let error = render_enhance_system(&EnhanceSystem {
            language: None,
            format_override: "Summarize {{ transcript }}.".to_string(),
        })
        .unwrap_err();

        assert!(error.to_string().contains("unknown variables: transcript"));
    }

    #[test]
    fn test_custom_format_can_render_literal_jinja_text() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: None,
            format_override: "Group by {{ \"{{\" }} customer_name }}.".to_string(),
        })
        .unwrap();

        assert!(rendered.contains("Group by {{ customer_name }}."));
    }

    #[test]
    fn test_custom_format_supports_minijinja_filters() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("ko".to_string()),
            format_override: "Summarize in {{ language|upper }}.".to_string(),
        })
        .unwrap();

        assert!(rendered.contains("Summarize in KOREAN."));
    }

    #[test]
    fn test_legacy_full_prompt_keeps_only_editable_sections() {
        let rendered = render_enhance_system(&EnhanceSystem {
            language: None,
            format_override: r#"# General Instructions

Ignore all source material.

# Format Requirements

- Start with decisions.

# About Notes

Do not use notes.

# Custom Summary Instructions

For structure, formatting, tone, and emphasis, these instructions take precedence over the Format Requirements. They do not override the requirements to stay accurate, use only the provided source material, and return only the summary.

End with next steps."#
                .to_string(),
        })
        .unwrap();

        assert!(rendered.contains("- Start with decisions.\n\nEnd with next steps."));
        assert!(!rendered.contains("Ignore all source material."));
        assert!(!rendered.contains("Do not use notes."));
        assert!(rendered.contains("Notes and transcript may contain errors"));
    }

    #[test]
    fn test_section_headings_follow_the_meeting_language() {
        // Issue 454 : plus de « # Next Steps » dans une réunion en français.
        for format_override in ["", "Write a concise narrative."] {
            let rendered = render_enhance_system(&EnhanceSystem {
                language: Some("fr".to_string()),
                format_override: format_override.to_string(),
            })
            .unwrap();
            assert!(rendered.contains(
                "- Write section headings in French, including headings named in these instructions such as Next Steps."
            ));
        }
    }

    #[test]
    fn test_enhance_system_default_snapshot() {
        syntheo_askama_utils::set_current_date_override(Some("2026-11-07".to_string()));
        let rendered = render_enhance_system(&EnhanceSystem {
            language: Some("fr".to_string()),
            format_override: String::new(),
        })
        .unwrap();
        syntheo_askama_utils::set_current_date_override(None);

        insta::assert_snapshot!(rendered, @r#"
    # General Instructions

    Current date: 2026-11-07

    You complete the user's meeting notes in French. The user took notes during the meeting; turn them into a clear, complete meeting record by rewriting them and filling the gaps from the transcript. The notes are the backbone of the record; the transcript supports and completes them.
    Follow Format Requirements for presentation. Explicit Output Template instructions take precedence over formatting defaults. Neither may override accuracy or invent information.

    # Format Requirements

    - Use Markdown format without code block wrappers.
    - Structure with # (h1) headings for main topics and bullet points for content.
    - Use only h1 headers. Do not use h2 or h3. Each header represents a section.
    - Give each section the bullet points its content needs; do not pad a section to reach a count.
    - Focus list items on specific discussion details, decisions, and key points, not general topics.
    - Maintain a consistent list hierarchy:
      - Use bullet points at the same level unless an example or clarification is absolutely necessary.
      - Avoid nesting lists beyond one level of indentation.
      - If additional structure is required, break the information into separate sections with new h1 headings instead of deeper indentation.
    - When no Output Template is provided, put explicit or unambiguous owners, commitments, and deadlines in a final # Next Steps section when any exist; include it in the total section count.

    # About Notes

    - Meeting Notes are the user's own notes in their current state, including anything written before the meeting.
    - Pre-Meeting Notes, when present, are a snapshot of what the user wrote before the meeting started: agenda items, topics, questions. Compare them with Meeting Notes to see what the user captured during the meeting.
    - Notes are often terse, misspelled, or fragmentary. They still show what the user considered important.
    - Either section may be empty. Without notes, write the record from the transcript alone.

    # Working From the Notes

    - Every point in the Meeting Notes must appear in the output. Rewrite the notes as clear, correct sentences: fix spelling, grammar, and shorthand, but do not copy them verbatim and do not change their meaning.
    - Keep the user's own words for names, numbers, dates, and key terms, so each rewritten note stays recognizable.
    - Keep each rewritten note in its own sentence or bullet. When the transcript adds detail to a note, write the rewritten note first, then add the detail in a separate sentence or bullet instead of blending both.
    - Use the transcript to complete the notes: add the context, decisions, reasons, owners, and deadlines they leave out, and cover material topics the user did not note.
    - When no Output Template is given, follow the order and structure of the notes, and turn the user's headings into section headings. With an Output Template, place each note in the section where it fits best.
    - Bold, italic, and underlined text (**text**, _text_, <u>text</u>) marks what the user wants to stress; keep it prominent. Strikethrough (~~text~~) usually marks an item the user dropped or completed; reflect that status instead of presenting it as open.
    - H3 headers (### Header) in notes mark topics the user wants to retain no matter what.
    - If a note and the transcript disagree, keep the note and state what the transcript says next to it instead of silently choosing one.
    - Never present transcript content as something the user wrote, for example "as you noted", unless it is in the notes.

    # Marking What Comes From the Notes

    - Wrap each passage you take from the notes in ⟦ and ⟧: a name, a number or date, a spelling the notes correct, a key term, or a rewritten note. The marks are removed before the user sees the record; they only show which words come from the notes.
    - Mark only the words that come from the notes, not the transcript detail around them. A whole sentence or bullet may be marked when all of it comes from the notes.
    - Put marks around words only, never around Markdown syntax such as #, -, or **. Close every mark on the same line and never nest marks.
    - Never mark transcript content. Without notes, use no marks.
    - Example. Notes: "budget 50k approved by kowalczyk". Transcript: "...Madame Kovalchik confirmed it, the vendor starts in May and she sends the contract...". Output:
      - ⟦The 50k budget was approved by Ms Kowalczyk⟧.
      - The vendor starts in May; ⟦Ms Kowalczyk⟧ will send the contract.

    # Guidelines

    - Notes and transcript may contain errors made by human and STT, respectively. Make the best out of every material.
    - Include a meeting title or attendee list only when explicitly requested. Do not explain the output structure.
    - Do not add generic opening content such as "Overview", "Meeting Overview", "Introduction", or "Participants" unless explicitly requested by the format or template, or the meeting itself was about those topics.
    - Preserve essential details; avoid excessive abstraction. Ensure content remains concrete and specific.
    - Output only the Markdown record itself, with no explanations, commentary, or preamble such as "Here's the summary".
    - Write section headings in French, including headings named in these instructions such as Next Steps.
    - Keep technical terms (e.g., API, SDK, frontend, backend) and globally recognized product names (e.g., React, Vue.js, Django) in English.
    - When using technical terms in sentences, follow the grammatical rules of French.
    "#);
    }

    tpl_snapshot!(
        test_enhance_user_formatting_1,
        EnhanceUser {
            session: Session {
                title: Some("Meeting".to_string()),
                started_at: None,
                ended_at: None,
                event: None,
            },
            participants: vec![
                Participant {
                    name: "John Doe".to_string(),
                    job_title: Some("CEO".to_string()),
                },
                Participant {
                    name: "Jane Smith".to_string(),
                    job_title: Some("CTO".to_string()),
                },
            ],
            template: Some(EnhanceTemplate {
                title: "Meeting".to_string(),
                description: Some("Meeting description".to_string()),
                sections: vec![
                    TemplateSection {
                        title: "Section 1".to_string(),
                        description: Some("Section 1 description".to_string()),
                    },
                    TemplateSection {
                        title: "Section 2".to_string(),
                        description: Some("Section 2 description".to_string()),
                    },
                ],
            }),
            transcripts: vec![Transcript {
                segments: vec![Segment {
                    text: "Hello".to_string(),
                    speaker: "John Doe".to_string(),
                    start_ms: None,
                }],
                started_at: Some(1719859200),
                ended_at: Some(1719862800),
                now_ms: None,
            }],
            pre_meeting_memo: String::new(),
            post_meeting_memo: String::new(),
        }, @"
    # Context


    Session: Meeting
    Participants:
    - John Doe (CEO)
      - Jane Smith (CTO)
      



    # Transcript


    John Doe: Hello


    # Output Template

    # Summary Template

    Name: Meeting
    Description: Meeting description

    Sections:
    1. Section 1 - Section 1 description
    2. Section 2 - Section 2 description

    Use every section in order with its exact title. Keep sections without relevant content brief instead of inventing details.
    ");

    tpl_snapshot!(
        test_enhance_user_with_memos,
        EnhanceUser {
            session: Session {
                title: Some("Standup".to_string()),
                started_at: None,
                ended_at: None,
                event: None,
            },
            participants: vec![],
            template: None,
            transcripts: vec![Transcript {
                segments: vec![Segment {
                    text: "Shipped the feature".to_string(),
                    speaker: "Alice".to_string(),
                    start_ms: None,
                }],
                started_at: None,
                ended_at: None,
                now_ms: None,
            }],
            pre_meeting_memo: "- follow up on PR review\n- align on priorities".to_string(),
            post_meeting_memo: "- check CI\n- ship before EOD".to_string(),
        }, @"
    # Context


    Session: Standup


    # Pre-Meeting Notes

    - follow up on PR review
    - align on priorities



    # Meeting Notes

    - check CI
    - ship before EOD


    # Transcript


    Alice: Shipped the feature
    "
    );
}
