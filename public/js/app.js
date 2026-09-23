import { getJson } from './api.js';
import { byId } from './dom.js';
import { refreshSidebar } from './sidebar.js';
import { addRow, clearTimeline } from './timeline.js';

const state = {
  selected: null,
  source: null,
};

const REFRESH_MS = 2000;

const refresh = () => refreshSidebar(state.selected, select);

async function select(id) {
  state.source?.close();
  state.selected = id;
  byId('selected').textContent = id;
  clearTimeline();
  refresh();

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

refresh();
setInterval(refresh, REFRESH_MS);
