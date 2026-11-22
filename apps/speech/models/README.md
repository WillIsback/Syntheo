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

`quantize.py` télécharge chaque source à la révision figée de `models.json`, vérifie son empreinte, quantifie (`onnxruntime.quantization.quantize_dynamic`, onnxruntime 1.32.0, onnx 1.23.2, toutes les dépendances figées par `quantize.py.lock`), puis vérifie chaque fichier produit. La reconstruction redonne exactement les empreintes de `models.json`. `verify.py` contrôle n'importe quelle copie : une arborescence (`nemotron/…`, `diar/…`), ou des fichiers à plat avec `--flat` (assets d'une release, avec leur `SHA256SUMS`). L'attestation de provenance de la CI couvre les fichiers publiés, pas leur fabrication : la reproduction ci-dessus est le moyen de vérifier celle-ci.

## Publier

La quantification ne tient pas sur un runner GitHub gratuit. La publication se fait en deux temps, chacun sur décision de William :

1. **En local**, `bash apps/speech/models/publish-local.sh speech-models-N` : quantification dans un dossier neuf, contrôle bloquant contre `models.json`, puis création d'une release GitHub **en brouillon** (invisible du public, jamais « latest ») avec un fichier par asset, `SHA256SUMS`, l'accord OpenMDW-1.1 et les fiches NVIDIA d'origine ; enfin, téléchargement du brouillon et nouveau contrôle. `--dry-run` s'arrête avant tout envoi. Le script refuse une release ou un tag déjà existant.
2. **En CI**, `publish-speech-models.yml` (depuis main, environnement `speech-models` avec validation) : brouillon unique et sans tag exigé, téléchargement de ses assets et contrôle bloquant, attestation de provenance, création du tag sur le commit vérifié avec un jeton dédié (`SPEECH_MODELS_RELEASE_TOKEN`, droits Contents et Workflows sur ce dépôt), passage en **prerelease** avec `make_latest=false` (le système de mise à jour de l'application ne doit pas la prendre pour une version), envoi vers Hugging Face (`WillisBack/syntheo-speech-models` : fichiers en arborescence, fiche `model-card.md`, accord et fiches NVIDIA ; jeton `HF_TOKEN` par variable d'environnement seulement, `hf_upload.py` à dépendances figées), second contrôle par retéléchargement depuis les deux hôtes. Le résumé du job donne la révision Hugging Face et les deux sources à épingler dans `models.json`. Après un échec entre la création du tag et la publication, une simple relance admet le tag s'il pointe sur le même commit. Après un échec côté Hugging Face (release déjà en prerelease), relancer avec `resume` : tag sur un commit de main et attestation des assets exigés, assets relus et revérifiés, puis l'envoi reprend.

Tant que `sources` est vide, une construction release sans devtools qui livre le compagnon échoue (build.rs de l'application) ; les sources s'épinglent après la publication, dans un commit à part. La release GitHub `speech-models-1` (gabarit `{name}`, assets à plat) est épinglée ; la source Hugging Face attend la révision que donnera la publication CI : son gabarit est dans `sources_pending`, une clé que l'application ne lit pas, à reporter à la fin de `sources` puis à retirer.

Fichiers : `verify.py` (contrôle), `flatten.py` (arborescence ↔ à plat), `download-draft.sh` (assets d'un brouillon), `publish-local.sh`, `release-notes.md`, `model-card.md` (fiche Hugging Face), `hf_upload.py` et `hf_upload.py.lock`.

## Miroir ou dossier d'installation

Pour un poste sans accès au réseau, copiez les fichiers des modèles dans un dossier (directement ou dans un sous-dossier `models`), à plat comme les assets de la release (`encoder.onnx`…) ou en arborescence comme le dépôt Hugging Face (`nemotron/encoder.onnx`…, `flatten.py --tree` passe de l'un à l'autre), puis **Installer depuis un dossier…**. Sous Windows, un chemin réseau UNC est refusé. Pour un miroir interne, servez les mêmes fichiers en HTTPS et déclarez-le dans `speech_models_urls` (par exemple `https://miroir.exemple.fr/modeles/{path}`). Vérifiez la copie avec `verify.py` avant de la diffuser : l'application refuse de toute façon un fichier différent.
