// A source location of a frame: opens the source view, with a GitHub link beside it.
import type { CoverageScope, TargetInfo } from "../../core/observatory.ts";
import type { Frame } from "../../core/types.ts";
import { githubUrl } from "../model/github.ts";

export interface SourceSelection {
  scope: CoverageScope; // whose conditions: an iteration's, or one visit's
  path: string | null; // null: the overview of the sources that evaluated conditions
  line: number | null;
}

export type OpenSource = (selection: SourceSelection) => void;

interface Props {
  frame: Frame;
  scope: CoverageScope;
  target: TargetInfo | null;
  onOpen: OpenSource;
}

export function SourceLocation({ frame, scope, target, onOpen }: Props) {
  if (!frame.path) return null;
  const { path, line } = frame;
  const name = `${path.slice(path.lastIndexOf("/") + 1)}:${line}`;
  return (
    <span className="src-loc">
      <button type="button" className="link" title={`${path}:${line}`} onClick={() => onOpen({ scope, path, line })}>
        {name}
      </button>
      {target && (
        <a className="github" href={githubUrl(target, path, line)} target="_blank" rel="noopener noreferrer" title="open on GitHub">
          ↗
        </a>
      )}
    </span>
  );
}
