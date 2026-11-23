import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isExecutionBlocked,
  OnDeviceRefusalSync,
} from "./on-device-refusal-sync";

import { listenerStore } from "~/store/zustand/listener/instance";
import {
  ON_DEVICE_COMMISSIONING_QUERY_KEY,
  ON_DEVICE_STATUS_QUERY_KEY,
} from "~/stt/on-device";

function setDegraded(degraded: Parameters<typeof isExecutionBlocked>[0]): void {
  listenerStore.setState((state) => ({
    live: { ...state.live, degraded },
  }));
}

afterEach(() => {
  listenerStore.setState(listenerStore.getInitialState(), true);
});

describe("OnDeviceRefusalSync (QA 0.8.0-3)", () => {
  it("relit la carte et le statut quand l'écoute est refusée par le système", () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(OnDeviceRefusalSync),
      ),
    );
    expect(invalidate).not.toHaveBeenCalled();

    // Autre refus du module : rien à relire.
    act(() =>
      setDegraded({
        type: "on_device_unavailable",
        reason: "crashing",
        permanent: false,
      }),
    );
    expect(invalidate).not.toHaveBeenCalled();

    act(() =>
      setDegraded({
        type: "on_device_unavailable",
        reason: "execution_blocked",
        permanent: true,
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ON_DEVICE_COMMISSIONING_QUERY_KEY,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ON_DEVICE_STATUS_QUERY_KEY,
    });
  });

  it("ne reconnaît que le refus d'exécution du module", () => {
    expect(isExecutionBlocked(null)).toBe(false);
    expect(isExecutionBlocked({ type: "connection_timeout" })).toBe(false);
    expect(
      isExecutionBlocked({
        type: "on_device_unavailable",
        reason: "execution_blocked",
        permanent: true,
      }),
    ).toBe(true);
  });
});
