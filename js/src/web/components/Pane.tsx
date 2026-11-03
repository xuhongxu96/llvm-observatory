// A titled pane with header actions, and the copy-to-clipboard button they often hold.
import { useCallback, useState, type ReactNode } from "react";

export function Pane({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="pane">
      <div className="pane-header">
        <span className="pane-title">{title}</span>
        {actions}
      </div>
      <div className="pane-body">{children}</div>
    </section>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard can be blocked (e.g. without focus); nothing to do.
    }
  }, [text]);
  return (
    <button type="button" className="pane-header-button" onClick={onClick} disabled={!text} title="Copy to clipboard">
      {copied ? "copied" : "copy"}
    </button>
  );
}
