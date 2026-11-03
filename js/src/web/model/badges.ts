// MC/DC badges for the source view: one after each condition with the values it took,
// one after each decision with its outcome, and one after each plain if/while.
import { decisions, singleConditions, valueLabel, type Decision, type FileCoverage } from "../../core/mcdc.ts";

export type BadgeKind = "T" | "F" | "M" | "none" | "result";

export interface Badge {
  column: number; // 0-based offset in the line where the badge goes
  text: string;
  kind: BadgeKind;
  title: string;
}

export interface SourceMarks {
  badges: Map<number, Badge[]>; // line -> badges in column order
  decisions: Decision[];
  conditions: number; // plain if/while conditions
}

export function sourceMarks(file: FileCoverage, source: string): SourceMarks {
  const badges = new Map<number, Badge[]>();
  const add = (line: number, badge: Badge) => {
    const list = badges.get(line) ?? [];
    list.push(badge);
    badges.set(line, list);
  };

  const placed = decisions(file, source);
  for (const d of placed) {
    const vectors = d.vectors.map((v, n) => `${d.conditionNames.map((name, i) => `${name}=${valueLabel([v[i]])}`).join("  ")}  => ${d.results[n]}`);
    for (const c of d.conditions) {
      add(c.end.line, { column: c.end.col - 1, ...valueBadge(c.values), title: `${c.text}\n${vectors.join("\n")}` });
    }
    const outcomes = new Set(d.results);
    const outcome = outcomes.size === 2 ? "both" : String(d.results[0]);
    add(d.endLine, { column: d.endCol, text: `→ ${outcome}`, kind: "result", title: vectors.join("\n") });
  }
  const plain = singleConditions(file, source);
  for (const c of plain) {
    // The region ends at the condition's last character: the badge goes after it.
    add(c.endLine, {
      column: c.endCol,
      ...valueBadge(c.values),
      title: `${c.keyword} (${c.text})\n${c.trueCount}× true, ${c.falseCount}× false`,
    });
  }
  for (const list of badges.values()) list.sort((a, b) => a.column - b.column);
  return { badges, decisions: placed, conditions: plain.length };
}

function valueBadge(values: (boolean | null)[]): { text: string; kind: BadgeKind } {
  const text = valueLabel(values) || "–";
  const kind: BadgeKind = text.includes("/") ? "M" : text === "T" ? "T" : text === "F" ? "F" : "none";
  return { text, kind };
}
