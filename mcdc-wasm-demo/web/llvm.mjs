// Runs llvm-profdata and llvm-cov, built for WebAssembly by scripts/build_llvm.sh.
// Each call uses a fresh instance with its own in-memory file system: inputs are
// written under /work, and the named outputs are read back afterwards.
const tools = {};

export async function runTool(name, args, inputs, outputs = []) {
  tools[name] ??= (await import(new URL(`./tools/${name}.js`, import.meta.url).href)).default;

  const stdout = [];
  const stderr = [];
  const module = await tools[name]({
    noInitialRun: true,
    print: (line) => stdout.push(line),
    printErr: (line) => stderr.push(line),
  });
  module.FS.mkdir('/work');
  for (const [file, data] of Object.entries(inputs)) {
    module.FS.writeFile(`/work/${file}`, data);
  }
  try {
    module.callMain(args);
  } catch (err) {
    if (err.name !== 'ExitStatus' || err.status !== 0) {
      throw new Error(`${name} failed: ${stderr.join('\n') || err.message}`);
    }
  }
  module.FS.quit();  // flushes stdout, which emscripten buffers until the streams close
  const files = Object.fromEntries(outputs.map((f) => [f, module.FS.readFile(`/work/${f}`)]));
  return { text: stdout.join('\n'), files };
}
