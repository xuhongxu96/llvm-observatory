// The JavaScript side of runtime/src/host.cpp. The driver module calls
// `observatory.emit` for every event, while the event's wasm frames are live, so the
// stack is captured here; and `observatory.emitProfile` with each coverage segment.

import { ProfileStore } from "./profiles.ts";
import type { ValueInfo } from "./types.ts";

// A wasm frame of a captured stack: its byte offset in the module, which is the
// address llvm-symbolizer takes, and the name V8 shows (from the name section).
export interface StackAddress {
  offset: number;
  name: string | null;
}

export interface RawEvent {
  data: RawEventData;
  stack: StackAddress[]; // innermost first
}

// The runtime's events (runtime/src/runtime.cpp). `visit` is set inside a visit.
export type RawEventData =
  | { type: "iteration_begin"; iteration: number; pass: string }
  | { type: "iteration_end"; iteration: number; ir?: string }
  | { type: "visit_begin"; iteration: number; visit: number; instruction: ValueInfo }
  | { type: "visit_end"; iteration: number; visit: number }
  | { type: "value"; iteration: number; visit?: number; value: ValueInfo }
  | { type: "replace"; iteration: number; visit?: number; old: ValueInfo; new: ValueInfo }
  | { type: "segment"; iteration: number; visit?: number; segment: number };

export class Recorder {
  events: RawEvent[] = [];
  profiles = new ProfileStore(); // coverage segment -> .profraw

  // Passed to the module factory as `observatory`.
  readonly observatory = {
    emit: (json: string) => {
      this.events.push({ data: JSON.parse(json) as RawEventData, stack: parseWasmStack(new Error().stack ?? "") });
    },
    emitProfile: (segment: number, profile: Uint8Array) => {
      this.profiles.add(segment, profile);
    },
  };

  constructor() {
    // InstCombine stacks are deep; V8 keeps 10 frames by default.
    Error.stackTraceLimit = Infinity;
  }

  clear(): void {
    this.events = [];
    this.profiles = new ProfileStore();
  }
}

// V8 prints a wasm frame as `at <module>.<name> (wasm://wasm/<hash>:wasm-function[<index>]:0x<offset>)`,
// or without the name and parentheses. <module> is the name section's module name.
const WASM_FRAME = /at (?:(.+?) \()?wasm:\/\/[^\s)]*:wasm-function\[\d+\]:0x([0-9a-f]+)\)?$/;
const MODULE_PREFIX = /^[\w.-]+\.wasm\./;

export function parseWasmStack(stack: string): StackAddress[] {
  const frames: StackAddress[] = [];
  for (const line of stack.split("\n")) {
    const m = line.trim().match(WASM_FRAME);
    if (m) frames.push({ name: m[1]?.replace(MODULE_PREFIX, "") ?? null, offset: parseInt(m[2], 16) });
  }
  return frames;
}
