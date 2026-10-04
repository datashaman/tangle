/// <reference types="vite/client" />
import { run, stub } from "./sequencer.ts";
import workletUrl from "./braids/worklet.js?url";
import wasmUrl from "./braids/braids.wasm?url";

let stop: (() => void) | null = null;
document.getElementById("go")!.onclick = async (ev) => {
  const btn = ev.target as HTMLButtonElement;
  if (stop) { stop(); stop = null; btn.textContent = "start"; return; }
  const ctx = new AudioContext({ sampleRate: 96000 }); // Braids' native rate
  await ctx.audioWorklet.addModule(workletUrl);
  const wasm = await (await fetch(wasmUrl)).arrayBuffer();
  const node = new AudioWorkletNode(ctx, "braids", { processorOptions: { wasm } });
  node.connect(ctx.destination);
  await ctx.resume();
  const stopRun = run(stub(), () => ctx.currentTime, (e) => node.port.postMessage(e));
  stop = () => { stopRun(); node.disconnect(); ctx.close(); };
  btn.textContent = "stop";
};
