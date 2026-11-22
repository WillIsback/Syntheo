Modèles int8 de syntheo-speech, la transcription sur le poste de Syntheo
Desktop, quantifiés par Syntheo à partir des modèles NVIDIA Nemotron 3.5 ASR
Streaming et Nemotron 3 Diarization. **Ce n'est pas une version de
l'application.**

- Licence : OpenMDW-1.1 (`LICENSE.OpenMDW-1.1`), avec les fiches NVIDIA
  d'origine (`NOTICE.*`).
- Empreintes : `SHA256SUMS`, identiques à `apps/speech/models/models.json`,
  que l'application vérifie avant de mettre un fichier en place et avant
  chaque lancement.
- Reproduction : `apps/speech/models/quantize.py`, puis
  `apps/speech/models/verify.py`.
