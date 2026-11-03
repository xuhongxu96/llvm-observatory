// build/dist/ on the local file system.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ModuleFactory, ModuleSource } from "../core/emscripten.ts";
import type { Dist, TargetInfo } from "../core/observatory.ts";

export const DEFAULT_DIST = new URL("../../../build/dist/", import.meta.url).pathname;

export function localDist(dir: string): Dist {
  const module = (base: string): ModuleSource => ({
    factory: async () => (await import(pathToFileURL(`${base}.js`).href)).default as ModuleFactory,
    binary: async () => new Uint8Array(await readFile(`${base}.wasm`)),
  });
  return {
    driver: module(join(dir, "driver/observatory_driver")),
    tool: (name) => module(join(dir, "llvm-tools", name)),
    target: async () => JSON.parse(await readFile(join(dir, "target.json"), "utf8")) as TargetInfo,
    source: (path) => readFile(join(dir, "sources", path), "utf8").catch(() => null),
  };
}
