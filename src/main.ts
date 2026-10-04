/// <reference types="vite/client" />
import { run, type Ev, type Pattern } from "./sequencer.ts";
import { capture, sanitizeTake, takePattern, type Take } from "./takes.ts";
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

const side = document.getElementById("side")!;
const section = (title: string, host: HTMLElement = app) => {
  const s = html(`<section><h2>${title}</h2></section>`);
  host.append(s);
  return s;
};
// Double-click a control (or a dropdown's label) to reset it to its default.
const slider = (parent: HTMLElement, label: string, [min, max, step]: readonly number[], def: number, get: () => number, set: (v: number) => void) => {
  const l = html(`<label class="row"><span title="${label}">${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output></label>`);
  const input = l.querySelector("input")!, out = l.querySelector("output")!;
  const show = () => { input.value = String(get()); out.textContent = fmt(get()); };
  input.oninput = () => { set(+input.value); out.textContent = fmt(get()); };
  l.title = "double-click to reset";
  l.ondblclick = () => { set(def); show(); };
  sync.push(show); show();
  parent.append(l);
};
const select = (parent: HTMLElement, label: string, options: [string, string][], def: string, get: () => string, set: (v: string) => void) => {
  const l = html(`<label class="row"><span title="${label}">${label}</span><select>${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`);
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
// Where each voice actually is right now (after sequenced motion); null when it isn't moving.
const live: ({ az: number; dist: number } | null)[] = [null, null, null];
let timers: number[] = [];
let gains: GainNode[] = []; // per-voice level, then the master
let master: GainNode | null = null;
let held = -1; // voice currently being dragged on the pad, or -1
let drawPad = () => {}; // assigned once the pad exists
const updatePanners = () => { live.fill(null); drawPad(); panners.forEach((pn, i) => {
  const [x, y, z] = position(p.voices[i].az, p.voices[i].el, p.voices[i].dist);
  pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z;
  pn.panningModel = p.hrtf ? "HRTF" : "equalpower";
}); };

// Mixer: vertical faders. Levels are smoothed gain changes so dragging doesn't click.
const updateMix = () => {
  gains.forEach((g, i) => g.gain.setTargetAtTime(p.voices[i].level, g.context.currentTime, 0.015));
  if (master) master.gain.setTargetAtTime(p.volume, master.context.currentTime, 0.015);
};
const fader = (parent: HTMLElement, label: string, [min, max, step]: readonly number[], def: number, get: () => number, set: (v: number) => void) => {
  const chan = html(`<div class="chan"><label class="ch" title="double-click to reset"><output></output><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label} level"><span>${label}</span></label></div>`);
  const input = chan.querySelector("input")!, out = chan.querySelector("output")!;
  const show = () => { input.value = String(get()); out.textContent = fmt(get()); };
  input.oninput = () => { set(+input.value); out.textContent = fmt(get()); updateMix(); };
  chan.querySelector("label")!.ondblclick = () => { set(def); show(); updateMix(); };
  sync.push(show); show();
  parent.append(chan);
  return chan;
};
const mixer = section("Mixer");
const strip = html(`<div class="mixer"></div>`);
mixer.append(strip);
p.voices.forEach((v, i) => {
  const chan = fader(strip, `voice ${i + 1}`, R.level, DEFAULTS.voices[i].level, () => v.level, (x) => (v.level = x));
  checkbox(chan, "on", () => v.on, (x) => { v.on = x; drawPad(); });
});
fader(strip, "master", R.volume, DEFAULTS.volume, () => p.volume, (x) => (p.volume = x));

// Freeze: déjà vu 0.5 stops every stream mutating, so the last `length` steps of rhythm, pitch and motion repeat.
// Unfreezing restores the previous déjà vu settings; touching either déjà vu slider (or loading a preset) just drops the freeze.
let thawed: { dejaVu: number; spaceDejaVu: number } | null = null;
const freezeBtn = document.getElementById("freeze") as HTMLButtonElement;
const forget = () => { thawed = null; freezeBtn.setAttribute("aria-pressed", "false"); };
const setFrozen = (on: boolean) => {
  if (on) { thawed = { dejaVu: p.dejaVu, spaceDejaVu: p.spaceDejaVu }; p.dejaVu = p.spaceDejaVu = 0.5; }
  else if (thawed) { p.dejaVu = thawed.dejaVu; p.spaceDejaVu = thawed.spaceDejaVu; thawed = null; }
  freezeBtn.setAttribute("aria-pressed", String(on));
  sync.forEach((f) => f());
};
freezeBtn.onclick = () => setFrozen(thawed === null);
addEventListener("keydown", (e) => {
  if (e.key === "f" && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target as HTMLElement).closest("input, select, textarea")) setFrozen(thawed === null);
});

const stack = html(`<div class="stack"></div>`); // Clock and Takes share one grid cell
app.append(stack);
const clock = section("Clock", stack);
slider(clock, "tick length (s)", R.step, DEFAULTS.step, () => p.step, (v) => (p.step = v));
slider(clock, "jitter", R.jitter, DEFAULTS.jitter, () => p.jitter, (v) => (p.jitter = v));

const rhythm = section("Rhythm");
select(rhythm, "model", MODELS.map((m) => [m, m]), DEFAULTS.model, () => p.model, (v) => (p.model = v as TParams["model"]));
slider(rhythm, "bias", R.bias, DEFAULTS.bias, () => p.bias, (v) => (p.bias = v));
slider(rhythm, "déjà vu", R.dejaVu, DEFAULTS.dejaVu, () => p.dejaVu, (v) => { p.dejaVu = v; forget(); });
slider(rhythm, "length", R.length, DEFAULTS.length, () => p.length, (v) => (p.length = v));
// Seed picks which random loop you get; "new" rolls one. Changing it takes effect on the next tick.
{
  const l = html(`<label class="row" title="double-click to reset"><span>seed</span><input type="number" min="${R.seed[0]}" max="${R.seed[1]}" step="1"><button type="button">new</button></label>`);
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

const voicesCard = section("Voices");
voicesCard.classList.add("wide");
const voicesGrid = html(`<div class="voices"></div>`);
voicesCard.append(voicesGrid);
p.voices.forEach((v, i) => {
  const s = html(`<div class="voice"><h3>Voice ${i + 1}${i === 2 ? " · every tick" : ""}</h3></div>`);
  voicesGrid.append(s);
  select(s, "shape", SHAPES.map((n, k) => [String(k), n]), String(DEFAULTS.voices[i].shape), () => String(v.shape), (x) => (v.shape = +x));
  slider(s, "timbre", R.timbre, DEFAULTS.voices[i].timbre, () => v.timbre, (x) => (v.timbre = x));
  slider(s, "color", R.color, DEFAULTS.voices[i].color, () => v.color, (x) => (v.color = x));
  const more = html(`<details><summary>position &amp; motion</summary></details>`); // spatial controls, folded away
  s.append(more);
  slider(more, "azimuth (°)", R.az, DEFAULTS.voices[i].az, () => v.az, (x) => { v.az = x; updatePanners(); });
  slider(more, "elevation (°)", R.el, DEFAULTS.voices[i].el, () => v.el, (x) => { v.el = x; updatePanners(); });
  slider(more, "walk (° per note)", R.walk, DEFAULTS.voices[i].walk, () => v.walk, (x) => { v.walk = x; updatePanners(); });
  slider(more, "swing (°)", R.swing, DEFAULTS.voices[i].swing, () => v.swing, (x) => { v.swing = x; updatePanners(); });
  slider(more, "elevation swing (°)", R.swingEl, DEFAULTS.voices[i].swingEl, () => v.swingEl, (x) => { v.swingEl = x; updatePanners(); });
  slider(more, "distance swing", R.swingDist, DEFAULTS.voices[i].swingDist, () => v.swingDist, (x) => { v.swingDist = x; updatePanners(); });
  slider(more, "distance", R.dist, DEFAULTS.voices[i].dist, () => v.dist, (x) => { v.dist = x; updatePanners(); });
});

// --- takes: grab what just played (retroactively), loop it exactly, save it ---
const played: Ev[] = []; // every event handed to a voice, in AudioContext time: the retroactive buffer
let take: Take | null = null;
let takePlay: Pattern | null = null; // looping the take instead of the live generator
let actx: AudioContext | null = null;
const captureSecs = { v: 8 };
const takesCard = section("Takes", stack);
slider(takesCard, "capture (s)", [1, 32, 1], 8, () => captureSecs.v, (v) => (captureSecs.v = v));
const takeBtns = html(`<div class="btns"><button type="button" title="Grab the last N seconds and loop them (press c)">capture</button><button type="button" aria-pressed="false" disabled title="Loop the take / go back to live">loop take</button></div>`);
takesCard.append(takeBtns);
const [capBtn, loopBtn] = Array.from(takeBtns.querySelectorAll("button"));
const setTakeUi = () => { loopBtn.disabled = !take; loopBtn.setAttribute("aria-pressed", String(!!takePlay)); };
const startLoop = (anchor: number) => { takePlay = takePattern(take!, anchor); setTakeUi(); };
const doCapture = () => {
  if (!actx || !played.length) return say("start and play something first");
  const edge = Math.max(...played.map((e) => e.time)) + 1e-6; // just past every note already handed to the voices, so nothing overlaps
  take = capture(played, edge, captureSecs.v);
  startLoop(edge); // the loop carries on exactly where the capture ended
  say(`captured ${take.events.length} notes (${captureSecs.v} s) and looping; press "loop take" to go back to live`);
};
capBtn.onclick = doCapture;
loopBtn.onclick = () => {
  if (takePlay) { takePlay = null; setTakeUi(); say("back to live"); }
  else if (take && actx) { startLoop(actx.currentTime + 0.05); say("looping take"); }
  else say("start the audio first");
};
addEventListener("keydown", (e) => {
  if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target as HTMLElement).closest("input, select, textarea")) doCapture();
});

const TKEY = "tangle.takes";
const takeStore = (): Record<string, unknown> => { try { return JSON.parse(localStorage.getItem(TKEY) ?? "{}"); } catch { return {}; } };
const saveTakeStore = (o: Record<string, unknown>) => { try { localStorage.setItem(TKEY, JSON.stringify(o)); return true; } catch { return false; } };
const takeRow = html(`<div class="btns"><select aria-label="saved takes"></select><input type="text" placeholder="take name" size="10" aria-label="take name"><button type="button">save</button><button type="button">delete</button></div>`);
takesCard.append(takeRow);
const takeSel = takeRow.querySelector("select")!, takeName = takeRow.querySelector("input")!;
const [saveTakeBtn, delTakeBtn] = Array.from(takeRow.querySelectorAll("button"));
const refreshTakes = (pick = "") => {
  takeSel.replaceChildren(new Option("takes…", ""), ...Object.keys(takeStore()).map((n) => new Option(n, n)));
  takeSel.value = pick;
};
refreshTakes();
takeSel.onchange = () => {
  if (!takeSel.value) return;
  const t = sanitizeTake(takeStore()[takeSel.value]);
  if (!t) return say("couldn't load that take");
  take = t; takePlay = null; setTakeUi();
  takeName.value = takeSel.value;
  say(`loaded ${takeSel.value} (${t.events.length} notes, ${t.len} s); press "loop take" to play it`);
};
saveTakeBtn.onclick = () => {
  const n = takeName.value.trim();
  if (!take) return say("capture a take first");
  if (!n) return say("give the take a name first");
  saveTakeStore({ ...takeStore(), [n]: take }) ? say(`saved take ${n}`) : say("couldn't save (storage blocked or full)");
  refreshTakes(n);
};
delTakeBtn.onclick = () => {
  if (!takeSel.value) return say("pick a take to delete");
  const { [takeSel.value]: _gone, ...rest } = takeStore();
  saveTakeStore(rest);
  say(`deleted ${takeSel.value}`);
  refreshTakes();
};

const space = section("Space", side);
slider(space, "spatial déjà vu", R.spaceDejaVu, DEFAULTS.spaceDejaVu, () => p.spaceDejaVu, (v) => { p.spaceDejaVu = v; forget(); });
slider(space, "spatial length", R.spaceLength, DEFAULTS.spaceLength, () => p.spaceLength, (v) => (p.spaceLength = v));
// Top-down pad: drag a voice around the listener. 10 svg units = 1 distance unit; front is up.
{
  const dots = p.voices.map((_, i) => `<g class="vp" data-i="${i}" tabindex="-1"><circle r="9"/><text y="4" text-anchor="middle">${i + 1}</text></g>`).join("");
  const svg = html(`<svg class="pad" viewBox="-110 -110 220 220" aria-hidden="true">
    <circle class="ring" r="10"/><circle class="ring" r="50"/><circle class="ring" r="100"/>
    <path class="ring" d="M0 -105V105M-105 0H105"/>
    <circle class="head" r="5"/><path class="head" d="M0 -10L-3.5 -4H3.5Z"/>${dots}${p.voices.map(() => `<circle class="live" r="4"/>`).join("")}</svg>`) as unknown as SVGSVGElement;
  const groups = Array.from(svg.querySelectorAll<SVGGElement>(".vp"));
  const liveDots = Array.from(svg.querySelectorAll<SVGCircleElement>(".live"));
  drawPad = () => groups.forEach((g, i) => {
    const v = p.voices[i], [x, y] = plan(v.az, v.dist);
    g.setAttribute("transform", `translate(${10 * x} ${-10 * y})`);
    g.style.opacity = v.on ? "1" : "0.35";
    const l = live[i], d = liveDots[i];
    d.style.display = l ? "" : "none";
    if (l) { const [lx, ly] = plan(l.az, l.dist); d.setAttribute("cx", String(10 * lx)); d.setAttribute("cy", String(-10 * ly)); }
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
  forget();
  const { voices, ...rest } = next;
  Object.assign(p, rest);
  p.voices.forEach((v, i) => Object.assign(v, voices[i]));
  sync.forEach((f) => f());
  updatePanners();
  updateMix();
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

// --- recording: tap the master gain into a MediaRecorder; stopping downloads the file ---
let rec: MediaRecorder | null = null;
const recBtn = document.getElementById("rec") as HTMLButtonElement;
const stopRec = () => { if (rec && rec.state !== "inactive") rec.stop(); };
recBtn.onclick = () => {
  if (rec && rec.state !== "inactive") return stopRec();
  const m = master;
  if (!m) return say("press start first, then record");
  const dest = (m.context as AudioContext).createMediaStreamDestination();
  m.connect(dest);
  const r = (rec = new MediaRecorder(dest.stream));
  const chunks: Blob[] = [];
  r.ondataavailable = (e) => chunks.push(e.data);
  r.onstop = () => {
    try { m.disconnect(dest); } catch { /* context already closed */ }
    recBtn.setAttribute("aria-pressed", "false");
    const ext = r.mimeType.includes("mp4") ? "m4a" : r.mimeType.includes("ogg") ? "ogg" : "webm";
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob(chunks, { type: r.mimeType })),
      download: `tangle-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${ext}`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    say(`saved ${a.download}`);
  };
  r.start();
  recBtn.setAttribute("aria-pressed", "true");
  say("recording…");
};

// --- audio ---
let stop: (() => void) | null = null;
const go = document.getElementById("go") as HTMLButtonElement;
go.onclick = async () => {
  if (stop) { stop(); stop = null; go.textContent = "start"; go.setAttribute("aria-pressed", "false"); return; }
  const ctx = new AudioContext({ sampleRate: 96000 }); // Braids' native rate
  actx = ctx;
  await ctx.audioWorklet.addModule(workletUrl);
  const wasm = await (await fetch(wasmUrl)).arrayBuffer();
  // One worklet node (own wasm instance) per voice.
  const nodes = [0, 1, 2].map(() => {
    const n = new AudioWorkletNode(ctx, "braids", { processorOptions: { wasm } });
    return n;
  });
  master = new GainNode(ctx);
  master.connect(ctx.destination);
  gains = nodes.map(() => new GainNode(ctx));
  panners = nodes.map((n, i) => {
    const pn = new PannerNode(ctx, { distanceModel: "inverse", refDistance: 1 });
    n.connect(gains[i]).connect(pn).connect(master!);
    return pn;
  });
  updatePanners();
  updateMix();
  await ctx.resume();
  const liveGen = marbles(p, (i) => held === i);
  // The live generator keeps running while a take loops (its output is dropped), so going back to live carries on in time.
  const pattern: Pattern = (from, to) => {
    const ev = liveGen(from, to);
    return takePlay ? takePlay(from, to).filter((e) => p.voices[e.voice ?? 0].on) : ev;
  };
  const stopRun = run(pattern, () => ctx.currentTime, (e) => {
    const i = e.voice ?? 0;
    played.push(e);
    if (played.length > 6000) played.splice(0, 2000);
    nodes[i].port.postMessage(e);
    if (e.pos) { // sequenced motion: move the voice at the note's start time, and show it on the pad when it happens
      const { az, el, dist } = e.pos, [x, y, z] = position(az, el, dist);
      panners[i].positionX.setValueAtTime(x, e.time); panners[i].positionY.setValueAtTime(y, e.time); panners[i].positionZ.setValueAtTime(z, e.time);
      timers.push(window.setTimeout(() => { live[i] = { az, dist }; drawPad(); }, Math.max(0, (e.time - ctx.currentTime) * 1000)));
      if (timers.length > 64) timers = timers.slice(-32); // old ones have fired long ago
    }
  });
  stop = () => { stopRec(); takePlay = null; actx = null; played.length = 0; setTakeUi(); stopRun(); timers.forEach(clearTimeout); timers = []; nodes.forEach((n) => n.disconnect()); panners = []; gains = []; master = null; live.fill(null); drawPad(); ctx.close(); };
  go.textContent = "stop";
  go.setAttribute("aria-pressed", "true");
};
