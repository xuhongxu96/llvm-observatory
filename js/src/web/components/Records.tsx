// One value or replacement of the structured trace, with its call stack.
import { shortName } from "../../core/trace.ts";
import type { Frame, Replacement, ValueInfo, ValueRecord } from "../../core/types.ts";
import type { TargetInfo } from "../../core/observatory.ts";
import { SourceLocation, type OpenSource } from "./SourceLocation.tsx";

interface Context {
  iteration: number;
  target: TargetInfo | null;
  onOpen: OpenSource;
}

export function ValueCard({ record, ...context }: { record: ValueRecord } & Context) {
  const { value, frames, rule } = record;
  return (
    <div className="trace-card" id={value.ptr}>
      <div className="trace-card-header">
        <PointerLink ptr={value.ptr} />
        <ValuePills value={value} />
        <RulePill rule={rule} {...context} />
        {value.debug_loc && <span className="trace-pill dbg" title="location from the IR's debug info">{value.debug_loc}</span>}
      </div>
      <pre className="ir-text">{value.ir}</pre>
      <ProducedAt frame={frames[0]} {...context} />
      <FrameList frames={frames} {...context} />
    </div>
  );
}

export function ReplacementRow({ record, ...context }: { record: Replacement } & Context) {
  return (
    <div className="trace-replacement">
      <div className="trace-replacement-row">
        <ReplacementSide value={record.old} className="rep-old" />
        <div className="rep-arrow">→</div>
        <ReplacementSide value={record.new} className="rep-new" />
      </div>
      <div className="trace-card-meta">
        <RulePill rule={record.rule} {...context} />
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
function RulePill({ rule, iteration, onOpen }: { rule: Frame | null } & Context) {
  if (!rule) return null;
  return (
    <button
      type="button"
      className="trace-pill rule"
      title={`${rule.function}\n${rule.path}:${rule.line}`}
      onClick={() => onOpen({ iteration, path: rule.path, line: rule.line })}
    >
      {shortName(rule.function)}
    </button>
  );
}

function ProducedAt({ frame, label = "produced at", ...context }: { frame: Frame | undefined; label?: string } & Context) {
  if (!frame) return null;
  return (
    <div className="trace-card-meta">
      {label} <code>{shortName(frame.function)}</code> <SourceLocation frame={frame} {...context} />
    </div>
  );
}

function FrameList({ frames, ...context }: { frames: Frame[] } & Context) {
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
