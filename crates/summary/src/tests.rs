use super::*;

#[test]
fn counts_normalized_code_points_with_javascript_whitespace() {
    assert_eq!(count_normalized_characters("이번 회의는 짧음"), 9);
    assert_eq!(count_normalized_characters("😀  meeting\tnotes"), 15);
    assert_eq!(
        count_normalized_characters("\u{FEFF}A\u{0085} B\u{FEFF}"),
        4
    );
}

#[test]
fn computes_the_short_transcript_policy() {
    assert_eq!(
        summary_length_policy(200, 0),
        Some(SummaryLengthPolicy {
            transcript_characters: 200,
            guidance: Some(SummaryLengthGuidance {
                max_characters: 320,
                min_sections: 1,
                max_sections: 2,
            }),
        })
    );
}

#[test]
fn policy_rounding_and_section_guidance_match_the_typescript_policy() {
    let cases = [
        (
            636,
            SummaryLengthGuidance {
                max_characters: 636,
                min_sections: 1,
                max_sections: 2,
            },
        ),
        (
            6_000,
            SummaryLengthGuidance {
                max_characters: 6_000,
                min_sections: 2,
                max_sections: 4,
            },
        ),
        (
            10_000,
            SummaryLengthGuidance {
                max_characters: 10_000,
                min_sections: 3,
                max_sections: 6,
            },
        ),
        (
            30_000,
            SummaryLengthGuidance {
                max_characters: 30_000,
                min_sections: 5,
                max_sections: 8,
            },
        ),
    ];

    for (characters, guidance) in cases {
        let result = summary_length_policy(characters, 0).unwrap();
        assert_eq!(result.guidance, Some(guidance));
    }
}

#[test]
fn policy_uses_the_template_section_floor() {
    let policy = summary_length_policy(160, 12).unwrap();
    assert_eq!(
        policy.guidance,
        Some(SummaryLengthGuidance {
            max_characters: 1_800,
            min_sections: 1,
            max_sections: 2,
        })
    );
}

#[test]
fn policy_for_texts_joins_nonempty_segments_before_counting() {
    let texts = vec!["first".to_owned(), String::new(), "second".to_owned()];
    let policy = summary_length_policy_for_texts(&texts, 0).unwrap();
    assert_eq!(policy.transcript_characters, 12);
}

#[test]
fn policy_is_absent_without_transcript_characters() {
    assert!(summary_length_policy(0, 0).is_none());
}

#[test]
fn extracts_unique_hashtags_in_first_insertion_order() {
    let tags = extract_tag_names(&[
        Some("# Summary\n\nDiscussed #Launch and issue #123."),
        Some("Prep #prep #launch"),
        Some("Next #follow-up"),
        Some("Template #customer"),
        Some("Use #owners"),
    ]);
    assert_eq!(tags, ["launch", "prep", "follow-up", "customer", "owners"]);
}

#[test]
fn append_replaces_existing_trailing_tag_lines() {
    assert_eq!(
        append_tag_line_to_markdown(
            "Body\n\n#old #tags",
            &["old".to_owned(), "tags".to_owned(), "new".to_owned()]
        ),
        "Body\n\n#old #tags #new"
    );
}

#[test]
fn appending_tags_normalizes_crlf_and_unicode_whitespace() {
    assert_eq!(
        append_tag_line_to_markdown(
            "Body\r\n\r\n#OLD\r\n",
            &[
                "\u{FEFF}OLD\u{FEFF}".to_owned(),
                "\u{FEFF}New\u{FEFF}".to_owned()
            ]
        ),
        "Body\n\n#old #new"
    );
}

#[test]
fn ensure_title_prepends_before_markdown_summary_headings() {
    assert_eq!(
        ensure_markdown_first_line_title("# Summary Section\n\n- Follow up", Some("Meeting Title")),
        "# Meeting Title\n\n# Summary Section\n\n- Follow up"
    );
}

#[test]
fn ensure_title_does_not_duplicate_an_exact_heading() {
    assert_eq!(
        ensure_markdown_first_line_title("# Meeting Title", Some("Meeting Title")),
        "# Meeting Title"
    );
}

#[test]
fn prepare_generated_summary_extracts_sources_and_appends_tags() {
    let prepared = prepare_generated_summary(PrepareGeneratedSummaryRequest {
        text: "# Summary\n\nDiscussed #Launch.".to_owned(),
        tag_sources: vec!["Prep #prep #Launch".to_owned()],
    })
    .unwrap();
    assert_eq!(prepared.text, "# Summary\n\nDiscussed #Launch.");
    assert_eq!(prepared.tag_names, ["launch", "prep"]);
    assert_eq!(
        prepared.text_with_tags,
        "# Summary\n\nDiscussed #Launch.\n\n#launch #prep"
    );
}

#[test]
fn prepare_generated_summary_returns_none_for_empty_text() {
    assert!(
        prepare_generated_summary(PrepareGeneratedSummaryRequest {
            text: "\u{FEFF} \n".to_owned(),
            tag_sources: Vec::new(),
        })
        .is_none()
    );
}

#[test]
fn compose_adds_title_and_tag_line_with_exact_markdown_output() {
    assert_eq!(
        compose_generated_summary(ComposeGeneratedSummaryRequest {
            text: "# Summary\n\nDiscussed #Launch.".to_owned(),
            title: Some("Meeting Title".to_owned()),
            tag_names: vec!["launch".to_owned(), "prep".to_owned()],
        }),
        "# Meeting Title\n\n# Summary\n\nDiscussed #Launch.\n\n#launch #prep"
    );
}
