// The trace as cards: iterations of values and replacements, filters, and pointer links.
import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import type { TargetInfo } from "../../core/observatory.ts";
import type { Iteration } from "../../core/types.ts";
import { filterIterations, isFiltering, NO_FILTERS, type Filters } from "../model/filters.ts";
import { ReplacementRow, ValueCard } from "./Records.tsx";
import type { OpenSource } from "./SourceLocation.tsx";

interface Props {
  iterations: Iteration[];
  target: TargetInfo | null;
  onOpen: OpenSource;
}

const FILTER_FIELDS: { key: keyof Filters; placeholder: string; title: string }[] = [
  { key: "text", placeholder: "search", title: "text anywhere in a record" },
  { key: "opcode", placeholder: "opcode", title: "the instruction's opcode" },
  { key: "rule", placeholder: "rule (visit*)", title: "the fold that fired, e.g. visitAdd" },
  { key: "fn", placeholder: "IR function (@…)", title: "the IR function of the value, e.g. @f" },
];

export function StructuredTraceView({ iterations, target, onOpen }: Props) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const root = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filterIterations(iterations, filters), [iterations, filters]);

  // Any [data-ptr] jumps to the value card with that pointer.
  const onClick = useCallback((e: MouseEvent) => {
    const ptr = (e.target as HTMLElement).closest("[data-ptr]")?.getAttribute("data-ptr");
    const card = ptr ? root.current?.ownerDocument.getElementById(ptr) : null;
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash");
    window.setTimeout(() => card.classList.remove("flash"), 1200);
  }, []);

  return (
    <div className="structured-trace" ref={root} onClick={onClick}>
      <div className="trace-filter-bar">
        {FILTER_FIELDS.map(({ key, placeholder, title }) => (
          <input
            key={key}
            type="search"
            placeholder={placeholder}
            title={title}
            aria-label={placeholder}
            value={filters[key]}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
          />
        ))}
        {isFiltering(filters) && (
          <button type="button" className="filter-clear" onClick={() => setFilters(NO_FILTERS)}>
            clear
          </button>
        )}
      </div>

      {shown.length === 0 && (
        <div className="trace-empty">
          {iterations.length === 0 ? "— press Run to observe InstCombine —" : "no records match the filters"}
        </div>
      )}

      {shown.map((it) => (
        <details key={it.number} open className="trace-iteration">
          <summary>
            <span className="iter-num">Iteration {it.number}</span>
            <span className="iter-pass">{it.pass}</span>
            <span className="iter-counts">
              {it.values.length} value{it.values.length === 1 ? "" : "s"} · {it.replacements.length} replacement
              {it.replacements.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="pane-header-button"
              title="the conditions this iteration evaluated (MC/DC)"
              onClick={(e) => {
                e.preventDefault();
                onOpen({ iteration: it.number, path: null, line: null });
              }}
            >
              conditions
            </button>
          </summary>
          {it.values.length > 0 && (
            <section className="iter-section">
              <h4>Values</h4>
              {it.values.map((v) => (
                <ValueCard key={v.value.ptr} record={v} iteration={it.number} target={target} onOpen={onOpen} />
              ))}
            </section>
          )}
          {it.replacements.length > 0 && (
            <section className="iter-section">
              <h4>Replacements</h4>
              {it.replacements.map((r, i) => (
                <ReplacementRow key={`${r.old.ptr}-${i}`} record={r} iteration={it.number} target={target} onOpen={onOpen} />
              ))}
            </section>
          )}
        </details>
      ))}
    </div>
  );
}
