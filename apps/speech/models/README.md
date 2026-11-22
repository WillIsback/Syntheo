# Modèles de syntheo-speech

Modèles int8 du programme de transcription sur le poste (issue 683) : Nemotron 3.5 ASR Streaming 0.6B et Nemotron 3 Diarization (NVIDIA, OpenMDW-1.1), quantifiés par Syntheo. Environ 1,1 Go, jamais livrés dans l'installeur : l'application les télécharge à la demande ou les installe depuis un dossier.

## `models.json`, seule référence

`models.json` donne, pour chaque fichier livré, son chemin, sa source, sa transformation, sa taille et son SHA-256, ainsi que les sources de téléchargement (`sources`). L'application le compile : elle ne met en place, et ne lance, que des fichiers qui y correspondent exactement, quelle que soit leur provenance. Une source (release GitHub, Hugging Face, miroir) ne peut donc servir que ces fichiers-là.

Les `sources` sont des gabarits d'adresse HTTPS, essayés dans l'ordre, fichier par fichier : `{path}` est remplacé par le chemin du fichier (`nemotron/encoder.onnx`, pour une arborescence, par exemple Hugging Face `…/resolve/<révision>/{path}`) et `{name}` par son seul nom (`encoder.onnx`, pour des fichiers à plat, par exemple les assets d'une release GitHub). La variable de construction `SYNTHEO_SPEECH_MODELS_URLS` (liste séparée par des virgules) les remplace ; le réglage géré `speech_models_urls` les remplace sur un poste.

## Reproduire et vérifier

```sh
uv run --locked --script apps/speech/models/quantize.py <dossier neuf>
python3 -I apps/speech/models/verify.py <dossier neuf>
```

`quantize.py` télécharge chaque source à la révision figée de `models.json`, vérifie son empreinte, quantifie (`onnxruntime.quantization.quantize_dynamic`, onnxruntime 1.32.0, onnx 1.23.2, poids int8 à plage réduite ([-64, 64]) par `reduce_range`, toutes les dépendances figées par `quantize.py.lock`), puis vérifie chaque fichier produit. La reconstruction redonne exactement les empreintes de `models.json`. `verify.py` contrôle n'importe quelle copie : une arborescence (`nemotron/…`, `diar/…`), ou des fichiers à plat avec `--flat` (assets d'une release, avec leur `SHA256SUMS`). L'attestation de provenance de la CI couvre les fichiers publiés, pas leur fabrication : la reproduction ci-dessus est le moyen de vérifier celle-ci.

## CPU sans VNNI : `reduce_range` et garde-fou

Les poids sont quantifiés en int8 à plage réduite (`reduce_range`, dans `models.json`) : quantification symétrique dans [-64, 64], soit 129 niveaux (pas strictement 7 bits). Sur un CPU sans VNNI (Intel jusqu'à la 10e génération courante, AMD jusqu'à Zen 3), le noyau AVX2 d'ONNX Runtime somme deux produits activation × poids (u8 × s8) dans un entier 16 bits ; avec des poids int8 sur toute la plage, la somme sature et l'ASR ne rend que des sorties vides (modèles de la 0.8.0-3). Dans [-64, 64], le pire cas (255 × 64 × 2 = 32 640) tient dans 16 bits (au plus 32 767). Mesuré sur 150 énoncés, l'écart de WER avec le FP32 reste dans le bruit (voir la fiche `model-card.md`), pour la même taille et la même vitesse.

Le garde-fou `cpu-check/run.sh <dossier des modèles>` transcrit l'audio de mise en service (`commissioning/mic.wav` et `sys.wav`) avec le vrai moteur, diarisation comprise, sous `qemu-x86_64 -cpu Skylake-Client` (AVX2 sans VNNI). Il exige, pour chaque fichier (30 s chacun) : au moins 80 % des mots de la référence FP32 normalisée du fichier, un WER d'au plus 5 % face à la transcription FP32 figée (`cpu-check/<fichier>.fp32.txt`), un intervenant pour chaque mot, et autant d'intervenants distincts que la référence FP32 figée (`cpu-check/<fichier>.fp32.json`). `run.sh` fixe ces seuils (`--min-word-ratio 0.8 --max-wer 5`, par fichier ; aucun seuil sur le total). Il est bloquant dans `publish-speech-models.yml` : il tourne sur les assets du brouillon dans un job séparé, sans privilège, avant le job de publication, qui revérifie les assets juste avant l'attestation. Il l'est aussi dans la CI (`ci-code-quality`, job des modèles, modèles téléchargés par `fetch.py` depuis les `sources`), quand une PR touche `apps/speech/` (n'importe quel fichier : modèles, moteur, `Cargo.toml`/`Cargo.lock`, exemple, audio de mise en service), `.github/actions/rust_install/`, `rust-toolchain.toml` ou l'un des deux workflows. `--expect-empty` sert de témoin négatif : les modèles de la 0.8.0-3 y rendent 0 mot au total. `cpu-check` est lié dynamiquement à la glibc : il se construit sur la même distribution que celle qui l'exécute (la CI le construit sur son runner ; pour une image Ubuntu 24.04, dans l'image de construction de l'alpha). Limite : vérifié en natif AVX-512 avec VNNI et en émulation AVX2 sans VNNI ; AVX-512 sans VNNI non vérifié (l'émulation logicielle de qemu n'a pas d'AVX-512).

Les `sources` doivent servir les nouveaux fichiers avant que `models.json` change dans une PR : publier d'abord (brouillon, Hugging Face), puis épingler.

## Publier

La quantification ne tient pas sur un runner GitHub gratuit. La publication se fait en deux temps, chacun sur décision de William :

1. **En local**, `bash apps/speech/models/publish-local.sh speech-models-N` : quantification dans un dossier neuf, contrôle bloquant contre `models.json`, puis création d'une release GitHub **en brouillon** (invisible du public, jamais « latest ») avec un fichier par asset, `SHA256SUMS`, l'accord OpenMDW-1.1 et les fiches NVIDIA d'origine ; enfin, téléchargement du brouillon et nouveau contrôle. `--dry-run` s'arrête avant tout envoi. Le script refuse une release ou un tag déjà existant.
2. **En CI**, `publish-speech-models.yml` (depuis main, environnement `speech-models` avec validation) : brouillon unique et sans tag exigé, téléchargement de ses assets et contrôle bloquant, garde-fou `cpu-check` dans un job séparé sans privilège, puis, dans le job de publication, nouveau contrôle des assets juste avant l'attestation de provenance, création du tag sur le commit vérifié avec un jeton dédié (`SPEECH_MODELS_RELEASE_TOKEN`, droits Contents et Workflows sur ce dépôt), passage en **prerelease** avec `make_latest=false` (le système de mise à jour de l'application ne doit pas la prendre pour une version), envoi vers Hugging Face (`WillisBack/syntheo-speech-models` : fichiers en arborescence, fiche `model-card.md`, accord et fiches NVIDIA ; jeton `HF_TOKEN` par variable d'environnement seulement, `hf_upload.py` à dépendances figées, qui refuse un dossier incomplet et n'envoie rien si le dépôt a déjà les mêmes fichiers ; ses tests passent avant l'attestation), second contrôle par retéléchargement depuis les deux hôtes. Le résumé du job donne la révision Hugging Face et les deux sources à épingler dans `models.json`. Après un échec entre la création du tag et la publication, une simple relance admet le tag s'il pointe sur le même commit. Après un échec côté Hugging Face (release déjà en prerelease), relancer avec `resume` : tag sur un commit de main et attestation des assets exigés, assets relus et revérifiés, puis l'envoi reprend.

Une construction release sans devtools qui livre le compagnon échoue si `sources` est vide (build.rs de l'application). Sont épinglées : la release GitHub `speech-models-1` (gabarit `{name}`, assets à plat), puis Hugging Face à une révision fixe (voir ci-dessous).

### Source Hugging Face

Le dépôt `WillisBack/syntheo-speech-models` a été rempli le 22 novembre 2026, avant la release, depuis les fichiers du brouillon `speech-models-1` (vérifiés avant l'envoi, puis retéléchargés à la révision obtenue et vérifiés), puis mis à jour le même jour avec les poids int8 à plage réduite ([-64, 64], `reduce_range`) ; la révision précédente, aux poids int8 sur toute la plage, ne sert plus. `sources` l'épingle après la release GitHub, à cette révision :

```
https://huggingface.co/WillisBack/syntheo-speech-models/resolve/16e4ca54b924297bf6af2cbc5f9c9c2eca9a94bf/{path}
```

Jamais `main` : une révision épinglée garantit que la source sert toujours les fichiers vérifiés. Les fichiers y sont en arborescence (`nemotron/…`, `diar/…`), d'où `{path}`. Tant que la release GitHub reste un brouillon, sa source répond 404 et l'application passe à Hugging Face. `publish-speech-models.yml` n'envoie rien si Hugging Face contient déjà des fichiers identiques (même SHA-256) et reprend alors la révision existante.

Fichiers : `verify.py` (contrôle), `fetch.py` (téléchargement depuis les `sources`, comme l'application), `cpu-check/` (garde-fou), `flatten.py` (arborescence ↔ à plat), `download-draft.sh` (assets d'un brouillon), `publish-local.sh`, `release-notes.md`, `model-card.md` (fiche Hugging Face), `hf_upload.py`, `hf_upload.py.lock` et `test_hf_upload.py` (tests sans réseau : `python3 -I -m unittest discover -s apps/speech/models -p 'test_*.py'`).

## Miroir ou dossier d'installation

Pour un poste sans accès au réseau, copiez les fichiers des modèles dans un dossier (directement ou dans un sous-dossier `models`), à plat comme les assets de la release (`encoder.onnx`…) ou en arborescence comme le dépôt Hugging Face (`nemotron/encoder.onnx`…, `flatten.py --tree` passe de l'un à l'autre), puis **Installer depuis un dossier…**. Sous Windows, un chemin réseau UNC est refusé. Pour un miroir interne, servez les mêmes fichiers en HTTPS et déclarez-le dans `speech_models_urls` (par exemple `https://miroir.exemple.fr/modeles/{path}`). Vérifiez la copie avec `verify.py` avant de la diffuser : l'application refuse de toute façon un fichier différent.
