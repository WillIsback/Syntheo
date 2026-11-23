use super::*;

fn run(generated: &str, sent: &str) -> Report {
    measure(
        generated,
        Format::Markdown,
        sent,
        Format::Markdown,
        &Dictionary::default(),
    )
    .unwrap()
}

fn counters(generated: u64, added: u64, deleted: u64, rf: u64, rl: u64) -> Counters {
    Counters {
        generated,
        added,
        deleted,
        replaced_content: rf,
        replaced_lexical: rl,
    }
}

const GENERATED: &str = "# Résumé

Le projet avance bien. Le budget est validé par la direction.

## Décisions

- Lancer le pilote en janvier avec Martin.
- Garder le serveur actuel.

## Actions

- Envoyer le compte rendu à l'équipe.
";

#[test]
fn identical_texts_have_no_rework() {
    let report = run(GENERATED, GENERATED);
    assert!(report.aligned);
    assert_eq!(report.headings_generated, 3);
    assert_eq!(report.headings_matched, 3);
    assert_eq!(report.total, counters(28, 0, 0, 0, 0));
    assert_eq!(report.content_per_mille, Some(0.0));
}

// Paire de référence : chiffres attendus par catégorie et par section.
#[test]
fn reference_pair_counts_each_category() {
    let sent = "# Résumé

Le projet avance bien. Le budget est validé par le comité de direction.

## Décisions

- Lancer le pilote en février avec Marten.
- Garder le serveur actuel.
- Former les testeurs.

## Actions

- Envoyer le compte rendu.
";
    let report = run(GENERATED, sent);
    assert!(report.aligned);
    // Résumé : « la » → « le comité de » : remplacement de 1 par 3 mots, sans
    // nom propre : fond, poids 3.
    assert_eq!(report.sections[0].counters, counters(11, 0, 0, 3, 0));
    // Décisions : « janvier » → « février » (fond, 1) ; « Martin » →
    // « Marten » (nom propre, lexical, 1) ; « Former les testeurs » ajouté (3).
    assert_eq!(report.sections[1].counters, counters(11, 3, 0, 1, 1));
    // Actions : « à l'équipe » supprimé (2 mots, l'élision reste un mot ; le
    // point reste).
    assert_eq!(report.sections[2].counters, counters(6, 0, 2, 0, 0));
    assert_eq!(report.total, counters(28, 3, 2, 4, 1));
    assert_eq!(report.unmatched_sent_words, 0);
    let fond = report.content_per_mille.unwrap();
    assert!((fond - 9000.0 / 28.0).abs() < 1e-9, "{fond}");
    let lex = report.lexical_per_mille.unwrap();
    assert!((lex - 1000.0 / 28.0).abs() < 1e-9, "{lex}");
}

#[test]
fn acronyms_mixed_tokens_and_dictionary_terms_are_lexical() {
    let generated = "Nous utilisons le modele de cri et la version gpt quatre.";
    let sent = "Nous utilisons le modele de CRI et la version GPT4.";
    let report = measure(
        generated,
        Format::Text,
        sent,
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    // « cri » → « CRI » (sigle) ; « gpt quatre » → « GPT4 » (2 → 1 mot).
    assert_eq!(report.total, counters(11, 0, 0, 0, 3));

    let dictionary = Dictionary::new(["nemotron"]).unwrap();
    let report = measure(
        "Le modèle nemo tron répond.",
        Format::Text,
        "Le modèle nemotron répond.",
        Format::Text,
        &dictionary,
    )
    .unwrap();
    assert_eq!(report.total, counters(5, 0, 0, 0, 2));
}

#[test]
fn capital_at_sentence_start_is_not_a_proper_noun() {
    let report = measure(
        "Projet validé. Suite demain.",
        Format::Text,
        "Projet validé. Fin demain.",
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert_eq!(report.total, counters(4, 0, 0, 1, 0));
}

#[test]
fn a_proper_noun_added_or_removed_alone_is_content() {
    let report = measure(
        "Réunion avec Alice et Bob.",
        Format::Text,
        "Réunion avec Alice.",
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert_eq!(report.total, counters(5, 0, 2, 0, 0));
}

// Une reformulation longue est du fond, même avec des noms propres ; seul le
// remplacement court d'un nom propre (« Lyon » → « Paris ») est lexical.
#[test]
fn long_replacements_are_content_even_with_proper_nouns() {
    let report = measure(
        "Martin présente le plan de Lyon.",
        Format::Text,
        "Sophie Durand expose la feuille de route de Paris.",
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert_eq!(report.total.replaced_lexical, 1);
    assert!(report.total.replaced_content >= 5, "{:?}", report.total);
}

#[test]
fn missing_section_counts_as_deleted_and_extra_section_as_added() {
    let sent = "# Résumé

Le projet avance bien. Le budget est validé par la direction.

## Décisions

- Lancer le pilote en janvier avec Martin.
- Garder le serveur actuel.

## Risques

Calendrier serré.
";
    let report = run(GENERATED, sent);
    assert!(report.aligned);
    assert_eq!(report.headings_matched, 2);
    assert!(!report.sections[2].matched);
    assert_eq!(report.sections[2].counters, counters(6, 0, 6, 0, 0));
    assert_eq!(report.unmatched_sent_words, 2);
    assert_eq!(report.total, counters(28, 2, 6, 0, 0));
}

#[test]
fn global_measure_when_less_than_half_of_titles_match() {
    let sent = "Le projet avance bien. Le budget est validé par la direction. Lancer le pilote en janvier avec Martin. Garder le serveur actuel. Envoyer le compte rendu à l'équipe.";
    let report = measure(
        GENERATED,
        Format::Markdown,
        sent,
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert!(!report.aligned);
    assert_eq!(report.headings_matched, 0);
    assert!(report.sections.is_empty());
    assert_eq!(report.total, counters(28, 0, 0, 0, 0));
}

// Texte collé depuis un wiki : titres sans mise en forme, retrouvés par leur
// libellé ; formats d'entrée différents (Markdown généré, HTML envoyé).
#[test]
fn plain_and_html_titles_are_aligned_with_generated_headings() {
    let plain = "Résumé\nLe projet avance bien. Le budget est validé par la direction.\nDécisions\nLancer le pilote en janvier avec Martin.\nGarder le serveur actuel.\nActions :\nEnvoyer le compte rendu à l'équipe.";
    let report = measure(
        GENERATED,
        Format::Markdown,
        plain,
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert!(report.aligned);
    assert_eq!(report.headings_matched, 3);
    assert_eq!(report.total, counters(28, 0, 0, 0, 0));

    let html = "<h1>Résumé</h1><p>Le projet avance bien. Le budget est validé par la direction.</p><h2>Décisions</h2><ul><li>Lancer le pilote en janvier avec Martin.</li><li>Garder le serveur actuel.</li></ul><h2>Actions</h2><ul><li>Envoyer le compte rendu à l&#39;équipe.</li></ul>";
    let report = measure(
        GENERATED,
        Format::Markdown,
        html,
        Format::Html,
        &Dictionary::default(),
    )
    .unwrap();
    assert!(report.aligned);
    assert_eq!(report.total, counters(28, 0, 0, 0, 0));
}

#[test]
fn limits_are_enforced() {
    let huge = "a ".repeat(MAX_INPUT_BYTES);
    assert_eq!(
        measure(
            &huge,
            Format::Text,
            "a",
            Format::Text,
            &Dictionary::default()
        ),
        Err(MeasureError::TooLarge)
    );
    let long = "mot ".repeat(MAX_TOKENS + 1);
    assert_eq!(
        measure(
            &long,
            Format::Text,
            "a",
            Format::Text,
            &Dictionary::default()
        ),
        Err(MeasureError::TooManyTokens)
    );
    let terms: Vec<String> = (0..=MAX_DICTIONARY_TERMS)
        .map(|i| format!("terme{i}"))
        .collect();
    assert!(matches!(
        Dictionary::new(terms.iter().map(String::as_str)),
        Err(MeasureError::DictionaryTooLarge)
    ));
}

// Aucune chaîne libre dans le rapport : des nombres, des booléens et des clés
// fixes ; les seules chaînes admises sont des empreintes SHA-256 (termes, issue
// 672) et les rôles de section, liste fermée. Un champ texte ajouté plus tard
// fait échouer ce test.
#[test]
fn report_contains_no_free_text() {
    fn walk(value: &serde_json::Value, path: &str) {
        match value {
            serde_json::Value::String(s) => {
                let hash = (path.ends_with(".hash") || path.contains(".dictionary_hashes["))
                    && s.len() == 64
                    && s.chars()
                        .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c));
                let role = path.ends_with(".role")
                    && ["decisions", "actions", "other"].contains(&s.as_str());
                assert!(hash || role, "chaîne dans le rapport à {path} : {s:?}");
            }
            serde_json::Value::Array(items) => {
                for (i, item) in items.iter().enumerate() {
                    walk(item, &format!("{path}[{i}]"));
                }
            }
            serde_json::Value::Object(map) => {
                for (key, item) in map {
                    assert!(
                        key.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
                        "clé inattendue {key:?}"
                    );
                    walk(item, &format!("{path}.{key}"));
                }
            }
            _ => {}
        }
    }
    let sent = "# Résumé\n\nTexte secret ajouté par Alice.\n\n## Nouvelle section\n\nContenu confidentiel.";
    let report = run(GENERATED, sent);
    let json = serde_json::to_value(&report).unwrap();
    walk(&json, "$");
    let text = json.to_string();
    for leak in [
        "secret",
        "Alice",
        "Nouvelle",
        "confidentiel",
        "Résumé",
        "Décisions",
    ] {
        assert!(!text.contains(leak), "{leak}");
    }
}

#[test]
fn format_from_extension() {
    assert_eq!(Format::from_extension("MD"), Some(Format::Markdown));
    assert_eq!(Format::from_extension("htm"), Some(Format::Html));
    assert_eq!(Format::from_extension("txt"), Some(Format::Text));
    assert_eq!(Format::from_extension("docx"), None);
    assert_eq!(Format::from_extension("pdf"), None);
}

// Calibrage (étape 0) : les différences de la paire de référence, avec leurs
// extraits, dans l'ordre de la version générée.
#[cfg(feature = "differences")]
#[test]
fn differences_list_the_reference_pair() {
    let sent = "# Résumé

Le projet avance bien. Le budget est validé par le comité de direction.

## Décisions

- Lancer le pilote en février avec Marten.
- Garder le serveur actuel.
- Former les testeurs.

## Actions

- Envoyer le compte rendu.
";
    let list = differences(
        GENERATED,
        Format::Markdown,
        sent,
        Format::Markdown,
        &Dictionary::default(),
    )
    .unwrap();
    let rows: Vec<_> = list
        .iter()
        .map(|d| {
            (
                d.section,
                d.change.kind,
                d.change.lexical,
                d.change.weight,
                d.generated.as_str(),
                d.sent.as_str(),
            )
        })
        .collect();
    use ChangeKind::*;
    assert_eq!(
        rows,
        vec![
            (Some(0), Replaced, false, 3, "la", "le comité de"),
            (Some(1), Replaced, false, 1, "janvier", "février"),
            (Some(1), Replaced, true, 1, "Martin", "Marten"),
            (Some(1), Added, false, 3, "", "Former les testeurs."),
            (Some(2), Deleted, false, 2, "à l'équipe", ""),
        ]
    );
    // Mêmes totaux que la mesure chiffrée.
    let mut counters = Counters::default();
    for d in &list {
        counters.record(d.change);
    }
    let report = run(GENERATED, sent);
    assert_eq!(
        (
            counters.added,
            counters.deleted,
            counters.replaced_content,
            counters.replaced_lexical
        ),
        (
            report.total.added,
            report.total.deleted,
            report.total.replaced_content,
            report.total.replaced_lexical
        )
    );
}

// Garde-fou : seuls la CLI et le plugin `mesure` (mode Calibrage, sans base
// ni journal : son test `plugin_persists_nothing`) activent la fonctionnalité
// `differences`. Ni l'application elle-même ni un autre plugin n'ont accès aux
// extraits.
#[test]
fn only_the_cli_and_the_calibration_plugin_enable_differences() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let allowed = [
        root.join("apps/cli/Cargo.toml"),
        root.join("plugins/mesure/Cargo.toml"),
    ];
    let mut manifests = vec![root.join("apps/desktop/src-tauri/Cargo.toml")];
    for dir in ["plugins", "crates"] {
        for entry in std::fs::read_dir(root.join(dir)).unwrap() {
            let manifest = entry.unwrap().path().join("Cargo.toml");
            if manifest.exists() {
                manifests.push(manifest);
            }
        }
    }
    for manifest in manifests {
        if allowed.contains(&manifest) {
            continue;
        }
        let text = std::fs::read_to_string(&manifest).unwrap();
        for line in text.lines().filter(|l| l.contains("syntheo-mesure")) {
            assert!(
                !line.contains("differences"),
                "{} active `differences`",
                manifest.display()
            );
        }
    }
    for manifest in &allowed {
        let text = std::fs::read_to_string(manifest).unwrap();
        assert!(
            text.contains(r#"syntheo-mesure = { workspace = true, features = ["differences"] }"#)
        );
    }
}

// Contrat d'export de la bêta (issue 672), `schema/export-v1.json` : tout
// objet est fermé et toute chaîne a un motif, une liste fermée ou une
// constante. Un champ libre ajouté au schéma fait échouer ce test.
#[test]
fn export_schema_is_closed_and_has_no_free_string() {
    fn walk(node: &serde_json::Value, path: &str) {
        let Some(map) = node.as_object() else {
            if let Some(items) = node.as_array() {
                for (i, item) in items.iter().enumerate() {
                    walk(item, &format!("{path}[{i}]"));
                }
            }
            return;
        };
        if map.get("type").and_then(|t| t.as_str()) == Some("object") {
            assert_eq!(
                map.get("additionalProperties"),
                Some(&serde_json::Value::Bool(false)),
                "objet ouvert à {path}"
            );
        }
        if map.get("type").and_then(|t| t.as_str()) == Some("string") {
            assert!(
                map.contains_key("pattern")
                    || map.contains_key("enum")
                    || map.contains_key("const"),
                "chaîne libre à {path}"
            );
            if let Some(pattern) = map.get("pattern").and_then(|p| p.as_str()) {
                assert!(
                    pattern.starts_with('^') && pattern.ends_with('$'),
                    "motif non ancré à {path}"
                );
                assert!(
                    !pattern.contains(".*") && !pattern.contains(".+"),
                    "motif trop large à {path}"
                );
            }
        }
        for (key, value) in map {
            if key != "description" && key != "title" {
                walk(value, &format!("{path}.{key}"));
            }
        }
    }
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../schema/export-v1.json")).unwrap();
    assert_eq!(schema["properties"]["schema_version"]["const"], 1);
    walk(&schema, "$");
    // Les exemples restent du JSON valide (leur validation par le schéma est
    // faite par l'outil d'agrégation, issue 673).
    for example in [
        include_str!("../schema/export-v1.example.json"),
        include_str!("../schema/export-v1.invalid.json"),
    ] {
        serde_json::from_str::<serde_json::Value>(example).unwrap();
    }
}

// Issue 672 : rôle des sections déduit du titre, termes corrigés par empreinte
// à clé (même empreinte qu'un terme du dictionnaire), jamais en clair.
const KEY: [u8; 32] = [7; 32];

#[test]
fn section_roles_and_corrected_terms() {
    let sent = "# Résumé\n\nLe projet avance bien. Le budget est validé par la direction.\n\n## Décisions\n\n- Lancer le pilote en janvier avec Marten.\n- Garder le serveur actuel.\n\n## Actions\n\n- Envoyer le compte rendu à l'équipe.\n";
    let dictionary = Dictionary::new(["Marten", "Nemotron"])
        .unwrap()
        .with_term_key(KEY);
    let report = measure(
        GENERATED,
        Format::Markdown,
        sent,
        Format::Markdown,
        &dictionary,
    )
    .unwrap();
    let roles: Vec<_> = report.sections.iter().map(|s| s.role).collect();
    assert_eq!(
        roles,
        [
            SectionRole::Other,
            SectionRole::Decisions,
            SectionRole::Actions
        ]
    );
    assert_eq!(report.corrected_terms.len(), 1);
    assert_eq!(report.corrected_terms[0].count, 1);
    assert!(
        report
            .dictionary_hashes
            .contains(&report.corrected_terms[0].hash)
    );
    assert_eq!(report.dictionary_hashes.len(), 2); // deux entrées d'un mot
    let json = serde_json::to_string(&report).unwrap();
    assert!(!json.contains("Marten") && !json.contains("marten"));

    // Sans clé, aucun terme n'est suivi ; une autre clé donne d'autres empreintes.
    let plain = Dictionary::new(["Marten"]).unwrap();
    let report = measure(GENERATED, Format::Markdown, sent, Format::Markdown, &plain).unwrap();
    assert!(report.corrected_terms.is_empty() && report.dictionary_hashes.is_empty());
    let other = Dictionary::new(["Marten"]).unwrap().with_term_key([8; 32]);
    let a = Dictionary::new(["Marten"])
        .unwrap()
        .with_term_key(KEY)
        .hashes();
    assert_ne!(a, other.hashes());
}

// Revue 0.8.0, constat 12 : l'empreinte porte sur le mot qui a fait le
// classement lexical, pas sur tout le remplacement ; l'ajout au dictionnaire
// d'un terme corrigé se retrouve donc par la même empreinte.
#[test]
fn corrected_term_is_the_word_that_made_it_lexical() {
    let generated = "Le dossier est suivi par Dupond depuis lundi.";
    let sent = "Le dossier est suivi par Dupont depuis lundi.";
    let before = Dictionary::new(["Nemotron"]).unwrap().with_term_key(KEY);
    let first = measure(generated, Format::Text, sent, Format::Text, &before).unwrap();
    assert_eq!(first.corrected_terms.len(), 1);
    assert!(!before.hashes().contains(&first.corrected_terms[0].hash));
    let after = Dictionary::new(["Nemotron", "Dupont"])
        .unwrap()
        .with_term_key(KEY);
    assert!(after.hashes().contains(&first.corrected_terms[0].hash));

    // « au rectorat » remplacé par « à la DRASI » : le terme est « DRASI ».
    let generated = "Le dossier part au rectorat demain.";
    let sent = "Le dossier part à la DRASI demain.";
    let report = measure(generated, Format::Text, sent, Format::Text, &before).unwrap();
    let drasi = Dictionary::new(["DRASI"])
        .unwrap()
        .with_term_key(KEY)
        .hashes();
    let hashes: Vec<_> = report.corrected_terms.iter().map(|t| &t.hash).collect();
    assert_eq!(hashes, [&drasi[0]]);
}

// Vérification 0.8.0, point 2 : un terme suivi contenu dans une entrée de
// plusieurs mots du dictionnaire est reconnu, et la clé ne paraît jamais dans
// un `Debug`.
#[test]
fn a_tracked_term_inside_a_longer_dictionary_entry_is_recognised() {
    let none = Dictionary::new(["Nemotron"]).unwrap().with_term_key(KEY);
    let with_entry = Dictionary::new(["Nemotron", "Jean Dupont"])
        .unwrap()
        .with_term_key(KEY);

    let report = measure(
        "Le dossier est suivi par Dupond depuis lundi.",
        Format::Text,
        "Le dossier est suivi par Dupont depuis lundi.",
        Format::Text,
        &none,
    )
    .unwrap();
    assert_eq!(report.corrected_terms.len(), 1);
    assert!(
        with_entry
            .hashes()
            .contains(&report.corrected_terms[0].hash)
    );

    // « Jeanne Dupond » corrigé en « Jean Dupont » : deux termes, tous deux
    // contenus dans l'entrée ajoutée ensuite.
    let report = measure(
        "Le dossier est suivi par Jeanne Dupond depuis lundi.",
        Format::Text,
        "Le dossier est suivi par Jean Dupont depuis lundi.",
        Format::Text,
        &none,
    )
    .unwrap();
    assert_eq!(report.corrected_terms.len(), 2);
    for term in &report.corrected_terms {
        assert!(with_entry.hashes().contains(&term.hash));
        assert!(!none.hashes().contains(&term.hash));
    }

    // Vérification 0.8.0 (second tour), point 3 : une mesure postérieure à
    // l'ajout suit toujours les mots, jamais l'entrée entière : « Dupont »
    // garde la même empreinte qu'avant l'ajout.
    let dupont = {
        let first = measure(
            "Le dossier est suivi par Dupond depuis lundi.",
            Format::Text,
            "Le dossier est suivi par Dupont depuis lundi.",
            Format::Text,
            &none,
        )
        .unwrap();
        first.corrected_terms[0].hash.clone()
    };
    let after = measure(
        "Le dossier est suivi par Jeanne Dupond depuis lundi.",
        Format::Text,
        "Le dossier est suivi par Jean Dupont depuis lundi.",
        Format::Text,
        &with_entry,
    )
    .unwrap();
    assert_eq!(after.corrected_terms.len(), 2);
    assert!(after.corrected_terms.iter().any(|t| t.hash == dupont));
    let whole = Dictionary::new(["Jean Dupont"]).unwrap().with_term_key(KEY);
    assert_eq!(
        whole.hashes().len(),
        2,
        "un mot par empreinte, pas l'entrée entière"
    );

    let debug = format!("{with_entry:?}");
    assert!(debug.contains("<masquée>") && !debug.contains("[7, 7"));
}

// Revue 0.8.0, constat 13 : liste fermée, correspondance exacte, testée sur
// les titres de tous les modèles par défaut, en français et en anglais.
#[test]
fn section_roles_follow_the_default_templates() {
    let mut titles = Vec::new();
    for source in [
        include_str!("../../../apps/desktop/src/templates/default-templates-fr.ts"),
        include_str!("../../../apps/desktop/src/templates/default-templates-en.ts"),
    ] {
        // Les sections sont des paires ["Titre", "Description"].
        for line in source.split("sections: [").skip(1) {
            let block = &line[..line.find("\n    ],").unwrap_or(line.len())];
            for pair in block.split('[').skip(1) {
                if let Some(title) = pair
                    .trim_start()
                    .strip_prefix('"')
                    .and_then(|t| t.split('"').next())
                {
                    titles.push(title.to_string());
                }
            }
        }
    }
    assert!(titles.len() > 200, "titres lus : {}", titles.len());
    let decisions = [
        "Décisions du conseil",
        "Décisions majeures",
        "Décisions prises",
        "Décisions actées",
        "Décisions et actions",
        "Board Decisions",
        "Major Decisions",
        "Decisions Made",
        "Decisions & Action Items",
    ];
    let actions = [
        "Prochaines étapes",
        "Actions",
        "Éléments à fournir",
        "À faire",
        "Plan d'action",
        "Actions à suivre",
        "Prochaine étape",
        "Next Steps",
        "Action Items",
        "Follow-up Items",
        "Action Plan",
        "Next Step",
    ];
    for title in &titles {
        let expected = if decisions.contains(&title.as_str()) {
            SectionRole::Decisions
        } else if actions.contains(&title.as_str()) {
            SectionRole::Actions
        } else {
            SectionRole::Other
        };
        assert_eq!(SectionRole::from_title(Some(title)), expected, "{title}");
    }
    // Chaque titre attendu existe bien dans un modèle par défaut.
    for title in decisions.iter().chain(&actions) {
        assert!(
            titles.iter().any(|t| t == title),
            "{title} absent des modèles"
        );
    }
    // Pas de sous-chaîne : « action » dans un autre mot ne suffit pas.
    for title in [
        "Rédaction",
        "Transactions",
        "Interactions",
        "Satisfaction client",
        "Décisionnaires",
    ] {
        assert_eq!(
            SectionRole::from_title(Some(title)),
            SectionRole::Other,
            "{title}"
        );
    }
    assert_eq!(
        SectionRole::from_title(Some("  Prochaines  étapes : ")),
        SectionRole::Actions
    );
    assert_eq!(SectionRole::from_title(Some("To-do")), SectionRole::Actions);
    assert_eq!(SectionRole::from_title(None), SectionRole::Other);
}
