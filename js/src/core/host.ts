// The JavaScript side of runtime/src/host.cpp. The driver module calls
// `observatory.emit` for every event, while the event's wasm frames are live, so the
// stack is captured here; and `observatory.emitProfile` at the end of each iteration.

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

export type RawEventData =
  | { type: "iteration_begin"; iteration: number; pass: string }
  | { type: "iteration_end"; iteration: number }
  | { type: "value"; iteration: number; value: ValueInfo }
  | { type: "replace"; iteration: number; old: ValueInfo; new: ValueInfo };

export class Recorder {
  events: RawEvent[] = [];
  profiles = new Map<number, Uint8Array>(); // iteration -> .profraw

  // Passed to the module factory as `observatory`.
  readonly observatory = {
    emit: (json: string) => {
      this.events.push({ data: JSON.parse(json) as RawEventData, stack: parseWasmStack(new Error().stack ?? "") });
    },
    emitProfile: (iteration: number, profile: Uint8Array) => {
      this.profiles.set(iteration, profile);
    },
  };

  constructor() {
    // InstCombine stacks are deep; V8 keeps 10 frames by default.
    Error.stackTraceLimit = Infinity;
  }

  clear(): void {
    this.events = [];
    this.profiles = new Map();
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
