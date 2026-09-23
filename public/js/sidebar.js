import { getJson } from './api.js';
import { badge, byId, el } from './dom.js';
import { shortId } from './format.js';

const SIDEBAR_LIMIT = 50;

/** Render-diffing keys so a 2s poll does not rebuild rows that have not changed. */
const keys = { orders: '', dead: '' };

/** Rebuilds the order list only when ids, statuses or the selection changed. */
function renderOrders(orders, selected, onSelect) {
  // The selected id is part of the key: clicking changes only the highlight, which
  // a data-only comparison would skip and leave the sidebar out of sync.
  const key = [selected, ...orders.map((o) => `${o.id}:${o.status}`)].join('|');
  if (key === keys.orders) return;
  keys.orders = key;

  byId('orders').replaceChildren(
    ...orders.map((order) => {
      const li = el('li', order.id === selected ? 'active' : '');
      li.append(
        el('span', 'id', shortId(order.id)),
        el('span', 'name', order.customerName),
        badge(order.status),
      );
      li.onclick = () => onSelect(order.id);
      return li;
    }),
  );
}

/** Rebuilds the dead-letter list only when its rows changed. */
function renderDeadLetters(rows) {
  const key = rows.map((r) => `${r.orderId}:${r.stage}:${r.retryCount}`).join('|');
  if (key === keys.dead) return;
  keys.dead = key;

  const list = byId('dead');
  if (!rows.length) {
    list.replaceChildren(el('li', 'none', 'none'));
    return;
  }
  list.replaceChildren(
    ...rows.map((row) =>
      el('li', '', `${row.stage} — ${shortId(row.orderId)} after ${row.retryCount} attempts`),
    ),
  );
}

/** Order list and dead letters; `onSelect(id)` fires when an order is clicked. */
export async function refreshSidebar(selected, onSelect) {
  try {
    const [orders, dead] = await Promise.all([
      getJson(`/orders?limit=${SIDEBAR_LIMIT}`),
      getJson('/dead-letters'),
    ]);
    byId('notice').hidden = true;
    renderOrders(orders, selected, onSelect);
    renderDeadLetters(dead);
  } catch (error) {
    // An instance being torn down makes one poll fail; the next tick recovers, so
    // say so rather than dying silently with an unhandled rejection every 2s.
    const notice = byId('notice');
    notice.hidden = false;
    notice.textContent = error.message;
  }
}
