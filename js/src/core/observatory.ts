// One observatory session: the driver, the LLVM tools, and the build's metadata.
// Shared by the CLI and the web worker; only the Dist (where files come from) differs.
import { Driver } from "./driver.ts";
import type { ModuleSource } from "./emscripten.ts";
import { LlvmTools, type ToolName } from "./llvm-tools.ts";
import { decodeProfiles, type IterationCoverage } from "./mcdc.ts";
import type { ProfileStore } from "./profiles.ts";
import { symbolize } from "./symbolize.ts";
import { buildTrace, segmentsOf, stackAddresses, type Segment } from "./trace.ts";
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
  segments: Segment[];
  profiles: ProfileStore; // by segment
}

// Whose coverage: one visit's, one iteration's, or (neither) the whole run's.
export interface CoverageScope {
  iteration?: number;
  visit?: number;
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
      segments: segmentsOf(raw.events),
      profiles: raw.profiles,
    };
  }

  // The conditions a scope evaluated: its segments merged.
  async coverage(run: Run, scope: CoverageScope): Promise<IterationCoverage> {
    const segments = run.segments.filter(
      (s) =>
        (scope.iteration === undefined || s.iteration === scope.iteration) &&
        (scope.visit === undefined || s.visit === scope.visit),
    );
    if (segments.length === 0) throw new Error(`no coverage for ${describeScope(scope)}`);
    this.coverageModule ??= withoutDebugInfo(this.driver.binary);
    return decodeProfiles(this.tools, this.coverageModule, segments.map((s) => run.profiles.get(s.segment)));
  }
}

export const describeScope = (scope: CoverageScope) =>
  scope.visit !== undefined ? `visit ${scope.visit}` : scope.iteration !== undefined ? `iteration ${scope.iteration}` : "the run";
