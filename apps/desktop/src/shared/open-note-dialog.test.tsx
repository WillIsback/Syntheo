import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildSearchFolders } from "~/search/unified/rank";
import type { SearchCatalog, SearchNote } from "~/search/unified/types";

const mocks = vi.hoisted(() => ({
  openCurrent: vi.fn(),
  openNew: vi.fn(),
  onOpenChange: vi.fn(),
  createNewNote: vi.fn(),
  setSelectedPath: vi.fn(),
  folderPaths: [] as string[],
  notes: [] as Array<{
    shareId: string;
    sessionId: string;
    title: string;
    publishedAt: string;
    manageAccess: boolean;
  }>,
  catalog: {
    notes: [],
    folders: [],
    contacts: [],
  } as SearchCatalog,
  search: vi.fn(),
  createSession: vi.fn(),
  askFolder: vi.fn(),
  live: {
    status: "inactive",
    sessionId: null as string | null,
    pause: null as { sessionId: string; phase: string } | null,
  },
  requestMainListenerControl: vi.fn(),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: { live: typeof mocks.live }) => unknown) =>
    selector({ live: mocks.live }),
}));

vi.mock("~/stt/window-control", () => ({
  requestMainListenerControl: mocks.requestMainListenerControl,
}));

vi.mock("~/settings/team/mirror", () => ({
  useMyWorkspacesWithMirror: () => ({ data: [], isLoading: false }),
}));

vi.mock("~/session/queries", () => ({
  createSession: mocks.createSession,
}));

// Le catalogue (requêtes vives) et l'index plein texte sont simulés ; le
// classement, lui, est le vrai, commun à la palette et aux mentions.
vi.mock("~/search/unified/catalog", () => ({
  useSearchCatalog: () => mocks.catalog,
}));

vi.mock("~/search/contexts/engine", () => ({
  useSearchEngine: () => ({ search: mocks.search }),
}));

vi.mock("~/chat/ask-folder", () => ({
  askFolder: mocks.askFolder,
}));

vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => mocks.createNewNote,
}));

vi.mock("~/folders/selection", () => ({
  useFolderSelection: {
    getState: () => ({ setSelectedPath: mocks.setSelectedPath }),
  },
}));

vi.mock("~/shared-notes/cache", () => ({
  useDurableSharedNotes: () => mocks.notes,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (
    selector: (state: {
      openCurrent: typeof mocks.openCurrent;
      openNew: typeof mocks.openNew;
      recentlyOpenedSessionIds: string[];
    }) => unknown,
  ) =>
    selector({
      openCurrent: mocks.openCurrent,
      openNew: mocks.openNew,
      recentlyOpenedSessionIds: [],
    }),
}));

import {
  closeNoteDialog,
  OpenNoteDialog,
  openNoteDialog,
  OpenNoteDialogProvider,
  useOpenNoteDialog,
} from "./open-note-dialog";

import { useMentionConfig } from "~/editor-bridge/mention-config";
import { useSpeakerNamingStore } from "~/session/components/speaker-naming/store";
import { useSettingFocus } from "~/settings/setting-focus";
import { openSettingsSearch } from "~/shared/palette-store";

function setCatalog(notes: SearchNote[], folderPaths: string[] = []) {
  mocks.catalog = {
    notes,
    folders: buildSearchFolders(folderPaths, notes),
    contacts: [],
  };
}

function searchHits(
  hits: Array<{ id: string; score: number; snippet?: string }>,
) {
  mocks.search.mockResolvedValue(
    hits.map((hit) => ({
      score: hit.score,
      document: {
        id: hit.id,
        type: "session",
        title: "",
        content: "",
        created_at: 0,
      },
      contentSnippet: hit.snippet ?? null,
    })),
  );
}

describe("OpenNoteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notes = [];
    setCatalog([]);
    mocks.search.mockResolvedValue([]);
    mocks.folderPaths = [];
    mocks.live = { status: "inactive", sessionId: null, pause: null };
    closeNoteDialog();
    useSettingFocus.getState().clear();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  it("closes through the shared dialog escape behavior", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows top-level pages when the query is empty", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(screen.getByText("Go to")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Contacts" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Transcription" })).toBeNull();
  });

  it("opens a matching page from the global navigator", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.change(screen.getByPlaceholderText("Search notes and pages..."), {
      target: { value: "contact" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Contacts" }));

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "contacts" });
  });

  it("opens a matching settings sub-page", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.change(screen.getByPlaceholderText("Search notes and pages..."), {
      target: { value: "transcription" },
    });
    // La page passe avant les réglages de la page (groupe « Aller à »).
    fireEvent.click(
      screen.getAllByRole("option", { name: /Transcription/ })[0]!,
    );

    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "transcription" },
    });
  });

  it("shows an empty state when no pages or notes match", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.change(screen.getByPlaceholderText("Search notes and pages..."), {
      target: { value: "zzzz" },
    });

    expect(screen.getByText("No results found.")).toBeTruthy();
  });

  it("propose « Nouvelle note » et crée une note", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.click(screen.getByRole("option", { name: /New note/ }));

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.createNewNote).toHaveBeenCalledOnce();
  });

  // Issue 353 : commande contextuelle, sans raccourci dédié.
  it("propose « Mettre en pause l'écoute » pendant une écoute", () => {
    mocks.live = { status: "active", sessionId: "session-1", pause: null };
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(
      screen.queryByRole("option", { name: /Resume listening/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Pause listening/ }));

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.requestMainListenerControl).toHaveBeenCalledWith(
      "pause",
      "session-1",
    );
  });

  it("propose « Reprendre l'écoute » pendant une pause", () => {
    mocks.live = {
      status: "inactive",
      sessionId: null,
      pause: { sessionId: "session-1", phase: "paused" },
    };
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(
      screen.queryByRole("option", { name: /Pause listening/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Resume listening/ }));

    expect(mocks.requestMainListenerControl).toHaveBeenCalledWith(
      "resume",
      "session-1",
    );
  });

  // Issue 321 : seulement quand la note affichée a des locuteurs anonymes.
  it("propose « Nommer les intervenants » pour la note affichée", () => {
    useSpeakerNamingStore.setState({
      available: { sessionId: "session-9", count: 2 },
      requested: null,
    });
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    fireEvent.click(screen.getByRole("option", { name: /Name speakers/ }));

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(useSpeakerNamingStore.getState().requested).toBe("session-9");
  });

  it("ne propose pas « Nommer les intervenants » sans locuteur anonyme", () => {
    useSpeakerNamingStore.setState({ available: null, requested: null });
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(screen.queryByRole("option", { name: /Name speakers/ })).toBeNull();
  });

  it("ne propose aucune commande d'écoute hors écoute", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(
      screen.queryByRole("option", { name: /Pause listening/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("option", { name: /Resume listening/ }),
    ).toBeNull();
  });

  it("ouvre un dossier depuis la recherche (ex-filtre de la barre latérale)", () => {
    setCatalog([], ["Clients", "Clients/ACME"]);
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    expect(screen.queryByRole("option", { name: /ACME/ })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search notes and pages..."), {
      target: { value: "acme" },
    });
    fireEvent.click(screen.getByRole("option", { name: /ACME/ }));

    expect(mocks.setSelectedPath).toHaveBeenCalledWith("Clients/ACME");
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "folders" });
  });

  it("s'ouvre depuis n'importe où via openNoteDialog()", () => {
    render(
      <OpenNoteDialogProvider>
        <p>contenu</p>
      </OpenNoteDialogProvider>,
    );

    expect(
      screen.queryByPlaceholderText("Search notes and pages..."),
    ).toBeNull();

    act(() => openNoteDialog());

    expect(
      screen.getByPlaceholderText("Search notes and pages..."),
    ).toBeTruthy();
  });

  it("garde une API useOpenNoteDialog stable, même hors provider", () => {
    const { result, rerender } = renderHook(() => useOpenNoteDialog());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
    expect(result.current.open).toBe(openNoteDialog);
  });
});

// Issue 373 : une seule recherche de paramètres, trois portes d'entrée.
describe("recherche de paramètres dans la palette", () => {
  const search = (value: string) =>
    fireEvent.change(screen.getByRole("combobox"), { target: { value } });

  beforeEach(() => {
    vi.clearAllMocks();
    setCatalog([]);
    mocks.search.mockResolvedValue([]);
    mocks.folderPaths = [];
    mocks.live = { status: "inactive", sessionId: null, pause: null };
    closeNoteDialog();
    useSettingFocus.getState().clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  it("Ctrl+K : groupe Paramètres limité à 5, puis « Voir les N paramètres »", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openNoteDialog());

    search("dictation");

    const settingOptions = screen
      .getAllByRole("option")
      .filter((option) =>
        option.getAttribute("data-value")?.startsWith("setting-"),
      );
    expect(settingOptions).toHaveLength(5);
    expect(screen.getByText("Go to")).toBeTruthy();

    fireEvent.click(screen.getByRole("option", { name: "See all 6 settings" }));

    expect(
      screen.getByRole("button", { name: "Remove the Settings filter" }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("option")
        .filter((option) =>
          option.getAttribute("data-value")?.startsWith("setting-"),
        ),
    ).toHaveLength(6);
  });

  it("Entrée ouvre la page et demande l'arrivée sur le réglage", () => {
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    search("dark");
    fireEvent.click(screen.getByRole("option", { name: /^Theme/ }));

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
    expect(useSettingFocus.getState().pending).toBe("theme");
    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "appearance" },
    });
  });

  it("Ctrl+Maj+P : palette filtrée, sans notes ni commandes", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openSettingsSearch());

    expect(screen.getByPlaceholderText("Search settings")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove the Settings filter" }),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: /New note/ })).toBeNull();

    search("micro");
    const [first] = screen.getAllByRole("option");
    expect(first?.textContent).toContain("Microphone");
    expect(first?.textContent).toContain("Meetings › Audio");
  });

  it("annonce l'absence de résultat avec un conseil", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openSettingsSearch());

    search("micor");

    expect(screen.getByText("No setting matches “micor”.")).toBeTruthy();
    expect(
      screen.getByText("Check the spelling, or try a shorter word."),
    ).toBeTruthy();
  });

  it("Retour arrière dans un champ vide retire le filtre", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openSettingsSearch());

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });

    expect(
      screen.queryByRole("button", { name: "Remove the Settings filter" }),
    ).toBeNull();
    expect(
      screen.getByPlaceholderText("Search notes and pages..."),
    ).toBeTruthy();
  });

  it("l'étiquette « Paramètres × » retire aussi le filtre", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openSettingsSearch());

    fireEvent.click(
      screen.getByRole("button", { name: "Remove the Settings filter" }),
    );

    expect(screen.getByRole("option", { name: /New note/ })).toBeTruthy();
  });
});

// Issue 501 : un seul moteur pour Ctrl+K et les mentions `@`.
describe("recherche commune dans la palette", () => {
  const ATLAS = "Réunion produit Atlas";
  const notes: SearchNote[] = [
    {
      id: "hebdo",
      title: "Point hebdo Atlas",
      createdAt: "2026-11-02T09:00:00Z",
      folderPath: ATLAS,
    },
    {
      id: "atelier",
      title: "Atelier onboarding",
      createdAt: "2026-10-19T09:00:00Z",
      folderPath: `${ATLAS}/Ateliers`,
    },
    {
      id: "comite",
      title: "Comité de direction",
      createdAt: "2026-10-29T09:00:00Z",
      folderPath: "Comité",
    },
  ];
  const type = (value: string) =>
    fireEvent.change(screen.getByRole("combobox"), { target: { value } });
  const noteOptions = () =>
    screen
      .getAllByRole("option")
      .filter((option) =>
        option.getAttribute("data-value")?.startsWith("note-"),
      )
      .map((option) => option.getAttribute("data-value")!.slice(5));

  beforeEach(() => {
    vi.clearAllMocks();
    setCatalog(notes, ["Comité", ATLAS, `${ATLAS}/Ateliers`]);
    mocks.search.mockResolvedValue([]);
    mocks.live = { status: "inactive", sessionId: null, pause: null };
    closeNoteDialog();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  it("met le dossier en tête avec son nombre de réunions, et le dossier sur chaque note", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openNoteDialog());

    type("atlas");

    const [first] = screen.getAllByRole("option");
    expect(first?.getAttribute("data-value")).toBe(`folder-${ATLAS}`);
    expect(first?.textContent).toContain("2 meetings");
    expect(first?.textContent).toContain("Tab: search inside");
    const hebdo = screen.getByRole("option", { name: /Point hebdo Atlas/ });
    expect(hebdo.textContent).toContain(ATLAS);
  });

  it("cherche aussi dans le contenu des notes (index plein texte)", async () => {
    searchHits([
      { id: "comite", score: 3, snippet: "date de livraison du 27" },
    ]);
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);

    type("livraison");

    const option = await screen.findByRole("option", {
      name: /Comité de direction/,
    });
    expect(option.textContent).toContain("date de livraison du 27");
    expect(option.textContent).toContain("Comité");
    expect(mocks.search).toHaveBeenCalledWith(
      "livraison",
      null,
      expect.objectContaining({ snippets: true }),
    );

    // La frappe continue : le résultat reste affiché (pas de clignotement)
    // pendant que l'index cherche le nouveau texte ; un texte sans rapport
    // l'efface aussitôt.
    mocks.search.mockReturnValue(new Promise(() => {}));
    type("livraisons");
    expect(
      screen.getByRole("option", { name: /Comité de direction/ }),
    ).toBeTruthy();
    type("budget");
    expect(
      screen.queryByRole("option", { name: /Comité de direction/ }),
    ).toBeNull();
  });

  it("Tab pose le dossier en filtre : sous-dossiers compris, puis retrait", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openNoteDialog());

    type("atlas");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });

    expect(
      screen.getByRole("button", {
        name: `Remove the ${ATLAS} folder filter`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Search in this folder..."),
    ).toBeTruthy();
    expect(noteOptions()).toEqual(["hebdo", "atelier"]);
    expect(screen.getByRole("option", { name: /Ask the folder/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^New note$/ })).toBeNull();

    // Retour arrière dans le champ vide : on sort du dossier.
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });
    expect(screen.queryByRole("button", { name: /folder filter/ })).toBeNull();
  });

  it("la pastille du dossier se retire d'un clic", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openNoteDialog());
    type("atlas");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });

    fireEvent.click(
      screen.getByRole("button", { name: `Remove the ${ATLAS} folder filter` }),
    );

    expect(
      screen.getByPlaceholderText("Search notes and pages..."),
    ).toBeTruthy();
  });

  it("Tab ne fait rien hors d'un dossier", () => {
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openNoteDialog());

    type("comité de");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });

    expect(screen.queryByRole("button", { name: /folder filter/ })).toBeNull();
  });

  it("dans un dossier : « Demander au dossier » et « Nouvelle note dans ce dossier »", async () => {
    mocks.createSession.mockResolvedValue("nouvelle");
    render(<OpenNoteDialogProvider>{null}</OpenNoteDialogProvider>);
    act(() => openNoteDialog());
    type("atlas");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });
    type("livraison");

    fireEvent.click(
      screen.getByRole("option", { name: "Ask the folder: “livraison”" }),
    );
    expect(mocks.askFolder).toHaveBeenCalledWith(ATLAS, "livraison");

    act(() => openNoteDialog());
    type("atlas");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });
    fireEvent.click(
      screen.getByRole("option", { name: /New note in this folder/ }),
    );

    expect(mocks.createSession).toHaveBeenCalledWith("", undefined, {
      folder_id: ATLAS,
    });
    await vi.waitFor(() =>
      expect(mocks.openNew).toHaveBeenCalledWith({
        type: "sessions",
        id: "nouvelle",
      }),
    );
  });

  it("même requête : mêmes notes, dans le même ordre, dans la palette et les mentions", async () => {
    searchHits([
      { id: "atelier", score: 2, snippet: "atlas en atelier" },
      { id: "inconnue", score: 9 },
    ]);
    render(<OpenNoteDialog open onOpenChange={mocks.onOpenChange} />);
    type("atlas");
    await screen.findByRole("option", { name: /Atelier onboarding/ });
    const paletteNotes = noteOptions();

    const { result } = renderHook(() => useMentionConfig());
    const items = await result.current.handleSearch("atlas");
    const mentionNotes = items
      .filter((item) => item.type === "session")
      .map((item) => item.id);

    expect(paletteNotes).toEqual(["hebdo", "atelier"]);
    expect(mentionNotes).toEqual(paletteNotes);
    // Le dossier vient en tête des deux côtés ; les notes montrent le leur.
    expect(items[0]).toMatchObject({
      type: "folder",
      id: ATLAS,
      label: ATLAS,
    });
    expect(items.find((item) => item.id === "atelier")?.description).toBe(
      `${ATLAS} / Ateliers`,
    );
  });
});
