// The functions and types of the build's sources (scripts/tags.py), for jump to
// definition by name: the definitions of a called name whose parameters fit the call.

// tags.json as written by scripts/tags.py.
export interface TagsFile {
  paths: string[];
  tags: Record<string, [path: number, line: number, kind: "function" | "type", definition: 0 | 1, minArgs: number, maxArgs: number][]>;
}

export interface Location {
  path: string;
  line: number;
}

// Where `name` is defined, best first. For a call (`args` arguments), only overloads that
// take that many arguments, if any do; definitions rather than declarations, if any.
export function lookup(file: TagsFile, name: string, args: number | null): Location[] {
  let candidates = file.tags[name] ?? [];
  const functions = candidates.filter((t) => t[2] === "function");
  if (args !== null && functions.length > 0) {
    const fitting = functions.filter(([, , , , min, max]) => min <= args && (max === -1 || args <= max));
    candidates = fitting.length > 0 ? fitting : functions;
  }
  const definitions = candidates.filter((t) => t[3] === 1);
  if (definitions.length > 0) candidates = definitions;
  return candidates.map(([path, line]) => ({ path: file.paths[path], line }));
}

const OPEN = "([{";
const CLOSE = ")]}";

// The number of arguments of a call whose name ends at `offset` in `text`
// (`name(a, b)` or `name<T>(a)`), or null if no call follows.
export function callArguments(text: string, offset: number): number | null {
  let i = skipSpace(text, offset);
  if (text[i] === "<") {
    i = skipBalanced(text, i, "<", ">");
    if (i < 0) return null;
    i = skipSpace(text, i);
  }
  if (text[i] !== "(") return null;
  let depth = 0;
  let commas = 0;
  let empty = true;
  for (i++; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = skipLiteral(text, i);
      empty = false;
    } else if (OPEN.includes(ch)) {
      depth++;
      empty = false;
    } else if (CLOSE.includes(ch)) {
      if (depth === 0) return empty ? 0 : commas + 1;
      depth--;
    } else if (ch === "," && depth === 0) {
      commas++;
    } else if (!/\s/.test(ch)) {
      empty = false;
    }
  }
  return null;
}

function skipSpace(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

// The index after the `close` matching the `open` at `i`, or -1.
function skipBalanced(text: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i + 1;
    else if (text[i] === ";" || text[i] === "{") return -1;
  }
  return -1;
}

// The index of the quote closing the literal opened at `i`.
function skipLiteral(text: string, i: number): number {
  const quote = text[i];
  for (i++; i < text.length && text[i] !== quote; i++) if (text[i] === "\\") i++;
  return i;
}
