// The trace pane: the structured view, or the trace as JSON.
import { useMemo, useState } from "react";
import type { TargetInfo } from "../../core/observatory.ts";
import type { Trace } from "../../core/types.ts";
import { JsonTraceView } from "./JsonTraceView.tsx";
import { CopyButton, Pane } from "./Pane.tsx";
import type { OpenSource } from "./SourceLocation.tsx";
import { StructuredTraceView } from "./StructuredTraceView.tsx";

const MODES = ["structured", "json"] as const;
type Mode = (typeof MODES)[number];

export function TracePanel({ trace, target, onOpen }: { trace: Trace | null; target: TargetInfo | null; onOpen: OpenSource }) {
  const [mode, setMode] = useState<Mode>("structured");
  const [wordWrap, setWordWrap] = useState(false);
  const json = useMemo(() => (trace ? JSON.stringify(trace, null, 2) : ""), [trace]);

  const actions = (
    <>
      {mode === "json" && (
        <>
          <CopyButton text={json} />
          <DownloadButton text={json} name="trace.json" />
          <button type="button" className="pane-header-button" onClick={() => setWordWrap((w) => !w)}>
            wrap: {wordWrap ? "on" : "off"}
          </button>
        </>
      )}
      <div className="view-mode-toggle" role="tablist" aria-label="view mode">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`pane-header-button${mode === m ? " active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <Pane title="Trace" actions={actions}>
      {mode === "structured" ? (
        <StructuredTraceView iterations={trace?.iterations ?? []} target={target} onOpen={onOpen} />
      ) : (
        <JsonTraceView json={json} wordWrap={wordWrap} />
      )}
    </Pane>
  );
}

function DownloadButton({ text, name }: { text: string; name: string }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: name });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="pane-header-button" onClick={download} disabled={!text} title={`Save as ${name}`}>
      download
    </button>
  );
}
