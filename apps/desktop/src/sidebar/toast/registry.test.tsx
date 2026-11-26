import { describe, expect, it, vi } from "vitest";

import { createToastRegistry, getToastToShow } from "./registry";

type RegistryParams = Parameters<typeof createToastRegistry>[0];

const baseParams: RegistryParams = {
  hasLLMConfigured: true,
  hasSttConfigured: true,
  isAiTranscriptionTabActive: false,
  isAiIntelligenceTabActive: false,
  onOpenLLMSettings: vi.fn(),
  onOpenSTTSettings: vi.fn(),
};

type Toast = NonNullable<ReturnType<typeof getToastToShow>>;

function showToast(
  overrides: Partial<RegistryParams> = {},
  isDismissed: (toast: Toast) => boolean = () => false,
) {
  return getToastToShow(
    createToastRegistry({ ...baseParams, ...overrides }),
    isDismissed,
  );
}

describe("sidebar toast registry", () => {
  it("requires missing-stt setup even if it was dismissed previously", () => {
    const toast = showToast(
      { hasSttConfigured: false },
      (toast) => toast.id === "missing-stt",
    );

    expect(toast?.id).toBe("missing-stt");
    expect(toast?.lifecycle).toEqual({ type: "condition-bound" });
  });

  // Issue 632 : la demande de modèle de langage se ferme pour la session
  // (elle recouvrait la capsule dans une fenêtre étroite) et revient au
  // lancement suivant.
  it("lets the missing-llm notice be closed for the session only", () => {
    const toast = showToast({ hasLLMConfigured: false });

    expect(toast?.id).toBe("missing-llm");
    expect(toast?.lifecycle).toEqual({
      type: "persistent",
      dismissal: "session",
    });
  });

  // Issue 707 : synthèse coupée par l'administration.
  it("never asks for a language model when synthesis is managed off", () => {
    expect(
      showToast({ hasLLMConfigured: false, llmManagedOff: true }),
    ).toBeNull();
  });

  // Issue 763 : modèles « Sur ce poste » d'une autre version.
  it("offers the models update instead of a generic not-ready notice", () => {
    const onUpdateOnDeviceModels = vi.fn();
    const toast = showToast({
      onDeviceNotReady: true,
      onDeviceModelsUpdate: true,
      onUpdateOnDeviceModels,
    });

    expect(toast?.id).toBe("on-device-models-update");
    expect(toast?.description).toBe(
      "The transcription models of this computer need an update",
    );
    expect(toast?.primaryAction?.label).toBe("Update the models");
    expect(toast?.lifecycle).toEqual({
      type: "persistent",
      dismissal: "session",
    });
    void toast?.primaryAction?.onClick();
    expect(onUpdateOnDeviceModels).toHaveBeenCalledOnce();

    expect(showToast({ onDeviceNotReady: true })?.id).toBe(
      "on-device-not-ready",
    );
    expect(
      showToast({
        onDeviceNotReady: true,
        onDeviceModelsUpdate: true,
        isAiTranscriptionTabActive: true,
      }),
    ).toBeNull();
  });

  it("never shows sign-in or upgrade prompts (no account)", () => {
    // Fully configured on-prem providers: nothing to promote.
    expect(showToast()).toBeNull();
    const ids = createToastRegistry(baseParams).map((entry) => entry.toast.id);
    expect(ids).not.toContain("sign-in-benefits");
    expect(ids).not.toContain("upgrade-to-pro");
  });

  it("never shows desktop update prompts (no updater)", () => {
    const ids = createToastRegistry(baseParams).map((entry) => entry.toast.id);
    expect(ids.some((id) => id.startsWith("desktop-update:"))).toBe(false);
  });

  it("announces an available update until it is dismissed for the session", () => {
    const onOpenUpdate = vi.fn();
    const toast = showToast({ availableUpdate: "0.7.4", onOpenUpdate });

    expect(toast?.id).toBe("update-available");
    expect(toast?.description).toBe("Version 0.7.4 is available");
    expect(toast?.lifecycle).toEqual({
      type: "persistent",
      dismissal: "session",
      dismissalId: "update-available-0.7.4",
    });
    void toast?.primaryAction?.onClick();
    expect(onOpenUpdate).toHaveBeenCalled();

    expect(
      showToast(
        { availableUpdate: "0.7.4" },
        (dismissed) => dismissed.id === "update-available",
      ),
    ).toBeNull();
    expect(showToast({ availableUpdate: null })).toBeNull();
  });
});
