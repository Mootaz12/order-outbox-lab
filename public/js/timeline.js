import { badge, byId, el } from './dom.js';
import { time } from './format.js';

/** Empties the stage table before a different order is selected. */
export function clearTimeline() {
  byId('timeline').tBodies[0].replaceChildren();
}

/** Appends one stage row; hydration rows and SSE frames share this shape. */
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
