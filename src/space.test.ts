import test from "node:test";
import assert from "node:assert/strict";
import { plan, position, unplan } from "./space.ts";

const near = (a: number[], b: number[]) => assert.ok(a.every((x, i) => Math.abs(x - b[i]) < 1e-9), `${a} vs ${b}`);

test("position: front, right, left, behind, above", () => {
  near(position(0, 0, 2), [0, 0, -2]);
  near(position(90, 0, 2), [2, 0, 0]);
  near(position(-90, 0, 2), [-2, 0, 0]);
  near(position(180, 0, 2), [0, 0, 2]);
  near(position(30, 90, 2), [0, 2, 0]);
});

test("plan view round-trips azimuth and distance", () => {
  for (const [az, d] of [[0, 2], [45, 5], [-120, 3], [180, 1.5]]) {
    const back = unplan(...plan(az, d));
    assert.ok(Math.abs(Math.abs(back.az) - Math.abs(az)) < 1e-9 && Math.abs(back.dist - d) < 1e-9, `${az},${d}`);
  }
  near(plan(90, 4), [4, 0]);
  near(plan(0, 4), [0, 4]);
});
