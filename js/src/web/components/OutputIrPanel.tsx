// The optimized IR after any one iteration; by default the last one, which is the final
// IR. A module without function bodies runs no iteration: it shows the driver's output.
import { useEffect, useState } from "react";
import type { RunResult } from "../worker/protocol.ts";
import { OutputIr } from "./IrEditor.tsx";
import { CopyButton, Pane } from "./Pane.tsx";

export function OutputIrPanel({ result }: { result: RunResult | null }) {
  const [chosen, setChosen] = useState<number | null>(null); // null: the last iteration
  useEffect(() => setChosen(null), [result]); // each run starts at its final IR

  const error = result && result.status !== 0 ? result.stderr || `the driver exited with status ${result.status}` : "";
  const iterations = error ? [] : (result?.trace.iterations ?? []);
  const shown = iterations.find((it) => it.number === chosen) ?? iterations.at(-1);
  const ir = shown ? shown.irAfter : (result?.outputIr ?? "");

  const picker = iterations.length > 0 && (
    <select
      className="pane-header-select"
      aria-label="IR after"
      value={shown?.number}
      onChange={(e) => setChosen(Number(e.target.value))}
    >
      {iterations.map((it) => (
        <option key={it.number} value={it.number}>
          after iteration {it.number} ({it.pass}){it === iterations.at(-1) ? ": final" : ""}
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
