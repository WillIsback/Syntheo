import { describe, expect, it } from "vitest";

import { parseSessionTagNames } from "./item-fields";

describe("parseSessionTagNames", () => {
  it("trims, dedupes, and sorts JSON tag names", () => {
    expect(
      parseSessionTagNames(JSON.stringify(["prep", " launch", "prep"])),
    ).toEqual(["launch", "prep"]);
  });

  it("keeps commas that belong to a tag name", () => {
    expect(
      parseSessionTagNames(JSON.stringify(["launch, prep", "design"])),
    ).toEqual(["design", "launch, prep"]);
  });

  it("returns no tags for empty or invalid input", () => {
    expect(parseSessionTagNames(null)).toEqual([]);
    expect(parseSessionTagNames("")).toEqual([]);
    expect(parseSessionTagNames("not-json")).toEqual([]);
    expect(parseSessionTagNames(JSON.stringify({ name: "launch" }))).toEqual(
      [],
    );
  });
});
