import { describe, expect, it } from "vitest";

import { cspViolationMessage } from "./csp-report";

describe("cspViolationMessage", () => {
  it("ne garde que la directive et l'origine bloquée", () => {
    expect(
      cspViolationMessage({
        effectiveDirective: "img-src",
        blockedURI: "https://attaquant.example/p.png?d=secret",
      }),
    ).toBe("[csp] img-src https://attaquant.example");
  });

  it("garde les mots-clés courts", () => {
    expect(
      cspViolationMessage({
        effectiveDirective: "script-src",
        blockedURI: "inline",
      }),
    ).toBe("[csp] script-src inline");
  });

  it("réduit une adresse sans origine à son protocole", () => {
    expect(
      cspViolationMessage({
        effectiveDirective: "img-src",
        blockedURI: "data:image/png;base64,AAAA",
      }),
    ).toBe("[csp] img-src data:");
  });
});
