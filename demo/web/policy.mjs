// Runs the policy module: one request in, the decision, its coverage profile, and the
// call stacks captured by print_stacktrace() out.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The module imports a few WASI and libc functions. Only the profile runtime's file
// path calls them, and this demo never reaches that path, so they are no-ops.
const noop = new Proxy({}, { get: () => () => 0 });

// loadPolicy returns { exports, captures }. captures is filled by js_capture_stack.
export async function loadPolicy(bytes) {
  const policy = { exports: null, captures: [] };
  // print_stacktrace() calls js_capture_stack while its wasm frames are on the stack.
  // Error.stack lists them with their function index and byte offset in the module.
  const env = new Proxy({
    js_capture_stack: () => policy.captures.push(new Error().stack),
  }, { get: (target, key) => (key in target ? target[key] : () => 0) });

  const { instance } = await WebAssembly.instantiate(bytes, {
    wasi_snapshot_preview1: noop,
    env,
  });
  policy.exports = instance.exports;
  return policy;
}

// Runs one request. The MC/DC counters are reset first, so the returned profile
// holds only this request's test vectors. `stacks` has one entry per print_stacktrace()
// call: its frames, innermost first, as { index, offset } (see web/stacktrace.mjs).
export function runPolicy(policy, text) {
  const e = policy.exports;
  const input = new Uint8Array(e.memory.buffer, e.input_ptr(), 512);
  input.fill(0);
  input.set(encoder.encode(text).subarray(0, 511));

  e.reset_profile();
  policy.captures.length = 0;
  const accepted = e.run() === 1;

  const result = readCString(e, e.result_ptr(), 128);
  const stacks = policy.captures.map(parseWasmFrames);
  const size = e.profile_dump();
  const profile = new Uint8Array(e.memory.buffer, e.profile_ptr(), size).slice();
  return { accepted, result, stacks, profile };
}

// Frames of a captured stack that are wasm functions. The innermost one is
// print_stacktrace() itself, which the caller does not need.
function parseWasmFrames(stackText) {
  const frames = [];
  for (const line of stackText.split('\n')) {
    const m = line.match(/wasm-function\[(\d+)\]:0x([0-9a-f]+)/);
    if (m) frames.push({ index: Number(m[1]), offset: parseInt(m[2], 16) });
  }
  return frames.slice(1);
}

function readCString(e, ptr, max) {
  const bytes = new Uint8Array(e.memory.buffer, ptr, max);
  const end = bytes.indexOf(0);
  return decoder.decode(bytes.subarray(0, end < 0 ? max : end));
}
