import { describe, expect, it } from "vitest";
import { filterIterations, NO_FILTERS } from "../../src/web/model/filters.ts";
import { TRACE } from "../fixtures.ts";

const counts = (filters: Partial<typeof NO_FILTERS>) =>
  filterIterations(TRACE.iterations, { ...NO_FILTERS, ...filters }).map((it) => [it.number, it.values.length, it.replacements.length]);

describe("filterIterations", () => {
  it("keeps every iteration without filters, also one that changed nothing", () => {
    expect(counts({})).toEqual([[1, 2, 1], [2, 0, 0]]);
  });

  it("drops iterations with nothing left after filtering", () => {
    expect(counts({ opcode: "shl" })).toEqual([[1, 1, 0]]);
  });

  it("filters by opcode, rule and IR function", () => {
    expect(counts({ opcode: "shl" })).toEqual([[1, 1, 0]]);
    expect(counts({ rule: "visitadd" })).toEqual([[1, 1, 1]]);
    expect(counts({ fn: "@f" })).toEqual([[1, 1, 1]]);
  });

  it("searches text anywhere", () => {
    expect(counts({ text: "0x20" })).toEqual([[1, 0, 1]]);
    expect(counts({ text: "nothing" })).toEqual([]);
  });
});
