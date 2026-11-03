// The parts of an emscripten ES-module factory (-sMODULARIZE -sEXPORT_ES6) that we use,
// and module loading that reuses one compiled WebAssembly.Module across instances.

export interface EmscriptenStream {
  fd: number;
}

export interface EmscriptenFS {
  mkdir(path: string): void;
  open(path: string, flags: string): EmscriptenStream;
  close(stream: EmscriptenStream): void;
  getStream(fd: number): EmscriptenStream;
  writeFile(path: string, data: string | Uint8Array): void;
  readFile(path: string): Uint8Array;
  readFile(path: string, opts: { encoding: "utf8" }): string;
  unlink(path: string): void;
  analyzePath(path: string): { exists: boolean };
  quit(): void;
}

export interface EmscriptenModule {
  FS: EmscriptenFS;
  callMain(args: string[]): number | undefined;
}

export interface ModuleOptions {
  noInitialRun?: boolean;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
  ) => object;
  [extra: string]: unknown;
}

export type ModuleFactory = (options: ModuleOptions) => Promise<EmscriptenModule>;

// Where a module's .js factory and .wasm binary come from (file system or URL).
export interface ModuleSource {
  factory(): Promise<ModuleFactory>;
  binary(): Promise<Uint8Array>;
}

export interface LoadedModule {
  factory: ModuleFactory;
  binary: Uint8Array;
  compiled: WebAssembly.Module;
}

export async function load(source: ModuleSource): Promise<LoadedModule> {
  const [factory, binary] = await Promise.all([source.factory(), source.binary()]);
  return { factory, binary, compiled: await WebAssembly.compile(binary as Uint8Array<ArrayBuffer>) };
}

// Creates an instance of a compiled module: the factory would otherwise fetch and compile
// the .wasm on every instantiation.
export function instantiate(loaded: LoadedModule, options: ModuleOptions): Promise<EmscriptenModule> {
  const wasm = loaded.compiled;
  return loaded.factory({
    noInitialRun: true,
    ...options,
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasm, imports).then((instance) => done(instance, wasm));
      return {};
    },
  });
}

// callMain, with emscripten's exit() (thrown as ExitStatus) turned into a status code.
export function callMain(module: EmscriptenModule, args: string[]): number {
  try {
    return module.callMain(args) ?? 0;
  } catch (err) {
    if (err instanceof Error && err.name === "ExitStatus") return (err as unknown as { status: number }).status;
    throw err;
  }
}
