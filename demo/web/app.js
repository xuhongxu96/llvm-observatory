// Policy MC/DC viewer: runs the wasm policy on a request, decodes the request's own
// coverage profile with llvm-cov (in the browser), and shows the value of every
// condition inline in the source.
import { decisionsFromExport, singleConditions, valueLabel, vectorText } from './coverage.mjs';
import { loadPolicy, runPolicy } from './policy.mjs';
import { resolveStacks } from './stacktrace.mjs';
import { runTool } from './llvm.mjs';

const FILES = ['policy.cpp', 'policy.h'];  // target source files shown in the tree
const TRACED = 'policy.cpp';               // the file inside the wasm module

const SAMPLES = [
  'age=34 member=y vip=n',
  'age=40 vip=y holiday=y',
  'age=40 holiday=y member=y',
  'age=70 member=y',
  'age=17 member=y',
  'age=40 member=n',
  'age=201 member=y',
  'member=y',
  'age=x',
];

const $ = (id) => document.getElementById(id);

const state = {
  policy: null,      // wasm exports
  wasmBytes: null,   // policy.wasm, also read by llvm-cov
  sources: {},       // file name -> text
  current: TRACED,   // file shown in the source view
  decisions: [],     // MC/DC decisions of the last run
  conditions: [],    // plain if/while conditions of the last run
  stacks: [],        // print_stacktrace() calls of the last run
  busy: false,
};

// ---- Decoding -----------------------------------------------------------------

async function decode(profile) {
  const merged = await runTool('llvm-profdata', ['merge', '-o', '/work/run.profdata', '/work/run.profraw'],
    { 'run.profraw': profile }, ['run.profdata']);
  const cov = await runTool('llvm-cov', ['export', '/work/policy.wasm', '-instr-profile=/work/run.profdata', '-format=text'],
    { 'policy.wasm': state.wasmBytes, 'run.profdata': merged.files['run.profdata'] });
  const report = JSON.parse(cov.text);
  const source = state.sources[TRACED];
  return {
    decisions: decisionsFromExport(report, source, TRACED),
    conditions: singleConditions(report, source, TRACED),
  };
}

// Badge class from a condition's values: T, F, M (both, in one run), or none (not reached).
function badgeOf(values) {
  const label = valueLabel(values) || '–';
  const cls = label.includes('/') ? 'M' : label === '–' ? '' : label;
  return { label, cls };
}

// ---- Rendering ----------------------------------------------------------------

// One badge per condition: its values across the run, and a tooltip with every test vector.
// Each decision also gets an outcome badge after its last character.
function badgesByLine(decisions, conditions) {
  const byLine = new Map();
  const add = (line, index, badge) => {
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push({ index, badge });
  };
  for (const c of conditions) {
    const { label, cls } = badgeOf(c.values);
    // The region ends on the if's own ')': the badge goes after it.
    add(c.endLine, c.endCol, {
      text: label,
      cls,
      title: `${c.keyword} (${c.text})\n${c.trueCount}× true, ${c.falseCount}× false`,
    });
  }
  for (const d of decisions) {
    const tooltip = d.vectors.map((v) => vectorText(d, v)).join('\n');
    for (const leaf of d.leaves) {
      const { label, cls } = badgeOf(leaf.values);
      // leaf.end is the position just after the condition: index it as a 0-based offset.
      add(leaf.end.line, leaf.end.col - 1, { text: label, cls, title: `${leaf.text}\n${tooltip}` });
    }
    const outcome = d.outcomes.length === 2 ? 'both' : d.outcomes[0] ? 'true' : 'false';
    add(d.endLine, d.endCol, { text: `→ ${outcome}`, cls: 'result', title: `decision at policy.cpp:${d.line}` });
  }
  return byLine;
}

function renderSource() {
  const code = $('code');
  code.replaceChildren();
  const lines = state.sources[state.current].split('\n');
  const marks = state.current === TRACED ? badgesByLine(state.decisions, state.conditions) : new Map();
  const hit = new Set([
    ...state.decisions.flatMap((d) => [d.line, d.endLine]),
    ...state.conditions.map((c) => c.line),
  ]);

  lines.forEach((text, i) => {
    const lineNo = i + 1;
    const row = document.createElement('div');
    row.className = hit.has(lineNo) ? 'row hit' : 'row';
    const no = document.createElement('div');
    no.className = 'no';
    no.textContent = String(lineNo);
    const src = document.createElement('div');
    src.className = 'src';

    let pos = 0;
    for (const { index, badge } of (marks.get(lineNo) ?? []).sort((a, b) => a.index - b.index)) {
      const at = Math.min(Math.max(index, pos), text.length);
      src.append(text.slice(pos, at));
      const el = document.createElement('span');
      el.className = `badge ${badge.cls}`;
      el.textContent = badge.text;
      el.title = badge.title;
      src.append(el);
      pos = at;
    }
    src.append(text.slice(pos) || '​');
    row.append(no, src);
    code.append(row);
  });
}

function renderDecisions() {
  const section = $('decisions');
  section.replaceChildren();
  if (state.current !== TRACED) return;

  const title = document.createElement('h2');
  title.textContent = state.decisions.length
    ? `Decisions evaluated in this run (${state.decisions.length})`
    : 'No decision was evaluated in this run';
  section.append(title);

  for (const d of state.decisions) {
    const box = document.createElement('div');
    box.className = 'decision';
    const head = document.createElement('header');
    head.textContent = `policy.cpp:${d.line}  →  ${d.outcomes.map((o) => (o ? 'true' : 'false')).join(' and ')}`;
    box.append(head);

    const table = document.createElement('table');
    const headRow = document.createElement('tr');
    for (const name of ['#', ...d.conditionNames, 'result']) {
      headRow.append(cell('th', name));
    }
    const thead = document.createElement('thead');
    thead.append(headRow);
    table.append(thead);

    const body = document.createElement('tbody');
    d.vectors.forEach((values, n) => {
      const tr = document.createElement('tr');
      tr.append(cell('td', String(n + 1)));
      for (const v of values) {
        const label = v === true ? 'T' : v === false ? 'F' : '–';
        const td = cell('td', label);
        td.className = `cond ${label === '–' ? 'dash' : label}`;
        tr.append(td);
      }
      tr.append(cell('td', d.results[n] ? 'true' : 'false'));
      body.append(tr);
    });
    table.append(body);
    box.append(table);
    section.append(box);
  }
  renderConditions(section);
}

// Plain if/while conditions: they have no test vectors, only a count for true and false.
function renderConditions(section) {
  if (state.conditions.length === 0) return;
  const box = document.createElement('div');
  box.className = 'decision';
  const head = document.createElement('header');
  head.textContent = 'if / while conditions (single values)';
  box.append(head);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const name of ['line', 'condition', 'value', 'true', 'false']) headRow.append(cell('th', name));
  thead.append(headRow);
  table.append(thead);

  const body = document.createElement('tbody');
  for (const c of state.conditions.slice().sort((a, b) => a.line - b.line)) {
    const tr = document.createElement('tr');
    tr.append(cell('td', String(c.line)), cell('td', `${c.keyword} (${c.text})`));
    const { label, cls } = badgeOf(c.values);
    const value = cell('td', label);
    value.className = `cond ${cls || 'dash'}`;
    tr.append(value, cell('td', String(c.trueCount)), cell('td', String(c.falseCount)));
    body.append(tr);
  }
  table.append(body);
  box.append(table);
  section.append(box);
}

function cell(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

// print_stacktrace() calls of the run: each frame with the file and line it is executing
// (the innermost is the print_stacktrace() call). Hidden when there are none.
function renderStacks() {
  const section = $('stacks');
  section.replaceChildren();
  if (state.stacks.length === 0) return;

  const title = document.createElement('h2');
  title.textContent = `Stack traces: ${state.stacks.length} call(s) of print_stacktrace()`;
  section.append(title);
  for (const frames of state.stacks) {
    const box = document.createElement('div');
    box.className = 'decision';
    const head = document.createElement('header');
    head.textContent = 'call stack, innermost first';
    box.append(head);
    for (const [i, frame] of frames.entries()) {
      const where = frame.file ? `${frame.file}:${frame.line}` : 'unknown';
      const row = cell('div', `${'  '.repeat(i)}${frame.name}   at ${where}`);
      row.style.whiteSpace = 'pre-wrap';
      box.append(row);
    }
    section.append(box);
  }
}

function renderTree() {
  const nav = $('tree');
  nav.replaceChildren(cell('div', 'target/'));
  nav.firstChild.className = 'folder';
  for (const name of FILES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'file';
    btn.setAttribute('aria-current', String(name === state.current));
    btn.append(cell('span', name));
    const tag = cell('span', name === TRACED ? 'traced' : 'declarations');
    tag.className = 'tag';
    btn.append(tag);
    btn.addEventListener('click', () => selectFile(name));
    nav.append(btn);
  }
}

function selectFile(name) {
  state.current = name;
  $('filename').textContent = `target/${name}`;
  renderTree();
  renderSource();
  renderDecisions();
}

function setVerdict(accepted, result) {
  const el = $('verdict');
  el.hidden = false;
  el.textContent = accepted ? result : `rejected: ${result}`;
  el.className = accepted ? 'verdict' : 'verdict rejected';
}

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.className = isError ? 'status error' : 'status';
}

// ---- Actions ------------------------------------------------------------------

async function submit(text) {
  if (state.busy) return;
  state.busy = true;
  $('run').disabled = true;
  $('input').value = text;
  try {
    const run = runPolicy(state.policy, text);
    setVerdict(run.accepted, run.result);
    state.stacks = await resolveStacks(state.wasmBytes, run.stacks);
    renderStacks();
    setStatus('Decoding this run’s coverage profile with llvm-cov…');
    ({ decisions: state.decisions, conditions: state.conditions } = await decode(run.profile));
    selectFile(state.current);
    setStatus(`Decoded ${state.decisions.length} decision(s) and ${state.conditions.length} if/while condition(s) from this run's profile.`);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    state.busy = false;
    $('run').disabled = false;
  }
}

async function load() {
  setStatus('Loading policy.wasm and sources…');
  const [wasmBytes, ...sources] = await Promise.all([
    fetch('build/policy.wasm').then((r) => r.arrayBuffer()),
    ...FILES.map((name) => fetch(`build/sources/${name}`).then((r) => r.text())),
  ]);
  state.wasmBytes = new Uint8Array(wasmBytes);
  state.sources = Object.fromEntries(FILES.map((name, i) => [name, sources[i]]));
  state.policy = await loadPolicy(state.wasmBytes);

  $('filename').textContent = `target/${state.current}`;
  renderTree();
  renderSource();
  setStatus('Ready. The first run loads the LLVM tools (about 10 MB).');
  submit($('input').value);
}

$('run-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  submit($('input').value);
});

for (const sample of SAMPLES) {
  const btn = cell('button', sample);
  btn.type = 'button';
  btn.className = 'chip';
  btn.addEventListener('click', () => submit(sample));
  $('samples').append(btn);
}

load().catch((err) => setStatus(`Failed to load: ${err.message}`, true));
