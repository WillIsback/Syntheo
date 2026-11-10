import { defineConfig } from "vitest/config";

// Sans cette config, `vitest run` lancé hors du script `test` (IDE, `npx
// vitest`, CI) tourne en environnement node : 53 tests DOM échouent avec
// « document is not defined » (issue #505).
export default defineConfig({
  test: {
    environment: "jsdom",
    // Plafond fixe : plusieurs runs en parallèle (agents, worktrees)
    // saturent la RAM de la machine, comme pour apps/desktop.
    maxWorkers: 4,
  },
});
