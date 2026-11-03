// Messages between the app and the observatory worker.
import type { FileCoverage } from "../../core/mcdc.ts";
import type { TargetInfo } from "../../core/observatory.ts";
import type { Trace } from "../../core/types.ts";

export type WorkerRequest =
  | { type: "init"; base: string } // base: the URL that holds build/dist's files
  | { type: "run"; id: number; ir: string }
  | { type: "coverage"; id: number; iteration: number }; // of the last run

export interface RunResult {
  status: number;
  stderr: string;
  outputIr: string;
  trace: Trace;
}

export type WorkerResponse =
  | { type: "ready"; target: TargetInfo }
  | { type: "loadError"; message: string }
  | { type: "result"; id: number; result: RunResult }
  | { type: "coverage"; id: number; iteration: number; files: [string, FileCoverage][] }
  | { type: "error"; id: number; message: string };
