import { describe, expect, it } from "vitest";

import { mapRecentNoteRows } from "./queries";

describe("mapRecentNoteRows", () => {
  it("normalise titre, date et durée", () => {
    const [note, plain, negative] = mapRecentNoteRows([
      {
        id: "s1",
        title: " Comité ",
        created_at: "2024-10-28T10:00:00",
        duration_ms: 1000,
      },
      { id: "s2", title: null, created_at: null, duration_ms: null },
      { id: "s3", title: "", created_at: "", duration_ms: -5 },
    ]);

    expect(note).toEqual({
      id: "s1",
      title: "Comité",
      createdAt: "2024-10-28T10:00:00",
      durationMs: 1000,
    });
    expect(plain).toEqual({
      id: "s2",
      title: "",
      createdAt: "",
      durationMs: 0,
    });
    expect(negative?.durationMs).toBe(0);
  });
});
