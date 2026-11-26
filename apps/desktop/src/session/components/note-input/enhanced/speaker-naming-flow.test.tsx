import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Enhanced } from "./index";

import type { SpeakerCard } from "~/session/components/speaker-naming/speakers";
import {
  markSpeakerNamed,
  useSpeakerNamingStore,
} from "~/session/components/speaker-naming/store";

/**
 * Issue 773 : la vraie vue de synthèse avec la vraie barre de nommage.
 * Pendant une génération, la vue de streaming remplace la synthèse et la
 * barre est démontée : la proposition de régénérer ne doit pas compter sur
 * elle pour oublier les noms déjà pris en compte.
 */
const hoisted = vi.hoisted(() => ({
  status: "idle" as "idle" | "generating" | "success",
  generatedAt: null as string | null,
  content: "- **Speaker 2** : accord sur le budget",
  cards: [] as SpeakerCard[],
}));

vi.mock("~/ai/hooks", () => ({
  useAITaskTask: () => ({
    status: hoisted.status,
    error: undefined,
    streamedText: hoisted.status === "generating" ? "En cours" : "",
  }),
  useLLMConnectionStatus: () => ({
    status: "success",
    providerId: "custom",
    isHosted: false,
  }),
}));

vi.mock("~/session/queries", () => ({
  useEnhancedNote: () => ({
    content: hoisted.content,
    generatedAt: hoisted.generatedAt,
  }),
}));

vi.mock("~/settings/managed", () => ({
  useIntelligenceDisabled: () => ({ managed: false, blocked: false }),
}));

vi.mock("~/session/hooks/useGenerateSummary", () => ({
  useGenerateSummary: () => ({ generate: vi.fn(), pending: false }),
}));

vi.mock("./streaming", () => ({
  StreamingView: () => <div role="status">Streaming</div>,
}));

vi.mock("./editor", () => ({
  EnhancedEditor: () => <div data-testid="enhanced-editor" />,
}));

vi.mock("./config-error", () => ({ ConfigError: () => null }));
vi.mock("./enhance-error", () => ({ EnhanceError: () => null }));

vi.mock("~/session/components/note-input/enhanced-actions", () => ({
  useEnhancedNoteActions: () => ({
    isGenerating: hoisted.status === "generating",
    summaryOff: false,
    onRegenerate: vi.fn(),
  }),
}));

vi.mock("~/session/components/speaker-naming/use-speaker-cards", () => ({
  useSpeakerCards: () => ({ cards: hoisted.cards, ready: true }),
}));

vi.mock("~/session/components/speaker-naming/dialog", () => ({
  SpeakerNamingDialog: () => null,
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ live: { sessionId: null, status: "inactive" } }),
}));

const FIRST_SUMMARY_AT = Date.parse("2025-06-02T09:00:00.000Z");
const REGENERATE = { name: "Regenerate summary with names" };

function view() {
  return (
    <Enhanced
      sessionId="session-1"
      sessionTitle="Point budget"
      enhancedNoteId="note-1"
    />
  );
}

describe("Enhanced summary and speaker naming (issue 773)", () => {
  beforeEach(() => {
    hoisted.status = "idle";
    hoisted.generatedAt = new Date(FIRST_SUMMARY_AT).toISOString();
    hoisted.cards = [];
    useSpeakerNamingStore.setState({
      available: null,
      requested: null,
      named: {},
    });
  });

  afterEach(() => cleanup());

  it("stops proposing once a summary is generated after the names", () => {
    const { rerender } = render(view());
    expect(screen.getByTestId("enhanced-editor")).not.toBeNull();
    expect(screen.queryByRole("button", REGENERATE)).toBeNull();

    // Un intervenant nommé après la synthèse : la proposition apparaît.
    act(() => markSpeakerNamed("session-1", FIRST_SUMMARY_AT + 60_000));
    expect(screen.getByRole("button", REGENERATE)).not.toBeNull();

    // Une génération lancée ailleurs (en-tête, palette) : la vue de
    // streaming remplace la synthèse, la barre est démontée.
    hoisted.status = "generating";
    rerender(view());
    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.queryByTestId("enhanced-editor")).toBeNull();

    // Fin de génération : la nouvelle synthèse est plus récente que le nom.
    hoisted.status = "success";
    hoisted.generatedAt = new Date(FIRST_SUMMARY_AT + 120_000).toISOString();
    rerender(view());
    expect(screen.getByTestId("enhanced-editor")).not.toBeNull();
    expect(screen.queryByRole("button", REGENERATE)).toBeNull();

    // Un nouveau nom après cette synthèse la propose de nouveau.
    act(() => markSpeakerNamed("session-1", FIRST_SUMMARY_AT + 180_000));
    expect(screen.getByRole("button", REGENERATE)).not.toBeNull();
  });

  it("proposes nothing for a summary without any name given", () => {
    render(view());

    expect(screen.getByTestId("enhanced-editor")).not.toBeNull();
    expect(screen.queryByRole("button", REGENERATE)).toBeNull();
    expect(
      screen.queryByText("The summary still mentions unnamed speakers."),
    ).toBeNull();
  });
});
