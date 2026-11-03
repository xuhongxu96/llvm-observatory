// The coverage profiles of a run. Each is about a megabyte, but they differ only in their
// counters: all but the first are kept as the byte runs where they differ from it.

interface Diff {
  length: number;
  runs: [offset: number, bytes: Uint8Array][];
}

export class ProfileStore {
  private reference: Uint8Array | null = null;
  private diffs = new Map<number, Diff>();

  // `profile` may be a view of memory that changes later: it is read now.
  add(id: number, profile: Uint8Array): void {
    if (!this.reference) {
      this.reference = profile.slice();
      this.diffs.set(id, { length: profile.length, runs: [] });
      return;
    }
    this.diffs.set(id, diff(this.reference, profile));
  }

  get(id: number): Uint8Array {
    const d = this.diffs.get(id);
    if (!d || !this.reference) throw new Error(`no coverage profile ${id}`);
    const out = new Uint8Array(d.length);
    out.set(this.reference.subarray(0, Math.min(d.length, this.reference.length)));
    for (const [offset, bytes] of d.runs) out.set(bytes, offset);
    return out;
  }

  has(id: number): boolean {
    return this.diffs.has(id);
  }
}

function diff(reference: Uint8Array, profile: Uint8Array): Diff {
  const runs: [number, Uint8Array][] = [];
  let i = 0;
  while (i < profile.length) {
    if (i < reference.length && profile[i] === reference[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < profile.length && (i >= reference.length || profile[i] !== reference[i])) i++;
    runs.push([start, profile.slice(start, i)]);
  }
  return { length: profile.length, runs };
}
