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

  it("ajoute le fichier, la ligne et la colonne du code en cause", () => {
    expect(
      cspViolationMessage({
        effectiveDirective: "script-src",
        blockedURI: "eval",
        sourceFile: "tauri://localhost/assets/schemas-DiKiOCUP.js?x=1",
        lineNumber: 1,
        columnNumber: 4242,
      }),
    ).toBe("[csp] script-src eval at schemas-DiKiOCUP.js:1:4242");
  });
});
