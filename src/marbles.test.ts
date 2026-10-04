import test from "node:test";
import assert from "node:assert/strict";
import { dejaVuStream } from "./marbles.ts";

const take = (n: number, next: () => number) => Array.from({ length: n }, next);

test("dejaVu 0.5 locks to a loop of `length`", () => {
  const s = take(24, dejaVuStream(7, { dejaVu: 0.5, length: 4 }));
  assert.deepEqual(s.slice(0, 4), s.slice(4, 8));
  assert.deepEqual(s.slice(0, 4), s.slice(20, 24));
});

test("dejaVu 0 never repeats; same seed is reproducible", () => {
  const a = take(16, dejaVuStream(7, { dejaVu: 0, length: 4 }));
  assert.notDeepEqual(a.slice(0, 4), a.slice(4, 8));
  assert.deepEqual(a, take(16, dejaVuStream(7, { dejaVu: 0, length: 4 })));
});

test("dejaVu 1 only reorders: values come from the existing loop", () => {
  const loop = new Set(take(4, dejaVuStream(7, { dejaVu: 0.5, length: 4 })));
  for (const v of take(50, dejaVuStream(7, { dejaVu: 1, length: 4 }))) assert.ok(loop.has(v));
});
