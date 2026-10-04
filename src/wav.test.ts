import test from "node:test";
import assert from "node:assert/strict";
import { encodeWav } from "./wav.ts";

test("encodeWav writes a valid 16-bit stereo header and clamps samples", () => {
  const w = encodeWav([[Float32Array.of(0, 1), Float32Array.of(-1, 2)], [Float32Array.of(0.5), Float32Array.of(0)]], 96000);
  const v = new DataView(w.buffer);
  assert.equal(String.fromCharCode(...w.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...w.slice(8, 16)), "WAVEfmt ");
  assert.equal(v.getUint16(22, true), 2); // channels
  assert.equal(v.getUint32(24, true), 96000);
  assert.equal(v.getUint32(40, true), 3 * 2 * 2); // 3 frames, 2 channels, 2 bytes
  assert.equal(w.length, 44 + 12);
  assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)], [0, -32768, 32767, 32767]); // frame 2 clamps 2 -> full scale
});
