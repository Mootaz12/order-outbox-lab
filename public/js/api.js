/**
 * Every read goes through here so a non-2xx response becomes a rejected promise.
 * `fetch` resolves on 404 and 500, which silently hands the caller `undefined` fields
 * to render.
 */
export async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }
  return response.json();
}
