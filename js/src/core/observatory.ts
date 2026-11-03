// One observatory session: the driver, the LLVM tools, and the build's metadata.
// Shared by the CLI and the web worker; only the Dist (where files come from) differs.
import { Driver } from "./driver.ts";
import type { ModuleSource } from "./emscripten.ts";
import { LlvmTools, type ToolName } from "./llvm-tools.ts";
import { decodeProfile, type IterationCoverage } from "./mcdc.ts";
import { symbolize } from "./symbolize.ts";
import { buildTrace, stackAddresses } from "./trace.ts";
import type { Trace } from "./types.ts";
import { withoutDebugInfo } from "./wasm.ts";

// The build output (build/dist/, written by scripts/build_*.sh).
export interface Dist {
  driver: ModuleSource;
  tool(name: ToolName): ModuleSource;
  target(): Promise<TargetInfo>;
  source(path: string): Promise<string | null>; // an observed source, by path under llvm/
}

// target.json: the observed LLVM.
export interface TargetInfo {
  ref: string;
  commit: string;
  version: string;
}

export interface Run {
  status: number;
  stderr: string;
  outputIr: string;
  trace: Trace;
  profiles: Map<number, Uint8Array>; // iteration -> .profraw
}

export class Observatory {
  private tools: LlvmTools;
  private driver: Driver;
  private coverageModule: Uint8Array | null = null; // the driver for llvm-cov

  private constructor(driver: Driver, tools: LlvmTools) {
    this.driver = driver;
    this.tools = tools;
  }

  static async create(dist: Dist): Promise<Observatory> {
    return new Observatory(await Driver.create(dist.driver), new LlvmTools((name) => dist.tool(name)));
  }

  async observe(ir: string): Promise<Run> {
    const raw = this.driver.run(ir);
    const symbols = await symbolize(this.tools, this.driver.binary, stackAddresses(raw.events));
    return {
      status: raw.status,
      stderr: raw.stderr,
      outputIr: raw.outputIr,
      trace: buildTrace(raw.events, symbols),
      profiles: raw.profiles,
    };
  }

  // The conditions one iteration evaluated (the iteration must have a profile).
  async coverage(run: Run, iteration: number): Promise<IterationCoverage> {
    const profile = run.profiles.get(iteration);
    if (!profile) throw new Error(`no coverage profile for iteration ${iteration}`);
    this.coverageModule ??= withoutDebugInfo(this.driver.binary);
    return decodeProfile(this.tools, this.coverageModule, profile);
  }
}
