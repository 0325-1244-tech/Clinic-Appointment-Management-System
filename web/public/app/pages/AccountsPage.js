// @ts-check
import { AccountDialog, ResetPasswordDialog } from '../components/dialogs/AccountDialogs.js';
import { h, icon } from '../core/dom.js';
import { ListPage } from './ListPage.js';

/** @typedef {import('../components/dialogs/AccountDialogs.js').Account} Account */

/** Sign-in accounts (administrators only): create, edit, deactivate, reset passwords. */
export class AccountsPage extends ListPage {
  /** @type {Account[]} */
  #all = [];
  #edit = h('button', { class: 'btn btn-secondary', type: 'button', disabled: true, onclick: () => this.#editSelected() }, icon('edit'), 'Edit');
  #reset = h('button', { class: 'btn btn-secondary', type: 'button', disabled: true, onclick: () => this.#resetSelected() }, 'Reset password');

  /** @param {import('../App.js').App} app */
  constructor(app) {
    super(app);
    this.withPlaceholder('Search username, name or role');
    this.table.label = 'Accounts';
    this.table.empty = { title: 'No accounts found' };
    this.table.columns = /** @type {import('../components/DataTable.js').Column<Account>[]} */ ([
      { key: 'username', label: 'Username', primary: true, render: (u) => h('span', { class: 'mono' }, u.username), sortValue: (u) => u.username },
      { key: 'name', label: 'Name', render: (u) => h('span', { class: 'cell-primary' }, u.displayName), sortValue: (u) => u.displayName },
      { key: 'role', label: 'Role', render: (u) => u.roleLabel, sortValue: (u) => u.roleLabel },
      { key: 'staff', label: 'Linked staff', render: (u) => u.staffName ?? h('span', { class: 'muted' }, '—'), sortValue: (u) => u.staffName ?? '' },
      {
        key: 'status', label: 'Status',
        render: (u) => h('span', { class: `pill ${u.active ? 'pill-active' : 'pill-inactive'}` }, u.active ? 'Active' : 'Deactivated'),
        sortValue: (u) => (u.active ? 'Active' : 'Deactivated'),
      },
    ]);
    this.table.addEventListener('activate', () => this.#editSelected());
  }

  get title() {
    return 'Accounts';
  }

  get subtitle() {
    return 'Who can sign in, and what each role may do. Deactivate accounts instead of sharing passwords.';
  }

  get navKey() {
    return '/accounts';
  }

  get csvName() {
    return 'accounts.csv';
  }

  actions() {
    return h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.#create() }, icon('plus'), 'New account');
  }

  rowActions() {
    return [this.#edit, this.#reset];
  }

  onSelectionChange() {
    const none = !this.table.selected;
    this.#edit.disabled = none;
    this.#reset.disabled = none;
  }

  async refresh() {
    const ticket = this.beginLoad();
    if (this.#all.length === 0) this.table.loading = true;
    const all = await this.app.api.users();
    if (this.isStale(ticket)) return;
    this.#all = all;
    const k = this.search.value.trim().toLowerCase();
    this.table.rows = all.filter((u) => !k || [u.username, u.displayName, u.roleLabel, u.staffName ?? ''].some((v) => v.toLowerCase().includes(k)));
    this.onSelectionChange();
  }

  async #create() {
    const account = await new AccountDialog(this.app).load();
    if (account) {
      this.app.toaster.success(`Created ${account.username}`, `${account.roleLabel} account`);
      await this.safeRefresh();
      this.table.select(account.id);
    }
  }

  async #editSelected() {
    const selected = this.table.selected;
    if (!selected) return;
    const account = await new AccountDialog(this.app, selected).load();
    if (account) {
      this.app.toaster.success(`Saved ${account.username}`, account.active ? undefined : 'The account is deactivated and signed out.');
      await this.safeRefresh();
    }
  }

  async #resetSelected() {
    const selected = this.table.selected;
    if (!selected) return;
    if (await new ResetPasswordDialog(this.app, selected).open()) {
      this.app.toaster.success(`New password set for ${selected.username}`, 'They have been signed out everywhere.');
    }
  }
}
