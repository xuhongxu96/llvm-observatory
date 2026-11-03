// Fetching an observed source from the build's sources/. A missing file is null: a 404,
// or the HTML page that some servers send for any unknown path (an SPA fallback).
export async function fetchSource(base: string | URL, path: string): Promise<string | null> {
  const response = await fetch(new URL(`sources/${path}`, base));
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) return null;
  return response.text();
}
