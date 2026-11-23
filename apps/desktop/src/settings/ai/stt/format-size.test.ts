import { describe, expect, it } from "vitest";

import { formatSize } from "./format-size";

// QA 0.8.0-4 : séparateur et unité selon la langue de l'interface, jamais
// « 0 Mo » pour une taille non nulle.
describe("formatSize", () => {
  it("writes gigabytes with the separator and unit of the language", () => {
    expect(formatSize(1_066_110_000, "fr")).toBe("1,1 Go");
    expect(formatSize(1_066_110_000, "fr-FR")).toBe("1,1 Go");
    expect(formatSize(1_066_110_000, "en")).toBe("1.1 GB");
  });

  it("writes megabytes, never 0 for a non-empty size", () => {
    expect(formatSize(340_000_000, "fr")).toBe("340 Mo");
    expect(formatSize(340_000_000, "en")).toBe("340 MB");
    expect(formatSize(409_549, "fr")).toBe("1 Mo");
    expect(formatSize(409_549, "en")).toBe("1 MB");
    expect(formatSize(0, "en")).toBe("0 MB");
  });
});
