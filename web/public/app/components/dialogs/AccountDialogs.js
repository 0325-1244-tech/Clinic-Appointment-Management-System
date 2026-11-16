// @ts-check
import { h } from '../../core/dom.js';
import { FormDialog } from './FormDialog.js';

/** @typedef {import('../../App.js').App} App */
/**
 * @typedef {{ id: string, username: string, displayName: string, role: string, roleLabel: string,
 *   staffId: string | null, staffName: string | null, active: boolean }} Account
 */

const MIN_PASSWORD = 10;
const ROLES = [['ADMIN', 'Admin: everything, including accounts'], ['RECEPTIONIST', 'Receptionist: front desk, no clinical findings'],
  ['DOCTOR', 'Doctor: own schedule and patients only']];

/**
 * Two password boxes that must match. Used by the account dialogs.
 *
 * @param {FormDialog<any>} dialog
 * @param {string} name
 * @param {string} label
 */
function passwordPair(dialog, name, label) {
  return [
    dialog.field({
      name, label, required: true, hint: `At least ${MIN_PASSWORD} characters.`,
      control: h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: '200' }),
    }),
    dialog.field({
      name: `${name}Confirm`, label: 'Type it again', required: true,
      control: h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: '200' }),
    }),
  ];
}

/**
 * @param {FormDialog<any>} dialog
 * @param {string} name
 */
function checkPasswordPair(dialog, name) {
  const password = dialog.value(name);
  if (password.length < MIN_PASSWORD) {
    throw Object.assign(new Error(`The password must be at least ${MIN_PASSWORD} characters long.`), { field: name });
  }
  if (password !== dialog.value(`${name}Confirm`)) {
    throw Object.assign(new Error('The two passwords do not match.'), { field: `${name}Confirm` });
  }
  return password;
}

/**
 * Create an account, or edit one's name, role, staff link and active flag.
 *
 * @extends {FormDialog<Account>}
 */
export class AccountDialog extends FormDialog {
  #app;
  #account;
  /** @type {{ id: string, name: string }[]} */
  #staff = [];
  /** @type {HTMLSelectElement | null} */
  #role = null;
  /** @type {HTMLElement | null} */
  #staffField = null;

  /** @param {App} app @param {Account} [account] */
  constructor(app, account) {
    super();
    this.#app = app;
    this.#account = account;
  }

  get title() {
    return this.#account ? `Edit ${this.#account.username}` : 'New account';
  }

  get description() {
    return this.#account ? 'Usernames cannot be changed.' : 'The person signs in with this username and password.';
  }

  get saveLabel() {
    return this.#account ? 'Save changes' : 'Create account';
  }

  /** Loads the staff list for the Doctor link, then opens. */
  async load() {
    this.#staff = (await this.#app.api.staff()).map((s) => ({ id: s.id, name: `${s.getDisplayName()} · ${s.id}` }));
    return this.open();
  }

  buildFields() {
    const a = this.#account;
    this.#role = h('select', { class: 'select', onchange: () => this.#toggleStaff() },
      ROLES.map(([code, label]) => h('option', { value: code, selected: code === (a?.role ?? 'RECEPTIONIST') }, label)));
    const staff = h('select', { class: 'select' }, h('option', { value: '' }, 'Choose the doctor…'),
      this.#staff.map((s) => h('option', { value: s.id, selected: s.id === a?.staffId }, s.name)));
    this.#staffField = this.field({ name: 'staffId', label: 'Linked staff record', required: true, wide: true, control: staff,
      hint: 'A Doctor account sees only this staff member\'s appointments and patients.' });
    const fields = h('div', { class: 'form-grid' },
      this.field({
        name: 'username', label: 'Username', required: !a,
        control: h('input', { class: 'input', value: a?.username ?? '', disabled: Boolean(a), autocomplete: 'off', maxlength: '30', spellcheck: 'false' }),
        hint: a ? undefined : '3 to 30 letters, numbers, dots, dashes or underscores.',
      }),
      this.field({ name: 'displayName', label: 'Full name', required: true, control: h('input', { class: 'input', value: a?.displayName ?? '', maxlength: '80' }) }),
      this.field({ name: 'role', label: 'Role', required: true, wide: true, control: this.#role }),
      this.#staffField,
      a ? this.field({
        name: 'active', label: 'Status', wide: true,
        control: h('select', { class: 'select' },
          h('option', { value: 'true', selected: a.active }, 'Active: can sign in'),
          h('option', { value: 'false', selected: !a.active }, 'Deactivated: cannot sign in')),
      }) : passwordPair(this, 'password', 'Password'));
    queueMicrotask(() => this.#toggleStaff());
    return fields;
  }

  #toggleStaff() {
    if (this.#staffField) {
      this.#staffField.hidden = this.#role?.value !== 'DOCTOR';
    }
  }

  async onSave() {
    const role = this.value('role');
    const staffId = role === 'DOCTOR' ? this.value('staffId') : undefined;
    if (role === 'DOCTOR' && !staffId) {
      throw Object.assign(new Error('Choose the staff record this doctor account belongs to.'), { field: 'staffId' });
    }
    const common = { displayName: this.value('displayName'), role, ...(staffId ? { staffId } : {}) };
    if (this.#account) {
      return this.#app.api.updateUser(this.#account.id, { ...common, active: this.value('active') === 'true' });
    }
    const password = checkPasswordPair(this, 'password');
    return this.#app.api.createUser({ ...common, username: this.value('username'), password });
  }
}

/**
 * An administrator sets a new password for someone (they are signed out everywhere).
 *
 * @extends {FormDialog<boolean>}
 */
export class ResetPasswordDialog extends FormDialog {
  #app;
  #account;

  /** @param {App} app @param {Account} account */
  constructor(app, account) {
    super();
    this.#app = app;
    this.#account = account;
  }

  get title() {
    return `Reset password for ${this.#account.username}`;
  }

  get description() {
    return 'They will be signed out on every device. Give them the new password in person.';
  }

  get saveLabel() {
    return 'Set new password';
  }

  get size() {
    return 'sm';
  }

  buildFields() {
    return h('div', { class: 'stack' }, passwordPair(this, 'password', 'New password'));
  }

  async onSave() {
    await this.#app.api.resetPassword(this.#account.id, checkPasswordPair(this, 'password'));
    return true;
  }
}

/**
 * Any signed-in user changes their own password.
 *
 * @extends {FormDialog<boolean>}
 */
export class ChangePasswordDialog extends FormDialog {
  #app;

  /** @param {App} app */
  constructor(app) {
    super();
    this.#app = app;
  }

  get title() {
    return 'Change your password';
  }

  get description() {
    return 'Other devices signed in to your account will be signed out.';
  }

  get saveLabel() {
    return 'Change password';
  }

  get size() {
    return 'sm';
  }

  buildFields() {
    return h('div', { class: 'stack' },
      this.field({
        name: 'currentPassword', label: 'Current password', required: true,
        control: h('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxlength: '200' }),
      }),
      passwordPair(this, 'newPassword', 'New password'));
  }

  async onSave() {
    const next = checkPasswordPair(this, 'newPassword');
    await this.#app.api.changePassword(this.value('currentPassword'), next);
    return true;
  }
}
