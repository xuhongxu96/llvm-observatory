// Runs the observatory off the main thread: the driver's passes are synchronous, and the
// LLVM tools are large. Keeps the last run so the app can ask for an iteration's coverage.
import type { ModuleFactory, ModuleSource } from "../../core/emscripten.ts";
import { Observatory, type Dist, type Run, type TargetInfo } from "../../core/observatory.ts";
import { fetchSource } from "../sources.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

let observatory: Observatory | null = null;
let lastRun: Run | null = null;

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  switch (data.type) {
    case "init":
      try {
        const dist = remoteDist(data.base);
        const [created, target] = await Promise.all([Observatory.create(dist), dist.target()]);
        observatory = created;
        post({ type: "ready", target });
      } catch (err) {
        post({ type: "loadError", message: messageOf(err) });
      }
      break;
    case "run":
      await answer(data.id, async () => {
        lastRun = await ready().observe(data.ir);
        const { status, stderr, outputIr, trace } = lastRun;
        post({ type: "result", id: data.id, result: { status, stderr, outputIr, trace } });
      });
      break;
    case "coverage":
      await answer(data.id, async () => {
        if (!lastRun) throw new Error("nothing has run yet");
        const files = await ready().coverage(lastRun, data.iteration);
        post({ type: "coverage", id: data.id, iteration: data.iteration, files: [...files] });
      });
      break;
  }
};

async function answer(id: number, work: () => Promise<void>) {
  try {
    await work();
  } catch (err) {
    post({ type: "error", id, message: messageOf(err) });
  }
}

function ready(): Observatory {
  if (!observatory) throw new Error("the observatory is not loaded");
  return observatory;
}

// build/dist's files under `base`.
function remoteDist(base: string): Dist {
  const url = (path: string) => new URL(path, base).href;
  const module = (path: string): ModuleSource => ({
    factory: async () => (await import(/* @vite-ignore */ url(`${path}.js`))).default as ModuleFactory,
    binary: async () => new Uint8Array(await (await fetchOk(url(`${path}.wasm`))).arrayBuffer()),
  });
  return {
    driver: module("driver/observatory_driver"),
    tool: (name) => module(`llvm-tools/${name}`),
    target: async () => (await (await fetchOk(url("target.json"))).json()) as TargetInfo,
    source: (path) => fetchSource(base, path),
  };
}

async function fetchOk(href: string): Promise<Response> {
  const response = await fetch(href);
  if (!response.ok) throw new Error(`${href}: ${response.status} ${response.statusText}`);
  return response;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
