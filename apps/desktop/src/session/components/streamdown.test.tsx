import { cleanup, render } from "@testing-library/react";
import { Streamdown } from "streamdown";
import { afterEach, describe, expect, it } from "vitest";

import {
  type AttachmentResolver,
  AttachmentResolverContext,
} from "@syntheo/editor/node-views";

import { streamdownComponents } from "./streamdown";

import { summaryBodyToMarkdown } from "~/session/summary-markdown";
import {
  safeRehypePlugins,
  summaryRehypePlugins,
} from "~/shared/safe-markdown";

// Pièce jointe connue de la session : son adresse locale vient du résolveur,
// jamais du Markdown (issue 697).
const KNOWN_SRC = "asset://localhost/sessions/s1/attachments/capture%201.png";
const resolver: AttachmentResolver = (attachmentId) =>
  attachmentId === "capture 1.png"
    ? { path: "/sessions/s1/attachments/capture 1.png", src: KNOWN_SRC }
    : null;

function renderMarkdown(
  markdown: string,
  resolve: AttachmentResolver | null = resolver,
  rehypePlugins = summaryRehypePlugins,
) {
  return render(
    <AttachmentResolverContext.Provider value={resolve}>
      <Streamdown
        components={streamdownComponents}
        rehypePlugins={rehypePlugins}
        linkSafety={{ enabled: false }}
      >
        {markdown}
      </Streamdown>
    </AttachmentResolverContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("streamdownComponents.img", () => {
  it("affiche une pièce jointe de la session désignée par son identifiant", () => {
    const { container } = renderMarkdown(
      "![Tableau blanc](attachment://capture%201.png)",
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(KNOWN_SRC);
    expect(img?.getAttribute("alt")).toBe("Tableau blanc");
  });

  it("laisse le texte alternatif d'un identifiant inconnu ou sans résolveur", () => {
    const unknown = renderMarkdown("![Inconnue](attachment://autre.png)");
    expect(unknown.container.querySelector("img")).toBeNull();
    expect(unknown.container.textContent).toContain("Inconnue");
    cleanup();

    const noResolver = renderMarkdown(
      "![Sans session](attachment://capture%201.png)",
      null,
    );
    expect(noResolver.container.querySelector("img")).toBeNull();
    expect(noResolver.container.textContent).toContain("Sans session");
  });

  it.each([
    ["asset", KNOWN_SRC],
    ["asset.localhost", "http://asset.localhost/etc/secret.png"],
    ["file", "file:///etc/secret.png"],
    ["distante", "https://example.com/pixel.png"],
    ["chemin", "/home/user/secret.png"],
  ])(
    "bloque toujours une adresse %s écrite dans le Markdown",
    (_label, src) => {
      const { container } = renderMarkdown(`![Bloquée](${src})`);
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent).toContain("Bloquée");
    },
  );

  it("n'ouvre pas attachment:// aux autres rendus de contenu généré", () => {
    const { container } = renderMarkdown(
      "![Chat](attachment://capture%201.png)",
      resolver,
      safeRehypePlugins,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("summaryBodyToMarkdown", () => {
  it("désigne une image jointe par son identifiant, sans son adresse locale", () => {
    const body = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            attachmentId: "capture 1.png",
            src: "asset://localhost/sessions/s1/attachments/capture%201.png",
            alt: "Tableau blanc",
          },
        },
        {
          type: "image",
          attrs: { attachmentId: "schéma (v2).png", alt: "Schéma" },
        },
      ],
    });
    const markdown = summaryBodyToMarkdown(body, "json");
    expect(markdown).toContain("attachment://capture%201.png");
    expect(markdown).toContain("attachment://sch%C3%A9ma%20%28v2%29.png");
    expect(markdown).not.toContain("asset://");
  });

  it("rend une pièce jointe affichable par le rendu des versions", () => {
    const body = JSON.stringify({
      type: "doc",
      content: [
        { type: "image", attrs: { attachmentId: "capture 1.png", alt: "Vue" } },
      ],
    });
    const { container } = renderMarkdown(summaryBodyToMarkdown(body, "json"));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(KNOWN_SRC);
  });

  it("renvoie un corps Markdown tel quel", () => {
    expect(summaryBodyToMarkdown("# Titre", "markdown")).toBe("# Titre");
  });
});
