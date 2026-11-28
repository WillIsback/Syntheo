import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Issue 815 : le nom d'un sous-dossier ne doit jamais rétrécir. Le
// rétrécissement flex est pondéré par la largeur de base : même à 1 contre
// 1000 pour le parent, le nom perdait une fraction de pixel et s'affichait
// avec une ellipse alors que le parent avait encore 137 px. La mesure dans un
// vrai navigateur est la preuve ; ce test garde la structure des règles.
const css = readFileSync(join(import.meta.dirname, "mention.css"), "utf8");

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`règle ${selector} absente`);
  const body = match[1].replace(/\/\*[\s\S]*?\*\//g, "");
  return Object.fromEntries(
    body
      .split(";")
      .map((line) => line.split(":").map((part) => part.trim()))
      .filter(([property, value]) => property && value)
      .map(([property, value]) => [property, value]),
  );
}

describe("mention.css : nom et parent d'un sous-dossier", () => {
  it("le nom ne rétrécit jamais et reste plafonné à sa boîte", () => {
    const label = declarations(".mention-label");
    expect(label["flex-shrink"]).toBe("0");
    expect(label["max-width"]).toBe("100%");
    expect(label["text-overflow"]).toBe("ellipsis");
    expect(label.overflow).toBe("hidden");
  });

  it("le parent seul cède la place dans une boîte qui peut se réduire à rien", () => {
    const box = declarations(".mention-name");
    expect(box.display).toBe("flex");
    expect(box["min-width"]).toBe("0");
    expect(box.overflow).toBe("hidden");

    const context = declarations(".mention-context");
    expect(context["min-width"]).toBe("0");
    expect(context["flex-shrink"] ?? "1").not.toBe("0");
  });

  it("le compteur de droite n'est pas coupé tant que la ligne a de la place", () => {
    const description = declarations(".mention-description");
    expect(description["flex-shrink"]).toBe("0");
    expect(description["max-width"]).toBe("50%");
  });
});
