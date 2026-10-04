/// <reference types="vite/client" />
import { run } from "./sequencer.ts";
import { CUSTOM, effectiveMask, marbles, SCALES, type TParams } from "./marbles.ts";
import { SHAPES } from "./braids/shapes.ts";
import { DEFAULTS, MODELS, R, decode, encode, sanitize } from "./presets.ts";
import { plan, position, unplan } from "./space.ts";
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

const checkbox = (parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void) => {
  const l = html(`<label><input type="checkbox"> ${label}</label>`);
  const box = l.querySelector("input")!;
  box.onchange = () => set(box.checked);
  sync.push(() => (box.checked = get())); box.checked = get();
  parent.append(l);
};

// Spatial placement: one PannerNode per voice, created when audio starts; controls call updatePanners() to move them live.
let panners: PannerNode[] = [];
let held = -1; // voice currently being dragged on the pad, or -1
let drawPad = () => {}; // assigned once the pad exists
const updatePanners = () => { drawPad(); panners.forEach((pn, i) => {
  const [x, y, z] = position(p.voices[i].az, p.voices[i].el, p.voices[i].dist);
  pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z;
  pn.panningModel = p.hrtf ? "HRTF" : "equalpower";
}); };

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
select(pitch, "root", NOTES.map((n, i) => [String(48 + i), n]), String(DEFAULTS.root), () => String(p.root), (v) => { p.root = +v; sync.forEach((f) => f()); });
select(pitch, "scale", [...Object.keys(SCALES), CUSTOM].map((s) => [s, s]), DEFAULTS.scale, () => p.scale, (v) => { p.scale = v; sync.forEach((f) => f()); }); // refresh the note buttons
// Piano keyboard in fixed C..B order; lit keys are in the scale, the dot marks the root. Clicking a key toggles that
// note relative to the root; editing a preset scale copies it into "custom".
{
  const BLACK = [1, 3, 6, 8, 10], WHITE_BEFORE = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 } as Record<number, number>; // black key sits after this many white keys
  const kb = html(`<div class="kb" role="group" aria-label="scale notes"></div>`);
  const degree = (pc: number) => (pc - (p.root - 48) + 12) % 12;
  const keys = NOTES.map((n, pc) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", n);
    if (BLACK.includes(pc)) { b.className = "b"; b.style.left = `${(WHITE_BEFORE[pc] / 7) * 100}%`; } else { b.className = "w"; b.textContent = n; }
    b.onclick = () => {
      const cur = effectiveMask(p), next = cur ^ (1 << degree(pc));
      if (next) { p.mask = next; p.scale = CUSTOM; sync.forEach((f) => f()); } // never allow an empty scale
    };
    kb.append(b);
    return b;
  });
  sync.push(() => keys.forEach((b, pc) => {
    const on = (effectiveMask(p) >> degree(pc) & 1) === 1;
    b.classList.toggle("on", on);
    b.classList.toggle("root", degree(pc) === 0);
    b.setAttribute("aria-pressed", String(on));
  }));
  sync[sync.length - 1]();
  pitch.append(kb);
}
slider(pitch, "spread", R.spread, DEFAULTS.spread, () => p.spread, (v) => (p.spread = v));
slider(pitch, "bias", R.pitchBias, DEFAULTS.pitchBias, () => p.pitchBias, (v) => (p.pitchBias = v));

p.voices.forEach((v, i) => {
  const s = section(i === 2 ? "Voice 3 · every tick" : `Voice ${i + 1}`);
  checkbox(s, "on", () => v.on, (x) => { v.on = x; drawPad(); });
  select(s, "shape", SHAPES.map((n, k) => [String(k), n]), String(DEFAULTS.voices[i].shape), () => String(v.shape), (x) => (v.shape = +x));
  slider(s, "timbre", R.timbre, DEFAULTS.voices[i].timbre, () => v.timbre, (x) => (v.timbre = x));
  slider(s, "color", R.color, DEFAULTS.voices[i].color, () => v.color, (x) => (v.color = x));
  slider(s, "azimuth (°)", R.az, DEFAULTS.voices[i].az, () => v.az, (x) => { v.az = x; updatePanners(); });
  slider(s, "elevation (°)", R.el, DEFAULTS.voices[i].el, () => v.el, (x) => { v.el = x; updatePanners(); });
  slider(s, "walk (° per note)", R.walk, DEFAULTS.voices[i].walk, () => v.walk, (x) => { v.walk = x; updatePanners(); });
  slider(s, "swing (°)", R.swing, DEFAULTS.voices[i].swing, () => v.swing, (x) => { v.swing = x; updatePanners(); });
  slider(s, "distance", R.dist, DEFAULTS.voices[i].dist, () => v.dist, (x) => { v.dist = x; updatePanners(); });
});

const space = section("Space");
// Top-down pad: drag a voice around the listener. 10 svg units = 1 distance unit; front is up.
{
  const dots = p.voices.map((_, i) => `<g class="vp" data-i="${i}" tabindex="-1"><circle r="9"/><text y="4" text-anchor="middle">${i + 1}</text></g>`).join("");
  const svg = html(`<svg class="pad" viewBox="-110 -110 220 220" aria-hidden="true">
    <circle class="ring" r="10"/><circle class="ring" r="50"/><circle class="ring" r="100"/>
    <path class="ring" d="M0 -105V105M-105 0H105"/>
    <circle class="head" r="5"/><path class="head" d="M0 -10L-3.5 -4H3.5Z"/>${dots}</svg>`) as unknown as SVGSVGElement;
  const groups = Array.from(svg.querySelectorAll<SVGGElement>(".vp"));
  drawPad = () => groups.forEach((g, i) => {
    const v = p.voices[i], [x, y] = plan(v.az, v.dist);
    g.setAttribute("transform", `translate(${10 * x} ${-10 * y})`);
    g.style.opacity = v.on ? "1" : "0.35";
  });
  groups.forEach((g, i) => {
    // While held, the sequencer's motion yields; on release it takes over again from the dropped position.
    g.onpointerdown = (e) => { g.setPointerCapture(e.pointerId); held = i; g.classList.add("held"); };
    const release = () => { if (held === i) held = -1; g.classList.remove("held"); updatePanners(); };
    g.onpointerup = g.onpointercancel = release;
    g.onpointermove = (e) => {
      if (!g.hasPointerCapture(e.pointerId)) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const m = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      const { az, dist } = unplan(m.x / 10, -m.y / 10);
      p.voices[i].az = Math.round(az);
      p.voices[i].dist = Math.round(Math.min(R.dist[1], Math.max(R.dist[0], dist)) * 10) / 10;
      sync.forEach((f) => f()); // moves the sliders too
      updatePanners();
    };
  });
  sync.push(drawPad);
  drawPad();
  space.append(svg);
}
checkbox(space, "HRTF (3D, use headphones; off = plain stereo pan)", () => p.hrtf, (v) => { p.hrtf = v; updatePanners(); });

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
  updatePanners();
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
  // One worklet node (own wasm instance) per voice.
  const nodes = [0, 1, 2].map(() => {
    const n = new AudioWorkletNode(ctx, "braids", { processorOptions: { wasm } });
    return n;
  });
  panners = nodes.map((n) => {
    const pn = new PannerNode(ctx, { distanceModel: "inverse", refDistance: 1 });
    n.connect(pn).connect(ctx.destination);
    return pn;
  });
  updatePanners();
  await ctx.resume();
  const stopRun = run(marbles(p, (i) => held === i), () => ctx.currentTime, (e) => {
    const i = e.voice ?? 0;
    nodes[i].port.postMessage(e);
    if (e.az !== undefined) { // sequenced motion: move the voice at the note's start time
      const [x, y, z] = position(e.az, p.voices[i].el, p.voices[i].dist);
      panners[i].positionX.setValueAtTime(x, e.time); panners[i].positionY.setValueAtTime(y, e.time); panners[i].positionZ.setValueAtTime(z, e.time);
    }
  });
  stop = () => { stopRun(); nodes.forEach((n) => n.disconnect()); panners = []; ctx.close(); };
  go.textContent = "stop";
  go.setAttribute("aria-pressed", "true");
};
