// The toolbar: run, share, help and the project on GitHub, the observed LLVM, the status,
// and the theme.
import { useState } from "react";
import type { TargetInfo } from "../../core/observatory.ts";
import { useColorScheme, type ColorSchemePref } from "../hooks/useColorScheme.ts";
import type { Status } from "../hooks/useObservatory.ts";
import { githubCommitUrl, PROJECT_URL } from "../model/github.ts";

interface Props {
  status: Status;
  target: TargetInfo | null;
  canRun: boolean;
  onRun(): void;
  shareUrl(): Promise<string>;
  onHelp(): void;
}

export function Toolbar({ status, target, canRun, onRun, shareUrl, onHelp }: Props) {
  const { pref, setPref } = useColorScheme();
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(await shareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard can be blocked (e.g. without focus); nothing to do.
    }
  };

  return (
    <header className="toolbar">
      <h1>LLVM Observatory</h1>
      <button type="button" onClick={onRun} disabled={!canRun}>
        Run
      </button>
      <button type="button" onClick={onShare} title="Copy a link to this IR">
        {copied ? "link copied" : "Share"}
      </button>
      <button type="button" className="toolbar-icon-link" onClick={onHelp} title="How to use LLVM Observatory" aria-label="Help">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d={HELP_ICON} />
        </svg>
      </button>
      <IconLink href={PROJECT_URL} label="Open the GitHub repository in a new tab" path={GITHUB_ICON} />
      {target && (
        // The version and commit, never a branch name: a branch (e.g. main) moves on.
        <a
          className="target"
          href={githubCommitUrl(target)}
          target="_blank"
          rel="noopener noreferrer"
          title={`${target.commit}${target.ref === target.commit ? "" : ` (built from ${target.ref})`}`}
        >
          LLVM {target.version} · {target.commit.slice(0, 12)}
        </a>
      )}
      <span className={`status ${status.kind}`} role="status">
        {statusText(status)}
      </span>
      <label className="theme-picker">
        theme
        <select value={pref} onChange={(e) => setPref(e.target.value as ColorSchemePref)}>
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </label>
    </header>
  );
}

function IconLink({ href, label, path }: { href: string; label: string; path: string }) {
  return (
    <a className="toolbar-icon-link" href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={path} />
      </svg>
    </a>
  );
}

// A question mark in a circle, and GitHub's mark (16×16).
const HELP_ICON =
  "M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 14.5A6.5 6.5 0 1 1 8 1.5a6.5 6.5 0 0 1 0 13ZM6.84 6.58a.75.75 0 0 1-1.48-.26 2.65 2.65 0 0 1 5.2.77c0 .97-.46 1.5-1.03 1.98-.55.46-.84.77-.84 1.27v.16a.75.75 0 0 1-1.5 0v-.16c0-1.15.68-1.86 1.38-2.45.48-.4.49-.62.49-.81a1.15 1.15 0 0 0-2.22-.5ZM8 12.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z";
const GITHUB_ICON =
  "M8 0C3.58 0 0 3.69 0 8.23c0 3.63 2.29 6.7 5.47 7.78.4.08.55-.18.55-.4 0-.2-.01-.85-.01-1.54-2.01.38-2.53-.51-2.69-.98-.09-.24-.48-.98-.82-1.18-.28-.15-.68-.55-.01-.56.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.03 0-.89.31-1.62.82-2.19-.08-.2-.36-1.02.08-2.13 0 0 .67-.22 2.2.84.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.06 2.2-.84 2.2-.84.44 1.11.16 1.93.08 2.13.51.57.82 1.29.82 2.19 0 3.13-1.87 3.82-3.65 4.03.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .22.15.49.55.4A8.24 8.24 0 0 0 16 8.23C16 3.69 12.42 0 8 0Z";

function statusText(status: Status): string {
  switch (status.kind) {
    case "loading":
      return "loading the driver and the LLVM tools…";
    case "loadError":
      return `load error: ${status.message}`;
    case "ready":
      return "ready";
    case "running":
      return "running InstCombine…";
    case "done":
      return "done";
    case "runError":
      return `run error: ${status.message}`;
  }
}
