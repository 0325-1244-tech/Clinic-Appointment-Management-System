// @ts-check
import { h, peso } from '../core/dom.js';
import { Columns } from './columns.js';
import { ListPage } from './ListPage.js';

/**
 * Appointment records: closed appointments (completed, cancelled, no-show),
 * per-patient filter, totals and the CSV export (Java: RecordsPanel).
 */
export class RecordsPage extends ListPage {
  #patient = h('select', { class: 'select', 'aria-label': 'Filter by patient', onchange: () => this.safeRefresh() }, h('option', { value: '' }, 'All patients'));
  #cards = {
    total: h('cc-stat-card', { label: 'Records', icon: 'records' }),
    completed: h('cc-stat-card', { label: 'Completed visits', icon: 'check' }),
    missed: h('cc-stat-card', { label: 'Cancelled / no-show', icon: 'ban' }),
    fees: h('cc-stat-card', { label: 'Fees collected', icon: 'peso' }),
  };
  #details = h('button', { class: 'btn btn-secondary', type: 'button', disabled: true, onclick: () => this.#open() }, 'View details');

  /** @param {import('../App.js').App} app */
  constructor(app) {
    super(app);
    this.withPlaceholder('Search records, findings or remarks');
    this.table.label = 'Appointment records';
    this.table.empty = { title: 'No records yet', message: 'Completed, cancelled and no-show appointments appear here.' };
    this.table.columns = Columns.records();
    this.table.addEventListener('activate', () => this.#open());
    const preset = app.router.params.get('patient');
    if (preset) this.#patient.dataset.preset = preset;
  }

  get title() {
    return 'Appointment Records';
  }

  get subtitle() {
    return 'Visit history with findings. Export uses the same CSV columns as the desktop version.';
  }

  get navKey() {
    return '/records';
  }

  rowActions() {
    return this.#details;
  }

  filters() {
    return this.#patient;
  }

  onSelectionChange() {
    this.#details.disabled = !this.table.selected;
  }

  /** @override */
  render() {
    return h('div', { class: 'stack' },
      h('div', { class: 'grid grid-stats' }, Object.values(this.#cards)),
      super.render());
  }

  /** The server builds the CSV in the Java column format, so this downloads it from the API. @override */
  exportCsv() {
    const url = this.app.api.recordsCsvUrl({ patientId: this.#patient.value || undefined, q: this.search.value || undefined });
    const a = h('a', { href: url, download: 'appointment-records.csv' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.app.toaster.success('Exporting records', 'appointment-records.csv');
  }

  async refresh() {
    if (this.#patient.options.length === 1) {
      const patients = await this.app.api.patients();
      const preset = this.#patient.dataset.preset;
      this.#patient.append(...patients.map((p) => h('option', { value: p.id, selected: p.id === preset }, `${p.fullName} · ${p.id}`)));
    }
    if (this.table.rows.length === 0) this.table.loading = true;
    const { records, summary } = await this.app.api.records({ patientId: this.#patient.value || undefined, q: this.search.value });
    this.table.rows = records;
    this.#cards.total.setAttribute('value', String(summary.total));
    this.#cards.completed.setAttribute('value', String(summary.completed));
    this.#cards.missed.setAttribute('value', `${summary.cancelled} / ${summary.noShow}`);
    this.#cards.fees.setAttribute('value', peso(summary.fees));
    this.onSelectionChange();
  }

  async #open() {
    const a = this.table.selected;
    if (a) await this.app.actions.details(a);
  }
}

