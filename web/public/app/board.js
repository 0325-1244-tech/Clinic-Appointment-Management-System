// @ts-check
import { h, replace } from './core/dom.js';

/**
 * The waiting-room screen. It listens to the server's Server-Sent Events
 * stream and redraws whenever a patient is called. EventSource reconnects by
 * itself if the connection drops. Only ticket numbers and initials are shown.
 */
class QueueBoard {
  #grid = /** @type {HTMLElement} */ (document.getElementById('board'));
  #status = /** @type {HTMLElement} */ (document.getElementById('board-status'));
  /** @type {Map<string, string>} staff id -> ticket being served */
  #serving = new Map();

  start() {
    const source = new EventSource('/api/queue/stream');
    source.addEventListener('board', (e) => this.#render(JSON.parse(/** @type {MessageEvent} */ (e).data)));
    source.addEventListener('open', () => {
      this.#status.textContent = 'Live';
    });
    source.addEventListener('error', () => {
      this.#status.textContent = 'Reconnecting…';
    });
    this.#tick();
    setInterval(() => this.#tick(), 15_000);
  }

  #tick() {
    const now = new Date();
    const time = /** @type {HTMLElement} */ (document.getElementById('board-time'));
    const date = /** @type {HTMLElement} */ (document.getElementById('board-date'));
    time.textContent = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
    date.textContent = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
  }

  /** @param {{ rows: { staffId: string, staffName: string, role: string, serviceArea: string, nowServing: { ticket: string, initials: string } | null, waiting: { ticket: string, initials: string }[] }[] }} board */
  #render(board) {
    this.#grid.removeAttribute('aria-busy');
    if (board.rows.length === 0) {
      replace(this.#grid, h('div', { class: 'empty-state' }, h('strong', null, 'The clinic is closed today.')));
      return;
    }
    replace(this.#grid, board.rows.map((row) => {
      const ticket = row.nowServing?.ticket ?? '';
      const changed = ticket !== '' && this.#serving.get(row.staffId) !== ticket;
      this.#serving.set(row.staffId, ticket);
      return h('section', { class: ['board-card', `role-${row.role}`, changed ? 'called' : ''], 'aria-label': row.staffName },
        h('h2', null, row.staffName),
        h('div', { class: 'area' }, row.serviceArea),
        row.nowServing
          ? [h('div', { class: 'board-ticket' }, row.nowServing.ticket), h('div', { class: 'board-initials' }, `Patient ${row.nowServing.initials}`)]
          : h('div', { class: 'board-ticket idle' }, 'Please wait'),
        h('div', { class: 'board-next' },
          row.waiting.length === 0
            ? 'No one waiting'
            : ['Next: ', h('strong', null, row.waiting.slice(0, 3).map((w) => w.ticket).join(', ')), row.waiting.length > 3 ? ` +${row.waiting.length - 3} more` : '']));
    }));
  }
}

new QueueBoard().start();
