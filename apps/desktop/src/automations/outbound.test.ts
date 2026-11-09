import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STEP_DEFINITIONS, WORKFLOW_STEP_TYPES } from "./steps";

// Politique « rien ne sort de la machine » (voir no-cloud-imports.test.ts et
// no-telemetry.test.ts) : dans les automatisations, la seule exception voulue
// est l'étape webhook, vers une adresse saisie par l'utilisateur et signalée
// comme telle dans l'éditeur. Le modèle local passe par la connexion de la
// synthèse (Paramètres › Synthèse), pas par un appel réseau propre à ce
// dossier.
const DIR = join(process.cwd(), "src/automations");

const NETWORK = /@tauri-apps\/plugin-http|\bfetch\(|XMLHttpRequest|WebSocket/;

describe("automations network policy", () => {
  it("reaches the network only from the webhook effect", () => {
    const offenders = readdirSync(DIR)
      .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name))
      .filter((name) => NETWORK.test(readFileSync(join(DIR, name), "utf8")));
    expect(offenders).toEqual(["step-effects.ts"]);
    const effects = readFileSync(join(DIR, "step-effects.ts"), "utf8");
    expect(effects.match(/plugin-http/g)).toHaveLength(1);
    expect(effects).toMatch(/postJson: async[\s\S]*plugin-http/);
  });

  it("marks the webhook as the only advanced step that sends data out", () => {
    expect(WORKFLOW_STEP_TYPES.filter((type) => type === "webhook")).toEqual([
      "webhook",
    ]);
    expect(STEP_DEFINITIONS.webhook.advanced).toBe(true);
  });
});
