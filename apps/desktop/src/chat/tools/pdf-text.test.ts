import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { extractPdfText, inflateZlib, isPdfMaterial } from "./pdf-text";

describe("pdf text extraction", () => {
  it("recognizes PDF materials", () => {
    expect(isPdfMaterial("application/pdf", "syllabus.pdf")).toBe(true);
    expect(isPdfMaterial("text/plain", "notes.txt")).toBe(false);
  });

  it("extracts show-text operators from a FlateDecode stream", async () => {
    const bytes = buildPdf("(Office hours: Friday 2pm) Tj");

    await expect(extractPdfText(bytes)).resolves.toBe(
      "Office hours: Friday 2pm",
    );
  });

  it("extracts TJ arrays and literal escapes", async () => {
    const bytes = buildPdf("[(Week 1: ) 20 (intro\\nlab)] TJ");

    await expect(extractPdfText(bytes)).resolves.toBe("Week 1: intro lab");
  });

  it("resolves an indirect /Length object instead of treating the ref as bytes", async () => {
    const bytes = buildPdf("(Office hours: Friday 2pm) Tj", {
      indirectLength: true,
    });

    await expect(extractPdfText(bytes)).resolves.toBe(
      "Office hours: Friday 2pm",
    );
  });

  it("scans to endstream when an indirect /Length object is missing", async () => {
    const bytes = buildPdf("(Office hours: Friday 2pm) Tj", {
      lengthRef: "99 0 R",
    });

    await expect(extractPdfText(bytes)).resolves.toBe(
      "Office hours: Friday 2pm",
    );
  });

  // Issue 654 : une bombe zlib n'est décompressée que jusqu'au plafond.
  it("stops inflating at the cap", async () => {
    const bomb = deflateSync(Buffer.alloc(64 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(200_000);

    const inflated = await inflateZlib(new Uint8Array(bomb), 1_000_000);

    expect(inflated?.length).toBe(1_000_000);
  });

  it("reads a PDF made of a zlib bomb without decompressing it all", async () => {
    const bytes = buildPdf(`(Avant) Tj ${"0 ".repeat(20_000_000)}`);

    await expect(extractPdfText(bytes)).resolves.toBe("Avant");
  });

  // Issue 654 : une parenthèse jamais fermée ne fait plus relire la fin du
  // flux à chaque position (lecture quadratique).
  it("stops at an unterminated string in linear time", async () => {
    const bytes = buildPdf(`(Titre) Tj ${"(a ".repeat(200_000)}`);
    const started = performance.now();

    await expect(extractPdfText(bytes)).resolves.toBe("Titre");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("returns null for non-PDF bytes", async () => {
    await expect(
      extractPdfText(Array.from(new TextEncoder().encode("hello"))),
    ).resolves.toBeNull();
  });
});

function buildPdf(
  contentStream: string,
  options: { indirectLength?: boolean; lengthRef?: string } = {},
): Uint8Array {
  const compressed = deflateSync(
    Buffer.from(`BT ${contentStream} ET`, "latin1"),
  );
  const length = options.lengthRef
    ? options.lengthRef
    : options.indirectLength
      ? "2 0 R"
      : String(compressed.length);
  const lengthObject = options.indirectLength
    ? `2 0 obj\n${compressed.length}\nendobj\n`
    : "";
  const header = `%PDF-1.1\n${lengthObject}1 0 obj\n<< /Length ${length} /Filter /FlateDecode >>\nstream\n`;
  const stream = Buffer.concat([
    Buffer.from(header, "latin1"),
    compressed,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
  return new Uint8Array(stream);
}
