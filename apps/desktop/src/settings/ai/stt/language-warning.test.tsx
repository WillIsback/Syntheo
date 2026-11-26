import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  health: { status: "success" } as Record<string, unknown>,
  toastWarning: vi.fn(),
  toastDismiss: vi.fn(),
}));

vi.mock("./health", () => ({
  useConnectionHealth: () => mocks.health,
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => ({
    ai_language: "fr",
    current_stt_provider: undefined,
    current_stt_model: undefined,
    spoken_languages: ["fr"],
  }),
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning: mocks.toastWarning, dismiss: mocks.toastDismiss },
}));

import { TranscriptionLanguageWarningToast } from "./language-warning";

function renderWarning() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TranscriptionLanguageWarningToast />
    </QueryClientProvider>,
  );
}

describe("TranscriptionLanguageWarningToast", () => {
  beforeEach(() => {
    mocks.toastWarning.mockReset();
    mocks.toastDismiss.mockReset();
    localStorage.clear();
  });
  afterEach(cleanup);

  // Issue 782 : sur Paramètres › Transcription, l'encart de la carte « Sur ce
  // poste » dit déjà que les modèles doivent être mis à jour, avec son
  // bouton ; un toast le répétait et le masquait dans une petite fenêtre.
  it("shows no toast for the models update, the card already says it", () => {
    mocks.health = {
      status: "error",
      message:
        "The transcription models of this computer need an update. Update them or go back to the server in Settings › Transcription.",
      onDeviceUnavailable: "models_update",
    };
    const view = renderWarning();
    expect(mocks.toastWarning).not.toHaveBeenCalled();

    // Aller-retour vers une autre page de réglages : toujours rien.
    view.unmount();
    renderWarning();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });

  it("stays silent for other on-device states", () => {
    mocks.health = {
      status: "error",
      message: "The transcription models of this computer are not installed.",
      onDeviceUnavailable: "models_missing",
    };
    renderWarning();

    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });
});
