// The observed driver (driver/driver.cpp): one instance, run once per input.
import { callMain, instantiate, load, type EmscriptenModule, type ModuleSource } from "./emscripten.ts";
import { Recorder, type RawEvent } from "./host.ts";
import type { ProfileStore } from "./profiles.ts";

const INPUT = "/work/input.ll";
const OUTPUT = "/work/output.ll";

export interface RawRun {
  status: number;
  stderr: string;
  outputIr: string;               // empty when the driver failed
  events: RawEvent[];
  profiles: ProfileStore; // coverage segment -> .profraw
}

export class Driver {
  readonly binary: Uint8Array; // the module, for llvm-symbolizer and llvm-cov
  private module: EmscriptenModule;
  private recorder: Recorder;
  private stderr: string[];

  private constructor(binary: Uint8Array, module: EmscriptenModule, recorder: Recorder, stderr: string[]) {
    this.binary = binary;
    this.module = module;
    this.recorder = recorder;
    this.stderr = stderr;
  }

  static async create(source: ModuleSource): Promise<Driver> {
    const loaded = await load(source);
    const recorder = new Recorder();
    const stderr: string[] = [];
    const module = await instantiate(loaded, {
      observatory: recorder.observatory,
      print: () => {},
      printErr: (line) => stderr.push(line),
    });
    module.FS.mkdir("/work");
    return new Driver(loaded.binary, module, recorder, stderr);
  }

  run(ir: string): RawRun {
    const { FS } = this.module;
    this.recorder.clear();
    this.stderr.length = 0;
    FS.writeFile(INPUT, ir);
    if (FS.analyzePath(OUTPUT).exists) FS.unlink(OUTPUT);

    const status = callMain(this.module, []);
    return {
      status,
      stderr: this.stderr.join("\n"),
      outputIr: FS.analyzePath(OUTPUT).exists ? FS.readFile(OUTPUT, { encoding: "utf8" }) : "",
      events: this.recorder.events,
      profiles: this.recorder.profiles,
    };
  }
}
