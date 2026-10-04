// Takes: grab what just played (retroactively), loop it exactly, save it. Times in a take are relative to its start.
import type { Ev, Pattern } from "./sequencer.ts";
import { GRAIN } from "./marbles.ts";

export type Take = { len: number; events: Ev[] }; // 0 <= event.time < len

// The `len` seconds of events that end at `edge`, re-based to start at 0.
export function capture(events: Ev[], edge: number, len: number): Take {
  const start = edge - len;
  return {
    len,
    events: events
      .filter((e) => e.time >= start && e.time < edge)
      .map((e) => ({ ...structuredClone(e), time: e.time - start }))
      .sort((a, b) => a.time - b.time),
  };
}

// Loops a take; the first pass starts at `anchor`. Pure in the window, so any split of windows gives the same events.
export const takePattern = (take: Take, anchor: number): Pattern => (from, to) => {
  const out: Ev[] = [];
  for (let k = Math.max(0, Math.floor((from - anchor) / take.len)); anchor + k * take.len < to; k++) {
    for (const e of take.events) {
      const t = anchor + k * take.len + e.time;
      if (t >= from && t < to) out.push({ ...e, time: t });
    }
  }
  return out;
};

const MAX_EVENTS = 4000;
const fin = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

// Takes come back from localStorage: rebuild each event from checked fields and drop anything malformed.
export function sanitizeTake(raw: unknown): Take | null {
  const r = raw as { len?: unknown; events?: unknown } | null;
  const len = fin(r?.len, 0.1, 64);
  if (len === null || !Array.isArray(r?.events)) return null;
  const events: Ev[] = [];
  for (const e of (r!.events as any[]).slice(0, MAX_EVENTS)) {
    const time = fin(e?.time, 0, len), pitch = fin(e?.pitch, 0, 127), dur = fin(e?.dur, 0, 64);
    if (time === null || pitch === null || dur === null) continue;
    const ev: Ev = { time, pitch, dur, voice: Math.round(fin(e?.voice, 0, GRAIN) ?? 0) };
    const az = fin(e?.pos?.az, -180, 180), el = fin(e?.pos?.el, -90, 90), dist = fin(e?.pos?.dist, 1, 10);
    if (az !== null && el !== null && dist !== null) ev.pos = { az, el, dist };
    if (e?.params && typeof e.params === "object") {
      ev.params = {};
      for (const [k, [lo, hi]] of Object.entries({ shape: [0, 47], timbre: [0, 1], color: [0, 1], pos: [0, 1], pan: [-1, 1], semis: [-48, 48] })) {
        const v = fin(e.params[k], lo, hi);
        if (v !== null) ev.params[k] = v;
      }
    }
    events.push(ev);
  }
  return { len, events: events.sort((a, b) => a.time - b.time) };
}
