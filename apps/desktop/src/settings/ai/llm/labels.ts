import { plural } from "@lingui/core/macro";

/** Pastille de la carte Synthèse, accordée au nombre de modèles (passe QA
 * 0.8.1-2 : « 1 modèles disponibles »). */
export function connectedModelsLabel(count: number): string {
  return plural(count, {
    one: "Connected · # model available",
    other: "Connected · # models available",
  });
}
