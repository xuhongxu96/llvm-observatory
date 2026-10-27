// Dynamic trace demo: runs the policy on each input and prints the value of every
// boolean condition in target/policy.cpp, read from the MC/DC profile of that run.
// The source has no tracing code.
//
//   node scripts/trace.mjs                       # sample inputs
//   node scripts/trace.mjs 'age=34 vip=y'        # your inputs
import { readFile } from 'node:fs/promises';
import { loadPolicy, runPolicy } from '../web/policy.mjs';
import { runTool } from '../web/llvm.mjs';
import { decisionsFromExport, singleConditions, valueLabel } from '../web/coverage.mjs';

const inputs = process.argv.length > 2
  ? process.argv.slice(2)
  : ['age=34 member=y vip=n', 'age=40 vip=y holiday=y', 'age=17 member=y', 'age=x'];

const wasm = await readFile(new URL('../web/policy.wasm', import.meta.url));
const source = await readFile(new URL('../target/policy.cpp', import.meta.url), 'utf8');
const policy = await loadPolicy(wasm);

// T, F, or - for a condition that was not evaluated (short-circuit).
const show = (v) => (v === null ? '-' : v ? 'T' : 'F');

for (const text of inputs) {
  const run = runPolicy(policy, text);
  console.log(`\ninput: ${JSON.stringify(text)}  ->  ${run.accepted ? run.result : `rejected: ${run.result}`}`);

  const merged = await runTool('llvm-profdata', ['merge', '-o', '/work/run.profdata', '/work/run.profraw'],
    { 'run.profraw': run.profile }, ['run.profdata']);
  const cov = await runTool('llvm-cov', ['export', '/work/policy.wasm', '-instr-profile=/work/run.profdata', '-format=text'],
    { 'policy.wasm': wasm, 'run.profdata': merged.files['run.profdata'] });
  const report = JSON.parse(cov.text);
  const decisions = decisionsFromExport(report, source, 'policy.cpp');
  const conditions = singleConditions(report, source, 'policy.cpp');

  for (const d of decisions) {
    console.log(`  policy.cpp:${d.line}  ${d.conditionNames.join('  ')}`);
    d.vectors.forEach((values, n) => {
      console.log(`    ${values.map(show).join('  ')}  =>  ${d.results[n]}`);
    });
  }
  for (const c of conditions) {
    console.log(`  policy.cpp:${c.line}  ${c.keyword} (${c.text})  =>  ${valueLabel(c.values)}`);
  }
}
