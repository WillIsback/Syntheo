// La CSP interdit eval (issue 642) : zod ne compile plus ses validateurs. Sa
// sonde `new Function` serait sinon signalée comme violation à chaque
// démarrage. Importé avant tout autre module qui pourrait valider un schéma
// dès son chargement.
import { z } from "zod";

z.config({ jitless: true });
