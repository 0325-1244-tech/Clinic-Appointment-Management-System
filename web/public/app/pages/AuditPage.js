// @ts-check
import { h } from '../core/dom.js';
import { ListPage } from './ListPage.js';

/**
 * @typedef {{ id: string, at: string, actor: string, actorRole: string, action: string, entityType: string,
 *   entityId: string, summary: string }} AuditRow
 */

/** Who changed what, and when (admins only). Fed by the AuditLog observer on the server. */
export class AuditPage extends ListPage {
  /** @type {AuditRow[]} */
  #all = [];

  /** @param {import('../App.js').App} app */
  constructor(app) {
    super(app);
    this.withPlaceholder('Search user, action or record');
    this.table.label = 'Audit log';
    this.table.empty = { title: 'No entries', message: 'Changes made in the system are recorded here.' };
    const time = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: app.config.timeZone });
    this.table.columns = /** @type {import('../components/DataTable.js').Column<AuditRow>[]} */ ([
      { key: 'at', label: 'When', render: (e) => h('time', { datetime: e.at }, time.format(new Date(e.at))), sortValue: (e) => e.at },
      { key: 'actor', label: 'User', primary: true, render: (e) => h('span', null, h('span', { class: 'cell-primary' }, e.actor), h('span', { class: 'cell-sub' }, e.actorRole)), sortValue: (e) => e.actor },
      { key: 'action', label: 'Action', render: (e) => h('span', { class: 'mono' }, e.action), sortValue: (e) => e.action },
      { key: 'record', label: 'Record', render: (e) => h('span', { class: 'mono' }, e.entityId), sortValue: (e) => e.entityId },
      { key: 'summary', label: 'Details', render: (e) => e.summary, sortValue: (e) => e.summary },
    ]);
  }

  get title() {
    return 'Audit Log';
  }

  get subtitle() {
    return 'Every change and failed sign-in, newest first.';
  }

  get navKey() {
    return '/audit';
  }

  get csvName() {
    return 'audit-log.csv';
  }

  async refresh() {
    if (this.#all.length === 0) {
      this.table.loading = true;
      this.#all = await this.app.api.audit();
    }
    const k = this.search.value.trim().toLowerCase();
    this.table.rows = this.#all.filter((e) => !k || [e.actor, e.action, e.entityId, e.summary].some((v) => v.toLowerCase().includes(k)));
  }
}
