import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeTransaction: vi.fn(async (_statements: unknown) => {}),
  execute: vi.fn(async (_sql: string) => []),
}));

vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
  liveQueryClient: { execute: mocks.execute },
  useLiveQuery: vi.fn(),
}));
vi.mock("~/db/write-queue", () => ({
  enqueueDatabaseWrite: (_key: string, run: () => Promise<void>) => run(),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn(),
  disable: vi.fn(),
}));

import { setSettingValues } from "./queries";

type Statement = { sql: string; params: unknown[] };

beforeEach(() => vi.clearAllMocks());

// Vérification 0.8.0, points 3 et 8 : désactiver la mesure vide la copie des
// synthèses générées et clôt les générations, dans la transaction du réglage.
describe("turning measurement off", () => {
  it("clears the generated copy and closes generations in the same transaction", async () => {
    await setSettingValues({
      measurement_enabled: false,
      calibration_enabled: false,
    });
    expect(mocks.executeTransaction).toHaveBeenCalledOnce();
    const sql = (mocks.executeTransaction.mock.calls[0][0] as Statement[]).map(
      (s) => s.sql,
    );
    expect(sql).toContain("PRAGMA secure_delete = ON");
    expect(sql).toContain("DELETE FROM summary_generated_bodies");
    expect(sql).toContain(
      "UPDATE beta_generations SET closed_at = ? WHERE closed_at IS NULL",
    );
    expect(
      sql.filter((s) => s.includes("INSERT INTO app_settings")),
    ).toHaveLength(2);
    expect(mocks.execute).toHaveBeenCalledWith(
      "PRAGMA wal_checkpoint(TRUNCATE)",
    );
  });

  // Vérification 0.8.0 (second tour), point 4 : activer inscrit la personne
  // dans la transaction du réglage, après lui (garde SQL sur le réglage).
  it("turning it on enrolls in the same transaction, and clears nothing", async () => {
    await setSettingValues({ measurement_enabled: true });
    const sql = (mocks.executeTransaction.mock.calls[0][0] as Statement[]).map(
      (s) => s.sql,
    );
    expect(sql).toHaveLength(2);
    expect(sql[0]).toContain("INSERT INTO app_settings");
    expect(sql[1]).toContain("INSERT INTO beta_enrollment");
    expect(sql[1]).toContain("measurement_enabled");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
