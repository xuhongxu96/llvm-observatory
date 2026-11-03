// Fetching the build's files (build/dist) from the app. A missing file is null: a 404,
// or the HTML page that some servers send for any unknown path (an SPA fallback).
export async function fetchText(base: string | URL, path: string): Promise<string | null> {
  const response = await fetch(new URL(path, base));
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) return null;
  return response.text();
}

// An observed source, by path under llvm/.
export function fetchSource(base: string | URL, path: string): Promise<string | null> {
  return fetchText(base, `sources/${path}`);
}
