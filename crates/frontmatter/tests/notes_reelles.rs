//! Non-régression du format des notes : chaque note de `fixtures/notes` est lue
//! puis réécrite, et le résultat doit être identique, à l'octet près, au fichier
//! attendu de `fixtures/attendu`. Une note déjà réécrite doit ensuite ressortir
//! inchangée (une note écrite par l'application ne bouge plus).
//!
//! Les fichiers attendus ont été produits avec `serde_yaml` 0.9 avant son
//! remplacement : ils figent le format que les notes des utilisateurs ont déjà.
//! Pour les régénérer volontairement : `FRONTMATTER_BLESS=1 cargo test -p frontmatter`.

use std::{
    fs,
    path::{Path, PathBuf},
    str::FromStr,
};

use frontmatter::{Document, Error};

type Note = Document<serde_json::Value>;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn notes() -> Vec<(String, String)> {
    let mut notes: Vec<_> = fs::read_dir(fixtures().join("notes"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "md"))
        .map(|path| {
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            (name, fs::read_to_string(&path).unwrap())
        })
        .collect();
    notes.sort();
    assert!(notes.len() >= 8, "fixtures manquantes : {notes:?}");
    notes
}

fn rewrite(input: &str) -> Result<String, Error> {
    Note::from_str(input)?.render()
}

#[test]
fn notes_reecrites_a_l_octet_pres() {
    let bless = std::env::var_os("FRONTMATTER_BLESS").is_some();
    let attendu = fixtures().join("attendu");

    for (name, input) in notes() {
        let expected_path = attendu.join(&name);
        let output = match rewrite(&input) {
            Ok(output) => output,
            Err(Error::MissingOpeningDelimiter) => {
                assert!(
                    !expected_path.exists(),
                    "{name} : sans frontmatter, aucun fichier attendu"
                );
                continue;
            }
            Err(error) => panic!("{name} : {error}"),
        };

        if bless {
            fs::create_dir_all(&attendu).unwrap();
            fs::write(&expected_path, &output).unwrap();
        }
        let expected =
            fs::read(&expected_path).unwrap_or_else(|_| panic!("{name} : fichier attendu absent"));
        assert_eq!(
            output.as_bytes(),
            expected.as_slice(),
            "{name} : réécriture différente\n--- obtenu ---\n{output}"
        );

        let again = rewrite(&output).unwrap();
        assert_eq!(again, output, "{name} : la réécriture n'est pas stable");
    }
}

#[test]
fn note_crlf_reecrite_a_l_octet_pres() {
    let input = "---\r\ntitle: Réunion\r\ntags:\r\n  - été\r\n---\r\n\r\nLigne 1\r\nLigne 2";
    let output = rewrite(input).unwrap();
    assert_eq!(
        output,
        "---\ntags:\n- été\ntitle: Réunion\n---\n\nLigne 1\r\nLigne 2"
    );
    assert_eq!(rewrite(&output).unwrap(), output);
}
