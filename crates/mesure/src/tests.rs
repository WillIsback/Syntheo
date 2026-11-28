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
    // 28 mots de corps et 3 mots de titre (issue 730 : titres comptés).
    assert_eq!(report.total, counters(31, 0, 0, 0, 0));
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
    assert_eq!(report.sections[0].counters, counters(12, 0, 0, 3, 0));
    // Décisions : « janvier » → « février » (fond, 1) ; « Martin » →
    // « Marten » (nom propre, lexical, 1) ; « Former les testeurs » ajouté (3).
    assert_eq!(report.sections[1].counters, counters(12, 3, 0, 1, 1));
    // Actions : « à l'équipe » supprimé (2 mots, l'élision reste un mot ; le
    // point reste).
    assert_eq!(report.sections[2].counters, counters(7, 0, 2, 0, 0));
    assert_eq!(report.total, counters(31, 3, 2, 4, 1));
    assert_eq!(report.unmatched_sent_words, 0);
    let fond = report.content_per_mille.unwrap();
    assert!((fond - 9000.0 / 31.0).abs() < 1e-9, "{fond}");
    let lex = report.lexical_per_mille.unwrap();
    assert!((lex - 1000.0 / 31.0).abs() < 1e-9, "{lex}");
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
    // « cri » → « CRI » (sigle). Règle v2 (issue 732) : « gpt quatre » →
    // « GPT4 » apparie « gpt » et « GPT4 » (1 mot lexical) ; « quatre »,
    // sans homologue, est supprimé (1 mot de fond).
    assert_eq!(report.total, counters(11, 0, 1, 0, 2));

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
    // Titre compris : « Actions » supprimée (1 + 6 mots), « Risques »
    // ajoutée (1 + 2 mots), sans appariement approché entre les deux.
    assert_eq!(report.sections[2].counters, counters(7, 0, 7, 0, 0));
    assert_eq!(report.unmatched_sent_words, 3);
    assert_eq!(report.total, counters(31, 3, 7, 0, 0));
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
    // Les trois titres, absents du texte envoyé, comptent en suppressions.
    assert_eq!(report.total, counters(31, 0, 3, 0, 0));
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
    assert_eq!(report.total, counters(31, 0, 0, 0, 0));

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
    assert_eq!(report.total, counters(31, 0, 0, 0, 0));
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
                // Codes fermés des garde-fous (issue 733).
                let status =
                    path == "$.status" && ["ok", "doubtful", "refused"].contains(&s.as_str());
                let reason = path.starts_with("$.status_reasons[")
                    && [
                        "entity_left",
                        "too_few_words_kept",
                        "global_alignment",
                        "unmatched_sections",
                    ]
                    .contains(&s.as_str());
                assert!(
                    hash || role || status || reason,
                    "chaîne dans le rapport à {path} : {s:?}"
                );
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

// Contrat d'export de la bêta (issue 672), `schema/export-v2.json` : tout
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
        serde_json::from_str(include_str!("../schema/export-v2.json")).unwrap();
    assert_eq!(schema["properties"]["schema_version"]["const"], 2);
    walk(&schema, "$");
    // Garde-fous (issue 733) : codes du schéma identiques à ceux du crate ;
    // une mesure refusée n'est pas exportable.
    let meeting = &schema["$defs"]["meeting"]["properties"];
    assert_eq!(
        meeting["status"]["enum"],
        serde_json::json!(["ok", "doubtful"])
    );
    assert_eq!(
        meeting["status_reasons"]["items"]["enum"],
        serde_json::json!(["global_alignment", "unmatched_sections"])
    );
    let controls = serde_json::to_value(Controls::default()).unwrap();
    let mut crate_keys: Vec<&String> = controls.as_object().unwrap().keys().collect();
    let mut schema_keys: Vec<&String> = schema["$defs"]["controls"]["properties"]
        .as_object()
        .unwrap()
        .keys()
        .collect();
    crate_keys.sort();
    schema_keys.sort();
    assert_eq!(crate_keys, schema_keys);
    for reason in ["global_alignment", "unmatched_sections"] {
        assert!(
            serde_json::to_value([
                StatusReason::GlobalAlignment,
                StatusReason::UnmatchedSections
            ])
            .unwrap()
            .as_array()
            .unwrap()
            .contains(&serde_json::json!(reason))
        );
    }
    // Les exemples restent du JSON valide (leur validation par le schéma est
    // faite par l'outil d'agrégation, issue 673).
    for example in [
        include_str!("../schema/export-v2.example.json"),
        include_str!("../schema/export-v2.invalid.json"),
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

    // « au siège » remplacé par « à Orion » (nom fictif) : le terme est
    // « Orion ».
    let generated = "Le dossier part au siège demain.";
    let sent = "Le dossier part à Orion demain.";
    let report = measure(generated, Format::Text, sent, Format::Text, &before).unwrap();
    let orion = Dictionary::new(["Orion"])
        .unwrap()
        .with_term_key(KEY)
        .hashes();
    let hashes: Vec<_> = report.corrected_terms.iter().map(|t| &t.hash).collect();
    assert_eq!(hashes, [&orion[0]]);
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

// --- Invariance au format et à la typographie (issue 729) -----------------
// Noms fictifs uniquement.

const RICH: &str = "# Résumé de la réunion

L'équipe a présenté « le plan » — validé à 95 %… Hélène Dubreuil confirme.

## Décisions

- Reporter l'audit à février ; prévenir François.
- Garder l'outil peut-être jusqu'à l'été.

## Actions

- Écrire à Noël Garçon (cœur du projet).
";

const RICH_HTML: &str = "<h1>Résumé de la réunion</h1><p>L'équipe a présenté « le plan » — validé à 95 %… Hélène Dubreuil confirme.</p><h2>Décisions</h2><ul><li>Reporter l'audit à février ; prévenir François.</li><li>Garder l'outil peut-être jusqu'à l'été.</li></ul><h2>Actions</h2><ul><li>Écrire à Noël Garçon (cœur du projet).</li></ul>";

/// Chaque caractère non ASCII encodé par `encode` ; les balises sont en
/// ASCII et restent intactes.
fn encode_non_ascii(html: &str, encode: impl Fn(char) -> String) -> String {
    html.chars()
        .map(|c| {
            if c.is_ascii() {
                c.to_string()
            } else {
                encode(c)
            }
        })
        .collect()
}

/// Entité nommée d'un caractère, la plus courte de la table HTML5.
fn named_entity(c: char) -> String {
    let target = c.to_string();
    crate::entities::NAMED_ENTITIES
        .iter()
        .filter(|(_, value)| *value == target)
        .map(|(name, _)| *name)
        .min_by_key(|name| (name.len(), *name))
        .map_or_else(|| format!("&#{};", c as u32), |name| format!("&{name};"))
}

fn assert_no_rework(sent: &str, sent_format: Format) {
    let report = measure(
        RICH,
        Format::Markdown,
        sent,
        sent_format,
        &Dictionary::default(),
    )
    .unwrap();
    assert!(report.aligned, "{sent}");
    assert_eq!(report.headings_matched, 3, "{sent}");
    assert_eq!(report.total, counters(35, 0, 0, 0, 0), "{sent}");
}

#[test]
fn utf8_named_and_numeric_entities_give_no_rework() {
    assert_no_rework(RICH_HTML, Format::Html);
    let named = encode_non_ascii(RICH_HTML, named_entity);
    assert!(named.contains("&eacute;") && named.contains("&laquo;") && named.contains("&mdash;"));
    assert_no_rework(&named, Format::Html);
    assert_no_rework(
        &encode_non_ascii(RICH_HTML, |c| format!("&#{};", c as u32)),
        Format::Html,
    );
    assert_no_rework(
        &encode_non_ascii(RICH_HTML, |c| format!("&#x{:X};", c as u32)),
        Format::Html,
    );
    // Entités aussi dans un Markdown envoyé (CommonMark les décode).
    assert_no_rework(&encode_non_ascii(RICH, named_entity), Format::Markdown);
}

#[test]
fn typographic_variants_alone_give_no_rework() {
    let markdown = "# Résumé de la réu\u{ad}nion

L’équipe a présenté «\u{a0}le plan\u{a0}» – validé à 95\u{202f}%... Hélène\u{200b} Dubreuil conﬁrme.

## 1. Décisions :

- Reporter l‘audit à février\u{202f}; prévenir François.
- Garder l’outil peut\u{2011}être jusqu’à l’été.

## Actions

- E\u{301}crire à Noël Garçon (cœur du projet).
";
    assert_no_rework(markdown, Format::Markdown);
    // Collage HTML : balises en ligne au milieu d'un mot, retour à la ligne
    // dans un titre et dans un paragraphe, `<br>` entre deux phrases.
    let html = "<h1>Résumé de la\n  réunion</h1><p>L&rsquo;<span>équipe</span> a <b>pré</b>senté &laquo;&nbsp;le plan&nbsp;&raquo; &ndash; validé à 95&#8239;%&hellip;<br>H<i>él</i>ène Dubreuil confirme.</p><h2>\nDécisions\n</h2><ul><li>Reporter l&#146;audit à février ; prévenir Fran&shy;çois.</li><li>Garder l'outil peut&#x2011;être jusqu'à l'été.</li></ul><h2>Actions</h2><ul><li>Écrire à Noël Garçon (c&oelig;ur du projet).</li></ul>";
    assert_no_rework(html, Format::Html);
}

// Test de sensibilité : la même retouche, encodée ou non, donne les mêmes
// compteurs, non nuls (une normalisation qui effacerait tout passerait le
// test d'invariance).
#[test]
fn the_same_edit_counts_the_same_in_every_encoding() {
    let edited = RICH_HTML
        .replace("février", "mars")
        .replace("Dubreuil", "Dubreuille")
        .replace("(cœur du projet)", "(cœur du projet, avant l'été)");
    let measure_html = |html: &str| {
        measure(
            RICH,
            Format::Markdown,
            html,
            Format::Html,
            &Dictionary::default(),
        )
        .unwrap()
        .total
    };
    // « février » → « mars » (fond), « Dubreuil » → « Dubreuille » (nom
    // propre), « avant l'été » ajouté (2 mots).
    let expected = counters(35, 2, 0, 1, 1);
    assert_eq!(measure_html(&edited), expected);
    assert_eq!(
        measure_html(&encode_non_ascii(&edited, named_entity)),
        expected
    );
    assert_eq!(
        measure_html(&encode_non_ascii(&edited, |c| format!("&#{};", c as u32))),
        expected
    );
}

#[test]
fn heading_numbers_and_typography_are_ignored_in_titles() {
    for (title, key) in [
        ("2. Décisions :", "décisions"),
        ("1.3) Plan d’action", "plan d'action"),
        ("IV. Prochaines étapes", "prochaines étapes"),
        ("b) Risques", "risques"),
        ("Suivi\u{a0}:", "suivi"),
        ("2024", "2024"),
        ("Bilan 2024", "bilan 2024"),
        ("Vision", "vision"),
    ] {
        assert_eq!(title_key(title), key, "{title}");
    }
    assert_eq!(
        SectionRole::from_title(Some(&title_key("3. Plan d’action"))),
        SectionRole::Actions
    );
}

// --- Appariement des sections (issue 730) ---------------------------------
// Noms fictifs uniquement.

const DEMO: &str = "# Contexte

Le comité a revu le calendrier du pilote.

## Démo pour l'équipe Dupond

Présenter le prototype vendredi aux testeurs.

## Budget

Le budget reste stable cette année.

## Actions

- Envoyer la synthèse aux participants.
";

#[test]
fn a_title_corrected_by_one_word_counts_one_lexical_word() {
    let sent = DEMO.replace("équipe Dupond", "équipe Dupont");
    let report = run(DEMO, &sent);
    assert!(report.aligned);
    assert_eq!(report.headings_matched, 4);
    assert!(report.sections.iter().all(|s| s.matched));
    assert_eq!(report.unmatched_sent_words, 0);
    // « Dupond » → « Dupont » : nom propre, 1 mot lexical, rien d'autre.
    assert_eq!(report.sections[1].counters.replaced_lexical, 1);
    assert_eq!(
        report.total,
        Counters {
            replaced_lexical: 1,
            ..run(DEMO, DEMO).total
        }
    );
    // Faute de frappe sur un mot ordinaire du titre : 1 mot de fond.
    let sent = DEMO.replace("## Budget", "## Bugdet");
    let report = run(DEMO, &sent);
    assert!(report.sections.iter().all(|s| s.matched));
    assert_eq!(report.total.replaced_content, 1);
    assert_eq!(report.total.added + report.total.deleted, 0);
}

#[test]
fn a_title_sharing_half_its_words_needs_shared_content() {
    // Titre allongé, contenu identique : appariée, les mots ajoutés au titre
    // comptent seuls.
    let sent = DEMO.replace("## Budget", "## Budget prévisionnel");
    let report = run(DEMO, &sent);
    assert!(report.sections[2].matched);
    assert_eq!(report.total.added, 1);
    assert_eq!(report.total.deleted, 0);
    // Titre proche mais contenu sans rapport : non appariée.
    let sent = DEMO.replace(
        "## Budget\n\nLe budget reste stable cette année.",
        "## Budget annexe\n\nLa salle du jeudi change de bâtiment.",
    );
    let report = run(DEMO, &sent);
    assert!(!report.sections[2].matched);
    assert_eq!(report.sections[2].counters.deleted, 7);
    assert_eq!(report.unmatched_sent_words, 9);
}

#[test]
fn swapped_sections_stay_matched() {
    let sent = "# Contexte

Le comité a revu le calendrier du pilote.

## Budget

Le budget reste stable cette année.

## Démo pour l'équipe Dupond

Présenter le prototype vendredi aux testeurs.

## Actions

- Envoyer la synthèse aux participants.
";
    let report = run(DEMO, sent);
    assert!(report.sections.iter().all(|s| s.matched));
    assert_eq!(report.unmatched_sent_words, 0);
    assert_eq!(report.total, run(DEMO, DEMO).total);
}

// Un titre proche n'est cherché qu'entre les deux titres identiques qui
// l'encadrent : une section déplacée et retitrée ne s'apparie pas.
#[test]
fn near_titles_are_only_matched_between_their_anchors() {
    let sent = "# Contexte

Le comité a revu le calendrier du pilote.

## Budget

Le budget reste stable cette année.

## Actions

- Envoyer la synthèse aux participants.

## Démo pour l'équipe Dupont

Présenter le prototype vendredi aux testeurs.
";
    let report = run(DEMO, sent);
    assert!(!report.sections[1].matched);
    assert_eq!(report.headings_matched, 3);
}

#[test]
fn heading_matching_helpers() {
    assert_eq!(edit_distance("Dupond", "Dupont"), 1);
    assert_eq!(edit_distance("", "abc"), 3);
    assert_eq!(edit_distance("équipe", "equipe"), 1);
    let words = |text: &str| -> Vec<String> { text.split(' ').map(str::to_owned).collect() };
    assert_eq!(common_count(&words("a b b c"), &words("b b b d")), 2);
    assert_eq!(
        increasing_subsequence(&[Some(0), Some(3), None, Some(1), Some(2), Some(4)]),
        vec![0, 3, 4, 5]
    );
    assert_eq!(increasing_subsequence(&[None, None]), Vec::<usize>::new());
}

// Titres en double (issue 730, relecture) : `sections` fusionne les sections
// de même clé de titre de chaque côté, avant l'appariement. Chaque section
// envoyée sert donc au plus une fois, et une occurrence sans homologue compte
// en suppressions.
const TWO_TOPICS: &str = "# Sujet A

Le comité valide le calendrier.

## Décisions

- Garder le prestataire actuel.

# Sujet B

Le budget du pilote est revu.

## Décisions

- Reporter la formation en mars.
";

fn prepared(generated: &str, sent: &str) -> Prepared {
    prepare(generated, Format::Markdown, sent, Format::Markdown).unwrap()
}

fn assert_one_to_one(prepared: &Prepared) {
    let mut used: Vec<usize> = prepared.matches.iter().flatten().copied().collect();
    let count = used.len();
    used.sort_unstable();
    used.dedup();
    assert_eq!(used.len(), count, "{:?}", prepared.matches);
}

#[test]
fn duplicate_titles_on_both_sides_are_matched_once() {
    let p = prepared(TWO_TOPICS, TWO_TOPICS);
    assert_one_to_one(&p);
    assert_eq!(p.generated.len(), 3);
    assert_eq!(run(TWO_TOPICS, TWO_TOPICS).total.added, 0);
    assert_eq!(run(TWO_TOPICS, TWO_TOPICS).total.deleted, 0);
}

#[test]
fn a_duplicate_title_without_counterpart_counts_as_deleted() {
    let sent = "# Sujet A

Le comité valide le calendrier.

## Décisions

- Garder le prestataire actuel.

# Sujet B

Le budget du pilote est revu.
";
    let p = prepared(TWO_TOPICS, sent);
    assert_one_to_one(&p);
    let report = run(TWO_TOPICS, sent);
    // Seconde « Décisions » : son titre (1 mot) et son corps (5 mots)
    // comptent en suppressions, rien n'est apparié deux fois.
    assert_eq!(report.total.deleted, 6);
    assert_eq!(report.total.added, 0);
    assert_eq!(report.unmatched_sent_words, 0);
}

// --- Classement v2 (issue 732) -------------------------------------------
// Noms fictifs uniquement.

fn text_total(generated: &str, sent: &str, dictionary: &Dictionary) -> Counters {
    measure(generated, Format::Text, sent, Format::Text, dictionary)
        .unwrap()
        .total
}

#[test]
fn a_mixed_replacement_is_split_word_by_word() {
    // Exemple de l'issue : le nom corrigé est lexical, le nom ajouté est du
    // fond.
    let total = text_total(
        "Réunion animée par Dupond hier.",
        "Réunion animée par Durand, Dupont hier.",
        &Dictionary::default(),
    );
    assert_eq!(total, counters(5, 1, 0, 0, 1));
    // Prénom corrigé, nom ajouté après lui.
    let total = text_total(
        "Validé avec Emmanuel ce matin.",
        "Validé avec Emmanuelle Garnier ce matin.",
        &Dictionary::default(),
    );
    assert_eq!(total, counters(5, 1, 0, 0, 1));
    // Aucun mot proche : remplacement classé d'un bloc, comme en v1.
    let total = text_total(
        "Le budget est validé par la direction.",
        "Le budget est validé par le comité de direction.",
        &Dictionary::default(),
    );
    assert_eq!(total, counters(7, 0, 0, 3, 0));
}

#[test]
fn corrections_around_function_words_are_counted_one_by_one() {
    let generated = "Hier, Martin de la DSI présente le plan.";
    let sent = "Hier, Marten de la DRH présente le plan.";
    // Deux corrections lexicales, les mots-outils ne comptent pas.
    assert_eq!(
        text_total(generated, sent, &Dictionary::default()),
        counters(8, 0, 0, 0, 2)
    );
    let mut found = Vec::new();
    let prepared = prepare(generated, Format::Text, sent, Format::Text).unwrap();
    for pair in prepared.pairs() {
        pair.diff(&Dictionary::default(), |old, new, change| {
            found.push((old.len(), new.len(), change));
        });
    }
    assert_eq!(found.len(), 2);
    assert!(
        found
            .iter()
            .all(|(o, n, c)| *o == 1 && *n == 1 && c.lexical)
    );
}

// Relecture de l'issue 732 : cas où une fusion par-dessus les mots-outils
// minorait la reprise. Sans fusion, chaque différence garde ses mots.
#[test]
fn a_function_word_between_two_differences_never_lowers_the_count() {
    // Le « de » de l'écart s'appariait à l'autre « de » : Rl=2, fond 0.
    assert_eq!(
        text_total(
            "Voir Martin de Lyon.",
            "Voir de Durand de Lyon.",
            &Dictionary::default()
        ),
        counters(4, 2, 1, 0, 0)
    );
    // Écart de ponctuation seule : une suppression et un ajout, pas un
    // remplacement d'un mot.
    assert_eq!(
        text_total(
            "Le budget validé, envoi lundi.",
            "Le budget, nouveau envoi lundi.",
            &Dictionary::default()
        ),
        counters(5, 1, 1, 0, 0)
    );
}

// Un mot-outil ne s'apparie pas à un mot voisin (« les » et « des ») : il ne
// découpe pas une reformulation en morceaux lexicaux.
#[test]
fn function_words_are_never_near_pairs() {
    let total = text_total(
        "Le comité Durand transmettra les chiffres demain.",
        "Le comité Durand publiera des tableaux demain.",
        &Dictionary::default(),
    );
    assert_eq!(total.replaced_lexical, 0, "{total:?}");
    assert_eq!(total.replaced_content, 3, "{total:?}");
    let token = |text: &str| Token {
        text: text.to_owned(),
        key: normalize::comparison_key(text),
        word: true,
        sentence_start: false,
    };
    assert_eq!(near_words(&token("les"), &token("des")), None);
    assert_eq!(near_words(&token("sur"), &token("sous")), None);
    assert_eq!(near_words(&token("15h"), &token("16h")), None);
    assert_eq!(near_words(&token("Dupond"), &token("Dupont")), Some(1));
    assert_eq!(near_words(&token("Dupond"), &token("Durand")), Some(2));
    assert_eq!(near_words(&token("cri"), &token("CRI")), Some(0));
}

// La paire la plus proche gagne, quel que soit l'ordre des mots.
#[test]
fn the_closest_word_is_paired_in_any_order() {
    for sent in ["Signé par Durand, Dupont.", "Signé par Dupont, Durand."] {
        let mut lexical = Vec::new();
        let prepared = prepare("Signé par Dupond.", Format::Text, sent, Format::Text).unwrap();
        for pair in prepared.pairs() {
            pair.diff(&Dictionary::default(), |old, new, change| {
                if change.kind == ChangeKind::Replaced {
                    lexical.push((old[0].text.clone(), new[0].text.clone()));
                }
            });
        }
        assert_eq!(
            lexical,
            [("Dupond".to_owned(), "Dupont".to_owned())],
            "{sent}"
        );
    }
}

// Coût borné : un très long mot qui change d'une lettre ne fait pas exploser
// le temps de calcul (distance d'édition bornée).
#[test]
fn near_word_distance_is_bounded() {
    let long = "a".repeat(20_000);
    let started = std::time::Instant::now();
    let total = text_total(
        &format!("Mot {long}x fin."),
        &format!("Mot {long}y fin."),
        &Dictionary::default(),
    );
    assert_eq!(total.replaced_content, 1);
    assert!(
        started.elapsed() < std::time::Duration::from_secs(2),
        "{:?}",
        started.elapsed()
    );
}

#[test]
fn repeated_words_count_a_single_change() {
    // Statuts répétés d'un tableau : un seul statut change.
    let generated = "Tâche A : fait. Tâche B : fait. Tâche C : fait. Tâche D : fait.";
    let sent = "Tâche A : fait. Tâche B : fait. Tâche C : bloqué. Tâche D : fait.";
    assert_eq!(
        text_total(generated, sent, &Dictionary::default()),
        counters(12, 0, 0, 1, 0)
    );
    // Une ligne retirée au milieu : ses trois mots, rien d'autre.
    let sent = "Tâche A : fait. Tâche C : fait. Tâche D : fait.";
    assert_eq!(
        text_total(generated, sent, &Dictionary::default()),
        counters(12, 0, 3, 0, 0)
    );
}

#[test]
fn dictionary_terms_and_joins_stay_lexical() {
    let dictionary = Dictionary::new(["Nemotron"]).unwrap();
    // Mot coupé en deux, sans mot proche : bloc court, terme du
    // dictionnaire, lexical.
    assert_eq!(
        text_total(
            "Le modèle nemo tron répond.",
            "Le modèle nemotron répond.",
            &dictionary
        ),
        counters(5, 0, 0, 0, 2)
    );
    // Faute de frappe sur un mot ordinaire : 1 mot de fond.
    assert_eq!(
        text_total(
            "Le calendier tient.",
            "Le calendrier tient.",
            &Dictionary::default()
        ),
        counters(3, 0, 0, 1, 0)
    );
}

#[test]
fn function_word_list_is_lowercase_and_unique() {
    for word in FUNCTION_WORDS {
        assert_eq!(*word, word.to_lowercase(), "{word}");
        assert_eq!(*word, normalize::comparison_key(word), "{word}");
    }
    let mut sorted: Vec<&str> = FUNCTION_WORDS.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), FUNCTION_WORDS.len());
}

#[test]
fn rule_version_is_four() {
    assert_eq!(RULE_VERSION, 4);
    assert_eq!(run(GENERATED, GENERATED).rule_version, 4);
}

// Texte brut collé (issue 730, suite) : un titre corrigé d'un mot ouvre
// encore sa section ; une ligne de corps qui ressemble à un titre sans le
// critère (a) n'ouvre rien. Noms fictifs.
#[test]
fn a_plain_text_line_one_word_from_a_title_opens_its_section() {
    let generated = "# Démo pour l'équipe Dupond\n\nPrésenter le prototype vendredi.\n\n## Budget\n\nLe budget reste stable.\n";
    let sent = "Démo pour l'équipe Dupont\nPrésenter le prototype vendredi.\nBudget\nLe budget reste stable.\n";
    let report = measure(
        generated,
        Format::Markdown,
        sent,
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert!(report.sections.iter().all(|s| s.matched), "{report:?}");
    assert_eq!(report.total.replaced_lexical, 1);
    assert_eq!(
        report.total.added + report.total.deleted + report.total.replaced_content,
        0
    );

    // Deux mots de différence : pas un titre, la ligne reste du corps.
    let sent = "Démo pour la direction Dupont\nPrésenter le prototype vendredi.\nBudget\nLe budget reste stable.\n";
    let report = measure(
        generated,
        Format::Markdown,
        sent,
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert!(!report.sections[0].matched);
    assert!(report.sections[1].matched);

    // Le critère (b) (moitié des mots en commun) ne s'applique pas à une
    // ligne de corps.
    let sent =
        "Démo pour l'équipe\nPrésenter le prototype vendredi.\nBudget\nLe budget reste stable.\n";
    let report = measure(
        generated,
        Format::Markdown,
        sent,
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert!(!report.sections[0].matched);
}

// --- Garde-fous (issue 733) ------------------------------------------------
// Noms fictifs uniquement.

fn html_report(sent: &str) -> Report {
    measure(
        GENERATED,
        Format::Markdown,
        sent,
        Format::Html,
        &Dictionary::default(),
    )
    .unwrap()
}

// Collage encodé deux fois (`&amp;eacute;`) : après décodage, le texte
// montre encore `&eacute;`, comme la page d'origine. La lecture a échoué.
#[test]
fn a_paste_with_undecoded_entities_is_refused() {
    let sent = "<h1>R&eacute;sum&eacute;</h1><p>Le projet avance bien. Le budget est valid&eacute; par la direction.</p><h2>D&eacute;cisions</h2><ul><li>Lancer le pilote en janvier avec Martin.</li><li>Garder le serveur actuel.</li></ul><h2>Actions</h2><ul><li>Envoyer le compte rendu &agrave; l&amp;rsquo;&amp;eacute;quipe.</li></ul>";
    let report = html_report(sent);
    assert_eq!(report.controls.residual_entities, 2);
    assert_eq!(report.status, MeasureStatus::Refused);
    assert_eq!(report.status_reasons, [StatusReason::EntityLeft]);
}

#[test]
fn too_few_words_kept_is_refused() {
    let report = run(
        GENERATED,
        "# Résumé\n\nTout a été réécrit autrement.\n\n## Décisions\n\nRien ne reste.\n\n## Actions\n\nAucune phrase commune.\n",
    );
    assert!(report.controls.generated_kept_words * 2 < report.total.generated);
    assert_eq!(report.status, MeasureStatus::Refused);
    assert_eq!(report.status_reasons, [StatusReason::TooFewWordsKept]);
}

#[test]
fn global_alignment_and_missing_sections_are_doubtful() {
    // Texte sans titres : mesure globale.
    let sent = "Le projet avance bien. Le budget est validé par la direction. Lancer le pilote en janvier avec Martin. Garder le serveur actuel. Envoyer le compte rendu à l'équipe.";
    let report = measure(
        GENERATED,
        Format::Markdown,
        sent,
        Format::Text,
        &Dictionary::default(),
    )
    .unwrap();
    assert_eq!(report.status, MeasureStatus::Doubtful);
    assert_eq!(report.status_reasons, [StatusReason::GlobalAlignment]);
    // Section « Actions » absente : 7 mots sur 31, plus de 10 %.
    let sent = "# Résumé\n\nLe projet avance bien. Le budget est validé par la direction.\n\n## Décisions\n\n- Lancer le pilote en janvier avec Martin.\n- Garder le serveur actuel.\n";
    let report = run(GENERATED, sent);
    assert_eq!(report.controls.deleted_section_words, 7);
    assert_eq!(report.status, MeasureStatus::Doubtful);
    assert_eq!(report.status_reasons, [StatusReason::UnmatchedSections]);
}

#[test]
fn a_near_title_is_reported_and_an_identical_text_is_ok() {
    let report = run(GENERATED, GENERATED);
    assert_eq!(report.status, MeasureStatus::Ok);
    assert_eq!(report.guard_version, GUARD_VERSION);
    assert_eq!(report.controls.generated_kept_words, report.total.generated);
    assert_eq!(report.controls.sections_matched_exact, 3);
    assert_eq!(report.controls.sections_matched_near, 0);
    let report = run(GENERATED, &GENERATED.replace("## Actions", "## Action"));
    assert_eq!(report.controls.sections_matched_exact, 2);
    assert_eq!(report.controls.sections_matched_near, 1);
    assert_eq!(report.status, MeasureStatus::Ok);
}

#[test]
fn guard_thresholds_use_integers_at_the_boundary() {
    let controls = |kept, deleted| Controls {
        generated_kept_words: kept,
        deleted_section_words: deleted,
        ..Controls::default()
    };
    // Exactement 50 % retrouvés : pas refusé ; exactement 10 % non
    // retrouvés : pas douteux.
    assert_eq!(guard(100, true, &controls(50, 10)).0, MeasureStatus::Ok);
    assert_eq!(guard(100, true, &controls(49, 0)).0, MeasureStatus::Refused);
    assert_eq!(
        guard(100, true, &controls(100, 11)).0,
        MeasureStatus::Doubtful
    );
    assert_eq!(guard(0, true, &controls(0, 0)).0, MeasureStatus::Ok);
}

#[test]
fn residual_entities_are_counted_in_linear_time() {
    // Entités connues et références numériques seulement : `&foo;` ou
    // `R&D;` ne sont pas des entités.
    assert_eq!(
        normalize::residual_entities("a &foo; b &#12; &nbsp; &#xZ; & ; &1x; &abc R&D;"),
        2
    );
    let started = std::time::Instant::now();
    assert_eq!(normalize::residual_entities(&"&".repeat(1_000_000)), 0);
    assert_eq!(normalize::residual_entities(&"&a".repeat(500_000)), 0);
    assert!(started.elapsed() < std::time::Duration::from_secs(2));
}

// Relecture de l'issue 733 : une entité citée volontairement des deux côtés
// ne fait pas refuser la mesure ; une section retitrée garde ses mots
// retrouvés (douteux au plus, jamais refusé pour cela).
#[test]
fn quoted_entities_and_renamed_sections_are_not_refused() {
    for (text, format) in [
        (
            "# Note\n\nRemplacez &amp;nbsp; par une espace.\n",
            Format::Markdown,
        ),
        ("# Note\n\n```\nTom &amp; Jerry\n```\n", Format::Markdown),
        (
            "<h1>Note</h1><p>Remplacez &amp;nbsp; par une espace.</p>",
            Format::Html,
        ),
        ("Note\nQ&A; demain, R&D; ensuite.\n", Format::Text),
    ] {
        let report = measure(text, format, text, format, &Dictionary::default()).unwrap();
        assert_eq!(report.controls.residual_entities, 0, "{text}");
        assert!(
            !report.status_reasons.contains(&StatusReason::EntityLeft),
            "{text}"
        );
        assert_ne!(report.status, MeasureStatus::Refused, "{text}");
    }
    let generated = "# Compte rendu\n\n## Participants\n\nHélène, Bastien.\n\n## Points abordés\n\nLe prestataire livre la deuxième version du portail et les tests d'accessibilité commencent la semaine prochaine avec les équipes des trois sites, puis un bilan sera présenté au comité de pilotage du mois suivant avec les premiers résultats et les difficultés rencontrées.\n\n## Décisions\n\nGarder le prestataire.\n\n## Actions\n\nEnvoyer le compte rendu.\n";
    let sent = generated.replace("## Points abordés", "## Discussion");
    let report = run(generated, &sent);
    assert!(report.controls.generated_kept_words + 2 >= report.total.generated);
    assert_eq!(report.status, MeasureStatus::Doubtful);
    assert_eq!(report.status_reasons, [StatusReason::UnmatchedSections]);
}

// L'outil d'agrégation recalcule le statut avec ses propres seuils : ils
// doivent rester ceux du crate pour la version courante des garde-fous.
#[test]
fn aggregation_tool_uses_the_crate_guard_thresholds() {
    // Espaces et retours à la ligne fusionnés : indépendant du formatage.
    let tool: String = include_str!("../../../scripts/beta/agregation.mjs")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let line = format!(
        "{GUARD_VERSION}: {{ mots_retrouves_min_pourcent: {MIN_KEPT_PERCENT}, sections_non_retrouvees_max_pourcent: {MAX_UNMATCHED_PERCENT}, }}"
    );
    assert!(tool.contains(&line), "{line}");
}

// --- Règle v4 (issue 767) ------------------------------------------------
// Une ligne de corps identique à un titre généré n'ouvre pas de section dans
// une copie identique : le titre reste le titre, la ligne reste du corps.

const TITLE_IN_BODY: &str = "# Point d'étape Orphée

Le projet avance selon le calendrier prévu.

## Contexte

Point d'étape Orphée

Le chantier de Valbrune tient ses délais malgré la pluie.

## Décisions

- Garder le prestataire actuel.
";

const TITLE_BEFORE_HEADING: &str = "# Revue du lot Hélianthe

Le lot avance.

- Décisions

Les points ci-dessous ont été tranchés en séance.

## Décisions

- Garder le prestataire actuel.
- Reporter la recette au printemps.
";

fn html_of(markdown: &str) -> String {
    markdown
        .split("\n\n")
        .filter(|block| !block.trim().is_empty())
        .map(|block| {
            let block = block.trim();
            if let Some(t) = block.strip_prefix("## ") {
                format!("<h2>{t}</h2>")
            } else if let Some(t) = block.strip_prefix("# ") {
                format!("<h1>{t}</h1>")
            } else if let Some(t) = block.strip_prefix("- ") {
                let items: Vec<String> = std::iter::once(t)
                    .chain(block.lines().skip(1).map(|l| l.trim_start_matches("- ")))
                    .map(|l| format!("<li>{}</li>", l.lines().next().unwrap_or(l)))
                    .collect();
                format!("<ul>{}</ul>", items.join(""))
            } else {
                format!("<p>{block}</p>")
            }
        })
        .collect()
}

fn text_of(markdown: &str) -> String {
    markdown
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            l.trim_start_matches("## ")
                .trim_start_matches("# ")
                .trim_start_matches("- ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn a_body_line_repeating_a_title_gives_no_rework_on_an_identical_copy() {
    for generated in [TITLE_IN_BODY, TITLE_BEFORE_HEADING] {
        let words = run(generated, generated).total.generated;
        for (name, sent, format) in [
            ("markdown", generated.to_owned(), Format::Markdown),
            ("html", html_of(generated), Format::Html),
            ("text", text_of(generated), Format::Text),
        ] {
            let report = measure(
                generated,
                Format::Markdown,
                &sent,
                format,
                &Dictionary::default(),
            )
            .unwrap();
            assert!(report.aligned, "{name}");
            assert_eq!(report.headings_matched, report.headings_generated, "{name}");
            assert_eq!(report.total, counters(words, 0, 0, 0, 0), "{name}");
            assert_eq!(report.content_per_mille, Some(0.0), "{name}");
        }
    }
}

// Un titre perdu au collage (wiki) reste retrouvé par sa ligne, même quand
// la même ligne figure aussi dans le corps.
#[test]
fn a_pasted_title_is_still_found_when_a_body_line_repeats_it() {
    let sent = TITLE_IN_BODY.replace("## Contexte", "Contexte");
    let report = run(TITLE_IN_BODY, &sent);
    assert!(report.aligned);
    assert_eq!(report.headings_matched, report.headings_generated);
    assert_eq!(report.total.added + report.total.deleted, 0);
}
