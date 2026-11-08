//! Non-régression du format des notes sur le chemin réel de l'application
//! (`ParsedDocument`, frontmatter converti en JSON puis réécrit en YAML).
//!
//! Les notes viennent de `crates/frontmatter/tests/fixtures/notes` ; chacune est
//! lue puis réécrite, et le résultat doit être identique, à l'octet près, au
//! fichier de `tests/fixtures/attendu`. Une note déjà réécrite doit ensuite
//! ressortir inchangée.
//!
//! Les fichiers attendus ont été produits avec `serde_yaml` 0.9 avant son
//! remplacement. Pour les régénérer volontairement :
//! `FRONTMATTER_BLESS=1 cargo test -p fs-sync-core --test notes_reelles`.

use std::{fs, path::PathBuf, str::FromStr};

use fs_sync_core::frontmatter::ParsedDocument;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn notes() -> Vec<(String, String)> {
    let dir = manifest_dir().join("../frontmatter/tests/fixtures/notes");
    let mut notes: Vec<_> = fs::read_dir(&dir)
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

fn rewrite(input: &str) -> String {
    ParsedDocument::from_str(input).unwrap().render().unwrap()
}

#[test]
fn notes_reecrites_a_l_octet_pres() {
    let bless = std::env::var_os("FRONTMATTER_BLESS").is_some();
    let attendu = manifest_dir().join("tests/fixtures/attendu");

    for (name, input) in notes() {
        let output = rewrite(&input);
        let path = attendu.join(&name);

        if bless {
            fs::create_dir_all(&attendu).unwrap();
            fs::write(&path, &output).unwrap();
        }
        let expected =
            fs::read(&path).unwrap_or_else(|_| panic!("{name} : fichier attendu absent"));
        assert_eq!(
            output.as_bytes(),
            expected.as_slice(),
            "{name} : réécriture différente\n--- obtenu ---\n{output}"
        );

        assert_eq!(
            rewrite(&output),
            output,
            "{name} : la réécriture n'est pas stable"
        );
    }
}

#[test]
fn note_crlf_reecrite_a_l_octet_pres() {
    let input = "---\r\ntitle: Réunion\r\ntags:\r\n  - été\r\n---\r\n\r\nLigne 1\r\nLigne 2";
    let output = rewrite(input);
    assert_eq!(
        output,
        "---\ntags:\n- été\ntitle: Réunion\n---\n\nLigne 1\r\nLigne 2"
    );
    assert_eq!(rewrite(&output), output);
}
