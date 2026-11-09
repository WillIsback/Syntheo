import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { MeetingCapturedChatMessage } from "@syntheo/plugin-detect";

import {
  meetingChatCaptureDelayMs,
  startMeetingChatCapture,
} from "./meeting-chat-capture";

const {
  captureMeetingChatMessagesMock,
  persistMeetingChatRecordsMock,
  persistParticipantConsentMock,
  toastWarningMock,
  toastDismissMock,
  captureSettingState,
} = vi.hoisted(() => ({
  captureMeetingChatMessagesMock: vi.fn(),
  persistMeetingChatRecordsMock: vi.fn(),
  persistParticipantConsentMock: vi.fn(),
  toastWarningMock: vi.fn(),
  toastDismissMock: vi.fn(),
  captureSettingState: { value: true },
}));

vi.mock("@syntheo/plugin-detect", () => ({
  commands: { captureMeetingChatMessages: captureMeetingChatMessagesMock },
}));
vi.mock("~/stt/meeting-chat-records", () => ({
  persistMeetingChatRecords: persistMeetingChatRecordsMock,
}));
vi.mock("~/stt/meeting-consent-store", () => ({
  persistParticipantConsent: persistParticipantConsentMock,
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning: toastWarningMock, dismiss: toastDismissMock },
}));
vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: vi.fn(async () => ({
    values: { capture_meeting_chat: captureSettingState.value },
    hasValues: new Set(["capture_meeting_chat"]),
  })),
}));

const capturedMessage: MeetingCapturedChatMessage = {
  id: "msg-1",
  platform: "zoom",
  surface: "native",
  sender: "Ada",
  timestamp: "10:42 AM",
  direction: "incoming",
  text: "Here is the doc https://example.com/spec",
  links: ["https://example.com/spec"],
};

const message = (
  id: string,
  extra: Partial<MeetingCapturedChatMessage> = {},
): MeetingCapturedChatMessage => ({ ...capturedMessage, id, ...extra });

function captureResult(
  messages: MeetingCapturedChatMessage[],
  contextId: string | null = "zoom:meeting-1",
) {
  return {
    status: "ok" as const,
    data: {
      app: { id: "us.zoom.xos", name: "Zoom" },
      contextId,
      platform: "zoom" as const,
      surface: "native" as const,
      messages,
      warnings: [],
    },
  };
}

// Aucune réunion reconnue : seuls les avertissements changent.
function unknownResult(
  warnings: string[],
  surface: "unknown" | "web" = "unknown",
) {
  return {
    status: "ok" as const,
    data: {
      app: null,
      contextId: null,
      platform: "unknown" as const,
      surface,
      messages: [],
      warnings,
    },
  };
}

const noMeetingResult = () =>
  unknownResult(
    [
      "no browser window title carries a meeting provider signal; accessibility tree walk skipped",
    ],
    "web",
  );

const serve = (
  messages: MeetingCapturedChatMessage[],
  contextId?: string | null,
) =>
  captureMeetingChatMessagesMock.mockResolvedValue(
    captureResult(messages, contextId),
  );

const tick = (ms = 5_000) => vi.advanceTimersByTimeAsync(ms);
const captureCalls = () => captureMeetingChatMessagesMock.mock.calls.length;

type CaptureOptions = Parameters<typeof startMeetingChatCapture>[0];

// Démarre la capture ; `baseline` laisse passer le premier relevé.
async function start(options: Partial<CaptureOptions> = {}, baseline = true) {
  const stop = startMeetingChatCapture({
    sessionId: "session-1",
    isEnabled: () => true,
    ...options,
  });
  if (baseline) await tick(0);
  return stop;
}

const signature = (id: string, contextId = "zoom:meeting-1") =>
  [contextId, "zoom", "native", id].join("\n");

const persisted = (
  persistedMessage: MeetingCapturedChatMessage,
  contextId?: string,
) => ({
  sessionId: "session-1",
  entries: [
    {
      message: persistedMessage,
      sourceSignature: signature(persistedMessage.id, contextId),
    },
  ],
});

function resetMocks() {
  vi.useFakeTimers();
  vi.clearAllMocks();
  captureSettingState.value = true;
  persistMeetingChatRecordsMock.mockImplementation(
    async ({ entries }: { entries: Array<{ sourceSignature: string }> }) =>
      entries.map((entry) => entry.sourceSignature),
  );
  persistParticipantConsentMock.mockResolvedValue(undefined);
}

describe("startMeetingChatCapture", () => {
  beforeEach(() => {
    resetMocks();
    serve([capturedMessage]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("persists an appended message while the meeting context stays the same", async () => {
    const stop = await start();
    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();

    const laterMessage = message("msg-2", {
      text: "Let's discuss this next",
      links: [],
    });
    serve([capturedMessage, laterMessage]);
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledWith(
      persisted(laterMessage),
    );
  });

  test("reads the current capture setting after the initiating view unmounts", async () => {
    const stop = await start({ isEnabled: undefined });

    captureSettingState.value = false;
    await tick();
    expect(captureMeetingChatMessagesMock).toHaveBeenCalledTimes(1);

    const whileDisabled = message("while-disabled");
    serve([capturedMessage, whileDisabled]);
    captureSettingState.value = true;
    await tick();
    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();

    const laterMessage = message("after-reenable");
    serve([capturedMessage, whileDisabled, laterMessage]);
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledWith(
      persisted(laterMessage),
    );
  });

  test("re-baselines history and scopes reused AX ids when the meeting context changes", async () => {
    const stop = await start();

    const nextMeetingHistory = message("next-meeting-history", {
      text: "This belongs to another meeting",
      links: [],
    });
    serve([nextMeetingHistory], "zoom:meeting-2");
    await tick();
    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();

    const nextMeetingMessage = message("msg-1", {
      text: "This was sent after switching",
      links: [],
    });
    serve([nextMeetingHistory, nextMeetingMessage], "zoom:meeting-2");
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledOnce();
    expect(persistMeetingChatRecordsMock).toHaveBeenCalledWith(
      persisted(nextMeetingMessage, "zoom:meeting-2"),
    );
  });

  test("keeps the last context across a transient missing-context poll", async () => {
    const stop = await start();

    const withoutContext = message("missing-context");
    serve([capturedMessage, withoutContext], null);
    await tick();
    serve([capturedMessage, withoutContext]);
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledWith(
      persisted(withoutContext),
    );
  });

  test("captures the first message after a visible empty-chat baseline", async () => {
    serve([]);
    const stop = await start();
    serve([capturedMessage]);
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledOnce();
  });

  test("keeps the last context while the validated chat surface is hidden", async () => {
    const stop = await start();

    captureMeetingChatMessagesMock.mockResolvedValue(
      unknownResult(["no visible supported meeting chat messages found"]),
    );
    await tick();

    const whileHidden = message("while-hidden");
    serve([capturedMessage, whileHidden]);
    await tick();
    expect(persistMeetingChatRecordsMock).toHaveBeenCalledWith(
      persisted(whileHidden),
    );

    const laterMessage = message("after-rebaseline");
    serve([capturedMessage, whileHidden, laterMessage]);
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenLastCalledWith(
      persisted(laterMessage),
    );
  });

  test("excludes the generated disclosure while retaining participant chat", async () => {
    const disclosure =
      "Syntheo disclosure https://github.com/WillIsback/syntheo-desktop";
    serve([]);
    const stop = await start({ excludedTexts: [disclosure] });

    serve([
      message("disclosure", {
        direction: "outgoing",
        text: `  ${disclosure.replace(" ", "\n")}  `,
        links: ["https://github.com/WillIsback/syntheo-desktop"],
      }),
      capturedMessage,
    ]);
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledWith(
      persisted(capturedMessage),
    );
  });

  test("retries a message after a storage failure", async () => {
    serve([]);
    const stop = await start();

    serve([capturedMessage]);
    persistMeetingChatRecordsMock.mockRejectedValueOnce(new Error("locked"));
    await tick();
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledTimes(2);
  });

  test("uses a bounded signature and does not retry a rejected oversized message", async () => {
    serve([]);
    const stop = await start();

    const oversized = message("", { text: "x".repeat(100_000) });
    serve([oversized]);
    await tick();
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledOnce();
    const sourceSignature =
      persistMeetingChatRecordsMock.mock.calls[0]?.[0].entries[0]
        .sourceSignature;
    expect(sourceSignature.length).toBeLessThan(100);
    expect(sourceSignature).not.toContain(oversized.text);
  });

  test("waits for an in-flight persistence write when capture stops", async () => {
    serve([]);
    const stop = await start();

    let resolvePersistence:
      | ((persistedSignatures: string[]) => void)
      | undefined;
    persistMeetingChatRecordsMock.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        resolvePersistence = resolve;
      }),
    );
    serve([capturedMessage]);
    await tick();

    const stopped = stop();
    let settled = false;
    void stopped.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(persistMeetingChatRecordsMock).toHaveBeenCalledOnce();
    expect(settled).toBe(false);

    resolvePersistence?.([signature("msg-1")]);
    await stopped;
    expect(settled).toBe(true);
  });

  test("stops without waiting for a stalled poll and fences its late result", async () => {
    let resolveCapture: ((value: unknown) => void) | undefined;
    captureMeetingChatMessagesMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const stop = await start();

    await expect(stop()).resolves.toBeUndefined();
    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();

    resolveCapture?.(captureResult([capturedMessage]));
    await Promise.resolve();
    await Promise.resolve();

    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();
  });

  test("waits a full interval after a slow capture finishes", async () => {
    let resolveCapture: ((value: unknown) => void) | undefined;
    captureMeetingChatMessagesMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const stop = await start({}, false);
    await tick(30_000);
    expect(captureMeetingChatMessagesMock).toHaveBeenCalledOnce();

    resolveCapture?.(captureResult([capturedMessage]));
    await tick(0);
    await tick(4_999);
    expect(captureMeetingChatMessagesMock).toHaveBeenCalledOnce();

    await tick(1);
    expect(captureMeetingChatMessagesMock).toHaveBeenCalledTimes(2);
    await stop();
  });

  test("does not capture while disabled and re-baselines when enabled", async () => {
    let enabled = false;
    const stop = await start({ isEnabled: () => enabled });
    expect(captureMeetingChatMessagesMock).not.toHaveBeenCalled();

    enabled = true;
    await tick();
    expect(captureMeetingChatMessagesMock).toHaveBeenCalledWith();
    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();

    enabled = false;
    await tick();
    enabled = true;
    serve([capturedMessage, message("during-disabled")]);
    await tick();
    stop();

    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: "delegates mic-active app scoping to the native capture command",
      data: unknownResult(["expected exactly one active supported meeting app"])
        .data,
    },
    {
      name: "accepts the alternate Slack bundle id selected natively",
      data: {
        app: { id: "com.slack.Slack", name: "Slack" },
        contextId: "slack:test",
        platform: "slack",
        surface: "native",
        messages: [],
        warnings: [],
      },
    },
    {
      name: "accepts a browser meeting resolved natively",
      data: {
        app: { id: "com.google.Chrome", name: "Google Chrome" },
        contextId: "google-meet:meeting-1",
        platform: "googleMeet",
        surface: "web",
        messages: [],
        warnings: [],
      },
    },
  ])("$name", async ({ data }) => {
    captureMeetingChatMessagesMock.mockResolvedValue({ status: "ok", data });
    const stop = await start();
    stop();

    expect(captureMeetingChatMessagesMock).toHaveBeenCalledWith();
    expect(persistMeetingChatRecordsMock).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: "missing Accessibility permission",
      warning: "macOS accessibility permission is not trusted",
    },
    {
      name: "a missing Linux accessibility bus",
      warning: "AT-SPI accessibility bus is not available",
    },
  ])("surfaces $name once", async ({ warning }) => {
    captureMeetingChatMessagesMock.mockResolvedValue(unknownResult([warning]));
    const stop = await start({}, false);
    await tick();
    stop();

    expect(toastWarningMock).toHaveBeenCalledOnce();
    expect(toastWarningMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "meeting-chat-capture-warning" }),
    );
  });

  test("stops listening after an explicit chat decline without treating disclosure as consent", async () => {
    const onParticipantDeclined = vi.fn();
    const stop = await start({ onParticipantDeclined });

    serve([
      capturedMessage,
      message("msg-decline", { text: "I do not consent", links: [] }),
    ]);
    await tick();
    stop();

    expect(persistParticipantConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        participantKey: "Ada",
        status: "declined",
        source: "explicit_chat_reply",
      }),
    );
    expect(onParticipantDeclined).toHaveBeenCalledOnce();
  });
});

describe("meeting chat capture backoff (issue 273)", () => {
  beforeEach(() => {
    resetMocks();
    captureMeetingChatMessagesMock.mockResolvedValue(noMeetingResult());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("doubles the delay after repeated misses up to one minute", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 20].map((misses) =>
        meetingChatCaptureDelayMs(misses),
      ),
    ).toEqual([5_000, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });

  test("spaces out captures while no meeting is found", async () => {
    const stop = await start({}, false);
    const callsAt = async (ms: number) => {
      await tick(ms);
      return captureCalls();
    };

    expect(await callsAt(0)).toBe(1); // t = 0
    expect(await callsAt(5_000)).toBe(2); // t = 5 s
    expect(await callsAt(9_999)).toBe(2);
    expect(await callsAt(1)).toBe(3); // t = 15 s
    expect(await callsAt(20_000)).toBe(4); // t = 35 s
    expect(await callsAt(40_000)).toBe(5); // t = 75 s
    expect(await callsAt(59_999)).toBe(5);
    expect(await callsAt(1)).toBe(6); // t = 135 s
    expect(await callsAt(60_000)).toBe(7); // plafond à 60 s
    await stop();
  });

  test("returns to five seconds as soon as a meeting context appears", async () => {
    const stop = await start();
    await tick();
    await tick(10_000);
    await tick(20_000);
    expect(captureCalls()).toBe(4);

    serve([capturedMessage]);
    await tick(40_000);
    expect(captureCalls()).toBe(5);
    await tick();
    expect(captureCalls()).toBe(6);
    await tick();
    expect(captureCalls()).toBe(7);
    await stop();
  });

  test("treats capture errors as misses", async () => {
    captureMeetingChatMessagesMock.mockResolvedValue({
      status: "error",
      error: "AT-SPI accessibility bus is not available",
    });
    const stop = await start();
    await tick();
    await tick();
    expect(captureCalls()).toBe(2);
    await tick();
    expect(captureCalls()).toBe(3);
    await stop();
  });

  test("never runs two captures in parallel, even after backing off", async () => {
    let release: (() => void) | undefined;
    captureMeetingChatMessagesMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(noMeetingResult());
        }),
    );
    const stop = await start({}, false);
    await tick(10 * 60_000);
    expect(captureCalls()).toBe(1);

    release?.();
    await tick(0);
    await tick(4_999);
    expect(captureCalls()).toBe(1);
    await tick(1);
    expect(captureCalls()).toBe(2);
    await stop();
  });

  // Avant : une capture toutes les 5 s, soit 25 sur [0 ; 120 s].
  // Après : t = 0, 5, 15, 35, 75 s, sans avertissement affiché.
  test("bench: two minutes of listening without a meeting stay quiet", async () => {
    const stop = await start();
    await tick(120_000);
    await stop();

    expect(captureCalls()).toBe(5);
    expect(toastWarningMock).not.toHaveBeenCalled();
  });
});
