# Corpus synthétique de la mesure de reprise

Comptes rendus **fictifs** (noms, lieux et chiffres inventés), versionnés pour
les tests de propriétés du crate `mesure` (issue 734) : `src/corpus_tests.rs`
les rend en Markdown, HTML (UTF-8, entités nommées et numériques), texte et
`.docx`, puis vérifie les propriétés de la règle de calcul.

Format accepté par le rendu des tests, et seulement lui : titres `#` et `##`,
puces `-`, paragraphes d'une ligne, lignes vides. Pas de tableau (issue 731).

`FINGERPRINTS` associe chaque version de la règle (`RULE_VERSION`) à
l'empreinte SHA-256 des sorties du corpus. Si les sorties changent, le test
`corpus_outputs_match_the_rule_version_fingerprint` échoue : incrémentez
`RULE_VERSION`, datez la spec, puis ajoutez une ligne. Ne modifiez jamais une
ligne existante, et n'ajoutez jamais de texte réel ici.
