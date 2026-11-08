import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SummarySwitcher } from "./summary-switcher";

// Le vrai sélecteur de modèle (template-picker.tsx), ouvert depuis le menu
// « Synthèse · vN ▾ » (issue 431) : seules ses sources de données sont
// simulées.
const mocks = vi.hoisted(() => ({
  selectTemplate: vi.fn(),
}));

vi.mock("~/session/queries", () => ({
  deleteEnhancedNote: vi.fn(() => Promise.resolve()),
  useEnhancedNote: () => ({
    id: "summary-1",
    content: '{"type":"doc"}',
    generatedAt: "2026-11-08T14:32:00.000Z",
    templateId: null,
  }),
  useSummaryVersions: () => [],
}));

vi.mock("~/session/components/note-input/enhanced-actions", () => ({
  useEnhancedNoteActions: () => ({
    isGenerating: false,
    isError: false,
    onRegenerate: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("~/session/components/note-input/header-enhanced", () => ({
  useEnhancedViewTitle: () => ({ viewTitle: "Summary", templateIcon: null }),
  useSummaryTemplateSelection: () => mocks.selectTemplate,
}));

vi.mock("~/shared/ui/resource-list", () => ({
  useWebResources: () => ({ data: [] }),
}));

vi.mock("~/templates", () => ({
  DEFAULT_TEMPLATE_ICON: { type: "icon", value: "file", color: "gray" },
  TemplateIconGlyph: () => null,
  filterWebTemplatesAgainstUserTemplates: () => [],
  parseWebTemplates: () => [],
  useCreateTemplate: () => vi.fn(),
  useOpenTemplatesTab: () => vi.fn(),
  useUserTemplates: () => [
    {
      id: "template-client",
      title: "Point client",
      pinned: false,
      icon: { type: "icon", value: "file", color: "gray" },
    },
  ],
}));

describe("SummarySwitcher template picker", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the picker anchored to the switcher from the menu", async () => {
    const onSelectView = vi.fn();
    render(
      <SummarySwitcher
        sessionId="session-1"
        enhancedNoteIds={["summary-1"]}
        currentNoteId="summary-1"
        onSelectNote={vi.fn()}
        view={{ kind: "summary" }}
        onSelectView={onSelectView}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Summary versions" }),
      { key: "Enter" },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Change template…" }));

    const search = await screen.findByPlaceholderText("Search templates...");
    expect(screen.queryByRole("menu")).toBeNull();

    // Sans élément d'ancrage, Radix laisse le sélecteur hors de l'écran
    // (translate(0, -200%)) : il paraît ne jamais s'ouvrir.
    const wrapper = search.closest<HTMLElement>(
      "[data-radix-popper-content-wrapper]",
    );
    expect(wrapper).not.toBeNull();
    await waitFor(() => {
      expect(wrapper!.style.transform).not.toContain("-200%");
    });

    fireEvent.click(screen.getByRole("button", { name: "Point client" }));

    expect(mocks.selectTemplate).toHaveBeenCalledWith({
      templateId: "template-client",
      title: "Point client",
    });
    expect(onSelectView).toHaveBeenCalledWith({ kind: "summary" });
    expect(screen.queryByPlaceholderText("Search templates...")).toBeNull();
  });
});
