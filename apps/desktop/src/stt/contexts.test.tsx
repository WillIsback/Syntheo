import { resolveResource } from "@tauri-apps/api/path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AUTO_STOP_ACCESSIBILITY_TIMEOUT_MS } from "./auto-stop";
import {
  cancelAutoStopEndedNotification,
  consumeAutoStopEndedNotificationKey,
  createAutoStopEndedNotificationKey,
  parseAutoStopEndedNotificationKey,
} from "./auto-stop-notification";
import {
  AUTO_STOP_CONFIRM_DELAY_MS,
  AUTO_STOP_NETWORK_HOLD_MS,
  AUTO_STOP_RECENT_OFFLINE_MS,
  ListenerProvider,
} from "./contexts";

import { createListenerStore } from "~/store/zustand/listener";

const {
  listMicUsingApplicationsMock,
  inspectMeetingAccessibilityMock,
  listenMock,
  clearNotificationsMock,
  showNotificationMock,
  useConfigValueMock,
} = vi.hoisted(() => ({
  listMicUsingApplicationsMock: vi.fn(),
  inspectMeetingAccessibilityMock: vi.fn(),
  listenMock: vi.fn(),
  clearNotificationsMock: vi.fn(async () => ({
    status: "ok" as const,
    data: null,
  })),
  showNotificationMock: vi.fn(),
  useConfigValueMock: vi.fn((key: string) => key !== "notification_disabled"),
}));

vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    inspectMeetingAccessibility: inspectMeetingAccessibilityMock,
    listMicUsingApplications: listMicUsingApplicationsMock,
  },
  events: { detectEvent: { listen: listenMock } },
}));

vi.mock("@syntheo/plugin-notification", () => ({
  commands: {
    clearNotifications: clearNotificationsMock,
    showNotification: showNotificationMock,
  },
}));

vi.mock("~/shared/config", () => ({ useConfigValue: useConfigValueMock }));

type Store = ReturnType<typeof createListenerStore>;
type App = { id: string; name: string };

const zoom = { id: "us.zoom.xos", name: "Zoom" };
const teams = { id: "com.microsoft.teams2", name: "Microsoft Teams" };
const chrome = { id: "com.google.Chrome", name: "Google Chrome" };
const kakao = { id: "com.kakao.KakaoTalkMac", name: "KakaoTalk" };
const ffmpeg = { id: "/opt/homebrew/bin/ffmpeg", name: "ffmpeg" };
const helper = (name: string) => ({ id: "pid:42", name });

const autoStopPrompt = (extra: Record<string, unknown> = {}) =>
  expect.objectContaining({
    key: expect.stringContaining("auto-stop-ended:session-1"),
    ...extra,
  });

function setStoreActive(store: Store, sessionId = "session-1") {
  store.setState((state) => ({
    live: { ...state.live, sessionId, status: "active" },
  }));
}

const micApps = (apps: App[]) =>
  listMicUsingApplicationsMock.mockResolvedValue({ status: "ok", data: apps });

async function renderProvider(store: Store) {
  render(
    <ListenerProvider store={store}>
      <div>child</div>
    </ListenerProvider>,
  );
  await vi.waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));
  const handler = listenMock.mock.calls[0]?.[0];
  expect(handler).toBeTypeOf("function");
  return handler;
}

// Monte le fournisseur avec un store prêt ; les minuteries factices sont
// activées après le rendu sauf si `fakeTimers` vaut false.
async function setup({
  triggers,
  active = true,
  prime,
  fakeTimers = true,
}: {
  triggers?: string[];
  active?: boolean;
  prime?: (store: Store) => void;
  fakeTimers?: boolean;
} = {}) {
  const store = createListenerStore();
  const stopSpy = vi.fn();
  store.setState({ stop: stopSpy });
  if (triggers) store.getState().setTriggerAppIds(triggers);
  if (active) setStoreActive(store);
  prime?.(store);
  const handler = await renderProvider(store);
  if (fakeTimers) vi.useFakeTimers();
  listMicUsingApplicationsMock.mockClear();
  return {
    store,
    stopSpy,
    handler,
    micStopped: (apps: App[]) =>
      handler({ payload: { type: "micStopped", apps } }),
    micDetected: (apps: App[], key = "mic-1") =>
      handler({
        payload: { type: "micDetected", key, apps, duration_secs: 15 },
      }),
  };
}

type MicStoppedCase = {
  name: string;
  triggers?: string[];
  active?: boolean;
  disabled?: boolean;
  mic?: App[];
  stopped: App[];
  checks?: number;
  stops: boolean;
  prompts?: boolean;
};

const confirmDelay = () =>
  vi.advanceTimersByTimeAsync(AUTO_STOP_CONFIRM_DELAY_MS);

describe("ListenerProvider detect events", () => {
  beforeEach(() => {
    cancelAutoStopEndedNotification("session-1");
    listenMock.mockReset();
    clearNotificationsMock.mockReset();
    showNotificationMock.mockReset();
    showNotificationMock.mockResolvedValue({ status: "ok", data: null });
    useConfigValueMock.mockReset();
    useConfigValueMock.mockImplementation(
      (key: string) => key !== "notification_disabled",
    );
    listenMock.mockResolvedValue(() => {});
    inspectMeetingAccessibilityMock.mockReset().mockResolvedValue({
      status: "ok",
      data: [],
    });
    micApps([]);
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  test("invalidates and clears pending notifications when listening becomes active", async () => {
    const store = createListenerStore();
    render(
      <ListenerProvider store={store}>
        <div>child</div>
      </ListenerProvider>,
    );
    expect(clearNotificationsMock).not.toHaveBeenCalled();
    const notificationKey = createAutoStopEndedNotificationKey("session-1");

    setStoreActive(store);

    await vi.waitFor(() =>
      expect(clearNotificationsMock).toHaveBeenCalledTimes(1),
    );
    expect(consumeAutoStopEndedNotificationKey(notificationKey)).toBeNull();
  });

  // Une app qui libère le micro, puis le délai de confirmation.
  test.each<MicStoppedCase>([
    {
      name: "no trigger apps are set (manual session, regression #5120)",
      triggers: undefined,
      active: false,
      stopped: [ffmpeg, zoom],
      stops: false,
    },
    {
      name: "auto-stop is disabled",
      triggers: [zoom.id],
      active: false,
      disabled: true,
      stopped: [zoom],
      stops: false,
    },
    {
      name: "only a non-trigger app stops (auto-session, regression #4846)",
      triggers: [zoom.id],
      active: false,
      stopped: [ffmpeg],
      stops: false,
    },
    {
      name: "a trigger app stays stopped",
      triggers: [zoom.id],
      stopped: [zoom],
      checks: 1,
      stops: true,
    },
    {
      name: "a trigger app resumes during the grace period",
      triggers: [zoom.id],
      mic: [zoom],
      stopped: [zoom],
      checks: 1,
      stops: false,
    },
    {
      name: "a non-trigger app stops while a trigger app is still active",
      triggers: [zoom.id],
      mic: [zoom],
      stopped: [ffmpeg],
      checks: 1,
      stops: false,
    },
    ...[[kakao], [helper("KakaoTalk Helper")]].map((stopped) => ({
      name: `KakaoTalk screen-share transition (${stopped[0]!.id})`,
      triggers: [kakao.id],
      stopped,
      checks: 0,
      stops: false,
    })),
    {
      name: "a helper stops while KakaoTalk remains active (co-trigger)",
      triggers: [kakao.id, zoom.id],
      mic: [kakao],
      stopped: [helper("KakaoTalk Helper")],
      checks: 1,
      stops: false,
    },
    {
      name: "a helper stops and no co-trigger app remains active",
      triggers: [kakao.id, zoom.id],
      stopped: [helper("KakaoTalk Helper")],
      checks: 1,
      stops: true,
    },
    {
      name: "the event omits the trigger app and none remains (regression #5436)",
      triggers: [teams.id],
      stopped: [helper("Microsoft Teams Helper")],
      checks: 1,
      stops: true,
    },
    {
      name: "Teams in Arc stops using the mic",
      triggers: ["company.thebrowser.Browser"],
      stopped: [{ id: "company.thebrowser.Browser", name: "Arc" }],
      checks: 1,
      stops: false,
      prompts: true,
    },
    {
      name: "a browser meeting stops using the mic",
      triggers: [chrome.id],
      stopped: [chrome],
      stops: false,
      prompts: true,
    },
  ])(
    "micStopped when $name",
    async ({
      triggers,
      active,
      disabled,
      mic,
      stopped,
      checks,
      stops,
      prompts,
    }) => {
      if (disabled) useConfigValueMock.mockReturnValue(false);
      if (mic) micApps(mic);
      const { stopSpy, micStopped } = await setup({ triggers, active });

      micStopped(stopped);
      expect(stopSpy).not.toHaveBeenCalled();
      await confirmDelay();

      if (checks !== undefined) {
        expect(listMicUsingApplicationsMock).toHaveBeenCalledTimes(checks);
      }
      expect(stopSpy).toHaveBeenCalledTimes(stops ? 1 : 0);
      if (prompts) {
        const notification = showNotificationMock.mock.calls[0]?.[0];
        expect(parseAutoStopEndedNotificationKey(notification?.key)).toBe(
          "session-1",
        );
        expect(notification).toEqual(
          autoStopPrompt({
            action_label: "Stop",
            action_variant: "destructive",
          }),
        );
      }
    },
  );

  describe("when a side app releases the mic during a call", () => {
    const recorder = { id: "com.example.recorder", name: "Recorder" };

    test("keeps listening, then stops when the meeting app ends", async () => {
      const { store, stopSpy, micStopped } = await setup({
        triggers: [recorder.id],
      });

      micApps([teams]);
      micStopped([recorder]);
      await confirmDelay();

      expect(stopSpy).not.toHaveBeenCalled();
      expect(store.getState().live.triggerAppIds).toContain(teams.id);

      micApps([]);
      micStopped([teams]);
      await confirmDelay();

      expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    test("stops when the meeting app stops in the same event, even with a browser on the mic", async () => {
      const { stopSpy, micStopped } = await setup({ triggers: [recorder.id] });

      micApps([chrome]);
      micStopped([recorder, teams]);
      await confirmDelay();

      expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    test("withdraws an open stop prompt when the call is still on the mic", async () => {
      const { stopSpy, micStopped } = await setup({
        triggers: [chrome.id, recorder.id],
      });

      micStopped([chrome, recorder]);
      await confirmDelay();
      const promptKey = showNotificationMock.mock.calls[0][0].key;

      micApps([teams]);
      micStopped([recorder]);
      await confirmDelay();

      expect(consumeAutoStopEndedNotificationKey(promptKey)).toBeNull();
      expect(stopSpy).not.toHaveBeenCalled();
    });

    test("ignores a mic snapshot that returns after the recording changed", async () => {
      const { store, stopSpy, micStopped } = await setup({
        triggers: [recorder.id],
      });
      let resolveSnapshot: (value: unknown) => void = () => {};
      listMicUsingApplicationsMock.mockReturnValue(
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
      );

      micStopped([recorder]);
      await confirmDelay();
      setStoreActive(store, "session-2");
      resolveSnapshot({ status: "ok", data: [teams] });
      await vi.advanceTimersByTimeAsync(0);

      expect(store.getState().live.triggerAppIds).not.toContain(teams.id);
      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  describe("réseau", () => {
    test("holds an offline ad-hoc meeting, then prompts instead of stopping", async () => {
      const { stopSpy, micStopped } = await setup({ triggers: [zoom.id] });

      window.dispatchEvent(new Event("offline"));
      micStopped([zoom]);

      await confirmDelay();
      expect(stopSpy).not.toHaveBeenCalled();
      expect(showNotificationMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(AUTO_STOP_NETWORK_HOLD_MS - 1);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(showNotificationMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(showNotificationMock).toHaveBeenCalledWith(autoStopPrompt());
    });

    test.each([
      { name: "coming back online", outageMs: 0 },
      {
        name: "a long outage reconnects",
        outageMs: AUTO_STOP_RECENT_OFFLINE_MS + 1,
      },
    ])(
      "holds auto-stop when micStopped arrives shortly after $name",
      async ({ outageMs }) => {
        const { stopSpy, micStopped } = await setup({ triggers: [zoom.id] });

        window.dispatchEvent(new Event("offline"));
        if (outageMs > 0) {
          await vi.advanceTimersByTimeAsync(outageMs);
        }
        window.dispatchEvent(new Event("online"));
        micStopped([zoom]);

        await confirmDelay();
        expect(stopSpy).not.toHaveBeenCalled();
        expect(showNotificationMock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(AUTO_STOP_NETWORK_HOLD_MS);
        expect(stopSpy).not.toHaveBeenCalled();
        expect(showNotificationMock).toHaveBeenCalledTimes(1);
      },
    );

    test("does not hold auto-stop after the recent-offline window expires", async () => {
      const { stopSpy, micStopped } = await setup({ triggers: [zoom.id] });

      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(AUTO_STOP_RECENT_OFFLINE_MS + 1);
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(AUTO_STOP_RECENT_OFFLINE_MS + 1);
      micStopped([zoom]);

      await confirmDelay();
      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(showNotificationMock).not.toHaveBeenCalled();
    });

    test("does not let an interrupted meeting timer stop a replacement session", async () => {
      const now = new Date("2026-05-19T10:05:00.000Z");
      const deadlineMs =
        now.getTime() + AUTO_STOP_CONFIRM_DELAY_MS + AUTO_STOP_NETWORK_HOLD_MS;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const { store, stopSpy, micStopped } = await setup({
        triggers: [zoom.id],
        fakeTimers: false,
      });

      window.dispatchEvent(new Event("offline"));
      micStopped([zoom]);
      await confirmDelay();

      setStoreActive(store, "session-2");
      await vi.advanceTimersByTimeAsync(deadlineMs - Date.now());

      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  describe("invite micro détecté", () => {
    test("does not show mic-detected prompts when detection notifications are disabled", async () => {
      useConfigValueMock.mockImplementation((key: string) =>
        key === "notification_detect" ? false : true,
      );
      const { micDetected } = await setup({
        active: false,
        fakeTimers: false,
      });

      micDetected([zoom]);
      await Promise.resolve();

      expect(showNotificationMock).not.toHaveBeenCalled();
    });

    // Calendrier retiré (issue 465) : l'invite nomme les apps détectées et ne
    // propose plus d'événement.
    test("names the detected apps without any calendar event", async () => {
      const { micDetected } = await setup({
        active: false,
        fakeTimers: false,
      });

      micDetected([chrome]);

      await vi.waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Are you in a meeting?",
            source: expect.objectContaining({
              app_names: ["Google Chrome"],
              event_ids: [],
            }),
          }),
        ),
      );
    });

    // L'icône de l'app se résout de façon asynchrone avant l'invite.
    async function setupWithPendingIcon() {
      let iconResolverReady = false;
      let resolveIcon = () => {};
      vi.mocked(resolveResource).mockImplementationOnce(
        (path: string) =>
          new Promise((resolve) => {
            resolveIcon = () => {
              resolve(`/resources/${path}`);
            };
            iconResolverReady = true;
          }),
      );
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-24T02:09:00.000Z"));
      const setupResult = await setup({ active: false, fakeTimers: false });
      return {
        ...setupResult,
        iconRequested: () =>
          vi.waitFor(() => expect(iconResolverReady).toBe(true)),
        resolveIcon: () => resolveIcon(),
      };
    }

    test("does not show a stale mic prompt when listening starts while icons resolve", async () => {
      const { store, micDetected, iconRequested, resolveIcon } =
        await setupWithPendingIcon();

      micDetected([{ id: "ru.keepcoder.Telegram", name: "Telegram" }]);
      await iconRequested();
      setStoreActive(store);
      resolveIcon();

      await vi.waitFor(() =>
        expect(store.getState().live.triggerAppIds).toEqual([
          "ru.keepcoder.Telegram",
        ]),
      );
      expect(showNotificationMock).not.toHaveBeenCalled();
    });

    test("does not show duplicate mic prompts while icons resolve", async () => {
      const { micDetected, iconRequested, resolveIcon } =
        await setupWithPendingIcon();
      const signal = {
        id: "org.whispersystems.signal-desktop",
        name: "Signal",
      };

      micDetected([signal], "mic-1");
      await iconRequested();
      micDetected([signal], "mic-2");
      resolveIcon();

      await vi.waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledTimes(1),
      );
      expect(showNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "mic-1",
          source: expect.objectContaining({ app_names: ["Signal"] }),
        }),
      );
    });

    test.each([
      { name: "already listening", prime: undefined },
      {
        name: "listening is starting",
        prime: (store: Store) =>
          store.setState((state) => ({
            live: {
              ...state.live,
              loading: true,
              sessionId: "session-1",
              status: "inactive" as const,
            },
          })),
      },
    ])(
      "records trigger app ids from micDetected while $name",
      async ({ prime }) => {
        const { store, micDetected } = await setup({
          active: !prime,
          prime,
          fakeTimers: false,
        });

        micDetected([helper("Chrome Helper"), chrome]);

        expect(showNotificationMock).not.toHaveBeenCalled();
        expect(store.getState().live.triggerAppIds).toEqual([chrome.id]);
      },
    );

    const finalizing = {
      "session-1": { startedAtMs: 0, seconds: 42, needsBatchRepair: false },
    };

    test.each([
      {
        name: "the note recording is finalizing",
        prime: (store: Store) =>
          store.setState((state) => ({
            live: {
              ...state.live,
              loading: true,
              sessionId: "session-1",
              status: "finalizing" as const,
              finalizingBySession: finalizing,
            },
          })),
      },
      {
        name: "a previous recording is still finalizing in the background",
        prime: (store: Store) =>
          store.setState((state) => ({
            live: { ...state.live, finalizingBySession: finalizing },
          })),
      },
    ])("never shows the mic prompt while $name", async ({ prime }) => {
      const { micDetected } = await setup({
        active: false,
        prime,
        fakeTimers: false,
      });

      micDetected([zoom]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(showNotificationMock).not.toHaveBeenCalled();
    });
  });

  describe("reprise de la réunion", () => {
    test("auto-stops after a trigger app learned during active listening stops", async () => {
      const { stopSpy, micDetected, micStopped } = await setup();

      micDetected([zoom]);
      micStopped([zoom]);
      await confirmDelay();

      expect(listMicUsingApplicationsMock).toHaveBeenCalledTimes(1);
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    test("rechecks after accessibility confirms the meeting is active", async () => {
      inspectMeetingAccessibilityMock
        .mockResolvedValueOnce({
          status: "ok",
          data: [
            {
              activeCall: true,
              app: chrome,
              pid: 42,
              platform: "googleMeet",
              surface: "web",
              accessibilityTrusted: true,
              windowTitle: "Team sync - Google Meet",
              remoteScreenShare: false,
              warnings: [],
            },
          ],
        })
        .mockResolvedValue({ status: "ok", data: [] });
      const { stopSpy, micStopped } = await setup({ triggers: [chrome.id] });

      micStopped([chrome]);
      await confirmDelay();

      expect(inspectMeetingAccessibilityMock).toHaveBeenCalledTimes(1);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(showNotificationMock).not.toHaveBeenCalled();

      await confirmDelay();

      expect(inspectMeetingAccessibilityMock).toHaveBeenCalledTimes(2);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(showNotificationMock).toHaveBeenCalledWith(autoStopPrompt());
    });

    test("keeps recording and prompts when AX stalls without queuing duplicate inspections", async () => {
      let resolveInspection!: (result: { status: "ok"; data: [] }) => void;
      inspectMeetingAccessibilityMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInspection = resolve;
        }),
      );
      const { stopSpy, micStopped } = await setup({ triggers: [zoom.id] });

      micStopped([zoom]);
      await confirmDelay();
      expect(showNotificationMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(AUTO_STOP_ACCESSIBILITY_TIMEOUT_MS);

      expect(stopSpy).not.toHaveBeenCalled();
      expect(showNotificationMock).toHaveBeenCalledWith(
        autoStopPrompt({ action_label: "Stop" }),
      );
      micStopped([zoom]);
      await confirmDelay();
      expect(inspectMeetingAccessibilityMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(AUTO_STOP_ACCESSIBILITY_TIMEOUT_MS);
      resolveInspection({ status: "ok", data: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(stopSpy).not.toHaveBeenCalled();

      micStopped([zoom]);
      await confirmDelay();
      expect(stopSpy).toHaveBeenCalledOnce();
    });

    test("does not recheck after the meeting resumes during accessibility inspection", async () => {
      let resolveInspection = (_result: unknown) => {};
      inspectMeetingAccessibilityMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveInspection = resolve;
          }),
      );
      const { stopSpy, micStopped, micDetected } = await setup({
        triggers: [chrome.id],
      });

      micStopped([chrome]);
      await confirmDelay();
      expect(inspectMeetingAccessibilityMock).toHaveBeenCalledTimes(1);

      micDetected([chrome], "mic-resumed");
      resolveInspection({
        status: "ok",
        data: [
          {
            app: chrome,
            pid: 42,
            platform: "googleMeet",
            surface: "web",
            accessibilityTrusted: true,
            windowTitle: "Team sync - Google Meet",
            remoteScreenShare: false,
            warnings: [],
          },
        ],
      });
      await confirmDelay();

      expect(inspectMeetingAccessibilityMock).toHaveBeenCalledTimes(1);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(showNotificationMock).not.toHaveBeenCalled();
    });

    test("cancels pending auto-stop when a browser trigger restarts", async () => {
      const { stopSpy, micStopped, micDetected } = await setup({
        triggers: [chrome.id],
      });

      micStopped([chrome]);
      await vi.advanceTimersByTimeAsync(AUTO_STOP_CONFIRM_DELAY_MS - 1);
      micDetected([chrome]);
      await vi.advanceTimersByTimeAsync(1);

      expect(listMicUsingApplicationsMock).not.toHaveBeenCalled();
      expect(stopSpy).not.toHaveBeenCalled();
    });

    test("invalidates a browser stop prompt when the meeting resumes", async () => {
      const { stopSpy, micStopped, micDetected } = await setup({
        triggers: [chrome.id],
      });
      clearNotificationsMock.mockClear();

      micStopped([chrome]);
      await confirmDelay();
      const notificationKey = showNotificationMock.mock.calls[0]?.[0]?.key;

      micDetected([chrome], "mic-resumed");

      expect(clearNotificationsMock).toHaveBeenCalledTimes(1);
      expect(consumeAutoStopEndedNotificationKey(notificationKey)).toBeNull();
      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  test("stops listening when sleep starts", async () => {
    const { stopSpy, handler } = await setup({
      active: false,
      fakeTimers: false,
    });

    handler({ payload: { type: "sleepStateChanged", value: true } });

    expect(stopSpy).toHaveBeenCalledTimes(1);
  });
});
