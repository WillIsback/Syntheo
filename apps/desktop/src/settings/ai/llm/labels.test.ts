import { i18n } from "@lingui/core";
import { afterEach, describe, expect, it } from "vitest";

import { connectedModelsLabel } from "./labels";

import { createI18n } from "~/i18n/catalogs";

afterEach(() => {
  i18n.activate("en");
});

describe("connectedModelsLabel", () => {
  it("agrees with the number of models", async () => {
    expect(connectedModelsLabel(1)).toBe("Connected · 1 model available");
    expect(connectedModelsLabel(3)).toBe("Connected · 3 models available");
    await createI18n("fr");
    expect(connectedModelsLabel(1)).toBe("Connecté · 1 modèle disponible");
    expect(connectedModelsLabel(3)).toBe("Connecté · 3 modèles disponibles");
  });
});
