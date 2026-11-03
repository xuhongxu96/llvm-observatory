// End-to-end: runs every inputs/*.ll through the built driver (build/dist) and checks
// the expectations written in the file as comments:
//
//   ; expect value `<ir>`: term, term     a value record whose IR is <ir>
//   ; expect replace `<ir>`: term, term   a replacement of the value whose IR is <ir>
//   ; expect mcdc <path>: term, term      a condition evaluated in <path> (under llvm/)
//   ; expect visit-mcdc `<ir>` <path>: term, term
//                                         ... in the visit that produced the value <ir>
//   ; expect match <path>: term, term     a match call in <path>, by its matcher tree
//                                         (matchers named as written, ✓/✗, values and
//                                         bindings)
//   ; requires LLVM >= <major>            skip the file for older targets
//
// A record matches when every term occurs in it, ignoring case (LLVM renamed functions
// such as SimplifyAddInst): its functions, paths, or the source lines its frames point
// at. A condition matches when every term occurs in its text.
//
//   node --test test/e2e/observe.test.ts [--dist DIR via OBSERVATORY_DIST]
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_DIST, localDist } from "../../src/cli/dist.ts";
import { decisions, singleConditions } from "../../src/core/mcdc.ts";
import { patternAt, type XrefFile } from "../../src/core/xref.ts";
import { nameRuns, treeLines } from "../../src/web/model/matchCalls.ts";
import { Observatory, type CoverageScope, type Run } from "../../src/core/observatory.ts";
import type { Frame, Replacement, ValueRecord } from "../../src/core/types.ts";

const INPUTS = new URL("./inputs/", import.meta.url);
const distDir = process.env.OBSERVATORY_DIST ?? DEFAULT_DIST;
const dist = localDist(distDir);
const xref = JSON.parse(readFileSync(join(distDir, "xref.json"), "utf8")) as XrefFile;
const observatory = await Observatory.create(dist);

interface Expectation {
  kind: "value" | "replace" | "mcdc" | "visit-mcdc" | "match";
  subject: string;
  path?: string; // visit-mcdc
  terms: string[];
}

const EXPECT = /^;\s*expect (value|replace|mcdc|match) (?:`([^`]*)`|(\S+)):\s*(.*)$/;
const EXPECT_VISIT = /^;\s*expect visit-mcdc `([^`]*)` (\S+):\s*(.*)$/;
const REQUIRES = /^;\s*requires LLVM >= (\d+)\s*$/m;
const targetMajor = Number((await dist.target()).version.split(".")[0]);

const termsOf = (list: string) => list.split(",").map((t) => t.trim()).filter(Boolean);

function expectations(ir: string): Expectation[] {
  return ir.split("\n").flatMap((line): Expectation[] => {
    const visit = line.trim().match(EXPECT_VISIT);
    if (visit) return [{ kind: "visit-mcdc", subject: visit[1], path: visit[2], terms: termsOf(visit[3]) }];
    const m = line.trim().match(EXPECT);
    return m ? [{ kind: m[1] as Expectation["kind"], subject: m[2] ?? m[3], terms: termsOf(m[4]) }] : [];
  });
}

for (const name of readdirSync(INPUTS).filter((f) => f.endsWith(".ll")).sort()) {
  const ir = readFileSync(new URL(name, INPUTS), "utf8");
  const required = Number(ir.match(REQUIRES)?.[1] ?? 0);
  test(name, { skip: targetMajor < required && `needs LLVM >= ${required}` }, async (t) => {
    const expected = expectations(ir);
    assert.ok(expected.length > 0, `${name} has no expectations`);

    const run = await observatory.observe(ir);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.outputIr.includes("define"), "no output IR");

    for (const e of expected) {
      await t.test(`${e.kind} ${e.subject}`, async () => {
        if (e.kind === "mcdc") await expectCondition(run, e);
        else if (e.kind === "visit-mcdc") await expectVisitCondition(run, e);
        else if (e.kind === "match") expectMatch(run, e);
        else await expectRecord(run, e);
      });
    }
  });
}

async function expectRecord(run: Run, e: Expectation) {
  const records = run.trace.iterations.flatMap((it): (ValueRecord | Replacement)[] =>
    e.kind === "value"
      ? it.values.filter((v) => v.value.ir.trim() === e.subject)
      : it.replacements.filter((r) => r.old.ir.trim() === e.subject),
  );
  assert.ok(records.length > 0, `no ${e.kind} record for \`${e.subject}\``);
  const texts = await Promise.all(records.map(recordText));
  const missing = (text: string) => e.terms.filter((term) => !text.toLowerCase().includes(term.toLowerCase()));
  if (!texts.some((text) => missing(text).length === 0)) {
    assert.fail(`\`${e.subject}\`: missing ${JSON.stringify(missing(texts[0]))} in\n${texts[0]}`);
  }
}

async function recordText(record: ValueRecord | Replacement): Promise<string> {
  const lines = await Promise.all(record.frames.map(frameText));
  return [JSON.stringify("value" in record ? record.value : { old: record.old, new: record.new }), ...lines].join("\n");
}

async function frameText(frame: Frame): Promise<string> {
  const source = frame.path ? await dist.source(frame.path) : null;
  const line = source?.split("\n")[frame.line - 1]?.trim() ?? "";
  return `${frame.function}  ${frame.path ?? "?"}:${frame.line}  ${line}`;
}

async function expectCondition(run: Run, e: Expectation) {
  const scopes = run.trace.iterations.map((it) => ({ iteration: it.number }));
  await expectConditionIn(run, scopes, e.subject, e.terms);
}

async function expectVisitCondition(run: Run, e: Expectation) {
  const scopes = run.trace.iterations.flatMap((it) =>
    it.values.filter((v) => v.value.ir.trim() === e.subject && v.visit).map((v) => ({ iteration: it.number, visit: v.visit })),
  );
  assert.ok(scopes.length > 0, `no visit produced \`${e.subject}\``);
  await expectConditionIn(run, scopes, e.path!, e.terms);
}

async function expectConditionIn(run: Run, scopes: CoverageScope[], path: string, terms: string[]) {
  const source = await dist.source(path);
  assert.ok(source !== null, `${path} is not in the build's sources`);
  const texts: string[] = [];
  for (const scope of scopes) {
    const file = (await observatory.coverage(run, scope)).files.get(path);
    if (!file) continue;
    texts.push(...decisions(file, source).map((d) => d.text), ...singleConditions(file, source).map((c) => c.text));
  }
  assert.ok(
    texts.some((text) => terms.every((term) => text.includes(term))),
    `no condition in ${path} with ${JSON.stringify(terms)} (${texts.length} evaluated)`,
  );
}

function expectMatch(run: Run, e: Expectation) {
  const calls = run.trace.iterations.flatMap((it) => it.matches).filter((m) => m.site.path === e.subject);
  assert.ok(calls.length > 0, `no match call in ${e.subject}`);
  const texts = calls.map((call) => treeLines(nameRuns(call.matchers, patternAt(xref, call.site))).join("\n"));
  assert.ok(
    texts.some((text) => e.terms.every((term) => text.includes(term))),
    `no match call in ${e.subject} with ${JSON.stringify(e.terms)} (${calls.length} ran); the first:\n${texts[0]}`,
  );
}
