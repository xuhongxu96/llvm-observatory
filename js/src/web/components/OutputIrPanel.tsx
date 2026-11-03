// The optimized IR: after the whole run (the default), or after any one iteration.
import { useEffect, useState } from "react";
import type { RunResult } from "../worker/protocol.ts";
import { OutputIr } from "./IrEditor.tsx";
import { CopyButton, Pane } from "./Pane.tsx";

const FINAL = "final";

export function OutputIrPanel({ result }: { result: RunResult | null }) {
  const [choice, setChoice] = useState<string>(FINAL);
  useEffect(() => setChoice(FINAL), [result]); // each run starts at its final IR

  const error = result && result.status !== 0 ? result.stderr || `the driver exited with status ${result.status}` : "";
  const iterations = result?.trace.iterations ?? [];
  const chosen = iterations.find((it) => String(it.number) === choice);
  const ir = chosen ? chosen.irAfter : (result?.outputIr ?? "");

  const picker = (
    <select
      className="pane-header-select"
      aria-label="IR after"
      value={choice}
      onChange={(e) => setChoice(e.target.value)}
      disabled={!!error || iterations.length === 0}
    >
      <option value={FINAL}>final</option>
      {iterations.map((it) => (
        <option key={it.number} value={it.number}>
          after iteration {it.number} ({it.pass})
        </option>
      ))}
    </select>
  );

  return (
    <Pane
      title={error ? "Driver error" : "Optimized IR"}
      actions={
        <>
          {picker}
          <CopyButton text={error || ir} />
        </>
      }
    >
      <OutputIr ir={ir} error={error} />
    </Pane>
  );
}
