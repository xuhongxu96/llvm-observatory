// The trace pane: the structured view, the trace as JSON, or the runtime's events as it
// emitted them (raw: before the trace is built and the stacks symbolized).
import { useMemo, useState } from "react";
import type { RawEvent } from "../../core/host.ts";
import type { TargetInfo } from "../../core/observatory.ts";
import type { Trace } from "../../core/types.ts";
import { JsonTraceView } from "./JsonTraceView.tsx";
import { CopyButton, Pane } from "./Pane.tsx";
import type { OpenSource } from "./SourceLocation.tsx";
import { StructuredTraceView } from "./StructuredTraceView.tsx";

const MODES = ["structured", "json", "events"] as const;
type Mode = (typeof MODES)[number];

interface Props {
  trace: Trace | null;
  events: RawEvent[] | null;
  target: TargetInfo | null;
  onOpen: OpenSource;
}

export function TracePanel({ trace, events, target, onOpen }: Props) {
  const [mode, setMode] = useState<Mode>("structured");
  const [wordWrap, setWordWrap] = useState(false);
  const traceJson = useMemo(() => (trace && mode === "json" ? JSON.stringify(trace, null, 2) : ""), [trace, mode]);
  const eventsJson = useMemo(() => (events && mode === "events" ? JSON.stringify(events, null, 2) : ""), [events, mode]);
  const json = mode === "events" ? eventsJson : traceJson;

  const actions = (
    <>
      {mode !== "structured" && (
        <>
          <CopyButton text={json} />
          <DownloadButton text={json} name={mode === "events" ? "events.json" : "trace.json"} />
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
