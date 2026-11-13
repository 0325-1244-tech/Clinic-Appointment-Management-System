// @ts-check
import { AppointmentStatus } from '/domain/index.js';
import { h, icon } from '../core/dom.js';
import { Columns } from './columns.js';
import { ListPage } from './ListPage.js';

/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */

const PERIODS = [['', 'All dates'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['past', 'Past']];

/** Book, reschedule, complete, cancel and track appointments (Java: AppointmentPanel). */
export class AppointmentsPage extends ListPage {
  #status = h('select', { class: 'select', 'aria-label': 'Filter by status', onchange: () => this.safeRefresh() },
    h('option', { value: '' }, 'All statuses'), AppointmentStatus.values().map((s) => h('option', { value: s.code }, s.label)));
  #period = 'upcoming';
  #periodButtons = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Period' });
  #buttons = {
    reschedule: h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.#act('reschedule') }, 'Reschedule'),
    complete: h('button', { class: 'btn btn-success', type: 'button', onclick: () => this.#act('complete') }, icon('check'), 'Complete'),
    cancel: h('button', { class: 'btn btn-danger', type: 'button', onclick: () => this.#act('cancel') }, 'Cancel'),
    noShow: h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.#act('noShow') }, 'No-show'),
  };

  /** @param {import('../App.js').App} app */
  constructor(app) {
    super(app);
    const preset = app.router.params.get('period');
    if (preset !== null && PERIODS.some(([v]) => v === preset)) this.#period = preset;
    this.withPlaceholder('Search patient, staff, ID or reason');
    this.table.label = 'Appointments';
    this.table.empty = { title: 'No appointments match', message: 'Change the filters or book a new appointment.' };
    this.table.columns = Columns.appointments();
    this.table.addEventListener('activate', async (e) => {
      if (await this.app.actions.details(/** @type {CustomEvent} */ (e).detail)) await this.safeRefresh();
    });
    this.#paintPeriods();
  }

  get title() {
    return 'Appointments';
  }

  get subtitle() {
    return 'Double-click or press Enter on a row for full details. Press N to book.';
  }

  get navKey() {
    return '/appointments';
  }

  get csvName() {
    return 'appointments.csv';
  }

  actions() {
    return this.app.can('appointments:book')
      ? h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
        if (await this.app.actions.book()) await this.safeRefresh();
      } }, icon('plus'), 'Book appointment')
      : null;
  }

  filters() {
    return [this.#status, this.#periodButtons];
  }

  rowActions() {
    const b = this.#buttons;
    return [
      this.app.can('appointments:manage') ? [b.reschedule, b.noShow, b.cancel] : null,
      this.app.can('appointments:complete') ? b.complete : null,
    ];
  }

  onSelectionChange() {
    const a = this.table.selected;
    const open = Boolean(a?.isActive());
    for (const button of Object.values(this.#buttons)) {
      button.disabled = !open;
    }
  }

  #paintPeriods() {
    this.#periodButtons.replaceChildren(...PERIODS.map(([value, label]) => h('button', {
      type: 'button', 'aria-pressed': String(value === this.#period),
      onclick: () => {
        this.#period = value;
        this.#paintPeriods();
        this.safeRefresh();
      },
    }, label)));
  }

  async refresh() {
    if (this.table.rows.length === 0) this.table.loading = true;
    this.table.rows = await this.app.api.appointments({
      q: this.search.value, status: this.#status.value || undefined, period: this.#period || undefined,
    });
    this.onSelectionChange();
  }

  /** @param {'reschedule' | 'complete' | 'cancel' | 'noShow'} action */
  async #act(action) {
    const a = this.table.selected;
    if (!a) return;
    if (await this.app.actions[action](a)) await this.safeRefresh();
  }
}
