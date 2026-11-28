# Corpus de WER français : attribution

Le corpus de WER français de Syntheo (150 énoncés de parole lue) est tiré de deux jeux de données publics. Le dépôt ne contient que la liste des énoncés (`utterances.tsv`), leurs références et le script qui les reconstruit (`prepare.py`) ; aucun audio.

## FLEURS (100 énoncés)

A. Conneau, M. Ma, S. Khanuja, Y. Zhang, V. Axelrod, S. Dalmia, J. Riesa, C. Rivera, A. Bapna, « FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech », IEEE Spoken Language Technology Workshop (SLT), 2022 (arXiv:2205.12446). Jeu de données sous licence CC BY 4.0, publié sur https://huggingface.co/datasets/google/fleurs (configuration `fr_fr`, split `test` : `data/fr_fr/test.tsv` et `data/fr_fr/audio/test.tar.gz`).

Les phrases lues dans FLEURS viennent du jeu de traduction FLoRes (FLoRes-101, repris dans FLoRes-200), que ses auteurs publient sous licence CC BY-SA 4.0. Les références de `utterances.tsv` sont les transcriptions brutes de FLEURS (colonne « raw transcription »), sans modification.

## Multilingual LibriSpeech (50 énoncés)

V. Pratap, Q. Xu, A. Sriram, G. Synnaeve, R. Collobert, « MLS: A Large-Scale Multilingual Dataset for Speech Research », Interspeech 2020. Jeu de données sous licence CC BY 4.0, publié sur https://huggingface.co/datasets/facebook/multilingual_librispeech (révision `2e83e61823b4c47dcbcb1980bb88601274127609`, fichier `french/1_hours-00000-of-00001.parquet`, sous-ensemble « 1 heure » du split d'entraînement).

Les enregistrements viennent de **LibriVox** et sont dans le domaine public. Les références de `utterances.tsv` sont les transcriptions de MLS, sans modification.

## Modifications

- **Sous-ensemble** : 100 phrases distinctes de FLEURS `fr_fr` test, tirées par `random.Random(20261122)`, puis un enregistrement par phrase ; 50 énoncés de MLS `french/1_hours`, tirés par `random.Random(20261123)` parmi les énoncés triés par identifiant.
- **Format** : chaque énoncé est converti par ffmpeg en WAV 16 kHz, mono, PCM 16 bits (FLEURS : WAV 16 kHz en flottant 32 bits converti en entier 16 bits ; MLS : Opus décodé et rééchantillonné en 16 kHz).
- Aucune autre modification : ni coupe, ni mixage, ni ajout de bruit.
