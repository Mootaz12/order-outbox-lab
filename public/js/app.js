import { getJson } from './api.js';
import { badge, byId, el } from './dom.js';
import { shortId, time } from './format.js';

const state = {
  selected: null,
  source: null,
  /** Render-diffing key so a 2s poll does not rebuild rows that have not changed. */
  sidebarKey: '',
  deadKey: '',
};

const REFRESH_MS = 2000;
const SIDEBAR_LIMIT = 50;

function renderOrders(orders) {
  // The selected id is part of the key: clicking changes only the highlight, which
  // a data-only comparison would skip and leave the sidebar out of sync.
  const key = [state.selected, ...orders.map((o) => `${o.id}:${o.status}`)].join('|');
  if (key === state.sidebarKey) return;
  state.sidebarKey = key;

  byId('orders').replaceChildren(
    ...orders.map((order) => {
      const li = el('li', order.id === state.selected ? 'active' : '');
      li.append(
        el('span', 'id', shortId(order.id)),
        el('span', 'name', order.customerName),
        badge(order.status),
      );
      li.onclick = () => select(order.id);
      return li;
    }),
  );
}

function renderDeadLetters(rows) {
  const key = rows.map((r) => `${r.orderId}:${r.stage}:${r.retryCount}`).join('|');
  if (key === state.deadKey) return;
  state.deadKey = key;

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

async function refreshSidebar() {
  try {
    const [orders, dead] = await Promise.all([
      getJson(`/orders?limit=${SIDEBAR_LIMIT}`),
      getJson('/dead-letters'),
    ]);
    byId('notice').hidden = true;
    renderOrders(orders);
    renderDeadLetters(dead);
  } catch (error) {
    // An instance being torn down makes one poll fail; the next tick recovers, so
    // say so rather than dying silently with an unhandled rejection every 2s.
    const notice = byId('notice');
    notice.hidden = false;
    notice.textContent = error.message;
  }
}

function addRow(event) {
  byId('empty').hidden = true;
  byId('timeline').hidden = false;

  const status = el('td');
  status.append(badge(event.status));

  const tr = el('tr');
  tr.append(
    el('td', '', event.stage),
    el('td', '', String(event.attempt)),
    status,
    el('td', '', event.detail ?? ''),
    el('td', '', time(event.createdAt)),
  );
  byId('timeline').tBodies[0].append(tr);
}

async function select(id) {
  state.source?.close();
  state.selected = id;
  byId('selected').textContent = id;
  byId('timeline').tBodies[0].replaceChildren();
  refreshSidebar();

  // Hydrate from Postgres first — the stream only carries what happens from now on.
  try {
    (await getJson(`/orders/${id}/stages`)).forEach(addRow);
  } catch (error) {
    byId('selected').textContent = `${id} — hydration failed: ${error.message}`;
  }

  state.source = new EventSource(`/orders/${id}/stream`);
  state.source.addEventListener('stage', (message) => addRow(JSON.parse(message.data)));
  state.source.onerror = () => {
    byId('selected').textContent = `${id} (stream closed — browser will retry)`;
  };
}

refreshSidebar();
setInterval(refreshSidebar, REFRESH_MS);
