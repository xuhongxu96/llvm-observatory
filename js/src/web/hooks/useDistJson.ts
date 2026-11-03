// A JSON file of the build (build/dist), fetched once per page; null while loading or if
// the build has none (e.g. tags.json of an older build).
import { useEffect, useState } from "react";
import { fetchText } from "../sources.ts";

const cache = new Map<string, Promise<unknown>>();

export function useDistJson<T>(file: string): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let loaded = cache.get(file);
    if (!loaded) cache.set(file, (loaded = fetchText(document.baseURI, file).then((text) => (text ? JSON.parse(text) : null))));
    let cancelled = false;
    loaded.then((v) => !cancelled && setValue(v as T | null));
    return () => {
      cancelled = true;
    };
  }, [file]);
  return value;
}
