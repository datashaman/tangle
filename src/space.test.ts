import test from "node:test";
import assert from "node:assert/strict";
import { position } from "./space.ts";

const near = (a: number[], b: number[]) => assert.ok(a.every((x, i) => Math.abs(x - b[i]) < 1e-9), `${a} vs ${b}`);

test("position: front, right, left, behind, above", () => {
  near(position(0, 0, 2), [0, 0, -2]);
  near(position(90, 0, 2), [2, 0, 0]);
  near(position(-90, 0, 2), [-2, 0, 0]);
  near(position(180, 0, 2), [0, 0, 2]);
  near(position(30, 90, 2), [0, 2, 0]);
});
