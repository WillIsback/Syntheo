import { describe, expect, it } from "vitest";

import { sessionSearchTimestamp } from "./utils";

describe("sessionSearchTimestamp", () => {
  it("uses the session creation date", () => {
    expect(sessionSearchTimestamp("2025-01-01T00:00:00.000Z")).toBe(
      Date.parse("2025-01-01T00:00:00.000Z"),
    );
  });

  it("accepts epoch milliseconds and ignores empty values", () => {
    expect(sessionSearchTimestamp("1735689600000")).toBe(1_735_689_600_000);
    expect(sessionSearchTimestamp("")).toBe(0);
    expect(sessionSearchTimestamp("not a date")).toBe(0);
  });
});
