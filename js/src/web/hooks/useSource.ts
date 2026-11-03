// An observed source file, fetched from the build's sources/ (cached per page).
import { useEffect, useState } from "react";

const cache = new Map<string, Promise<string | null>>();

function fetchSource(path: string): Promise<string | null> {
  let text = cache.get(path);
  if (!text) {
    text = fetch(new URL(`sources/${path}`, document.baseURI)).then((r) => (r.ok ? r.text() : null));
    cache.set(path, text);
  }
  return text;
}

// undefined while loading, null when the build has no such source.
export function useSource(path: string | null): string | null | undefined {
  const [state, setState] = useState<{ path: string | null; text: string | null | undefined }>({ path, text: undefined });
  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    fetchSource(path).then((text) => !cancelled && setState({ path, text }));
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (path === null) return null;
  return state.path === path ? state.text : undefined;
}
