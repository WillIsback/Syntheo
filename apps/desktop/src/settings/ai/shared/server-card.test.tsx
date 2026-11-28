import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ServerStatusChip } from "./server-card";
import type { ServerFailure } from "./server-connection";

// Issue 786 : la pastille de la carte et la barre d'état partagent la même
// raison d'échec ; une route absente ou une erreur du serveur ne sont pas
// « injoignable ».
describe("ServerStatusChip", () => {
  afterEach(cleanup);

  it.each<[ServerFailure, string]>([
    [{ ok: false, reason: "unreachable" }, "Unreachable"],
    [{ ok: false, reason: "unauthorized", status: 401 }, "Key refused"],
    [{ ok: false, reason: "invalid_url", message: "x" }, "Invalid address"],
    [{ ok: false, reason: "not_found", status: 404 }, "Route not found"],
    [{ ok: false, reason: "server_error", status: 503 }, "Server error"],
  ])("labels %o as %s", (failure, label) => {
    render(<ServerStatusChip state={{ status: "failed", failure }} />);
    expect(screen.getByRole("status").textContent).toBe(label);
  });
});
