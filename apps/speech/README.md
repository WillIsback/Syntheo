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

## Chaîne d'approvisionnement d'ONNX Runtime (à traiter dans l'issue 683)

Avec ses features par défaut, `ort-sys` 2.0.0-rc.15 télécharge, au moment de la construction, une bibliothèque ONNX Runtime 1.31.0 précompilée par pyke. Il vérifie son empreinte SHA-256, qui est épinglée dans `ort-sys` (`build/download/dist.tsv`).

| Cible                      | Archive                                                                                 | SHA-256                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `x86_64-unknown-linux-gnu` | `https://cdn.pyke.io/0/pyke:ort-rs/ms@1.31.0/x86_64-unknown-linux-gnu.tar.lzma2`        | `02aac0d3b4927026292088986d7a377c657c88761b1c068be217a67b35447678` |
| `x86_64-pc-windows-msvc`   | `https://cdn.pyke.io/0/pyke:ort-rs/ms@1.31.0/x86_64-pc-windows-msvc+directml.tar.lzma2` | `f99aaef23f12986abb05924c944d8433521263ad756b462df762a5a982c98405` |

- La ligne Windows est celle de la variante DirectML. `dist.tsv` n'a pas de variante sans accélérateur pour cette cible ; l'archive réellement choisie reste à confirmer par la première construction Windows.
- Pour la construction signée du module (issue 683), il reste à décider entre vérifier et épingler cette source dans le workflow dédié, ou compiler ONNX Runtime depuis une révision épinglée.
- Autre point pour Windows : `parakeet-rs` tire `tokenizers`, donc `onig_sys`, une bibliothèque C à compiler avec MSVC. Un `cargo clippy --target x86_64-pc-windows-msvc` depuis Linux n'aboutit pas ; il faut un runner Windows.
