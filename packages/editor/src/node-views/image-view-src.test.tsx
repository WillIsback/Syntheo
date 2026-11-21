import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Issue 661 : une image déposée garde son adresse quand la note enregistrée
// ne garde plus que l'identifiant de la pièce jointe, tant que le résolveur
// ne la connaît pas encore.
vi.mock("@handlewithcare/react-prosemirror", () => ({
  useEditorEventCallback: (callback: unknown) => callback,
  useIsNodeSelected: () => false,
}));

import { AttachmentResolverContext } from "./attachment-resolver";
import { ResizableImageView } from "./image-view";

type Attrs = Record<string, unknown>;

function view(attrs: Attrs, resolve: (id: string) => { src: string } | null) {
  const nodeProps = {
    node: { attrs: { editorWidth: 80, ...attrs } },
    getPos: () => 0,
  } as never;
  return (
    <AttachmentResolverContext.Provider value={resolve as never}>
      <ResizableImageView nodeProps={nodeProps} />
    </AttachmentResolverContext.Provider>
  );
}

function imageSrc() {
  return document.querySelector("img")?.getAttribute("src") ?? null;
}

describe("ResizableImageView", () => {
  afterEach(cleanup);

  it("keeps the inserted address once the saved note drops it", () => {
    const unknown = () => null;
    const { rerender } = render(
      view(
        { attachmentId: "att-dropped", src: "asset://localhost/notes/a.png" },
        unknown,
      ),
    );
    expect(imageSrc()).toBe("asset://localhost/notes/a.png");

    // Note enregistrée : `src` retiré, résolveur pas encore à jour.
    rerender(view({ attachmentId: "att-dropped" }, unknown));
    expect(imageSrc()).toBe("asset://localhost/notes/a.png");
  });

  it("keeps it after the view is mounted again", () => {
    const unknown = () => null;
    render(
      view(
        { attachmentId: "att-remount", src: "asset://localhost/notes/b.png" },
        unknown,
      ),
    );
    cleanup();
    render(view({ attachmentId: "att-remount" }, unknown));
    expect(imageSrc()).toBe("asset://localhost/notes/b.png");
  });

  it("prefers the resolver once it knows the attachment", () => {
    render(
      view({ attachmentId: "att-resolved" }, (id) =>
        id === "att-resolved"
          ? { src: "asset://localhost/attachments/c.png" }
          : null,
      ),
    );
    expect(imageSrc()).toBe("asset://localhost/attachments/c.png");
  });

  it("renders no address for an unknown attachment", () => {
    render(view({ attachmentId: "att-never-seen" }, () => null));
    expect(imageSrc()).toBeNull();
  });
});
