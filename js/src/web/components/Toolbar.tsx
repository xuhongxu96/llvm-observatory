// The toolbar: run, share, the observed LLVM, the status, and the theme.
import { useState } from "react";
import type { TargetInfo } from "../../core/observatory.ts";
import { useColorScheme, type ColorSchemePref } from "../hooks/useColorScheme.ts";
import type { Status } from "../hooks/useObservatory.ts";
import { githubCommitUrl } from "../model/github.ts";

interface Props {
  status: Status;
  target: TargetInfo | null;
  canRun: boolean;
  onRun(): void;
  shareUrl(): Promise<string>;
}

export function Toolbar({ status, target, canRun, onRun, shareUrl }: Props) {
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
      {target && (
        <a className="target" href={githubCommitUrl(target)} target="_blank" rel="noopener noreferrer" title={target.commit}>
          LLVM {target.version} · {target.ref === target.commit ? target.commit.slice(0, 12) : target.ref}
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
