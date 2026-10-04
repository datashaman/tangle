/// <reference types="vite/client" />
import { run } from "./sequencer.ts";
import { marbles, SCALES, type TParams } from "./marbles.ts";
import { SHAPES } from "./braids/shapes.ts";
import { DEFAULTS, MODELS, R, decode, encode, sanitize } from "./presets.ts";
import workletUrl from "./braids/worklet.js?url";
import wasmUrl from "./braids/braids.wasm?url";

const p: TParams = structuredClone(DEFAULTS);

// --- controls: built from specs, each registers a sync() so loading a preset can refresh them all ---
const sync: (() => void)[] = [];
const app = document.getElementById("app")!;
const html = (s: string) => Object.assign(document.createElement("div"), { innerHTML: s }).firstElementChild as HTMLElement;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

const section = (title: string) => {
  const s = html(`<section><h2>${title}</h2></section>`);
  app.append(s);
  return s;
};
// Double-click a control (or a dropdown's label) to reset it to its default.
const slider = (parent: HTMLElement, label: string, [min, max, step]: readonly number[], def: number, get: () => number, set: (v: number) => void) => {
  const l = html(`<label><span>${label} <output></output></span><input type="range" min="${min}" max="${max}" step="${step}"></label>`);
  const input = l.querySelector("input")!, out = l.querySelector("output")!;
  const show = () => { input.value = String(get()); out.textContent = fmt(get()); };
  input.oninput = () => { set(+input.value); out.textContent = fmt(get()); };
  l.title = "double-click to reset";
  l.ondblclick = () => { set(def); show(); };
  sync.push(show); show();
  parent.append(l);
};
const select = (parent: HTMLElement, label: string, options: [string, string][], def: string, get: () => string, set: (v: string) => void) => {
  const l = html(`<label><span>${label}</span><select>${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`);
  const sel = l.querySelector("select")!;
  sel.onchange = () => set(sel.value);
  const show = () => (sel.value = get());
  const name = l.querySelector("span")!;
  name.title = "double-click to reset";
  name.ondblclick = () => { set(def); show(); };
  sync.push(show); show();
  parent.append(l);
};

const clock = section("Clock");
slider(clock, "tick length (s)", R.step, DEFAULTS.step, () => p.step, (v) => (p.step = v));
slider(clock, "jitter", R.jitter, DEFAULTS.jitter, () => p.jitter, (v) => (p.jitter = v));

const rhythm = section("Rhythm");
select(rhythm, "model", MODELS.map((m) => [m, m]), DEFAULTS.model, () => p.model, (v) => (p.model = v as TParams["model"]));
slider(rhythm, "bias", R.bias, DEFAULTS.bias, () => p.bias, (v) => (p.bias = v));
slider(rhythm, "déjà vu", R.dejaVu, DEFAULTS.dejaVu, () => p.dejaVu, (v) => (p.dejaVu = v));
slider(rhythm, "length", R.length, DEFAULTS.length, () => p.length, (v) => (p.length = v));
// Seed picks which random loop you get; "new" rolls one. Changing it takes effect on the next tick.
{
  const l = html(`<label title="double-click to reset"><span>seed</span><input type="number" min="${R.seed[0]}" max="${R.seed[1]}" step="1" style="width:7em"> <button type="button">new</button></label>`);
  const input = l.querySelector("input")!;
  const setSeed = (v: number) => { p.seed = Math.min(R.seed[1], Math.max(R.seed[0], Math.round(v) || DEFAULTS.seed)); input.value = String(p.seed); };
  input.onchange = () => setSeed(+input.value);
  l.querySelector("button")!.onclick = () => setSeed(1 + Math.floor(Math.random() * R.seed[1]));
  l.querySelector("span")!.ondblclick = () => setSeed(DEFAULTS.seed);
  sync.push(() => (input.value = String(p.seed))); input.value = String(p.seed);
  rhythm.append(l);
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitch = section("Pitch");
select(pitch, "root", NOTES.map((n, i) => [String(48 + i), n]), String(DEFAULTS.root), () => String(p.root), (v) => (p.root = +v));
select(pitch, "scale", Object.keys(SCALES).map((s) => [s, s]), DEFAULTS.scale, () => p.scale, (v) => (p.scale = v));
slider(pitch, "spread", R.spread, DEFAULTS.spread, () => p.spread, (v) => (p.spread = v));
slider(pitch, "bias", R.pitchBias, DEFAULTS.pitchBias, () => p.pitchBias, (v) => (p.pitchBias = v));

p.voices.forEach((v, i) => {
  const s = section(`Voice ${i + 1}`);
  select(s, "shape", SHAPES.map((n, k) => [String(k), n]), String(DEFAULTS.voices[i].shape), () => String(v.shape), (x) => (v.shape = +x));
  slider(s, "timbre", R.timbre, DEFAULTS.voices[i].timbre, () => v.timbre, (x) => (v.timbre = x));
  slider(s, "color", R.color, DEFAULTS.voices[i].color, () => v.color, (x) => (v.color = x));
});

// --- presets: saved in localStorage, shared as a URL hash ---
const KEY = "tangle.presets";
const store = (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const save = (o: Record<string, unknown>) => { try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch { return false; } };

// Voice objects are captured by their controls, so copy into them in place.
const apply = (next: TParams) => {
  const { voices, ...rest } = next;
  Object.assign(p, rest);
  p.voices.forEach((v, i) => Object.assign(v, voices[i]));
  sync.forEach((f) => f());
};

const bar = document.getElementById("presets")!;
bar.innerHTML = `<select id="saved" aria-label="saved presets"></select>
  <input id="name" type="text" placeholder="preset name" aria-label="preset name" size="16">
  <button id="save">save</button><button id="del">delete</button><button id="share">copy link</button>
  <span id="status" role="status"></span>`;
const saved = bar.querySelector("#saved") as HTMLSelectElement, name = bar.querySelector("#name") as HTMLInputElement;
const status = bar.querySelector("#status")!;
const say = (m: string) => (status.textContent = m);
const refreshList = (pick = "") => {
  saved.innerHTML = `<option value="">presets…</option>` + Object.keys(store()).map((n) => `<option>${n.replace(/[<&]/g, "")}</option>`).join("");
  saved.value = pick;
};
refreshList();
saved.onchange = () => {
  if (!saved.value) return;
  apply(sanitize(store()[saved.value]));
  name.value = saved.value;
  say(`loaded ${saved.value}`);
};
(bar.querySelector("#save") as HTMLElement).onclick = () => {
  const n = name.value.trim().replace(/[<&]/g, "");
  if (!n) return say("give it a name first");
  save({ ...store(), [n]: structuredClone(p) }) ? say(`saved ${n}`) : say("couldn't save (storage blocked)");
  refreshList(n);
};
(bar.querySelector("#del") as HTMLElement).onclick = () => {
  const { [saved.value]: _gone, ...rest } = store();
  if (!saved.value) return say("pick a preset to delete");
  save(rest);
  say(`deleted ${saved.value}`);
  refreshList();
};
(bar.querySelector("#share") as HTMLElement).onclick = async () => {
  location.hash = "p=" + encode(p);
  try { await navigator.clipboard.writeText(location.href); say("link copied"); } catch { say("link is in the address bar"); }
};
const fromHash = location.hash.match(/^#p=(.+)$/)?.[1];
const shared = fromHash && decode(fromHash);
if (shared) { apply(shared); say("loaded shared preset"); }

// --- audio ---
let stop: (() => void) | null = null;
const go = document.getElementById("go") as HTMLButtonElement;
go.onclick = async () => {
  if (stop) { stop(); stop = null; go.textContent = "start"; go.setAttribute("aria-pressed", "false"); return; }
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
  go.textContent = "stop";
  go.setAttribute("aria-pressed", "true");
};
