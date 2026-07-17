import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

test("node test runner executes TSX tests through tsx", () => {
  const element = <div data-kind="probe">ok</div>;

  assert.equal(React.isValidElement(element), true);
  assert.equal(element.props["data-kind"], "probe");
});
