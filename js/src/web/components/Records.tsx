// One value or replacement of the structured trace, with its call stack.
import { shortName } from "../../core/trace.ts";
import type { Frame, Replacement, ValueInfo, ValueRecord } from "../../core/types.ts";
import type { CoverageScope, TargetInfo } from "../../core/observatory.ts";
import { SourceLocation, type OpenSource } from "./SourceLocation.tsx";

// `iteration`, and the visit of the record if any, make the scope of its conditions.
interface Context {
  iteration: number;
  target: TargetInfo | null;
  onOpen: OpenSource;
}

interface RecordContext {
  scope: CoverageScope;
  target: TargetInfo | null;
  onOpen: OpenSource;
}

const scopeOf = (iteration: number, visit: number | undefined): CoverageScope =>
  visit === undefined ? { iteration } : { iteration, visit };

export function ValueCard({ record, iteration, ...rest }: { record: ValueRecord } & Context) {
  const { value, frames, rule } = record;
  const context: RecordContext = { scope: scopeOf(iteration, record.visit), ...rest };
  return (
    <div className="trace-card" id={value.ptr}>
      <div className="trace-card-header">
        <PointerLink ptr={value.ptr} />
        <ValuePills value={value} />
        <RulePill rule={rule} {...context} />
        <VisitPill {...context} />
        {value.debug_loc && <span className="trace-pill dbg" title="location from the IR's debug info">{value.debug_loc}</span>}
      </div>
      <pre className="ir-text">{value.ir}</pre>
      <ProducedAt frame={frames[0]} {...context} />
      <FrameList frames={frames} {...context} />
    </div>
  );
}

export function ReplacementRow({ record, iteration, ...rest }: { record: Replacement } & Context) {
  const context: RecordContext = { scope: scopeOf(iteration, record.visit), ...rest };
  return (
    <div className="trace-replacement">
      <div className="trace-replacement-row">
        <ReplacementSide value={record.old} className="rep-old" />
        <div className="rep-arrow">→</div>
        <ReplacementSide value={record.new} className="rep-new" />
      </div>
      <div className="trace-card-meta">
        <RulePill rule={record.rule} {...context} />
        <VisitPill {...context} />
        <ProducedAt frame={record.frames[0]} label="replaced at" {...context} />
      </div>
      <FrameList frames={record.frames} {...context} />
    </div>
  );
}

function ReplacementSide({ value, className }: { value: ValueInfo; className: string }) {
  return (
    <div className={`rep-side ${className}`}>
      <PointerLink ptr={value.ptr} />
      {value.opcode && <span className="trace-pill opcode">{value.opcode}</span>}
      <code className="ir-text-inline">{value.ir.trim()}</code>
    </div>
  );
}

function ValuePills({ value }: { value: ValueInfo }) {
  return (
    <>
      {value.opcode && <span className="trace-pill opcode">{value.opcode}</span>}
      {value.fn && (
        <span className="trace-pill fn">
          @{value.fn}
          {value.bb && <span className="trace-pill-bb">/{value.bb}</span>}
        </span>
      )}
    </>
  );
}

// The fold that fired; opens its source.
function RulePill({ rule, scope, onOpen }: { rule: Frame | null } & RecordContext) {
  if (!rule) return null;
  return (
    <button
      type="button"
      className="trace-pill rule"
      title={`${rule.function}\n${rule.path}:${rule.line}`}
      onClick={() => onOpen({ scope, path: rule.path, line: rule.line })}
    >
      {shortName(rule.function)}
    </button>
  );
}

// The visit a record happened in: opens the sources whose conditions that visit evaluated.
function VisitPill({ scope, onOpen }: RecordContext) {
  if (scope.visit === undefined) return null;
  return (
    <button
      type="button"
      className="trace-pill visit"
      title="the conditions evaluated in this visit of an instruction"
      onClick={() => onOpen({ scope, path: null, line: null })}
    >
      visit {scope.visit}
    </button>
  );
}

function ProducedAt({ frame, label = "produced at", ...context }: { frame: Frame | undefined; label?: string } & RecordContext) {
  if (!frame) return null;
  return (
    <div className="trace-card-meta">
      {label} <code>{shortName(frame.function)}</code> <SourceLocation frame={frame} {...context} />
    </div>
  );
}

function FrameList({ frames, ...context }: { frames: Frame[] } & RecordContext) {
  if (frames.length === 0) return null;
  return (
    <details className="trace-frames">
      <summary>
        stack ({frames.length} frame{frames.length === 1 ? "" : "s"})
      </summary>
      <ol start={0}>
        {frames.map((frame, i) => (
          <li key={i}>
            <span className="frame-name" title={frame.function}>{shortName(frame.function)}</span>{" "}
            <SourceLocation frame={frame} {...context} />
          </li>
        ))}
      </ol>
    </details>
  );
}

// A pointer: clicking it jumps to the value with that pointer (see StructuredTraceView).
function PointerLink({ ptr }: { ptr: string }) {
  return (
    <span className="ptr-link" data-ptr={ptr}>
      {ptr}
    </span>
  );
}
