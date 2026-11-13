// @ts-check
import { abstractClass } from '/domain/contracts.js';
import { downloadText, h, icon } from '../core/dom.js';
import { BasePage } from './BasePage.js';

/**
 * INHERITANCE: a BasePage with a searchable <cc-data-table>. Patients, Staff,
 * Appointments and Records all extend it and only add their own columns,
 * filters and buttons.
 *
 * @template T
 */
export class ListPage extends BasePage {
  /** @type {import('../components/DataTable.js').DataTable<T>} */
  table = /** @type {any} */ (document.createElement('cc-data-table'));
  search = h('input', { class: 'input', type: 'search', placeholder: 'Search…', 'aria-label': 'Search', autocomplete: 'off' });
  #debounce = 0;

  /** @param {import('../App.js').App} app */
  constructor(app) {
    super(app);
    if (new.target === ListPage) {
      throw abstractClass('ListPage');
    }
    this.search.addEventListener('input', () => {
      clearTimeout(this.#debounce);
      this.#debounce = window.setTimeout(() => this.safeRefresh(), 220);
    });
    this.table.addEventListener('select', () => this.onSelectionChange());
  }

  /** @override @param {unknown} err */
  onLoadError(err) {
    this.table.empty = { title: 'Could not load this list', message: /** @type {Error} */ (err)?.message };
    this.table.rows = [];
  }

  /** Extra filter controls for the toolbar. @returns {import('../core/dom.js').Child} */
  filters() {
    return null;
  }

  /** Buttons that act on the selected row. @returns {import('../core/dom.js').Child} */
  rowActions() {
    return null;
  }

  /** Called when the selected row changes (enable or disable row buttons). */
  onSelectionChange() {}

  /** File name for "Export CSV". */
  get csvName() {
    return 'export.csv';
  }

  /** @param {string} placeholder */
  withPlaceholder(placeholder) {
    this.search.placeholder = placeholder;
    this.search.setAttribute('aria-label', placeholder);
    return this;
  }

  /** The search box, filters, row buttons and the table, in one card. */
  render() {
    return h('section', { class: 'card' },
      h('div', { class: 'toolbar' },
        h('div', { class: 'search-field' }, icon('search'), this.search),
        this.filters(),
        h('div', { class: 'spacer' }),
        this.rowActions(),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => this.exportCsv() }, icon('download'), 'Export CSV')),
      this.table);
  }

  exportCsv() {
    if (this.table.rows.length === 0) {
      this.app.toaster.error('Nothing to export', 'The table is empty.');
      return;
    }
    downloadText(this.csvName, this.table.toCsv());
    this.app.toaster.success(`Exported ${this.table.rows.length} row(s)`, this.csvName);
  }
}
