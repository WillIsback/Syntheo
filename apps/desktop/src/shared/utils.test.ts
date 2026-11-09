import { describe, expect, it } from "vitest";

import * as utils from "./utils";

describe("web app flows", () => {
  it("no longer builds hosted web app URLs (no account, no web flows)", () => {
    expect("buildWebAppUrl" in utils).toBe(false);
  });
});
