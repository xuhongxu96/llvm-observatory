// The trace pane: structured or text view.
import { useMemo, useState } from "react";
import type { TargetInfo } from "../../core/observatory.ts";
import { renderText } from "../../core/text.ts";
import type { Trace } from "../../core/types.ts";
import { CopyButton, Pane } from "./Pane.tsx";
import type { OpenSource } from "./SourceLocation.tsx";
import { StructuredTraceView } from "./StructuredTraceView.tsx";
import { TextTraceView } from "./TextTraceView.tsx";

type Mode = "structured" | "text";

const TEXT_FRAMES = 8;

export function TracePanel({ trace, target, onOpen }: { trace: Trace | null; target: TargetInfo | null; onOpen: OpenSource }) {
  const [mode, setMode] = useState<Mode>("structured");
  const [wordWrap, setWordWrap] = useState(true);
  const text = useMemo(() => (trace ? renderText(trace, { maxFrames: TEXT_FRAMES }) : ""), [trace]);

  const actions = (
    <>
      {mode === "text" && <CopyButton text={text} />}
      {mode === "text" && (
        <button type="button" className="pane-header-button" onClick={() => setWordWrap((w) => !w)}>
          wrap: {wordWrap ? "on" : "off"}
        </button>
      )}
      <div className="view-mode-toggle" role="tablist" aria-label="view mode">
        {(["structured", "text"] as const).map((m) => (
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
        <TextTraceView text={text} wordWrap={wordWrap} />
      )}
    </Pane>
  );
}
