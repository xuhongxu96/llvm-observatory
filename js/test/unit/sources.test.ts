import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSource } from "../../src/web/sources.ts";

const respond = (body: string, init: ResponseInit) => vi.fn(async () => new Response(body, init));

afterEach(() => vi.unstubAllGlobals());

describe("fetchSource", () => {
  it("returns the source text", async () => {
    vi.stubGlobal("fetch", respond("int x;", { headers: { "content-type": "text/plain" } }));
    expect(await fetchSource("http://h/", "lib/A.cpp")).toBe("int x;");
  });

  it("treats a 404 as missing", async () => {
    vi.stubGlobal("fetch", respond("", { status: 404 }));
    expect(await fetchSource("http://h/", "lib/A.cpp")).toBeNull();
  });

  it("treats an HTML page (a server's fallback for unknown paths) as missing", async () => {
    vi.stubGlobal("fetch", respond("<!doctype html>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    expect(await fetchSource("http://h/", "include/llvm/ADT/SmallVector.h")).toBeNull();
  });
});
