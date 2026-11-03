// The guide, over the page (model/help.ts): it opens with the page until asked not to,
// and from the toolbar's ?. Trying an example puts its IR in the editor and runs it.
// Escape, Close or a click outside closes it, and focus goes back where it was.
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { HELP, type Example, type HelpSection } from "../model/help.ts";

const DISMISSED_KEY = "observatory-help-dismissed";

// Whether the guide is not to open with the page, as asked.
export function helpDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setHelpDismissed(dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(DISMISSED_KEY, "1");
    else localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Storage may be unavailable; the guide then opens each time.
  }
}

// Text with `code` in backquotes and **bold** in double stars.
function Prose({ text }: { text: string }) {
  return text.split("`").map((piece, i) =>
    i % 2 ? (
      <code key={i}>{piece}</code>
    ) : (
      <Fragment key={i}>{piece.split("**").map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}</Fragment>
    ),
  );
}

function Section({ section, onTry }: { section: HelpSection; onTry(example: Example): void }) {
  return (
    <section id={`help-${section.id}`} className="help-section">
      <h3>{section.title}</h3>
      {section.text.map((paragraph) => (
        <p key={paragraph}>
          <Prose text={paragraph} />
        </p>
      ))}
      <div className="help-pair">
        {section.picture && (
          <div>
            <div className="help-label">{section.picture.label}</div>
            <pre className="help-code">{section.picture.text}</pre>
          </div>
        )}
        {section.example && (
          <div>
            <div className="help-label help-try-header">
              <span>Example: {section.example.label}</span>
              <button type="button" className="link" onClick={() => onTry(section.example!)}>
                try it
              </button>
            </div>
            <pre className="help-code">{section.example.ir.trimEnd()}</pre>
          </div>
        )}
      </div>
    </section>
  );
}

export function HelpDialog({ onTry, onClose }: { onTry(example: Example): void; onClose(): void }) {
  const [dismissed, setDismissed] = useState(helpDismissed);
  const [current, setCurrent] = useState(HELP[0].id);
  const close = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => focused?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };
  // The section being read: the last whose top has reached the top of the body (the
  // last of all at the end).
  const follow = () => {
    const root = body.current;
    if (!root) return;
    const top = root.getBoundingClientRect().top + 24;
    const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
    let reading = HELP[0].id;
    for (const { id } of HELP) {
      const section = root.querySelector(`#help-${id}`);
      if (section && section.getBoundingClientRect().top <= top) reading = id;
    }
    setCurrent(atEnd ? HELP[HELP.length - 1].id : reading);
  };
  const go = (id: string) => body.current?.querySelector(`#help-${id}`)?.scrollIntoView({ block: "start" });

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onKeyDown={onKeyDown}>
        <div className="help-header">
          <h2 id="help-title">How to Use LLVM Observatory</h2>
          <span className="spacer" />
          <label className="help-dismiss">
            <input
              type="checkbox"
              checked={dismissed}
              onChange={(e) => {
                setDismissed(e.target.checked);
                setHelpDismissed(e.target.checked);
              }}
            />
            Don't show again
          </label>
          <button type="button" ref={close} onClick={onClose}>
            Close
          </button>
        </div>
        <nav className="help-nav" aria-label="guide sections">
          {HELP.map(({ id, title }) => (
            <button
              key={id}
              type="button"
              className={`link${id === current ? " current" : ""}`}
              aria-current={id === current ? "location" : undefined}
              onClick={() => go(id)}
            >
              {title}
            </button>
          ))}
        </nav>
        <div className="help-body" ref={body} onScroll={follow}>
          {HELP.map((section) => (
            <Section key={section.id} section={section} onTry={onTry} />
          ))}
        </div>
      </div>
    </div>
  );
}
