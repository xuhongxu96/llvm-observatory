// Runs the policy module: one request in, the decision and its coverage profile out.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The module imports a few WASI and libc functions. Only the profile runtime's file
// path calls them, and this demo never reaches that path, so they are no-ops.
const noop = new Proxy({}, { get: () => () => 0 });

export async function loadPolicy(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {
    wasi_snapshot_preview1: noop,
    env: noop,
  });
  return instance.exports;
}

// Runs one request. The MC/DC counters are reset first, so the returned profile
// holds only this request's test vectors.
export function runPolicy(e, text) {
  const input = new Uint8Array(e.memory.buffer, e.input_ptr(), 512);
  input.fill(0);
  input.set(encoder.encode(text).subarray(0, 511));

  e.reset_profile();
  const accepted = e.run() === 1;

  const result = readCString(e, e.result_ptr(), 128);
  const size = e.profile_dump();
  const profile = new Uint8Array(e.memory.buffer, e.profile_ptr(), size).slice();
  return { accepted, result, profile };
}

function readCString(e, ptr, max) {
  const bytes = new Uint8Array(e.memory.buffer, ptr, max);
  const end = bytes.indexOf(0);
  return decoder.decode(bytes.subarray(0, end < 0 ? max : end));
}
