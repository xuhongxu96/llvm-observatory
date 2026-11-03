import { describe, expect, it } from "vitest";
import { codeSectionOffset, withoutDebugInfo } from "../../src/core/wasm.ts";

const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

describe("codeSectionOffset", () => {
  it("skips the sections before the code section", () => {
    // type section (id 1) of 3 bytes, then a code section (id 10) of 130 bytes (2-byte LEB).
    const module = new Uint8Array([...header, 1, 3, 0, 0, 0, 10, 0x82, 0x01, ...new Array(130).fill(0)]);
    expect(codeSectionOffset(module)).toBe(8 + 2 + 3 + 3);
  });

  it("fails without a code section", () => {
    expect(() => codeSectionOffset(new Uint8Array(header))).toThrow("no code section");
  });
});

describe("withoutDebugInfo", () => {
  const custom = (name: string, body: number[]) => {
    const bytes = [...new TextEncoder().encode(name)];
    return [0, bytes.length + 1 + body.length, bytes.length, ...bytes, ...body];
  };

  it("drops .debug_* sections and keeps the others", () => {
    const module = new Uint8Array([...header, 1, 1, 0, ...custom(".debug_info", [7, 7]), ...custom("name", [9])]);
    expect([...withoutDebugInfo(module)]).toEqual([...header, 1, 1, 0, ...custom("name", [9])]);
  });
});
