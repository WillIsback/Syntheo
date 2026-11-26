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

import { useSettingFocus } from "~/settings/setting-focus";

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
    useSettingFocus.getState().clear();
    localStorage.clear();
  });
  afterEach(cleanup);

  // Issue 763 : l'état « mise à jour requise » calculé par health.tsx est
  // affiché, avec l'action qui mène à « Mettre à jour les modèles ».
  it("shows the models update with the update action", () => {
    mocks.health = {
      status: "error",
      message:
        "The transcription models of this computer need an update. Update them or go back to the server in Settings › Transcription.",
      onDeviceUnavailable: "models_update",
    };
    renderWarning();

    expect(mocks.toastWarning).toHaveBeenCalledOnce();
    const [description, options] = mocks.toastWarning.mock.lastCall!;
    expect(description).toContain("need an update");
    expect(options.action.label).toBe("Update the models");

    options.action.onClick();
    expect(useSettingFocus.getState().pending).toBe("stt-on-device-module");
    // Une fermeture n'est pas retenue : l'avertissement revient tant que les
    // modèles ne sont pas à jour.
    options.onDismiss();
    expect(
      localStorage.getItem("syntheo:dismissed-transcription-language-warnings"),
    ).toBeNull();
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
