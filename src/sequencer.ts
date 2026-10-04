// A pattern is any function of a time window -> events. No grid, no loop assumed:
// non-linear algorithms live here. Sound sources only ever see Ev.
export type Ev = { time: number; pitch: number; dur: number; voice?: number; az?: number; params?: Record<string, number> };
export type Pattern = (from: number, to: number) => Ev[];

// Stub algorithm: events at every integer multiple of `step` seconds, pitch from a
// fixed deterministic scramble of the step index (not a linear scale walk).
export const stub = (step = 0.25, root = 48): Pattern => (from, to) => {
  const out: Ev[] = [];
  for (let i = Math.ceil(from / step); i * step < to; i++) {
    out.push({ time: i * step, pitch: root + [0, 7, 3, 10, 5, 12][(i * 5) % 6], dur: step * 0.8, params: { shape: 3 * (Math.floor(i / 12) % 4), timbre: (i % 8) / 8 } });
  }
  return out;
};

// Calls play() for each event once, scheduling `lookahead` seconds ahead of now().
// Window edges are contiguous, so no event is skipped or doubled.
export function run(p: Pattern, now: () => number, play: (e: Ev) => void, lookahead = 0.1, tick = 25) {
  let cursor = now();
  const id = setInterval(() => {
    const to = now() + lookahead;
    p(cursor, to).forEach(play);
    cursor = to;
  }, tick);
  return () => clearInterval(id);
}
