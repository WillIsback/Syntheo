import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createStore } from "zustand";

import type { ListenerStore } from "~/store/zustand/listener";

type DetectPayload = {
  type: "micDetected";
  key: string;
  apps: { id: string; name: string }[];
  duration_secs: number;
};

const mocks = vi.hoisted(() => ({
  detectListener: null as null | ((event: { payload: unknown }) => void),
  showNotification: vi.fn(),
  settings: {
    auto_stop_meetings: true,
    notification_disabled: false,
    notification_detect: true,
    notification_recording: true,
  } as Record<string, unknown>,
}));

// Frontières seulement : plugins Tauri (détection, notification native),
// chemins de ressources et réglages persistés.
vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    setDetectEnabled: vi.fn(async () => ({ status: "ok", data: null })),
    listMicUsingApplications: vi.fn(async () => ({ status: "ok", data: [] })),
  },
  events: {
    detectEvent: {
      listen: vi.fn(async (cb: (event: { payload: unknown }) => void) => {
        mocks.detectListener = cb;
        return () => {};
      }),
    },
  },
}));
vi.mock("@syntheo/plugin-notification", () => ({
  commands: {
    showNotification: mocks.showNotification,
    clearNotifications: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));
vi.mock("@tauri-apps/api/path", () => ({
  resolveResource: vi.fn(async (path: string) => `/resources/${path}`),
}));
vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) => mocks.settings[key],
}));

import { useHandleDetectEvents } from "./detect-events";

function idleListenerStore() {
  return createStore(() => ({
    live: {
      status: "inactive",
      loading: false,
      sessionId: null,
      finalizingBySession: {},
      pause: null,
    },
    stop: vi.fn(),
    setMuted: vi.fn(),
  })) as unknown as ListenerStore;
}

afterEach(() => {
  mocks.detectListener = null;
  mocks.showNotification.mockReset();
});

describe("invite « Êtes-vous en réunion ? »", () => {
  // Une seule question et un seul « Oui » : plus de pied « Ignorer … ? »
  // avec un second « Oui » (issue 808).
  test("n'ajoute pas de question pour ignorer l'application", async () => {
    renderHook(() => useHandleDetectEvents(idleListenerStore()));
    await waitFor(() => expect(mocks.detectListener).not.toBeNull());

    const payload: DetectPayload = {
      type: "micDetected",
      key: "mic-started:com.example.meet",
      apps: [{ id: "com.example.meet", name: "Visio Exemple" }],
      duration_secs: 5,
    };
    mocks.detectListener!({ payload });

    await waitFor(() => expect(mocks.showNotification).toHaveBeenCalled());
    const notification = mocks.showNotification.mock.calls[0]![0];
    expect(notification).toMatchObject({
      title: "Are you in a meeting?",
      action_label: "Yes",
      footer: null,
    });
  });
});
