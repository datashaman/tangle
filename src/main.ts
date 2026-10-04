/// <reference types="vite/client" />
import { run } from "./sequencer.ts";
import { marbles, type TParams } from "./marbles.ts";
import workletUrl from "./braids/worklet.js?url";
import wasmUrl from "./braids/braids.wasm?url";

const p: TParams = { dejaVu: 0.5, length: 8, bias: 0.5, model: "bernoulli" };
const bind = (id: string, k: "dejaVu" | "length" | "bias") => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.oninput = () => (p[k] = +el.value);
};
bind("dv", "dejaVu"); bind("len", "length"); bind("bias", "bias");
const model = document.getElementById("model") as HTMLSelectElement;
model.onchange = () => (p.model = model.value as TParams["model"]);

let stop: (() => void) | null = null;
document.getElementById("go")!.onclick = async (ev) => {
  const btn = ev.target as HTMLButtonElement;
  if (stop) { stop(); stop = null; btn.textContent = "start"; return; }
  const ctx = new AudioContext({ sampleRate: 96000 }); // Braids' native rate
  await ctx.audioWorklet.addModule(workletUrl);
  const wasm = await (await fetch(wasmUrl)).arrayBuffer();
  // One worklet node (own wasm instance) per Marbles t channel.
  const nodes = [0, 1].map(() => {
    const n = new AudioWorkletNode(ctx, "braids", { processorOptions: { wasm } });
    n.connect(ctx.destination);
    return n;
  });
  await ctx.resume();
  const stopRun = run(marbles(p), () => ctx.currentTime, (e) => nodes[e.voice ?? 0].port.postMessage(e));
  stop = () => { stopRun(); nodes.forEach((n) => n.disconnect()); ctx.close(); };
  btn.textContent = "stop";
};
