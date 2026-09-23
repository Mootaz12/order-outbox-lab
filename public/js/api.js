/** GETs `path` as JSON; rejects on a non-2xx status, which bare `fetch` would resolve. */
export async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }
  return response.json();
}
