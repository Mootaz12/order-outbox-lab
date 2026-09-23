import { badge, byId, el } from './dom.js';
import { time } from './format.js';

/**
 * The stage table for the selected order. Hydration rows and SSE frames share one
 * shape (`createdAt` included), so both paths render through `addRow`.
 */
export function clearTimeline() {
  byId('timeline').tBodies[0].replaceChildren();
}

export function addRow(event) {
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
