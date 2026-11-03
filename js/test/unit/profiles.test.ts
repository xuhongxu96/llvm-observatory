import { describe, expect, it } from "vitest";
import { ProfileStore } from "../../src/core/profiles.ts";

describe("ProfileStore", () => {
  it("gives back every profile, storing the later ones as differences", () => {
    const store = new ProfileStore();
    const memory = new Uint8Array([1, 2, 3, 4, 5, 6]);
    store.add(1, memory);
    memory.set([1, 9, 9, 4, 5, 7]); // the same memory, rewritten: the store copied it
    store.add(2, memory);
    store.add(3, new Uint8Array([1, 2, 3, 4, 5, 6, 8, 8])); // longer
    store.add(4, new Uint8Array([1, 2])); // shorter
    expect([...store.get(1)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...store.get(2)]).toEqual([1, 9, 9, 4, 5, 7]);
    expect([...store.get(3)]).toEqual([1, 2, 3, 4, 5, 6, 8, 8]);
    expect([...store.get(4)]).toEqual([1, 2]);
    expect(() => store.get(5)).toThrow("no coverage profile 5");
  });
});
