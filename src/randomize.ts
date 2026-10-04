// Randomize the configuration. "music" = clock, rhythm, pitch, space-loop and seed; "all" also re-rolls each voice's sound
// and position and the effects. Never touches the mixer (levels, on/off, master) or the HRTF switch, so a roll can't mute a voice or blast
// the volume. Ranges are chosen to stay musical; the full ranges are still reachable by hand.
import { SCALES, type TParams } from "./marbles.ts";
import { MODELS, R } from "./presets.ts";

const pick = <T>(a: readonly T[], r: () => number) => a[Math.floor(r() * a.length)];
const between = (lo: number, hi: number, r: () => number) => lo + (hi - lo) * r();
const chance = (p: number, r: () => number) => r() < p;
const dejaVu = (r: () => number) => (chance(0.25, r) ? 0.5 : r()); // a quarter of the time, lock the loop

export function randomize(p: TParams, scope: "music" | "all", r: () => number = Math.random): TParams {
  const n = structuredClone(p);
  n.model = pick(MODELS, r);
  n.bias = r();
  n.dejaVu = dejaVu(r);
  n.length = 2 + Math.floor(r() * 15);
  n.jitter = r() ** 3 * 0.7; // mostly tight, occasionally loose
  n.step = Math.round(between(0.1, 0.4, r) * 100) / 100;
  n.root = R.root[0] + Math.floor(r() * 12);
  n.scale = pick(Object.keys(SCALES), r);
  n.spread = between(0.2, 0.95, r);
  n.pitchBias = between(0.2, 0.8, r);
  n.seed = 1 + Math.floor(r() * (R.seed[1] - 1));
  n.spaceDejaVu = dejaVu(r);
  n.spaceLength = 2 + Math.floor(r() * 15);
  if (scope === "all") {
    for (const v of n.voices) {
      v.shape = Math.floor(r() * (R.shape[1] + 1));
      v.timbre = r();
      v.color = r();
      v.az = Math.round(between(-180, 180, r));
      v.el = Math.round(between(-30, 30, r));
      v.dist = Math.round(between(1, 4, r) * 10) / 10;
      v.walk = chance(0.3, r) ? Math.round(between(-45, 45, r)) : 0;
      v.swing = chance(0.4, r) ? Math.round(between(0, 90, r)) : 0;
      v.swingEl = chance(0.2, r) ? Math.round(between(0, 40, r)) : 0;
      v.swingDist = chance(0.2, r) ? Math.round(between(0, 3, r) * 10) / 10 : 0;
    }
    // effects: each is off half the time, and kept subtle when on
    n.delayMix = chance(0.5, r) ? Math.round(between(0.05, 0.4, r) * 100) / 100 : 0;
    n.delayTicks = pick([2, 3, 4, 6], r);
    n.delayFeedback = Math.round(between(0.2, 0.6, r) * 100) / 100;
    n.reverbMix = chance(0.5, r) ? Math.round(between(0.05, 0.35, r) * 100) / 100 : 0;
    n.reverbSize = Math.floor(r() * 4);
    for (const v of n.voices) { // per-voice sends: a third of the time a voice stays dry, otherwise anywhere up to full
      v.delaySend = chance(0.3, r) ? 0 : Math.round(r() * 100) / 100;
      v.reverbSend = chance(0.3, r) ? 0 : Math.round(r() * 100) / 100;
    }
  }
  return n;
}
