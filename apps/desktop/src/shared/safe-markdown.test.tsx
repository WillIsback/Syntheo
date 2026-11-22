import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Streamdown } from "streamdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Issue 642 : une image distante dans une sortie du LLM n'émet aucune requête
// tant que l'utilisateur ne la demande pas.
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));

import { streamdownIcons } from "@syntheo/ui/components/streamdown-icons";

import { safeRehypePlugins, SafeMarkdownImage } from "./safe-markdown";

import { streamdownComponents } from "~/session/components/streamdown";

const REMOTE = "https://attaquant.example/p.png?d=secret";

function renderMarkdown(
  markdown: string,
  components: Record<string, unknown> = streamdownComponents,
) {
  return render(
    <Streamdown
      icons={streamdownIcons}
      components={components as never}
      rehypePlugins={safeRehypePlugins}
      mode="static"
      isAnimating={false}
      controls={false}
      linkSafety={{ enabled: false }}
    >
      {markdown}
    </Streamdown>,
  );
}

function images() {
  return Array.from(document.querySelectorAll("img"));
}

describe("rendu sûr des images", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:http://localhost/image-1"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });
  afterEach(() => {
    cleanup();
  });

  it.each([
    ["synthèse", streamdownComponents],
    ["chat", { img: SafeMarkdownImage }],
  ])(
    "%s : une image distante Markdown ou HTML n'est pas rendue en <img>",
    (_, components) => {
      renderMarkdown(
        `Texte\n\n![logo](${REMOTE})\n\n<img src="${REMOTE}" alt="brut">`,
        components,
      );
      expect(images().map((image) => image.getAttribute("src"))).toEqual([]);
      expect(
        screen.getAllByRole("button", { name: "Load image" }),
      ).toHaveLength(2);
      expect(document.body.textContent).toContain("attaquant.example");
      expect(document.body.innerHTML).not.toContain("d=secret");
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  // Issue 677 : une adresse de fichier local (protocole asset) ou de chemin
  // réseau n'est jamais rendue ; seul le texte alternatif reste. `asset://` et
  // `data:` sont déjà retirés par la sanitisation de Streamdown.
  it.each([
    ["synthèse", streamdownComponents],
    ["chat", { img: SafeMarkdownImage }],
  ])("%s : une image de fichier local n'est pas rendue", (_, components) => {
    renderMarkdown(
      "![local](http://asset.localhost/tmp/b.png)\n\n![reseau](http://asset.localhost/%5C%5C192.0.2.1%5Cshare%5Cc.png)",
      components,
    );
    expect(images()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Load image" })).toBeNull();
    expect(document.body.textContent).toContain("local");
    expect(document.body.textContent).toContain("reseau");
    expect(document.body.innerHTML).not.toContain("192.0.2.1");
  });

  it("charge l'image distante au clic, par le client HTTP, puis l'affiche en blob:", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      blob: async () => new Blob(["png"], { type: "image/png" }),
    });
    renderMarkdown(`![logo](${REMOTE})`);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    await waitFor(() =>
      expect(images().map((image) => image.getAttribute("src"))).toEqual([
        "blob:http://localhost/image-1",
      ]),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(REMOTE, { method: "GET" });
  });

  it("refuse une réponse qui n'est pas une image", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      blob: async () => new Blob(["<b>"], { type: "text/html" }),
    });
    renderMarkdown(`![logo](${REMOTE})`);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    await screen.findByRole("button", { name: "Image unavailable" });
    expect(images()).toEqual([]);
  });

  it("préfixe les id et name du HTML brut (pas de clobbering de document)", () => {
    renderMarkdown(
      '<a name="createElement" id="getElementById" href="https://example.com">lien</a>',
    );
    const link = screen.getByText("lien").closest("a");
    expect(link?.getAttribute("name")).toBe("user-content-createElement");
    expect(link?.getAttribute("id")).toBe("user-content-getElementById");
    expect(typeof document.createElement).toBe("function");
  });
});
