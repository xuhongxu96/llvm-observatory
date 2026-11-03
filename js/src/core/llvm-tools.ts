// Runs llvm-cov, llvm-profdata and llvm-symbolizer (built for wasm by
// scripts/build_tools.sh). Each call uses a fresh instance with its own in-memory file
// system: inputs are written under /work and the named outputs are read back.
import { callMain, instantiate, load, type LoadedModule, type ModuleSource } from "./emscripten.ts";

export type ToolName = "llvm-cov" | "llvm-profdata" | "llvm-symbolizer";

export interface ToolResult {
  stdout: string;
  files: Record<string, Uint8Array>;
}

export class LlvmTools {
  private loaded = new Map<ToolName, Promise<LoadedModule>>();
  private source: (tool: ToolName) => ModuleSource;

  constructor(source: (tool: ToolName) => ModuleSource) {
    this.source = source;
  }

  async run(
    tool: ToolName,
    args: string[],
    inputs: Record<string, Uint8Array | string>,
    outputs: string[] = [],
  ): Promise<ToolResult> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const module = await instantiate(await this.load(tool), {
      print: (line) => stdout.push(line),
      printErr: (line) => stderr.push(line),
    });
    module.FS.mkdir("/work");
    for (const [name, data] of Object.entries(inputs)) module.FS.writeFile(`/work/${name}`, data);

    const status = callMain(module, args);
    module.FS.quit(); // flushes stdout, which emscripten buffers until the streams close
    if (status !== 0) throw new Error(`${tool} failed (${status}): ${stderr.join("\n")}`);
    const files = Object.fromEntries(outputs.map((name) => [name, module.FS.readFile(`/work/${name}`)]));
    return { stdout: stdout.join("\n"), files };
  }

  private load(tool: ToolName): Promise<LoadedModule> {
    let loaded = this.loaded.get(tool);
    if (!loaded) {
      loaded = load(this.source(tool));
      this.loaded.set(tool, loaded);
    }
    return loaded;
  }
}
