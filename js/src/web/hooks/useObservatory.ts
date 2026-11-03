// The observatory worker as React state: load once, run IR, fetch iteration coverage.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileCoverage, IterationCoverage } from "../../core/mcdc.ts";
import type { TargetInfo } from "../../core/observatory.ts";
import type { RunResult, WorkerRequest, WorkerResponse } from "../worker/protocol.ts";

export type Status =
  | { kind: "loading" }
  | { kind: "loadError"; message: string }
  | { kind: "ready" }
  | { kind: "running" }
  | { kind: "done" }
  | { kind: "runError"; message: string };

export interface Observatory {
  status: Status;
  target: TargetInfo | null;
  result: RunResult | null;
  run(ir: string): void;
  coverage(iteration: number): Promise<IterationCoverage>; // of the current result
}

type Pending = { resolve: (files: [string, FileCoverage][]) => void; reject: (err: Error) => void };

export function useObservatory(): Observatory {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const runId = useRef(-1);
  const pending = useRef(new Map<number, Pending>());
  const coverageCache = useRef(new Map<number, Promise<IterationCoverage>>());

  useEffect(() => {
    const w = new Worker(new URL("../worker/observatory.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      switch (data.type) {
        case "ready":
          setTarget(data.target);
          setStatus({ kind: "ready" });
          break;
        case "loadError":
          setStatus({ kind: "loadError", message: data.message });
          break;
        case "result":
          if (data.id !== runId.current) break;
          setResult(data.result);
          setStatus(data.result.status === 0 ? { kind: "done" } : { kind: "runError", message: firstLine(data.result.stderr) });
          break;
        case "coverage":
          pending.current.get(data.id)?.resolve(data.files);
          pending.current.delete(data.id);
          break;
        case "error":
          if (data.id === runId.current) setStatus({ kind: "runError", message: data.message });
          pending.current.get(data.id)?.reject(new Error(data.message));
          pending.current.delete(data.id);
          break;
      }
    };
    w.postMessage({ type: "init", base: new URL("./", document.baseURI).href } satisfies WorkerRequest);
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  const run = useCallback((ir: string) => {
    runId.current = nextId.current++;
    coverageCache.current.clear();
    setStatus({ kind: "running" });
    worker.current?.postMessage({ type: "run", id: runId.current, ir } satisfies WorkerRequest);
  }, []);

  const coverage = useCallback((iteration: number) => {
    let cached = coverageCache.current.get(iteration);
    if (!cached) {
      const id = nextId.current++;
      cached = new Promise<[string, FileCoverage][]>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        worker.current?.postMessage({ type: "coverage", id, iteration } satisfies WorkerRequest);
      }).then((files) => new Map(files));
      coverageCache.current.set(iteration, cached);
    }
    return cached;
  }, []);

  return { status, target, result, run, coverage };
}

const firstLine = (text: string) => text.split("\n").find((l) => l.trim() !== "") ?? "the driver failed";
