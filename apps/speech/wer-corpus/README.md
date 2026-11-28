# Corpus de WER français

Corpus de mesure du taux d'erreur sur les mots (WER) de la transcription en français, publié sur la page « Qualité en français » de la documentation (`docs/fr/french-quality.mdx`, issue 788) et dans la section « Accuracy » de `../models/model-card.md`. 150 énoncés de parole lue (29,6 min, 4 480 mots après normalisation) : 100 de FLEURS `fr_fr` (split test) et 50 de Multilingual LibriSpeech `french` (split test).

Le dépôt ne contient **aucun audio** : seulement la liste des énoncés, leurs sources et leurs références, et les scripts qui reconstruisent le corpus et calculent le WER.

- `utterances.tsv` : un énoncé par ligne, avec l'identifiant, le jeu (`google/fleurs` ou `facebook/multilingual_librispeech`), le split, le fichier d'origine, son SHA-256, le SHA-256 du WAV mesuré et la référence. Rien d'autre.
- `sources.json` : dépôts, révision, fichiers source et leurs empreintes, graines du tirage.
- `ATTRIBUTION.md` : auteurs, licences et modifications ; copiée dans le dossier reconstruit.
- `prepare.py` : reconstruction (dépendances figées par `prepare.py.lock`).
- `score.py` : WER et intervalles à 95 % (bootstrap), sans dépendance.

## Reconstruire le corpus

```sh
uv run --locked --script apps/speech/wer-corpus/prepare.py <dossier neuf hors du dépôt>
```

Le script télécharge `data/fr_fr/test.tsv` et `data/fr_fr/audio/test.tar.gz` de FLEURS, puis le fichier `french/test` de MLS (158 Mo) à la révision figée de `sources.json`. Il vérifie les empreintes connues, refait le tirage avec les graines et s'arrête s'il ne redonne pas exactement `utterances.tsv`, vérifie l'empreinte de chaque fichier d'origine retenu, puis convertit chaque énoncé en WAV 16 kHz mono PCM16 avec ffmpeg (dans le PATH). Il écrit `wav/<id>.wav`, `refs.tsv` et `ATTRIBUTION.md`, et refuse un dossier de sortie situé dans le dépôt.

Limites de la reproductibilité :

- **FLEURS** : la révision Hugging Face n'a pas été relevée lors de la mesure ; le script prend `main`. L'empreinte de `test.tsv` et celle de chacun des 100 fichiers audio retenus sont vérifiées : si la source change, le script s'arrête. L'empreinte de l'archive `test.tar.gz` elle-même n'est pas connue.
- **MLS** : révision et empreinte du fichier source figées. La révision est celle de l'audio de mise en service (`../commissioning/sources.json`), mais le fichier diffère : la mise en service puise dans `french/1_hours` (split d'entraînement), le corpus dans `french/test`. Aucun énoncé, ni aucun locuteur, n'est commun aux deux.
- **WAV** : la conversion passe par ffmpeg ; une autre version peut donner d'autres octets. Le script compare chaque WAV à l'empreinte de la mesure et signale un écart (`ÉCART`) sans s'arrêter.

Pour vérifier sans réseau des fichiers source déjà téléchargés (rien n'est écrit) :

```sh
uv run --locked --script apps/speech/wer-corpus/prepare.py --check <test.tsv> <dossier audio FLEURS test> <parquet MLS french/test>
```

## Calculer le WER

Le banc de transcription doit écrire une hypothèse par énoncé, `<dossier>/<id>.txt`. Puis :

```sh
python3 -I apps/speech/wer-corpus/score.py <corpus>/refs.tsv fp32=<hypothèses FP32> int8=<hypothèses int8>
```

`score.py` normalise références et hypothèses (NFC, minuscules, apostrophes typographiques ramenées à `'`, apostrophe interne gardée, autre ponctuation remplacée par une espace ; nombres non normalisés), compte les éditions mot à mot, et calcule l'intervalle à 95 % par 1 000 tirages bootstrap des énoncés avec remise (`random.Random(12345)`), ainsi que l'écart apparié avec la première variante. Une hypothèse absente compte comme une sortie vide.

Le banc qui a produit les hypothèses publiées (transcription de chaque WAV entier, hors temps réel, 4 fils ONNX Runtime sur 4 cœurs) est un outil local, hors dépôt : cette étape n'est pas encore reproductible depuis le dépôt.
