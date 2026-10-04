import test from "node:test";
import assert from "node:assert/strict";
import { capture, sanitizeTake, takePattern } from "./takes.ts";
import { marbles } from "./marbles.ts";
import { DEFAULTS } from "./presets.ts";
import type { Ev } from "./sequencer.ts";

const ev = (time: number, pitch = 60): Ev => ({ time, pitch, dur: 0.1, voice: 0 });

test("capture takes the window ending at the edge and re-bases it to 0", () => {
  const t = capture([1, 2, 3, 9, 10].map((x) => ev(x)), 10, 8);
  assert.equal(t.len, 8);
  assert.deepEqual(t.events.map((e) => e.time), [0, 1, 7]); // events at 2, 3, 9; the one at 10 is the edge, 1 is too old
});

test("takePattern loops the take, and any split of windows gives the same events", () => {
  const take = { len: 2, events: [ev(0.5), ev(1.5)] };
  const p = takePattern(take, 10);
  assert.deepEqual(p(10, 14.01).map((e) => e.time), [10.5, 11.5, 12.5, 13.5]);
  const split = [...p(10, 11), ...p(11, 12.7), ...p(12.7, 14.01)];
  assert.deepEqual(split, p(10, 14.01));
  assert.deepEqual(p(0, 10), []); // nothing before the anchor
});

test("capturing a live groove and looping it continues it exactly", () => {
  const p = { ...structuredClone(DEFAULTS), model: "independent" as const, bias: 0, dejaVu: 0, jitter: 0.5 };
  const live = marbles(p)(0, 30);
  const edge = Math.max(...live.map((e) => e.time)) + 1e-6, len = 6;
  const take = capture(live, edge, len);
  const looped = takePattern(take, edge)(edge, edge + 2 * len);
  const tail = live.filter((e) => e.time >= edge - len);
  assert.equal(looped.length, 2 * tail.length);
  const r = (x: number) => Math.round(x * 1e6) / 1e6; // re-basing costs a few ulps
  assert.deepEqual(looped.slice(0, tail.length).map((e) => [r(e.time - len), e.pitch, e.voice]), tail.map((e) => [r(e.time), e.pitch, e.voice])); // first pass = the captured tail, one loop later
  assert.deepEqual(looped.slice(tail.length).map((e) => e.pitch), tail.map((e) => e.pitch)); // second pass repeats
});

test("sanitizeTake rejects junk and rebuilds clean events", () => {
  assert.equal(sanitizeTake(null), null);
  assert.equal(sanitizeTake({ len: -1, events: [] }), null);
  assert.equal(sanitizeTake({ len: 4, events: "x" }), null);
  const t = sanitizeTake({ len: 4, events: [
    { time: 1, pitch: 60, dur: 0.2, voice: 1, pos: { az: 30, el: 0, dist: 2 }, params: { shape: 3, timbre: 9, evil: 1 }, extra: 1 },
    { time: 99, pitch: 60, dur: 0.2 }, { time: 1, pitch: NaN, dur: 1 }, null,
  ] })!;
  assert.equal(t.events.length, 1);
  assert.deepEqual(t.events[0], { time: 1, pitch: 60, dur: 0.2, voice: 1, pos: { az: 30, el: 0, dist: 2 }, params: { shape: 3 } });
  assert.equal(sanitizeTake({ len: 4, events: Array(9000).fill({ time: 1, pitch: 60, dur: 1 }) })!.events.length, 4000);
});
