import { describe, expect, it } from "vitest";

import { appLinkHttpUrl, appLinkNodeSpec } from "./app-link-spec";

// Issue 655 : une pastille collée depuis du HTML ne garde qu'une adresse
// http(s).
describe("app link URLs", () => {
  it("keeps http(s) and drops other schemes", () => {
    expect(appLinkHttpUrl("https://github.com/acme/app/issues/1")).toBe(
      "https://github.com/acme/app/issues/1",
    );
    for (const value of [
      "file:///etc/passwd",
      "ms-msdt:/id x",
      "javascript:alert(1)",
      "not a url",
      "",
      null,
    ]) {
      expect(appLinkHttpUrl(value)).toBeNull();
    }
  });

  it("parses a pasted chip without its non-http URL", () => {
    const span = document.createElement("span");
    span.setAttribute("data-type", "app-link");
    span.setAttribute("data-url", "smb://attacker/share");
    const rule = appLinkNodeSpec.parseDOM?.[0];
    const attrs = (rule as { getAttrs: (dom: HTMLElement) => any }).getAttrs(
      span,
    );
    expect(attrs.url).toBeNull();
  });
});
