// La CSP interdit eval (issue 642) : zod ne compile pas ses validateurs. Posé
// avant tout module, car zod lit ce réglage dès la définition d'un schéma ; sa
// sonde `new Function` serait sinon signalée comme violation au démarrage.
globalThis.__zod_globalConfig = Object.assign(
  globalThis.__zod_globalConfig || {},
  { jitless: true },
);
