// @ts-check
import { abstractClass, abstractMethod } from '/domain/contracts.js';
import { h, peso, svg } from '../core/dom.js';

/**
 * ABSTRACTION: an accessible chart. Every chart has a one-sentence text
 * summary (read first by screen readers) and can switch to a plain data
 * table. Subclasses only draw their own picture (POLYMORPHISM on draw()).
 *
 * @template D
 */
export class Chart {
  #data;
  #label;

  /** @param {string} label @param {D} data */
  constructor(label, data) {
    if (new.target === Chart) {
      throw abstractClass('Chart');
    }
    this.#label = label;
    this.#data = data;
  }

  get data() {
    return this.#data;
  }

  get label() {
    return this.#label;
  }

  /** @abstract @returns {Element} */
  draw() {
    throw abstractMethod(this, 'draw');
  }

  /** @abstract @returns {string} */
  summary() {
    throw abstractMethod(this, 'summary');
  }

  /** @abstract @returns {{ head: string[], rows: (string | number)[][] }} */
  table() {
    throw abstractMethod(this, 'table');
  }

  /** Figure with the summary, the picture and a "Show as table" toggle. */
  element() {
    const picture = this.draw();
    picture.setAttribute('aria-hidden', 'true');
    const { head, rows } = this.table();
    const dataTable = h('table', { class: 'table', hidden: true },
      h('caption', { class: 'sr-only' }, this.#label),
      h('thead', null, h('tr', null, head.map((c) => h('th', { scope: 'col' }, h('div', { class: 'th-inner' }, c))))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, String(c)))))));
    const toggle = h('button', {
      class: 'btn btn-ghost btn-sm data-table-toggle', type: 'button', 'aria-pressed': 'false',
      onclick: () => {
        const show = dataTable.hidden;
        dataTable.hidden = !show;
        picture.toggleAttribute('hidden', show);
        toggle.setAttribute('aria-pressed', String(show));
      },
    }, 'Show as table');
    return h('figure', { class: 'chart-figure', style: { margin: '0' } },
      h('figcaption', { class: 'chart-summary' }, this.summary()),
      picture, dataTable, toggle);
  }
}

/**
 * @typedef {{ date: string, total: number, byStatus: Record<string, number> }} DayCount
 */

const STATUS_COLORS = {
  COMPLETED: 'var(--status-completed)',
  SCHEDULED: 'var(--status-scheduled)',
  NO_SHOW: 'var(--status-noshow)',
  CANCELLED: 'var(--status-cancelled)',
};
const STATUS_LABELS = { COMPLETED: 'Completed', SCHEDULED: 'Scheduled', NO_SHOW: 'No-Show', CANCELLED: 'Cancelled' };

/** Appointments per day, stacked by status. @extends {Chart<DayCount[]>} */
export class DailyVolumeChart extends Chart {
  draw() {
    const days = this.data;
    const width = 640;
    const height = 200;
    const pad = { top: 10, right: 8, bottom: 24, left: 28 };
    const max = Math.max(4, ...days.map((d) => d.total));
    const step = (width - pad.left - pad.right) / days.length;
    const barW = Math.max(6, Math.min(28, step * 0.62));
    const y = (/** @type {number} */ v) => pad.top + (height - pad.top - pad.bottom) * (1 - v / max);
    const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img' });
    const ticks = [0, Math.ceil(max / 2), max];
    for (const t of ticks) {
      chart.append(svg('line', { class: 'gridline', x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t) }),
        svg('text', { x: pad.left - 6, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
    }
    days.forEach((d, i) => {
      const x = pad.left + i * step + (step - barW) / 2;
      let acc = 0;
      for (const code of Object.keys(STATUS_COLORS)) {
        const v = d.byStatus[code] ?? 0;
        if (v > 0) {
          chart.append(svg('rect', {
            x, width: barW, y: y(acc + v), height: Math.max(0, y(acc) - y(acc + v) - 1), rx: 3,
            fill: STATUS_COLORS[/** @type {keyof typeof STATUS_COLORS} */ (code)],
          }));
          acc += v;
        }
      }
      if (i % Math.ceil(days.length / 7) === 0 || i === days.length - 1) {
        chart.append(svg('text', { x: x + barW / 2, y: height - 6, 'text-anchor': 'middle' }, shortDate(d.date)));
      }
    });
    const legend = h('div', { class: 'chart-legend' }, Object.entries(STATUS_COLORS).map(([code, color]) =>
      h('span', null, h('i', { style: { background: color } }), STATUS_LABELS[/** @type {keyof typeof STATUS_LABELS} */ (code)])));
    return h('div', null, chart, legend);
  }

  summary() {
    const total = this.data.reduce((s, d) => s + d.total, 0);
    const busiest = [...this.data].sort((a, b) => b.total - a.total)[0];
    return total === 0
      ? `No appointments in the last ${this.data.length} days.`
      : `${total} appointments in the last ${this.data.length} days; the busiest day was ${shortDate(busiest.date)} with ${busiest.total}.`;
  }

  table() {
    return {
      head: ['Date', 'Total', ...Object.values(STATUS_LABELS)],
      rows: this.data.map((d) => [d.date, d.total, ...Object.keys(STATUS_LABELS).map((k) => d.byStatus[k] ?? 0)]),
    };
  }
}

/** @typedef {{ status: string, label: string, count: number }} StatusCount */

/** Share of each status as a ring. @extends {Chart<StatusCount[]>} */
export class StatusDonutChart extends Chart {
  draw() {
    const total = this.data.reduce((s, d) => s + d.count, 0) || 1;
    const r = 52;
    const c = 2 * Math.PI * r;
    const chart = svg('svg', { viewBox: '0 0 140 140', class: 'chart', role: 'img' });
    chart.append(svg('circle', { cx: 70, cy: 70, r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': 18 }));
    let offset = 0;
    for (const d of this.data) {
      const len = (d.count / total) * c;
      if (len > 0) {
        chart.append(svg('circle', {
          cx: 70, cy: 70, r, fill: 'none', stroke: STATUS_COLORS[/** @type {keyof typeof STATUS_COLORS} */ (d.status)], 'stroke-width': 18,
          'stroke-dasharray': `${Math.max(0, len - 2)} ${c}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 70 70)',
        }));
      }
      offset += len;
    }
    chart.append(
      svg('text', { x: 70, y: 68, 'text-anchor': 'middle', class: 'donut-value' }, String(this.data.reduce((s, d) => s + d.count, 0))),
      svg('text', { x: 70, y: 86, 'text-anchor': 'middle' }, 'appointments'));
    chart.style.maxWidth = '160px';
    const legend = h('div', { class: 'chart-legend', style: { 'flex-direction': 'column' } }, this.data.map((d) =>
      h('span', null, h('i', { style: { background: STATUS_COLORS[/** @type {keyof typeof STATUS_COLORS} */ (d.status)] } }), `${d.label}: ${d.count}`)));
    return h('div', { style: { display: 'flex', gap: '20px', 'align-items': 'center', 'flex-wrap': 'wrap' } }, chart, legend);
  }

  summary() {
    const total = this.data.reduce((s, d) => s + d.count, 0);
    return `${total} appointments in total: ${this.data.map((d) => `${d.count} ${d.label.toLowerCase()}`).join(', ')}.`;
  }

  table() {
    return { head: ['Status', 'Appointments'], rows: this.data.map((d) => [d.label, d.count]) };
  }
}

/** @typedef {{ label: string, value: number, role?: string, note?: string }} BarItem */

/** Horizontal bars, e.g. fees by staff type or busiest staff. @extends {Chart<BarItem[]>} */
export class BarListChart extends Chart {
  #money;

  /** @param {string} label @param {BarItem[]} data @param {{ money?: boolean }} [options] */
  constructor(label, data, { money = false } = {}) {
    super(label, data);
    this.#money = money;
  }

  /** @param {number} v */
  #format(v) {
    return this.#money ? peso(v) : String(v);
  }

  draw() {
    const max = Math.max(1, ...this.data.map((d) => d.value));
    return h('div', { class: 'bar-list' }, this.data.map((d) => h('div', { class: ['bar-row', d.role ? `role-${d.role}` : ''] },
      h('span', null, d.label, d.note ? h('span', { class: 'cell-sub' }, d.note) : null),
      h('span', { class: 'bar' }, h('i', { style: { width: `${(d.value / max) * 100}%` } })),
      h('span', { class: 'value' }, this.#format(d.value)))));
  }

  summary() {
    if (this.data.length === 0) {
      return `${this.label}: no data yet.`;
    }
    const top = [...this.data].sort((a, b) => b.value - a.value)[0];
    return `${this.label}: highest is ${top.label} with ${this.#format(top.value)}.`;
  }

  table() {
    return { head: ['Name', this.#money ? 'Amount' : 'Count'], rows: this.data.map((d) => [d.label, this.#format(d.value)]) };
  }
}

/** "2026-11-11" -> "Nov 11" @param {string} iso */
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
