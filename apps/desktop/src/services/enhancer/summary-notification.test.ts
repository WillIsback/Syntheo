import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showNativeNotification: vi.fn(async (_input: { message: string }) => ({
    status: "ok" as const,
    data: null,
  })),
}));

vi.mock("~/services/notification-labels", () => ({
  showNativeNotification: mocks.showNativeNotification,
}));
vi.mock("~/shared/notification-policy", () => ({
  shouldShowNotification: async () => true,
}));
vi.mock("~/shared/window-activity", () => ({
  isAppWindowInactive: async () => true,
}));

import { showSummaryReadyNotification } from "./summary-notification";

describe("showSummaryReadyNotification", () => {
  beforeEach(() => {
    mocks.showNativeNotification.mockClear();
  });

  // Issue 616 : sous Windows, la carte compacte tronquait « "…" is ready to
  // read. » pour un titre long. Le titre de la notification dit déjà
  // « Summary ready » : le message se réduit au titre de la note.
  it("shows only the note title between quotes", async () => {
    const title = "Revue trimestrielle du programme de conformité RGPD 2026";

    await showSummaryReadyNotification("session-1", `  ${title}  `);

    expect(mocks.showNativeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Summary ready",
        message: `"${title}"`,
      }),
    );
  });

  it("keeps a generic message for an untitled note", async () => {
    await showSummaryReadyNotification("session-1", "   ");

    expect(mocks.showNativeNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Your summary is ready." }),
    );
  });
});
