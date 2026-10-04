// Port of the "déjà vu" loop from Mutable Instruments Marbles (marbles/random/random_sequence.h):
// a 16-slot loop of random values. dejaVu=0 always draws new values, 0.5 locks the loop,
// 1 jumps randomly within the loop. Below 0.5 mutation writes new values; above it only shuffles order.
// Omitted: replay/rewrite history (multi-channel locking, external input).
import type { Pattern } from "./sequencer.ts";

const N = 16;
export type DejaVu = { dejaVu: number; length: number }; // mutable: change live from the UI

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dejaVuStream(seed: number, p: DejaVu): () => number {
  const rnd = mulberry32(seed);
  const loop = Array.from({ length: N }, rnd);
  let head = 0, step = 0;
  return () => {
    const len = Math.min(N, Math.max(1, Math.round(p.length)));
    const dv = p.dejaVu;
    const mutate = rnd() < (2 * dv - 1) ** 2;
    if (mutate && dv <= 0.5) {
      loop[head] = rnd();
      head = (head + 1) % N;
      step = len - 1;
    } else if (mutate) {
      step = Math.floor(rnd() * len);
    } else {
      step = (step + 1) % len;
    }
    return loop[(head + N - len + (step % len)) % N];
  };
}

// Stateful: advances one stream value per clock step, so windows must arrive in order (run() does).
// ponytail: fixed clock, minor-pentatonic quantizer; Marbles' t-generator (rhythm models) is the next piece.
export const marbles = (p: DejaVu, seed = 1, step = 0.25, root = 48): Pattern => {
  const next = dejaVuStream(seed, p);
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
  let i: number | undefined;
  return (from, to) => {
    i ??= Math.ceil(from / step);
    const out = [];
    for (; i * step < to; i++) {
      out.push({ time: i * step, pitch: root + scale[Math.floor(next() * scale.length)], dur: step * 0.8 });
    }
    return out;
  };
};
