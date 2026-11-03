// The app: IR in (left), the trace and the evaluated conditions out (right).
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { IrEditor, OutputIr } from "./components/IrEditor.tsx";
import { CopyButton, Pane } from "./components/Pane.tsx";
import type { SourceSelection } from "./components/SourceLocation.tsx";
import { SourcePane } from "./components/SourcePane.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { TracePanel } from "./components/TracePanel.tsx";
import { useObservatory } from "./hooks/useObservatory.ts";
import { useSharedIr } from "./hooks/useSharedIr.ts";

const DEFAULT_IR = `; Paste LLVM IR here, then press Run.
define i32 @f(i32 %x) {
  %a = add i32 %x, 0
  %b = mul i32 %a, 2
  ret i32 %b
}
`;

export function App() {
  const observatory = useObservatory();
  const shared = useSharedIr(DEFAULT_IR);
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const { status, result } = observatory;

  const canRun = !shared.decoding && (status.kind === "ready" || status.kind === "done" || status.kind === "runError");
  const run = useCallback(() => {
    setSelection(null);
    observatory.run(shared.ir);
  }, [observatory, shared.ir]);

  // A share link runs its IR once, as soon as both the IR and the driver are ready.
  const autoRun = useRef(shared.fromLink);
  useEffect(() => {
    if (autoRun.current && canRun) {
      autoRun.current = false;
      run();
    }
  }, [canRun, run]);

  const error = result && result.status !== 0 ? result.stderr || `the driver exited with status ${result.status}` : "";

  return (
    <div className="app">
      <Toolbar status={status} target={observatory.target} canRun={canRun} onRun={run} shareUrl={shared.shareUrl} />
      <main className="panes">
        <PanelGroup direction="horizontal" autoSaveId="observatory-h">
          <Panel defaultSize={45} minSize={20}>
            <PanelGroup direction="vertical" autoSaveId="observatory-left">
              <Panel defaultSize={60} minSize={15}>
                <Pane title="LLVM IR" actions={<CopyButton text={shared.ir} />}>
                  <IrEditor value={shared.ir} onChange={shared.setIr} />
                </Pane>
              </Panel>
              <PanelResizeHandle className="pane-resize-handle horizontal" />
              <Panel defaultSize={40} minSize={15}>
                <Pane title={error ? "Driver error" : "Optimized IR"} actions={<CopyButton text={error || result?.outputIr || ""} />}>
                  <OutputIr ir={result?.outputIr ?? ""} error={error} />
                </Pane>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="pane-resize-handle vertical" />
          <Panel defaultSize={55} minSize={20}>
            <PanelGroup direction="vertical" autoSaveId="observatory-right">
              {/* id and order: the source panel comes and goes. */}
              <Panel id="trace" order={1} minSize={15}>
                <TracePanel trace={result?.trace ?? null} target={observatory.target} onOpen={setSelection} />
              </Panel>
              {selection && (
                <>
                  <PanelResizeHandle className="pane-resize-handle horizontal" />
                  <Panel id="source" order={2} defaultSize={45} minSize={15}>
                    <SourcePane
                      selection={selection}
                      target={observatory.target}
                      coverage={observatory.coverage}
                      onOpen={setSelection}
                      onClose={() => setSelection(null)}
                    />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </main>
    </div>
  );
}
