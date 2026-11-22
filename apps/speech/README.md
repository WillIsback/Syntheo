# syntheo-speech

Module de transcription sur le poste (issue 681, epic 631). C'est un processus séparé que l'application lance au début d'une écoute et arrête à la fin. Il n'est joignable que sur la boucle locale et parle le protocole temps réel de NeMo-Speech.cpp, celui de l'adaptateur `nvidia` de `crates/owhisper-client`.

C'est un workspace Cargo à part, avec son propre `Cargo.lock` : le moteur A (`parakeet-rs`) épingle `ort` 2.0.0-rc.15, alors que l'application utilise une autre version, et `ort-sys` déclare `links`. Il est vérifié par le job `ci-test (module syntheo-speech)` et par `cargo deny` dans `ci-security`.

## Lancement

```
syntheo-speech --models <dossier> [--engine parakeet] [--threads N] [--max-sessions N]
```

1. Le jeton du lancement (au moins 32 chiffres hexadécimaux, soit 128 bits) arrive sur la première ligne de l'entrée standard, jamais sur la ligne de commande.
2. Le module charge le moteur, écoute sur `127.0.0.1` sur un port libre et annonce `{"event":"listening","port":N,"protocol":1}` sur la sortie standard.
3. Il s'arrête quand l'entrée standard se ferme, c'est-à-dire quand l'application se termine.

Dossier des modèles : `nemotron/` (encoder.onnx et ses données, decoder_joint.onnx, tokenizer.model, config.json) et, si présent, `diar/nemotron3_diar_v3.onnx`. Modèles retenus par le banc de l'issue 680 : Nemotron 3.5 en int8 per-channel et diarisation Nemotron-3 en int8.

## Canal local

`GET /v1/audio/transcriptions/realtime` en WebSocket. **Le jeton ne circule jamais** : chaque côté prouve qu'il le connaît, par un HMAC-SHA-256 lié à la connexion.

- **Le client** ouvre la connexion TCP, puis envoie un nonce `Nc` (`x-syntheo-speech-nonce`, 32 à 128 chiffres hexadécimaux) et sa preuve (`x-syntheo-speech-client-proof`). Cette preuve est le HMAC du jeton sur le texte formé de `syntheo-speech/1`, d'une espace, de `client`, puis de `|Nc|port source|port serveur`.
- **Le module** vérifie cette preuve en temps constant, avec le port source qu'il voit et son propre port : un relais ne peut donc pas la réutiliser. Il refuse aussi tout nonce déjà accepté pendant le lancement (rejeu).
- **Le module répond** dans `x-syntheo-speech-proof` par le même calcul, avec `server` au lieu de `client`. L'étiquette de sens empêche la réflexion.
- **Le client vérifie** cette preuve avant d'envoyer quoi que ce soit d'autre. Il ne se connecte qu'au port annoncé par le lancement en cours, jamais à un port mémorisé.
- **Contre l'épuisement** : le handshake est limité à 3 s et 16 handshakes au plus sont en cours ; au-delà, la connexion est fermée tout de suite. Une erreur d'acceptation entraîne une pause de 100 ms, et la file audio est bornée, avec contre-pression sur le client.
- Un en-tête `Origin` donne 403 : une page web ne peut pas joindre le module. Un `Host` hors de `127.0.0.1:port` ou `localhost:port` donne 403.
- Les sessions simultanées sont bornées (4 par défaut ; au-delà, 503).
- Les journaux, sur la sortie d'erreur, ne contiennent que des durées et des nombres, jamais de texte transcrit.

## Tests

```
cargo clippy --locked --all-targets -- -D warnings
cargo clippy --locked --all-targets --features fake-engine -- -D warnings
cargo test --locked --features fake-engine   # moteur factice, jamais livré
# Essai avec le vrai modèle (sauté sans ces variables) :
SYNTHEO_SPEECH_MODELS=<dossier> SYNTHEO_SPEECH_AUDIO=<wav 16 kHz mono PCM16> cargo test --release --test model
```

## Construction (issue 683)

Le workflow `.github/workflows/build-speech.yml` (`workflow_dispatch` et `workflow_call`) construit le module en release pour `x86_64-unknown-linux-gnu` (ubuntu-24.04) et `x86_64-pc-windows-msvc` (windows-latest). Il part d'un registre Cargo et d'un cache vides : aucun cache n'est partagé avec les autres workflows. Il ne publie rien. Il produit en artefacts :

- le dossier du module : binaire, runtime Visual C++ sous Windows, `licenses/` (voir `supply-chain/notices/README.md`), `manifest.json` et `files.sha256`. Le binaire est uploadé dès l'assemblage, avant tout outil tiers ;
- le SBOM CycloneDX 1.5 des dépendances Rust (`cargo-cyclonedx` 0.5.10) et les notices des crates (`cargo-about` 0.9.3), versions figées, produits dans des jobs qui ne voient pas le module construit ;
- sur demande, depuis main, `manifest.json.sig` (voir « Manifeste signé »).

### ONNX Runtime

Avec ses features par défaut, `ort-sys` 2.0.0-rc.15 télécharge pendant la construction une bibliothèque ONNX Runtime 1.31.0 précompilée par pyke, liée statiquement. Il vérifie son SHA-256 contre `build/download/dist.tsv`, un fichier de la crate elle-même, dont l'empreinte est figée par `Cargo.lock`. `supply-chain/check_ort.py` ajoute notre propre épinglage (`supply-chain/ort.tsv`) :

- **avant la compilation** : la crate `ort-sys` de `Cargo.lock` épingle exactement l'archive et l'empreinte attendues pour la cible ;
- **après** : le cache d'`ort-sys` (`ORT_CACHE_DIR`, vide au départ) ne contient que l'archive épinglée.

| Cible                      | Archive                                                                                 | SHA-256                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `x86_64-unknown-linux-gnu` | `https://cdn.pyke.io/0/pyke:ort-rs/ms@1.31.0/x86_64-unknown-linux-gnu.tar.lzma2`        | `02aac0d3b4927026292088986d7a377c657c88761b1c068be217a67b35447678` |
| `x86_64-pc-windows-msvc`   | `https://cdn.pyke.io/0/pyke:ort-rs/ms@1.31.0/x86_64-pc-windows-msvc+directml.tar.lzma2` | `f99aaef23f12986abb05924c944d8433521263ad756b462df762a5a982c98405` |

Sous Windows, `dist.tsv` n'a pas de variante sans accélérateur : c'est la variante DirectML. Le workflow liste les DLL importées par le binaire et échoue si une DLL ONNX Runtime manque au dossier du module.

### Modèles

`models/models.json` fige les sources des modèles et les empreintes des fichiers livrés.

- **Sources** : l'export ONNX de `altunenes/parakeet-rs` sur Hugging Face, révision `26684938ff242cb4f7a65fad712476c6015a4477`, à partir de `nvidia/nemotron-3.5-asr-streaming-0.6b` et `nvidia/Nemotron-3-Diarization`.
- **Quantification** : `models/quantize.py` produit l'int8 retenu par l'issue 680 : Python 3.12, onnxruntime 1.32.0 et onnx 1.23.2, toutes les dépendances transitives figées par `quantize.py.lock` (`uv run --locked --script`). Encodeur et décodeur sont quantifiés par canal, la diarisation par tenseur. Le script écrit dans un dossier neuf, vérifie chaque source et chaque fichier produit ; la reconstruction redonne exactement les empreintes de `models.json`.
- **Licence** : OpenMDW-1.1, pour les modèles NVIDIA comme pour l'export, dont l'auteur renvoie aux licences de NVIDIA. L'accord permet de redistribuer les modèles, modifiés ou non (« deal in the Model Materials without restriction »), à condition de garder une copie de l'accord et les avis d'origine. Le module livre l'accord et les fiches des modèles et de l'export, aux révisions figées (`supply-chain/notices/models/`), ainsi que la licence et les notices d'ONNX Runtime et les notices des crates : tout est listé dans le manifeste signé.
- **Hébergement** : à décider. Proposé, une release GitHub dédiée (tag `speech-models-1`), une ressource par fichier (moins de 2 Go chacune). Les modèles restent ainsi dans le même dépôt et sous les mêmes droits que le reste, et l'attestation de provenance d'Actions s'applique. L'autre option est un dépôt Hugging Face, avec une révision épinglée. L'URL de base est un paramètre du workflow ; le manifeste porte l'URL de chaque fichier.

### Manifeste signé

`manifest.json` (`supply-chain/make_manifest.py`) contient :

- le schéma, le module, sa version, le protocole, le moteur, la cible et la version minimale de l'application ;
- l'empreinte et la taille de chaque fichier, ainsi que l'URL de chaque modèle.

`manifest.json.sig` est sa signature minisign, au format de `tauri signer sign`. Elle est faite avec une clé propre au module, distincte de celle des mises à jour de l'application.

Avant chaque lancement, `crates/speech-host` vérifie dans l'ordre :

1. la signature, avec la clé publique `MODULE_PUBLIC_KEY` ;
2. la cible, le protocole, la version minimale de l'application, la version minimale du module (`MIN_MODULE_VERSION`, relevée à chaque correctif de sécurité) et le numéro de construction (`build`, le numéro d'exécution du workflow) : l'application garde le plus haut accepté (`<modules>/speech.floor`) et refuse un module plus ancien ;
3. que `files.sha256` liste exactement les fichiers du manifeste ;
4. la taille et l'empreinte de chaque fichier ;
5. qu'aucun fichier hors liste n'est présent.

Tant que la clé n'existe pas, `MODULE_PUBLIC_KEY` est vide et aucun module n'est chargé.

On exécute exactement ce qui a été vérifié :

- le binaire et ses bibliothèques sont copiés dans un dossier privé neuf par lancement (Linux : 0700 ; Windows : DACL protégée limitée au propriétaire et au système, posée à la création), hachés depuis la copie et exécutés depuis elle ;
- les modèles ne sont pas copiés. Sous Linux, chaque modèle est ouvert, haché depuis son descripteur, et le module en hérite ; le dossier privé l'expose par un lien `/proc/self/fd/N`, que le module rouvre à chaque session (diarisation). Un autre processus du même utilisateur pourrait encore réécrire le fichier en place : Linux n'offre pas de verrou obligatoire à un utilisateur ordinaire. Sous Windows, chaque modèle et chaque dossier de son chemin sont ouverts sans partage en écriture ni en suppression, les points de réanalyse sont refusés et le chemin final est vérifié (`GetFinalPathNameByHandleW`) ;
- tout cela vit aussi longtemps que le processus. Une erreur d'entrée-sortie (disque plein) est un lancement raté, réessayable, jamais un module refusé ;
- le module limite la recherche de bibliothèques à son dossier et à System32 (`SetDefaultDllDirectories`) ;
- le dossier courant du processus n'est jamais le dossier du module (`/`, ou System32).

La clé privée sera rangée dans un environnement GitHub `speech-signing`, limité à main comme `release-signing`, sous les secrets `SPEECH_MANIFEST_PRIVATE_KEY` et `SPEECH_MANIFEST_PRIVATE_KEY_PASSWORD`. Le job `sign-manifest` ne tourne que sur demande (`sign`) et depuis main.

### Signature Authenticode (prévue)

Un job `authenticode` se placera entre `build` et `manifest` pour la cible Windows, sur le modèle du job `sign` de `build-windows.yml` :

- environnement `windows-signing` ;
- connexion OIDC, avec `id-token: write` limité à ce job ;
- client Artifact Signing à empreinte figée ;
- `signtool sign` de `syntheo-speech.exe`, puis vérification du signataire.

Le manifeste sera calculé après, sur l'exécutable signé. Ce job n'est pas encore actif.

### Reste pour Windows

`parakeet-rs` tire `tokenizers`, donc `onig_sys`, une bibliothèque C à compiler avec MSVC. Seul le runner Windows de `build-speech.yml` le vérifie.
