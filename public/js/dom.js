/**
 * DOM construction in one place, and it deliberately has no HTML-accepting path.
 * `customerName` and stage `detail` are caller-supplied strings rendered straight
 * into the page; `innerHTML` would turn a name like `<img src=x onerror=...>` into
 * executed script, so every node here is built with `textContent`.
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text ?? '';
  return node;
}

export function badge(status) {
  const span = el('span', `badge ${status}`, status);
  return span;
}

export const byId = (id) => document.getElementById(id);
