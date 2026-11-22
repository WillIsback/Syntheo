# Audio de mise en service

La mise en service du module (issue 686) mesure chaque profil sur 30 s d'audio, en deux flux comme une écoute : `mic.wav` (micro) et `sys.wav` (son du poste), 16 kHz, mono, PCM16. Les deux fichiers sont livrés dans le module, sous `commissioning/`, et listés dans le manifeste signé. La signature du manifeste les exige.

- **Source** : Multilingual LibriSpeech (MLS), partie française, à une révision figée ; deux locuteurs et deux livres LibriVox (domaine public). Voir `sources.json` et `ATTRIBUTION.md`, copiée dans les licences du module.
- **Préparation** : `uv run --locked --script prepare.py <dossier neuf>` télécharge le fichier source, vérifie son empreinte, décode les énoncés listés, les rééchantillonne en 16 kHz et insère 1,2 s de silence aux pauses naturelles de la lecture. Le module ferme ainsi un énoncé toutes les quelques secondes, comme aux tours de parole d'une réunion, ce qui donne des finals à mesurer. Deux exécutions redonnent les mêmes empreintes, celles de `sources.json`.
