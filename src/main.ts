import { run, stub, type Ev } from "./sequencer.ts";

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// Voice: oscillator + linear attack/release envelope. Swap for Braids later.
function voice(ctx: AudioContext, e: Ev) {
  const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: hz(e.pitch) });
  const g = new GainNode(ctx, { gain: 0 });
  const t = ctx.currentTime + Math.max(0, e.time - ctx.currentTime);
  g.gain.setValueAtTime(0, t).linearRampToValueAtTime(0.2, t + 0.005).linearRampToValueAtTime(0, t + e.dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + e.dur + 0.01);
}

let stop: (() => void) | null = null;
document.getElementById("go")!.onclick = async (ev) => {
  const btn = ev.target as HTMLButtonElement;
  if (stop) { stop(); stop = null; btn.textContent = "start"; return; }
  const ctx = new AudioContext();
  await ctx.resume();
  stop = run(stub(), () => ctx.currentTime, (e) => voice(ctx, e));
  btn.textContent = "stop";
};
