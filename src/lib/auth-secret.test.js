import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthSecret } from "./auth-secret.js";

test("resolveAuthSecret uses the development fallback when env is empty", () => {
  assert.equal(resolveAuthSecret({}), "syntheo-dev-auth-secret");
});
