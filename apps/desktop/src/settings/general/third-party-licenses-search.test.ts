import { describe, expect, it } from "vitest";

import {
  componentMatches,
  licenseMatches,
  nameMatches,
  spdxIdentifiers,
} from "./third-party-licenses-search";

// Issue 774 : recherche par identifiant SPDX en mots entiers et par début de
// segment du nom, au lieu d'une sous-chaîne.
describe("license search", () => {
  it("splits an SPDX expression into identifiers", () => {
    expect(spdxIdentifiers("(MIT OR Apache-2.0) AND Unicode-3.0")).toEqual([
      "mit",
      "apache-2.0",
      "unicode-3.0",
    ]);
    expect(spdxIdentifiers("Apache-2.0 WITH LLVM-exception")).toEqual([
      "apache-2.0",
      "llvm-exception",
    ]);
  });

  it("matches whole SPDX identifiers, case-insensitively", () => {
    expect(licenseMatches("MIT OR Apache-2.0", "mit")).toBe(true);
    expect(licenseMatches("MIT OR Apache-2.0", "apache-2.0")).toBe(true);
    expect(licenseMatches("MIT OR Apache-2.0", "apache")).toBe(true);
    expect(licenseMatches("MPL-2.0", "mpl")).toBe(true);
    expect(licenseMatches("BSD-3-Clause", "bsd-3")).toBe(true);
    expect(licenseMatches("MIT OR Apache-2.0", "mit or apache-2.0")).toBe(true);
    expect(licenseMatches("Apache-2.0", "apach")).toBe(false);
    expect(licenseMatches("MIT", "mi")).toBe(false);
    expect(licenseMatches("MIT OR Apache-2.0", "or")).toBe(false);
  });

  it("splits non-normalized expressions on slash and comma", () => {
    expect(spdxIdentifiers("MIT/Apache-2.0, ISC")).toEqual([
      "mit",
      "apache-2.0",
      "isc",
    ]);
    expect(licenseMatches("MIT/Apache-2.0", "mit")).toBe(true);
    expect(licenseMatches("Unlicense/MIT", "mit")).toBe(true);
    expect(licenseMatches("Apache-2.0/MIT", "apache")).toBe(true);
    expect(licenseMatches("MIT, Apache-2.0", "apache")).toBe(true);
  });

  it("matches versioned families but keeps MIT-0 and 0BSD distinct", () => {
    expect(licenseMatches("MIT-0", "mit")).toBe(false);
    expect(licenseMatches("MIT-0", "mit-0")).toBe(true);
    expect(licenseMatches("0BSD", "bsd")).toBe(false);
    expect(licenseMatches("Apache-2.0", "apache")).toBe(true);
    expect(licenseMatches("BSD-3-Clause", "bsd")).toBe(true);
    expect(licenseMatches("MPL-2.0", "mpl")).toBe(true);
    expect(licenseMatches("GPL-3.0-only", "gpl")).toBe(true);
    expect(licenseMatches("GPL-3.0-only", "gpl-3.0")).toBe(true);
  });

  it("matches the start of the name segments", () => {
    expect(nameMatches("react-dom", "dom")).toBe(true);
    expect(nameMatches("react-dom", "react-d")).toBe(true);
    expect(nameMatches("@giscus/react", "giscus")).toBe(true);
    expect(nameMatches("@giscus/react", "react")).toBe(true);
    expect(nameMatches("serde_derive", "derive")).toBe(true);
    expect(nameMatches("Serde", "serde")).toBe(true);
    expect(nameMatches("windows-impl", "mpl")).toBe(false);
    expect(nameMatches("hound-sample", "mpl")).toBe(false);
  });

  it("no longer returns -impl or sample names for MPL", () => {
    const components = [
      { name: "windows-impl", license: "MIT OR Apache-2.0" },
      { name: "dasp_sample", license: "MIT OR Apache-2.0" },
      { name: "cssparser", license: "MPL-2.0" },
    ];
    expect(
      components
        .filter((component) => componentMatches(component, "mpl"))
        .map((component) => component.name),
    ).toEqual(["cssparser"]);
  });
});
