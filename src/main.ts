/// <reference types="vite/client" />
import { run } from "./sequencer.ts";
import { marbles, type TParams } from "./marbles.ts";
import { SHAPES } from "./braids/shapes.ts";
import workletUrl from "./braids/worklet.js?url";
import wasmUrl from "./braids/braids.wasm?url";

const p: TParams = {
  dejaVu: 0.5, length: 8, bias: 0.5, model: "bernoulli", step: 0.25,
  voices: [{ shape: 0, timbre: 0.5, color: 0.5 }, { shape: 3, timbre: 0.5, color: 0.5 }],
};
const bind = (id: string, k: "dejaVu" | "length" | "bias" | "step") => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.oninput = () => (p[k] = +el.value);
};
bind("dv", "dejaVu"); bind("len", "length"); bind("bias", "bias"); bind("step", "step");
const model = document.getElementById("model") as HTMLSelectElement;
model.onchange = () => (p.model = model.value as TParams["model"]);

// Per-voice Braids controls, built once; handlers write straight into p.voices.
const voicesEl = document.getElementById("voices")!;
p.voices.forEach((v, i) => {
  const row = document.createElement("div");
  row.innerHTML = `voice ${i + 1} <select>${SHAPES.map((n, k) => `<option value="${k}">${n}</option>`).join("")}</select>
    <label>timbre <input type="range" min="0" max="1" step="0.01" value="${v.timbre}"></label>
    <label>color <input type="range" min="0" max="1" step="0.01" value="${v.color}"></label>`;
  const [sel, tim, col] = Array.from(row.querySelectorAll("select, input")) as HTMLInputElement[];
  sel.value = String(v.shape);
  sel.onchange = () => (v.shape = +sel.value);
  tim.oninput = () => (v.timbre = +tim.value);
  col.oninput = () => (v.color = +col.value);
  voicesEl.append(row);
});

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
