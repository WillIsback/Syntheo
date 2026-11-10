import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  live: { status: "active", sessionId: "session-1" as string | null },
  getStatus: vi.fn(),
  retry: vi.fn(),
  warning: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: <T,>(selector: (state: { live: typeof mocks.live }) => T) =>
    selector({ live: mocks.live }),
}));
vi.mock("~/types/tauri.gen", () => ({
  commands: {
    getAecModelStatus: mocks.getStatus,
    retryAecModelDownload: mocks.retry,
  },
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning: mocks.warning, dismiss: mocks.dismiss },
}));

import { AecModelUnavailableNotice } from "./aec-model-unavailable-notice";

const status = (state: "downloading" | "ready" | "failed") => ({
  status: "ok" as const,
  data: { state },
});

function renderNotice() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AecModelUnavailableNotice />
    </QueryClientProvider>,
  );
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("AecModelUnavailableNotice (issue 509)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.live.status = "active";
    mocks.live.sessionId = "session-1";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("warns once during a recording when the models are missing", async () => {
    mocks.getStatus.mockResolvedValue(status("failed"));

    renderNotice();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(mocks.warning).toHaveBeenCalledOnce();
    const [message, options] = mocks.warning.mock.calls[0] ?? [];
    expect(message).toBe("Echo cancellation unavailable");
    expect(options).toMatchObject({
      id: "aec-model-unavailable-session-1",
      description:
        "The models could not be downloaded (offline?). Listening continues without it.",
      action: { label: "Retry" },
    });
  });

  it("retries the download from the toast", async () => {
    mocks.getStatus.mockResolvedValue(status("failed"));
    mocks.retry.mockResolvedValue(status("downloading"));

    renderNotice();
    await flush();
    const options = mocks.warning.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    await act(async () => {
      options.action.onClick();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.retry).toHaveBeenCalledOnce();
  });

  it("stays silent when the models are ready", async () => {
    mocks.getStatus.mockResolvedValue(status("ready"));

    renderNotice();
    await flush();

    expect(mocks.warning).not.toHaveBeenCalled();
  });

  it("does not check the models outside a recording", async () => {
    mocks.live.status = "inactive";
    mocks.getStatus.mockResolvedValue(status("failed"));

    renderNotice();
    await flush();

    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(mocks.warning).not.toHaveBeenCalled();
  });

  it("removes the warning once the models arrive during the recording", async () => {
    mocks.getStatus
      .mockResolvedValueOnce(status("failed"))
      .mockResolvedValue(status("ready"));

    renderNotice();
    await flush();
    expect(mocks.warning).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(mocks.getStatus).toHaveBeenCalledTimes(2);
    expect(mocks.dismiss).toHaveBeenCalledWith(
      "aec-model-unavailable-session-1",
    );
  });
});
