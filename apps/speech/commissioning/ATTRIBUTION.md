# Audio de mise en service : attribution

Les deux fichiers de mise en service du module `syntheo-speech` sont tirés de **Multilingual LibriSpeech (MLS)**, partie française : V. Pratap, Q. Xu, A. Sriram, G. Synnaeve, R. Collobert, « MLS: A Large-Scale Multilingual Dataset for Speech Research », Interspeech 2020. Jeu de données sous licence CC BY 4.0, publié sur https://huggingface.co/datasets/facebook/multilingual_librispeech (révision `2e83e61823b4c47dcbcb1980bb88601274127609`, fichier `french/1_hours-00000-of-00001.parquet`).

Les enregistrements eux-mêmes viennent de **LibriVox** et sont dans le domaine public.

| Fichier   | Livre                                  | Projet LibriVox                                                    | Lecteur (identifiant MLS)    | Énoncés MLS                                                |
| --------- | -------------------------------------- | ------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------- |
| `mic.wav` | Victor Hugo, _Les Misérables_, tome 3  | https://archive.org/details/miserables_t3_1108_librivox            | locuteur 6381, chapitre 4703 | `6381_4703_000002`, `6381_4703_000003`, `6381_4703_000005` |
| `sys.wav` | Jean de La Fontaine, _Fables_, livre 6 | https://archive.org/details/fables_de_la_fontaine_06_0901_librivox | locuteur 3344, chapitre 2567 | `3344_2567_000000`, `3344_2567_000001`, `3344_2567_000002` |

Les énoncés sont décodés, rééchantillonnés en 16 kHz, mis bout à bout, séparés par 1,2 s de silence aux pauses naturelles de la lecture et coupés à 30 s par `prepare.py`. Le nom de chaque lecteur figure sur la page du projet LibriVox ci-dessus.
