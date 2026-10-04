import test from "node:test";
import assert from "node:assert/strict";
import { stub } from "./sequencer.ts";

test("windows are contiguous: no dropped or duplicated events", () => {
  const p = stub(0.25);
  const split = [...p(0, 0.37), ...p(0.37, 1.01)];
  assert.deepEqual(split, p(0, 1.01));
});
