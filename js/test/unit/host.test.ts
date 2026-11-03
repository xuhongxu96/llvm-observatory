import { describe, expect, it } from "vitest";
import { parseWasmStack, Recorder } from "../../src/core/host.ts";

describe("parseWasmStack", () => {
  it("reads wasm frames with and without names, innermost first, without the module name", () => {
    const stack = [
      "Error",
      "    at Object.emit (file:///js/src/core/host.ts:30:70)",
      "    at llvm_obs_host_emit (file:///build/dist/driver/observatory_driver.js:1:2)",
      "    at observatory_driver.wasm.llvm_obs::on_value(llvm::Value const*) (wasm://wasm/0a1b2c3d:wasm-function[812]:0x3f2a1)",
      "    at wasm://wasm/0a1b2c3d:wasm-function[77]:0x1b0",
      "    at callMain (file:///build/dist/driver/observatory_driver.js:9:9)",
    ].join("\n");
    expect(parseWasmStack(stack)).toEqual([
      { name: "llvm_obs::on_value(llvm::Value const*)", offset: 0x3f2a1 },
      { name: null, offset: 0x1b0 },
    ]);
  });
});

describe("Recorder", () => {
  it("records events with their stacks and profiles by iteration", () => {
    const recorder = new Recorder();
    recorder.observatory.emit('{"type":"iteration_begin","iteration":1,"pass":"instcombine"}', true);
    recorder.observatory.emit('{"type":"iteration_end","iteration":1}', false);
    recorder.observatory.emitProfile(1, new Uint8Array([1, 2]));
    expect(recorder.events).toHaveLength(2);
    expect(recorder.events[1].stack).toEqual([]); // not asked for
    expect(recorder.events[0].data).toEqual({ type: "iteration_begin", iteration: 1, pass: "instcombine" });
    expect(recorder.profiles.get(1)).toEqual(new Uint8Array([1, 2]));
    recorder.clear();
    expect(recorder.events).toEqual([]);
    expect(recorder.profiles.has(1)).toBe(false);
  });
});
