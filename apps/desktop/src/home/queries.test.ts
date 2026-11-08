import { describe, expect, it } from "vitest";

import { mapRecentNoteRows } from "./queries";

describe("mapRecentNoteRows", () => {
  it("garde l'événement d'agenda lié pour la suppression", () => {
    const [linked, plain, broken] = mapRecentNoteRows([
      {
        id: "s1",
        title: " Comité ",
        created_at: "2024-10-28T10:00:00",
        duration_ms: 1000,
        event_json: JSON.stringify({ tracking_id: "tracking-1" }),
      },
      { id: "s2", title: null, created_at: null, duration_ms: null },
      {
        id: "s3",
        title: "",
        created_at: "",
        duration_ms: -5,
        event_json: "{",
      },
    ]);

    expect(linked).toEqual({
      id: "s1",
      title: "Comité",
      createdAt: "2024-10-28T10:00:00",
      durationMs: 1000,
      trackingId: "tracking-1",
    });
    expect(plain?.trackingId).toBeNull();
    expect(broken?.trackingId).toBeNull();
    expect(broken?.durationMs).toBe(0);
  });
});
