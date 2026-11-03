// The layout of a WebAssembly module file: a header, then sections of
// (id: byte, size: LEB128, payload). Custom sections (id 0) start with their name.

const CUSTOM_SECTION = 0;
const CODE_SECTION = 10;
const HEADER_SIZE = 8; // magic and version

interface Section {
  id: number;
  name: string | null; // custom sections only
  start: number;       // of the section, at its id byte
  payload: number;     // of the payload
  end: number;
}

// Reads unsigned LEB128 numbers from `binary`, starting at `pos`.
class Reader {
  pos: number;
  private binary: Uint8Array;

  constructor(binary: Uint8Array, pos: number) {
    this.binary = binary;
    this.pos = pos;
  }

  leb(): number {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = this.binary[this.pos++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  }
}

function* sections(binary: Uint8Array): Generator<Section> {
  const r = new Reader(binary, HEADER_SIZE);
  while (r.pos < binary.length) {
    const start = r.pos;
    const id = binary[r.pos++];
    const size = r.leb();
    const payload = r.pos;
    let name: string | null = null;
    if (id === CUSTOM_SECTION) {
      const length = r.leb();
      name = new TextDecoder().decode(binary.subarray(r.pos, r.pos + length));
    }
    r.pos = payload + size;
    yield { id, name, start, payload, end: r.pos };
  }
}

// The file offset of the code section's payload. DWARF addresses in a wasm module are
// offsets in that payload, while V8 reports file offsets.
export function codeSectionOffset(binary: Uint8Array): number {
  return codeSection(binary).payload;
}

function codeSection(binary: Uint8Array): Section {
  for (const s of sections(binary)) if (s.id === CODE_SECTION) return s;
  throw new Error("the module has no code section");
}

// The module without its DWARF sections (.debug_*), which llvm-cov does not read.
export function withoutDebugInfo(binary: Uint8Array): Uint8Array {
  const kept = [...sections(binary)].filter((s) => !s.name?.startsWith(".debug_"));
  const out = new Uint8Array(HEADER_SIZE + kept.reduce((n, s) => n + s.end - s.start, 0));
  out.set(binary.subarray(0, HEADER_SIZE));
  let pos = HEADER_SIZE;
  for (const s of kept) {
    out.set(binary.subarray(s.start, s.end), pos);
    pos += s.end - s.start;
  }
  return out;
}
