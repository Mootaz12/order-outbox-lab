/** Creates `<tag class=className>` with `text` set via `textContent` — never HTML,
 * since `customerName` and stage `detail` are user-controlled. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text ?? '';
  return node;
}

/** Status pill whose CSS class and label are both the status value. */
export function badge(status) {
  return el('span', `badge ${status}`, status);
}

/** Shorthand for `document.getElementById`. */
export const byId = (id) => document.getElementById(id);
