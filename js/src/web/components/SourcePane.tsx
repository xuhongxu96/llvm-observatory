// The source panel: observed sources with the MC/DC values of a scope (a visit, an
// iteration, or the whole run), a badge after each condition (T, F, – not evaluated, T/F
// both) and after each decision (its outcome). Jumps to definitions (Ctrl/⌘+click or F12
// on a call) keep the scope and add to a breadcrumb; back and the crumbs return. Without
// a path, it lists the sources that evaluated conditions.
import { useEffect, useMemo, useState } from "react";
import type { FileCoverage, IterationCoverage } from "../../core/mcdc.ts";
import { describeScope, type CoverageScope, type TargetInfo } from "../../core/observatory.ts";
import { lookup, type TagsFile } from "../../core/tags.ts";
import type { Visit } from "../../core/types.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { useDistJson } from "../hooks/useDistJson.ts";
import { useSource } from "../hooks/useSource.ts";
import { sourceMarks } from "../model/badges.ts";
import { githubUrl } from "../model/github.ts";
import {
  current,
  goTo,
  levelsOf,
  placeCrumb,
  push,
  replace,
  scopeOf,
  setLevel,
  type Crumb,
  type Level,
  type Navigation,
} from "../model/navigation.ts";
import { Pane } from "./Pane.tsx";
import { SourceEditor } from "./SourceEditor.tsx";

interface Props {
  nav: Navigation;
  onNavigate(nav: Navigation): void;
  target: TargetInfo | null;
  coverage(scope: CoverageScope): Promise<IterationCoverage>;
  visit(number: number): Visit | undefined; // of the current run
  onClose(): void;
}

export function SourcePane({ nav, onNavigate, target, coverage, visit, onClose }: Props) {
  const scope = scopeOf(nav);
  const { path, line } = current(nav);
  const files = useAsync(() => coverage(scope), [coverage, scope.iteration, scope.visit]);
  const covered = files && "value" in files ? files.value : null;
  const tags = useDistJson<TagsFile>("tags.json");
  const [notice, setNotice] = useState("");
  useEffect(() => setNotice(""), [nav]);

  const follow = (name: string, args: number | null) => {
    const [first, ...others] = tags ? lookup(tags, name, args) : [];
    if (!first) {
      setNotice(`no definition of ${name} in the observed sources`);
      return;
    }
    const crumb: Crumb = { ...first, label: name, title: `${first.path}:${first.line}`, alternatives: others };
    onNavigate(push(nav, crumb));
  };

  const actions = (
    <>
      <LevelSwitch nav={nav} visit={visit} onLevel={(level) => onNavigate(setLevel(nav, level))} />
      {path && (
        <button type="button" className="pane-header-button" onClick={() => onNavigate(push(nav, placeCrumb(null, null)))}>
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
    <Pane title={<Breadcrumb nav={nav} onNavigate={onNavigate} />} actions={actions}>
      {files && "error" in files && <div className="trace-empty">coverage: {files.error}</div>}
      {path === null ? (
        <SourceList files={covered?.files ?? null} onSelect={(p) => onNavigate(push(nav, placeCrumb(p, null)))} />
      ) : (
        <SourceView
          path={path}
          line={line}
          scope={scope}
          file={covered?.files.get(path)}
          loading={files === undefined}
          target={target}
          notice={notice}
          alternatives={current(nav).alternatives ?? []}
          onAlternative={(alt) => onNavigate(replace(nav, { ...current(nav), ...alt, title: `${alt.path}:${alt.line}` }))}
          onFollow={follow}
        />
      )}
    </Pane>
  );
}

// Back, then the crumbs: the current one bold, the ones ahead (after going back) dimmed.
function Breadcrumb({ nav, onNavigate }: { nav: Navigation; onNavigate(nav: Navigation): void }) {
  return (
    <nav className="breadcrumb" aria-label="source navigation">
      <button
        type="button"
        className="pane-header-button"
        disabled={nav.index === 0}
        onClick={() => onNavigate(goTo(nav, nav.index - 1))}
        aria-label="back"
        title="back"
      >
        ←
      </button>
      {nav.crumbs.map((crumb, i) => (
        <span key={i} className="crumb">
          {i > 0 && <span className="crumb-separator">›</span>}
          <button
            type="button"
            className={`link${i === nav.index ? " current" : ""}${i > nav.index ? " ahead" : ""}`}
            title={crumb.title}
            aria-current={i === nav.index ? "location" : undefined}
            onClick={() => onNavigate(goTo(nav, i))}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

// Whose conditions: the visit, the iteration, or the whole run.
function LevelSwitch({ nav, visit, onLevel }: { nav: Navigation; visit(n: number): Visit | undefined; onLevel(level: Level): void }) {
  const { iteration, visit: visitNumber } = nav.context;
  const label: Record<Level, string> = { visit: `visit ${visitNumber}`, iteration: `iteration ${iteration}`, run: "whole run" };
  const visited = visitNumber === undefined ? undefined : visit(visitNumber);
  const title: Record<Level, string> = {
    visit: `the conditions evaluated while visiting ${visited?.instruction.ir.trim() ?? ""}`,
    iteration: `the conditions evaluated in iteration ${iteration}`,
    run: "the conditions evaluated in the whole run",
  };
  return (
    <div className="view-mode-toggle" role="tablist" aria-label="coverage scope">
      {levelsOf(nav.context).map((level) => (
        <button
          key={level}
          type="button"
          role="tab"
          aria-selected={nav.level === level}
          className={`pane-header-button${nav.level === level ? " active" : ""}`}
          title={title[level]}
          onClick={() => onLevel(level)}
        >
          {label[level]}
        </button>
      ))}
    </div>
  );
}

function SourceList({ files, onSelect }: { files: IterationCoverage["files"] | null; onSelect(path: string): void }) {
  if (!files) return <div className="trace-empty">decoding the coverage…</div>;
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
  scope: CoverageScope;
  file: FileCoverage | undefined;
  loading: boolean; // the coverage is still being decoded
  target: TargetInfo | null; // line numbers link to the line on GitHub
  notice: string;
  alternatives: { path: string; line: number }[]; // other definitions of what was followed
  onAlternative(location: { path: string; line: number }): void;
  onFollow(name: string, args: number | null): void;
}

function SourceView(props: SourceViewProps) {
  const { path, line, scope, file, loading, target, notice, alternatives, onAlternative, onFollow } = props;
  const source = useSource(path);
  const marks = useMemo(() => (source && file ? sourceMarks(file, source) : null), [source, file]);

  if (source === undefined) return <div className="trace-empty">loading {path}…</div>;
  if (source === null) return <div className="trace-empty">{path} is not in this build's sources</div>;

  const where = describeScope(scope);
  return (
    <div className="source-view">
      <div className="source-status">
        {notice ||
          (loading
            ? `decoding the coverage of ${where}…`
            : marks && marks.decisions.length + marks.conditions > 0
              ? `evaluated in ${where}: ${plural(marks.decisions.length, "decision")} (&&, ||) and ${plural(marks.conditions, "plain condition")}`
              : `no condition of this file was evaluated in ${where}`)}
        {alternatives.length > 0 && (
          <span className="alternatives">
            {" · also defined at "}
            {alternatives.map((alt) => (
              <button key={`${alt.path}:${alt.line}`} type="button" className="link" title={alt.path} onClick={() => onAlternative(alt)}>
                {alt.path.slice(alt.path.lastIndexOf("/") + 1)}:{alt.line}
              </button>
            ))}
          </span>
        )}
      </div>
      <SourceEditor
        path={path}
        source={source}
        marks={marks}
        line={line}
        target={target}
        onFollow={onFollow}
      />
    </div>
  );
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
