// The app: IR in (left), the trace and the evaluated conditions out (right).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { IrEditor } from "./components/IrEditor.tsx";
import { OutputIrPanel } from "./components/OutputIrPanel.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { HelpDialog, helpDismissed } from "./components/HelpDialog.tsx";
import { CopyButton, Pane } from "./components/Pane.tsx";
import type { SourceSelection } from "./components/SourceLocation.tsx";
import { placeCrumb, start, type Navigation } from "./model/navigation.ts";
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
  const [nav, setNav] = useState<Navigation | null>(null);
  // The trace opens a source with the scope of a record: a new breadcrumb.
  const openSource = useCallback((selection: SourceSelection) => {
    setNav(start(selection.scope, placeCrumb(selection.path, selection.line)));
  }, []);
  const { status, result } = observatory;
  // The source panel shows a run's scopes: without the run, it closes.
  useEffect(() => {
    if (!result) setNav(null);
  }, [result]);
  const visits = useMemo(() => new Map(result?.trace.iterations.flatMap((it) => it.visits.map((v) => [v.number, v]))), [result]);
  const matches = useMemo(() => result?.trace.iterations.flatMap((it) => it.matches.map((m) => ({ ...m, iteration: it.number }))) ?? [], [result]);

  const canRun = !shared.decoding && (status.kind === "ready" || status.kind === "done" || status.kind === "runError");
  const run = useCallback(() => {
    setNav(null);
    observatory.run(shared.ir);
  }, [observatory, shared.ir]);

  // The guide opens with the page, unless asked not to or opened from a share link.
  const [help, setHelp] = useState(() => !shared.fromLink && !helpDismissed());
  const tryExample = (ir: string) => {
    setHelp(false);
    shared.setIr(ir);
    if (canRun) {
      setNav(null);
      observatory.run(ir);
    }
  };

  // A share link runs its IR once, as soon as both the IR and the driver are ready.
  const autoRun = useRef(shared.fromLink);
  useEffect(() => {
    if (autoRun.current && canRun) {
      autoRun.current = false;
      run();
    }
  }, [canRun, run]);

  return (
    <div className="app">
      <Toolbar status={status} target={observatory.target} canRun={canRun} onRun={run} shareUrl={shared.shareUrl} onHelp={() => setHelp(true)} />
      {help && <HelpDialog onTry={(example) => tryExample(example.ir)} onClose={() => setHelp(false)} />}
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
                <OutputIrPanel result={result} />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="pane-resize-handle vertical" />
          <Panel defaultSize={55} minSize={20}>
            <PanelGroup direction="vertical" autoSaveId="observatory-right">
              {/* id and order: the source panel comes and goes. */}
              <Panel id="trace" order={1} minSize={15}>
                <TracePanel trace={result?.trace ?? null} events={result?.events ?? null} target={observatory.target} onOpen={openSource} />
              </Panel>
              {nav && (
                <>
                  <PanelResizeHandle className="pane-resize-handle horizontal" />
                  <Panel id="source" order={2} defaultSize={45} minSize={15}>
                    <ErrorBoundary key={`${nav.level}:${nav.index}:${nav.crumbs.length}`}>
                      <SourcePane
                        nav={nav}
                        onNavigate={setNav}
                        target={observatory.target}
                        coverage={observatory.coverage}
                        visit={(n) => visits.get(n)}
                        matches={matches}
                        onClose={() => setNav(null)}
                      />
                    </ErrorBoundary>
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
