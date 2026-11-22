# syntheo-speech

Programme compagnon de transcription sur le poste (issues 681 et 683, epic 631), livré dans l'installeur de l'application (`bundle.externalBin`). C'est un processus séparé que l'application lance au début d'une écoute et arrête à la fin. Il n'est joignable que sur la boucle locale et parle le protocole temps réel de NeMo-Speech.cpp, celui de l'adaptateur `nvidia` de `crates/owhisper-client`.

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

Le programme est construit avant l'application, qui l'embarque et en épingle l'empreinte :

```
bash scripts/build-speech.sh [cible]                 # Linux
powershell -File scripts/build-speech.ps1 -Dumpbin <dumpbin.exe>   # Windows
```

Les scripts compilent en release (`--locked`), vérifient ONNX Runtime avant et après (voir ci-dessous), contrôlent sous Windows les DLL importées, posent le binaire dans `apps/desktop/src-tauri/binaries/syntheo-speech-<cible>` et ses licences dans `apps/desktop/src-tauri/speech-licenses/`. Ils sont appelés par `release.yml` (Linux), `build-windows.yml` et les scripts d'alpha, avec `tauri.speech.conf.json` (externalBin et licences). Sur les PR qui le touchent, `build-speech.yml` le construit et le teste pour Linux et Windows, avec un SBOM CycloneDX 1.5 (`cargo-cyclonedx` 0.5.10) et les notices des crates (`cargo-about` 0.9.3), dans des jobs qui ne voient pas le binaire construit.

### ONNX Runtime

Avec ses features par défaut, `ort-sys` 2.0.0-rc.15 télécharge pendant la construction une bibliothèque ONNX Runtime 1.31.0 précompilée par pyke, liée statiquement. Il vérifie son SHA-256 contre `build/download/dist.tsv`, un fichier de la crate elle-même, dont l'empreinte est figée par `Cargo.lock`. `supply-chain/check_ort.py` ajoute notre propre épinglage (`supply-chain/ort.tsv`) :

- **avant la compilation** : la crate `ort-sys` de `Cargo.lock` épingle exactement l'archive et l'empreinte attendues pour la cible ;
- **après** : le cache d'`ort-sys` (`ORT_CACHE_DIR`, vide au départ) ne contient que l'archive épinglée.

| Cible                      | Archive                                                                                 | SHA-256                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `x86_64-unknown-linux-gnu` | `https://cdn.pyke.io/0/pyke:ort-rs/ms@1.31.0/x86_64-unknown-linux-gnu.tar.lzma2`        | `02aac0d3b4927026292088986d7a377c657c88761b1c068be217a67b35447678` |
| `x86_64-pc-windows-msvc`   | `https://cdn.pyke.io/0/pyke:ort-rs/ms@1.31.0/x86_64-pc-windows-msvc+directml.tar.lzma2` | `f99aaef23f12986abb05924c944d8433521263ad756b462df762a5a982c98405` |

Sous Windows, `dist.tsv` n'a pas de variante sans accélérateur : c'est la variante DirectML. `build-speech.ps1` liste les DLL importées par le binaire et échoue si une DLL ONNX Runtime est importée (elle ne serait pas livrée) ou si une DLL du runtime Visual C++ manque à celles que l'application embarque.

### Modèles

`models/models.json` fige les sources des modèles, les empreintes et les tailles des fichiers livrés, et les sources de téléchargement : c'est la seule référence, compilée dans l'application. Voir [`models/README.md`](models/README.md) (reproduction, vérification, publication, miroir).

- **Licence** : OpenMDW-1.1, pour les modèles NVIDIA comme pour l'export, dont l'auteur renvoie aux licences de NVIDIA. L'accord permet de redistribuer les modèles, modifiés ou non (« deal in the Model Materials without restriction »), à condition de garder une copie de l'accord et les avis d'origine : l'application livre l'accord et les fiches des modèles et de l'export, aux révisions figées (`supply-chain/notices/models/`), et chaque source des modèles les publie à côté des fichiers.

### Vérification avant lancement

`crates/speech-host` ne lance que le compagnon livré avec l'application, depuis son dossier d'installation (dossier canonique de l'exécutable, lien ou point de réanalyse refusé), et vérifie avant chaque lancement :

1. les fichiers du compagnon (binaire et, sous Windows, runtime Visual C++) contre les empreintes compilées par le build.rs de l'application (`SYNTHEO_SPEECH_FILES`, crate `image-hash` : stable à la signature Authenticode, que le job sign ajoute après la compilation) ;
2. chaque modèle contre sa taille et son SHA-256 de `models.json`.

On exécute exactement ce qui a été vérifié :

- les fichiers du compagnon sont copiés dans un dossier privé neuf par lancement (Linux : 0700 ; Windows : DACL protégée limitée au propriétaire et au système, posée à la création), hachés depuis la copie et exécutés depuis elle ;
- les modèles ne sont pas copiés. Sous Linux, chaque modèle est ouvert, haché depuis son descripteur, et le programme en hérite ; le dossier privé l'expose par un lien `/proc/self/fd/N`, que le programme rouvre à chaque session (diarisation). Un autre processus du même utilisateur pourrait encore réécrire le fichier en place : Linux n'offre pas de verrou obligatoire à un utilisateur ordinaire. Sous Windows, chaque modèle et chaque dossier de son chemin sont ouverts sans partage en écriture ni en suppression, les points de réanalyse sont refusés et le chemin final est vérifié (`GetFinalPathNameByHandleW`) ;
- un modèle n'est jamais écrit en place : installation et téléchargement passent par un `.part` haché puis renommé (`crates/pinned-fetch`) ;
- tout cela vit aussi longtemps que le processus. Une erreur d'entrée-sortie (disque plein) est un lancement raté, réessayable, jamais un refus ;
- le programme limite la recherche de bibliothèques à son dossier et à System32 (`SetDefaultDllDirectories`) ;
- le dossier courant du processus n'est jamais le dossier du programme (`/`, ou System32).

### Mise en service et charge (issue 686)

- **Mise en service** (`crates/speech-host`, `commissioning`) : après l'installation, puis à la demande, chaque profil est mesuré environ 30 s en temps réel sur l'audio de mise en service (`commissioning/`, deux flux, compilé dans l'application), dans l'ordre de la conclusion du banc 680 (§4) : deux flux avec diarisation, deux flux sans, un seul flux (micro) avec, un seul flux sans. Le retard d'un final va de la fin de son dernier mot dans l'audio à son arrivée (retard brut), moins l'attente de fin d'énoncé envoyée au module (`endpointing_ms`, 1 s) : c'est le retard net, qui ne dépend que du poste. Le premier profil dont le retard net reste sous 2 s au 95e centile, sans dérive (écart des médianes du dernier et du premier tiers sous 1 s), est retenu, et la mesure s'arrête là ; sinon le poste est inéligible. Les deux retards, brut et net, sont enregistrés. Une erreur pendant un profil (module tombé) le refuse avec sa raison, et la mesure passe au suivant. Sur cet Omarchy (RTF 0,10) : deux flux avec diarisation retenus, net p95 1,16 s (brut 2,16 s), 12 finals. Le résultat est enregistré dans `speech/commissioning.json` du dossier de données, lié à la construction du compagnon, avec la mesure. Pas d'écoute « Sur ce poste » sans profil retenu.
- **Application du profil** : un seul flux, seul le micro est transcrit (le son de l'ordinateur, donc les participants à distance, ne l'est pas : la carte et un rappel au début de l'écoute le disent) ; sans diarisation, la session annonce un seul intervenant.
- **Charge pendant l'écoute** (`load`) : le module mesure le retard de chaque session (attente de l'audio le plus ancien de chaque lot) et son RTF. Au-delà de 2 s de retard pendant 2 s, la diarisation passe en espacée (tranches de 2,2 s au lieu de 1,04 s), puis en coupée ; elle remonte d'un niveau après 60 s sous 1 s, attente doublée après chaque rechute rapide (jusqu'à 10 min) pour éviter l'oscillation. Chaque changement de niveau repart d'un état neuf du diarizer : ses étiquettes d'intervenants forment une nouvelle série, distincte des précédentes, pour que l'application ne fusionne jamais deux personnes (au prix de scinder parfois la même). Mesure du coût sur 45 s d'audio : RTF 0,104 en complète, 0,077 en espacée, 0,059 en coupée.
- **Mesures publiées** : toutes les 5 s pendant une écoute, une ligne JSON `{"event":"metrics","sessions":[…]}` sur la sortie standard (retard, RTF, niveau, durée), lue par l'hôte et affichée dans la barre de diagnostic des alphas devtools.
- Moteur factice : `--fake-cost complète,espacée,coupée` simule le coût de calcul sous un verrou commun aux sessions, pour les essais.

### Signature Authenticode

Sous Windows, le compagnon est signé par le job `sign` de `build-windows.yml`, avec l'application (`signCommand` de Tauri), et sa signature est contrôlée comme celle de `syntheo.exe` (signataire et émetteur épinglés, horodatage), de façon bloquante.

### Reste pour Windows

`parakeet-rs` tire `tokenizers`, donc `onig_sys`, une bibliothèque C à compiler avec MSVC. Seul le runner Windows de `build-speech.yml` le vérifie.
