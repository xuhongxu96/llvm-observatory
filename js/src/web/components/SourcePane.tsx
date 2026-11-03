// An observed source with the MC/DC values of one iteration: a badge after each
// condition (T, F, – not evaluated, T/F both) and after each decision (its outcome).
// Without a path, it lists the sources the iteration evaluated conditions in.
import { useMemo } from "react";
import type { FileCoverage, IterationCoverage } from "../../core/mcdc.ts";
import type { TargetInfo } from "../../core/observatory.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { useSource } from "../hooks/useSource.ts";
import { sourceMarks } from "../model/badges.ts";
import { githubUrl } from "../model/github.ts";
import { Pane } from "./Pane.tsx";
import { SourceEditor } from "./SourceEditor.tsx";
import type { OpenSource, SourceSelection } from "./SourceLocation.tsx";

interface Props {
  selection: SourceSelection;
  target: TargetInfo | null;
  coverage(iteration: number): Promise<IterationCoverage>;
  onOpen: OpenSource;
  onClose(): void;
}

export function SourcePane({ selection, target, coverage, onOpen, onClose }: Props) {
  const { iteration, path, line } = selection;
  const files = useAsync(() => coverage(iteration), [coverage, iteration]);
  const covered = files && "value" in files ? files.value : null;

  const title = (
    <>
      Iteration {iteration} · {path ?? "evaluated sources"}
    </>
  );
  const actions = (
    <>
      {path && (
        <button type="button" className="pane-header-button" onClick={() => onOpen({ iteration, path: null, line: null })}>
          sources
        </button>
      )}
      {path && target && (
        <a className="pane-header-button" href={githubUrl(target, path, line ?? undefined)} target="_blank" rel="noopener noreferrer">
          GitHub ↗
        </a>
      )}
      <button type="button" className="pane-header-button" onClick={onClose} aria-label="close source">
        ×
      </button>
    </>
  );

  return (
    <Pane title={title} actions={actions}>
      {files && "error" in files && <div className="trace-empty">coverage: {files.error}</div>}
      {path === null ? (
        <SourceList files={covered} onSelect={(p) => onOpen({ iteration, path: p, line: null })} />
      ) : (
        <SourceView path={path} line={line} file={covered?.get(path)} loading={files === undefined} target={target} />
      )}
    </Pane>
  );
}

function SourceList({ files, onSelect }: { files: IterationCoverage | null; onSelect(path: string): void }) {
  if (!files) return <div className="trace-empty">decoding the iteration's coverage…</div>;
  const rows = [...files].sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="source-list">
      <table>
        <thead>
          <tr>
            <th>source</th>
            <th>decisions</th>
            <th>branches</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([path, file]) => (
            <tr key={path}>
              <td>
                <button type="button" className="link" onClick={() => onSelect(path)}>
                  {path}
                </button>
              </td>
              <td>{file.decisions.length}</td>
              <td>{file.branches.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SourceViewProps {
  path: string;
  line: number | null;
  file: FileCoverage | undefined;
  loading: boolean; // the coverage is still being decoded
  target: TargetInfo | null; // line numbers link to the line on GitHub
}

function SourceView({ path, line, file, loading, target }: SourceViewProps) {
  const source = useSource(path);
  const marks = useMemo(() => (source && file ? sourceMarks(file, source) : null), [source, file]);

  if (source === undefined) return <div className="trace-empty">loading {path}…</div>;
  if (source === null) return <div className="trace-empty">{path} is not in this build's sources</div>;

  return (
    <div className="source-view">
      <div className="source-status">
        {loading
          ? "decoding the iteration's coverage…"
          : marks && marks.decisions.length + marks.conditions > 0
            ? `evaluated in this iteration: ${plural(marks.decisions.length, "decision")} (&&, ||) and ${plural(marks.conditions, "plain condition")}`
            : "no condition of this file was evaluated in this iteration"}
      </div>
      <SourceEditor path={path} source={source} marks={marks} line={line} target={target} />
    </div>
  );
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
