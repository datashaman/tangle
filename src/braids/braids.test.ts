import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("braids wasm renders audio at the expected pitch", async () => {
  const { instance } = await WebAssembly.instantiate(readFileSync(new URL("./braids.wasm", import.meta.url)), {});
  const x = instance.exports as any;
  x._initialize(); x.b_init();
  x.b_set(3, 69 << 7, 0, 0); // SINE_TRIANGLE, A4
  let crossings = 0, prev = 0, peak = 0;
  const blocks = 96000 / 24; // 1s at Braids' native 96kHz
  for (let b = 0; b < blocks; b++) {
    const buf = new Int16Array(x.memory.buffer, x.b_render(), 24);
    for (const s of buf) { if (prev < 0 && s >= 0) crossings++; prev = s; peak = Math.max(peak, Math.abs(s)); }
  }
  assert.ok(peak > 1000, `silent (peak ${peak})`);
  assert.ok(Math.abs(crossings - 440) < 3, `expected ~440Hz, got ${crossings}`);
});
