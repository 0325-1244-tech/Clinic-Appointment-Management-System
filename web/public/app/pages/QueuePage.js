// @ts-check
import { h, icon, replace } from '../core/dom.js';
import { BasePage } from './BasePage.js';

/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */

const STATE_LABELS = { WAITING: 'Waiting', SERVING: 'Now serving', SEEN: 'Seen' };

/**
 * Front-desk side of the waiting-room queue: check patients in as they
 * arrive and call them in. The public board (/board) updates live.
 */
export class QueuePage extends BasePage {
  #list = h('div');

  get title() {
    return 'Waiting-room queue';
  }

  get subtitle() {
    return "Check in today's patients as they arrive, then call them in. The queue board shows only ticket numbers and initials.";
  }

  get navKey() {
    return '/queue';
  }

  actions() {
    return h('a', { class: 'btn btn-secondary', href: '/board', target: '_blank', rel: 'noopener' }, icon('external'), 'Open queue board');
  }

  render() {
    return h('section', { class: 'card' }, this.#list);
  }

  async refresh() {
    const entries = await this.app.api.queue();
    if (entries.length === 0) {
      replace(this.#list, h('div', { class: 'empty-state' },
        h('div', { class: 'empty-icon' }, icon('queue')), h('strong', null, 'No scheduled appointments today'),
        h('span', null, 'Appointments booked for today will appear here for check-in.')));
      return;
    }
    replace(this.#list, h('ul', { class: 'today-list' }, entries.map((/** @type {{ appointment: Appointment, state: string | null }} */ { appointment: a, state }) =>
      h('li', { class: 'today-item' },
        h('div', { class: 'today-time' }, a.time.format12h(), h('span', { class: 'mono' }, a.id)),
        h('div', null,
          h('strong', null, a.patient.fullName), ' ',
          state ? h('span', { class: `pill pill-${state}` }, STATE_LABELS[/** @type {keyof typeof STATE_LABELS} */ (state)]) : h('span', { class: 'pill pill-inactive' }, 'Not arrived'),
          h('div', { class: 'muted small' }, `${a.staff.getDisplayName()} · ${a.staff.serviceArea} · ${a.reason}`)),
        h('div', { class: 'btn-group' },
          !state ? this.#button('Check in', 'check', () => this.app.api.queueAction(a.id, 'check-in'), `${a.patient.fullName} checked in`) : null,
          state === 'WAITING' || state === 'SEEN' ? this.#button('Call in', 'bell', () => this.app.api.queueAction(a.id, 'call'), `Calling ${a.id}`) : null,
          state ? this.#button('Undo check-in', 'undo', () => this.app.api.queueRemove(a.id), `Removed ${a.id} from the queue`, 'btn-ghost') : null,
          this.app.can('appointments:complete') && state === 'SERVING'
            ? h('button', { class: 'btn btn-success btn-sm', type: 'button', onclick: async () => {
              if (await this.app.actions.complete(a)) await this.safeRefresh();
            } }, icon('check'), 'Complete')
            : null)))));
  }

  /**
   * @param {string} label @param {import('../core/dom.js').IconName} name
   * @param {() => Promise<unknown>} run @param {string} done @param {string} [cls]
   */
  #button(label, name, run, done, cls = 'btn-secondary') {
    return h('button', { class: ['btn', 'btn-sm', cls], type: 'button', onclick: async () => {
      try {
        await run();
        this.app.toaster.success(done);
      } catch (err) {
        this.app.toaster.error('That did not work', /** @type {Error} */ (err).message);
      }
      await this.safeRefresh();
    } }, icon(name), label);
  }
}
