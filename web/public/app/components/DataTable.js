// @ts-check
import { CsvWriter } from '/domain/CsvWriter.js';
import { h, icon, replace } from '../core/dom.js';

/**
 * @template T
 * @typedef {object} Column
 * @property {string} key
 * @property {string} label
 * @property {(row: T) => import('../core/dom.js').Child} render   cell content
 * @property {(row: T) => string | number} [sortValue]            makes the column sortable
 * @property {(row: T) => string | number} [csv]                   value for CSV export (defaults to sortValue)
 * @property {'right'} [align]
 * @property {boolean} [primary]                                   the row's main text (used as the row label)
 */

/**
 * @typedef {object} EmptyState
 * @property {string} title
 * @property {string} [message]
 * @property {HTMLElement} [action]
 */

/**
 * <cc-data-table>: a generic, reusable table (Web Component).
 *
 * It knows nothing about patients or appointments. Each page passes column
 * definitions (STRATEGY objects that say how to render, sort and export a
 * cell), so one class serves every list in the app, like the Java
 * EntityTableModel<T>.
 *
 * Keyboard: Up/Down move between rows, Enter opens the selected row
 * (same as double-click), Home/End jump to the first/last row.
 * Events: "select" and "activate" (detail = the row object).
 *
 * @template T
 */
export class DataTable extends HTMLElement {
  /** @type {Column<T>[]} */
  #columns = [];
  /** @type {T[]} */
  #rows = [];
  /** @type {{ key: string, dir: 1 | -1 } | null} */
  #sort = null;
  /** @type {string | null} */
  #selectedId = null;
  #loading = false;
  /** @type {EmptyState} */
  #empty = { title: 'Nothing to show' };
  /** @type {(row: T) => string} */
  #idOf = (row) => /** @type {any} */ (row).id;
  #label = '';
  #footer = h('div', { class: 'table-foot' });

  /** @param {Column<T>[]} columns */
  set columns(columns) {
    this.#columns = columns;
    this.#render();
  }

  /** @param {T[]} rows */
  set rows(rows) {
    this.#rows = [...rows];
    this.#loading = false;
    if (this.#selectedId && !this.#rows.some((r) => this.#idOf(r) === this.#selectedId)) {
      this.#selectedId = null;
      this.#emit('select', null);
    }
    this.#render();
  }

  get rows() {
    return this.#sorted();
  }

  /** @param {boolean} value */
  set loading(value) {
    this.#loading = value;
    this.#render();
  }

  /** @param {EmptyState} value */
  set empty(value) {
    this.#empty = value;
  }

  /** Accessible name of the table. @param {string} value */
  set label(value) {
    this.#label = value;
  }

  /** @param {(row: T) => string} fn */
  set idOf(fn) {
    this.#idOf = fn;
  }

  /** @returns {T | null} */
  get selected() {
    return this.#rows.find((r) => this.#idOf(r) === this.#selectedId) ?? null;
  }

  /** @param {string | null} id */
  select(id) {
    this.#selectedId = id;
    this.#render();
    this.#emit('select', this.selected);
  }

  /** CSV of the rows as currently sorted, using each column's csv() or sortValue(). */
  toCsv() {
    const exportable = this.#columns.filter((c) => c.csv || c.sortValue);
    const writer = new CsvWriter(exportable.map((c) => ({
      header: c.label,
      value: (/** @type {T} */ row) => /** @type {(r: T) => string | number} */ (c.csv ?? c.sortValue)(row),
    })));
    return writer.write(this.#sorted());
  }

  #sorted() {
    if (!this.#sort) {
      return this.#rows;
    }
    const column = this.#columns.find((c) => c.key === this.#sort?.key);
    if (!column?.sortValue) {
      return this.#rows;
    }
    const value = column.sortValue;
    const dir = this.#sort.dir;
    return [...this.#rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
    });
  }

  #render() {
    const rows = this.#sorted();
    const thead = h('thead', null, h('tr', null, this.#columns.map((c) => {
      const sorted = this.#sort?.key === c.key;
      const ariaSort = sorted ? (this.#sort?.dir === 1 ? 'ascending' : 'descending') : undefined;
      const content = c.sortValue
        ? h('button', { type: 'button', onclick: () => this.#toggleSort(c.key) }, c.label,
          icon(sorted ? (this.#sort?.dir === 1 ? 'sortUp' : 'sortDown') : 'sort'))
        : h('div', { class: 'th-inner' }, c.label);
      return h('th', { scope: 'col', 'aria-sort': ariaSort, class: c.align === 'right' ? 'align-right' : undefined }, content);
    })));

    /** @type {Node} */
    let tbody;
    if (this.#loading) {
      tbody = h('tbody', { 'aria-busy': 'true' }, Array.from({ length: 5 }, () =>
        h('tr', null, this.#columns.map(() => h('td', null, h('span', { class: 'skeleton', style: { width: `${40 + Math.round(Math.random() * 45)}%` } }))))));
    } else if (rows.length === 0) {
      tbody = h('tbody', null, h('tr', null, h('td', { colspan: this.#columns.length },
        h('div', { class: 'empty-state' },
          h('div', { class: 'empty-icon' }, icon('search')),
          h('strong', null, this.#empty.title),
          this.#empty.message ? h('span', null, this.#empty.message) : null,
          this.#empty.action ?? null))));
    } else {
      const focusId = this.#selectedId ?? this.#idOf(rows[0]);
      tbody = h('tbody', null, rows.map((row) => {
        const id = this.#idOf(row);
        const selected = id === this.#selectedId;
        const primary = this.#columns.find((c) => c.primary) ?? this.#columns[0];
        return h('tr', {
          tabindex: id === focusId ? '0' : '-1',
          'aria-selected': String(selected),
          dataset: { id },
          onclick: () => this.select(id),
          ondblclick: () => this.#emit('activate', row),
          onkeydown: (/** @type {KeyboardEvent} */ e) => this.#onKey(e, rows, id),
          'aria-label': primary?.sortValue ? String(primary.sortValue(row)) : undefined,
        }, this.#columns.map((c) => h('td', { 'data-label': c.label, class: c.align === 'right' ? 'align-right' : undefined }, c.render(row))));
      }));
    }

    const table = h('table', { class: 'table responsive', 'aria-label': this.#label || undefined, 'aria-rowcount': String(rows.length) }, thead, tbody);
    this.#footer.textContent = this.#loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${this.selected ? ' · 1 selected' : ''}`;
    const hadFocus = this.contains(document.activeElement) && document.activeElement instanceof HTMLTableRowElement;
    replace(this, h('div', { class: 'table-wrap' }, table), this.#footer);
    if (hadFocus && this.#selectedId) {
      /** @type {HTMLElement | null} */ (this.querySelector(`tr[data-id="${CSS.escape(this.#selectedId)}"]`))?.focus();
    }
  }

  /** @param {string} key */
  #toggleSort(key) {
    this.#sort = this.#sort?.key === key ? { key, dir: this.#sort.dir === 1 ? -1 : 1 } : { key, dir: 1 };
    this.#render();
    /** @type {HTMLElement | null} */ (this.querySelector('th[aria-sort] button'))?.focus();
  }

  /** @param {KeyboardEvent} e @param {T[]} rows @param {string} id */
  #onKey(e, rows, id) {
    const index = rows.findIndex((r) => this.#idOf(r) === id);
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(index + 1, rows.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(index - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if (e.key === 'Enter') {
      e.preventDefault();
      this.#selectedId = id;
      this.#emit('activate', rows[index]);
      return;
    } else if (e.key === ' ') {
      e.preventDefault();
      this.select(id);
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      this.select(this.#idOf(rows[next]));
      /** @type {HTMLElement | null} */ (this.querySelector(`tr[data-id="${CSS.escape(this.#idOf(rows[next]))}"]`))?.focus();
    }
  }

  /** @param {string} type @param {unknown} detail */
  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
customElements.define('cc-data-table', DataTable);
