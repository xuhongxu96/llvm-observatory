// Decodes llvm-cov MC/DC records into per-condition values for the source view.
// Shared by the web viewer and by scripts/mcdc_trace.mjs (Node), so both read the
// profile the same way.
//
// Input: the JSON from `llvm-cov export -format=text` and the source text of the
// traced file. Output: one entry per MC/DC decision that has executed test vectors,
// with the position of each condition and the values it took.

// llvm-cov MC/DC record layout (export JSON):
//   [line, col, endLine, endCol, trueCount, falseCount, fileId, expandedFileId,
//    kind, independencePairs[], testVectors[]]
// Columns are 1-based. The end column is inclusive.
const REC = { line: 0, col: 1, endLine: 2, endCol: 3, fileId: 6, pairs: 9, vectors: 10 };

const STATE = { true: 'T', false: 'F', null: '-' };

export function baseName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

// Exact source text of a decision, lines joined with '\n'.
export function spanText(lines, line, col, endLine, endCol) {
  if (line === endLine) return lines[line - 1].slice(col - 1, endCol);
  const parts = [lines[line - 1].slice(col - 1)];
  for (let l = line + 1; l < endLine; l++) parts.push(lines[l - 1]);
  parts.push(lines[endLine - 1].slice(0, endCol));
  return parts.join('\n');
}

// Splits a decision into condition texts: every && / || splits the text, at any
// parenthesis depth, and string/char literals are skipped.
export function conditionTexts(decision) {
  const leaves = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < decision.length; i++) {
    const ch = decision[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') cur += decision[++i] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if ((ch === '&' || ch === '|') && decision[i + 1] === ch) {
      leaves.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += ch;
  }
  leaves.push(cur);
  return leaves.map(stripGroupingParens);
}

// Removes '(' and ')' that wrap a leaf without a partner inside the leaf.
export function stripGroupingParens(text) {
  let s = text.trim();
  for (;;) {
    if (s.startsWith('(') && !closesWithin(s)) s = s.slice(1).trim();
    else if (s.endsWith(')') && !opensWithin(s)) s = s.slice(0, -1).trim();
    else return s;
  }
}

function closesWithin(s) {
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return true;
  }
  return false;
}

function opensWithin(s) {
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++;
    else if (s[i] === '(' && --depth === 0) return true;
  }
  return false;
}

// Source position (1-based line and column) of every offset of `text` that starts
// at (line, col). positions[k] is the position of text[k]; positions[text.length]
// is the position just after the text.
function positionsOf(text, line, col) {
  const positions = [];
  let l = line;
  let c = col;
  for (const ch of text) {
    positions.push({ line: l, col: c });
    if (ch === '\n') {
      l++;
      c = 1;
    } else {
      c++;
    }
  }
  positions.push({ line: l, col: c });
  return positions;
}

// Turns one llvm-cov record into a decision with positioned conditions.
export function decisionFromRecord(rec, fileName, lines) {
  const [line, col, endLine, endCol] = rec;
  const pairs = rec[REC.pairs];
  const text = spanText(lines, line, col, endLine, endCol);
  const names = conditionTexts(text);
  const matches = names.length === pairs.length;

  // Leaves appear in source order, so each one is found after the previous one.
  // If the split does not match llvm-cov's condition count, the decision is still
  // reported, but its conditions have no positions.
  const leaves = [];
  if (matches) {
    const positions = positionsOf(text, line, col);
    let cursor = 0;
    names.forEach((name, i) => {
      const start = text.indexOf(name, cursor);
      cursor = start + name.length;
      leaves.push({
        text: name,
        start: positions[start],
        end: positions[start + name.length],
        values: [],
        index: i,
      });
    });
  }

  const executed = rec[REC.vectors].filter((tv) => tv.executed);
  const vectors = executed.map((tv) => tv.conditions);
  const results = executed.map((tv) => tv.result);
  for (const leaf of leaves) {
    leaf.values = vectors.map((v) => v[leaf.index]);
  }
  const outcomes = new Set(executed.map((tv) => tv.result));

  return {
    file: fileName,
    line,
    col,
    endLine,
    endCol,
    leaves,
    conditionCount: pairs.length,
    outcomes: [...outcomes],
    vectors,
    results,
    conditionNames: matches ? names : pairs.map((_, i) => `C${i + 1}`),
  };
}

// All decisions of the traced file in an llvm-cov export that ran in this profile.
export function decisionsFromExport(exportJson, source, fileName) {
  const lines = source.split('\n');
  const decisions = [];
  for (const fn of exportJson.data[0].functions) {
    for (const rec of fn.mcdc_records) {
      if (baseName(fn.filenames[rec[REC.fileId]] ?? '') !== fileName) continue;
      const decision = decisionFromRecord(rec, fileName, lines);
      if (decision.vectors.length > 0) decisions.push(decision);
    }
  }
  return decisions;
}

// Text for one condition's values across the executed test vectors of a run,
// e.g. "T", "F", "-", or "T/F" when the condition took both values (loops).
export function valueLabel(values) {
  const seen = [];
  for (const v of values) {
    const s = STATE[String(v)];
    if (s && !seen.includes(s)) seen.push(s);
  }
  return seen.join('/');
}

// Human-readable list of one test vector: "age >= 18=T, member=-" -> "true".
export function vectorText(decision, vector) {
  const parts = decision.conditionNames.map((name, i) => `${name}=${STATE[String(vector[i])]}`);
  return parts.join('  ');
}

// Plain `if (cond)` and `while (cond)` conditions. Clang's MC/DC does not instrument a
// single condition, but every such condition has a branch region with a true counter
// and a false counter. In a run that was reset before it started, a non-zero counter
// means the condition took that value.
const BRANCH_REGION = 4;  // llvm::coverage::CounterMappingRegion::BranchRegion

export function singleConditions(exportJson, source, fileName) {
  const lines = source.split('\n');
  const conditions = new Map();
  for (const fn of exportJson.data[0].functions) {
    for (const [line, col, endLine, endCol, trueCount, falseCount, fileId, , kind] of fn.branches) {
      if (kind !== BRANCH_REGION || line !== endLine) continue;
      if (baseName(fn.filenames[fileId] ?? '') !== fileName) continue;
      const head = lines[line - 1].slice(0, col - 1).match(/\b(if|while)\s*\($/);
      if (!head) continue;
      const key = `${line}:${col}:${endCol}`;
      if (conditions.has(key)) continue;
      const values = [];
      if (trueCount > 0) values.push(true);
      if (falseCount > 0) values.push(false);
      conditions.set(key, {
        keyword: head[1],
        line,
        col,
        endLine,
        endCol,
        text: stripGroupingParens(spanText(lines, line, col, endLine, endCol)),
        trueCount,
        falseCount,
        values,
      });
    }
  }
  return [...conditions.values()];
}
