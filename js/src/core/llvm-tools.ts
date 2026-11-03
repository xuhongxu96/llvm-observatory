// Runs llvm-cov, llvm-profdata and llvm-symbolizer (built for wasm by
// scripts/build_tools.sh). Each call uses a fresh instance with its own in-memory file
// system: inputs are written under /work and the named outputs are read back.
//
// Standard output goes to a file: emscripten's terminal passes output to JavaScript one
// byte at a time, which made a large llvm-cov export several times slower.
import { callMain, instantiate, load, type EmscriptenModule, type LoadedModule, type ModuleSource } from "./emscripten.ts";

const STDOUT_FILE = "/work/.stdout";

// Reopens file descriptor 1 on `path`: a closed descriptor is the lowest free one, which
// the next open takes.
function redirectStdout(module: EmscriptenModule, path: string): void {
  const { FS } = module;
  FS.close(FS.getStream(1));
  const stream = FS.open(path, "w");
  if (stream.fd !== 1) throw new Error(`stdout was reopened as fd ${stream.fd}`);
}

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
    const stderr: string[] = [];
    const module = await instantiate(await this.load(tool), { printErr: (line) => stderr.push(line) });
    const { FS } = module;
    FS.mkdir("/work");
    for (const [name, data] of Object.entries(inputs)) FS.writeFile(`/work/${name}`, data);
    redirectStdout(module, STDOUT_FILE);

    const status = callMain(module, args);
    if (status !== 0) throw new Error(`${tool} failed (${status}): ${stderr.join("\n")}`);
    const files = Object.fromEntries(outputs.map((name) => [name, FS.readFile(`/work/${name}`)]));
    return { stdout: FS.readFile(STDOUT_FILE, { encoding: "utf8" }), files };
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
