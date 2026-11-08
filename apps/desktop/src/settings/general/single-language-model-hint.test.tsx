import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SingleLanguageModelHint } from "./single-language-model-hint";

// Issue 351 : sous les langues parlées, une ligne d'aide signale un modèle en
// direct qui ne gère qu'une langue à la fois.

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
  getLiveTranscriptionConfig: vi.fn(),
  openNew: vi.fn(),
}));

// Le mock global de Trans ignore les balises ; celui-ci rend le lien.
vi.mock("@lingui/react", async () => {
  const { cloneElement, createElement, Fragment } = await import("react");
  return {
    Trans: ({
      message,
      id,
      components = {},
    }: {
      message?: string;
      id?: string;
      components?: Record<string, React.ReactElement>;
    }) =>
      createElement(
        Fragment,
        null,
        ...(message ?? id ?? "")
          .split(/(<\d+>.*?<\/\d+>)/)
          .map((part, index) => {
            const match = /^<(\d+)>(.*)<\/\d+>$/.exec(part);
            const component = match ? components[match[1]!] : undefined;
            return component
              ? cloneElement(component, { key: index }, match![2])
              : part;
          }),
      ),
  };
});

vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: unknown) => unknown) =>
    selector({ openNew: mocks.openNew }),
}));

vi.mock("~/stt/capabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/stt/capabilities")>()),
  getLiveTranscriptionConfig: mocks.getLiveTranscriptionConfig,
}));

function renderHint(spokenLanguages: string[] = ["fr"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SingleLanguageModelHint
        mainLanguage="en"
        spokenLanguages={spokenLanguages}
      />
    </QueryClientProvider>,
  );
}

const HINT_LINK = { name: "change models" };

describe("SingleLanguageModelHint", () => {
  beforeEach(() => {
    mocks.config = {
      current_stt_provider: "nvidia",
      current_stt_model: "parakeet",
    };
    mocks.getLiveTranscriptionConfig.mockReset();
    mocks.openNew.mockReset();
  });

  afterEach(cleanup);

  it("shows the hint when the live model keeps only one language", async () => {
    mocks.getLiveTranscriptionConfig.mockResolvedValue({
      languages: ["en"],
      omittedLanguages: ["fr"],
    });

    renderHint();

    const link = await screen.findByRole("button", HINT_LINK);
    expect(link.closest("p")?.textContent).toBe(
      "The live transcription model handles one language at a time. To transcribe several, change models.",
    );
    expect(mocks.getLiveTranscriptionConfig).toHaveBeenCalledWith({
      provider: "nvidia",
      model: "parakeet",
      languages: ["en", "fr"],
    });
  });

  it("opens the Transcription settings from the link", async () => {
    mocks.getLiveTranscriptionConfig.mockResolvedValue({
      languages: ["en"],
      omittedLanguages: ["fr"],
    });

    renderHint();
    fireEvent.click(await screen.findByRole("button", HINT_LINK));

    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "transcription" },
    });
  });

  it("stays hidden when the live model handles every spoken language", async () => {
    mocks.getLiveTranscriptionConfig.mockResolvedValue({
      languages: ["en", "fr"],
    });

    const { container } = renderHint();

    await waitFor(() =>
      expect(mocks.getLiveTranscriptionConfig).toHaveBeenCalled(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe("");
  });

  it("does not check the model without additional spoken languages", () => {
    const { container } = renderHint([]);

    expect(mocks.getLiveTranscriptionConfig).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  it("does not check the model without a transcription model", () => {
    mocks.config = { current_stt_provider: "nvidia" };

    const { container } = renderHint();

    expect(mocks.getLiveTranscriptionConfig).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
