# Audio de mise en service

La mise en service du module (issue 686) mesure chaque profil sur environ 30 s d'audio, en deux flux comme une écoute : `mic.wav` (micro) et `sys.wav` (son du poste), 16 kHz, mono, PCM16. Les deux fichiers sont livrés dans le module, sous `commissioning/`, et listés dans le manifeste signé. Le workflow `build-speech.yml` les copie s'ils sont présents ici ; la signature du manifeste les exige.

Source à décider avant la publication : un extrait de parole sous licence libre, avec son attribution dans `../supply-chain/notices/`. Il ne doit contenir aucune voix privée.
