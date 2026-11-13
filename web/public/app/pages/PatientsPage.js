// @ts-check
import { ConfirmDialog } from '../components/dialogs/BaseDialog.js';
import { PatientDialog } from '../components/dialogs/EntityDialogs.js';
import { h, icon } from '../core/dom.js';
import { ListPage } from './ListPage.js';

/** @typedef {import('/domain/Patient.js').Patient} Patient */

/** Register, edit, search and delete patients (Java: PatientPanel). */
export class PatientsPage extends ListPage {
  #edit = h('button', { class: 'btn btn-secondary', type: 'button', disabled: true, onclick: () => this.#editSelected() }, icon('edit'), 'Edit');
  #delete = h('button', { class: 'btn btn-danger', type: 'button', disabled: true, onclick: () => this.#deleteSelected() }, icon('trash'), 'Delete');
  #open = h('button', { class: 'btn btn-secondary', type: 'button', disabled: true, onclick: () => this.#openSelected() }, icon('records'), 'Profile');

  /** @param {import('../App.js').App} app */
  constructor(app) {
    super(app);
    this.withPlaceholder('Search name, ID, phone, email or address');
    this.table.label = 'Patients';
    this.table.empty = { title: 'No patients found', message: 'Try a different search, or register a new patient.' };
    this.table.columns = /** @type {import('../components/DataTable.js').Column<Patient>[]} */ ([
      { key: 'id', label: 'Patient ID', render: (p) => h('span', { class: 'mono' }, p.id), sortValue: (p) => p.id },
      {
        key: 'name', label: 'Name', primary: true,
        render: (p) => h('a', { class: 'cell-primary', href: `#/patients/${encodeURIComponent(p.id)}` }, p.fullName), sortValue: (p) => p.fullName,
      },
      { key: 'age', label: 'Age', align: 'right', render: (p) => String(p.age), sortValue: (p) => p.age },
      { key: 'gender', label: 'Gender', render: (p) => p.gender, sortValue: (p) => p.gender },
      { key: 'contact', label: 'Contact', render: (p) => h('span', { class: 'num' }, p.contactNumber), sortValue: (p) => p.contactNumber },
      { key: 'email', label: 'Email', render: (p) => p.email || h('span', { class: 'muted' }, '—'), sortValue: (p) => p.email },
      { key: 'blood', label: 'Blood', render: (p) => p.bloodType, sortValue: (p) => p.bloodType },
      { key: 'address', label: 'Address', render: (p) => p.address, sortValue: (p) => p.address },
    ]);
    this.table.addEventListener('activate', (e) => this.app.router.go(`/patients/${encodeURIComponent(/** @type {CustomEvent} */ (e).detail.id)}`));
  }

  get title() {
    return 'Patients';
  }

  get subtitle() {
    return 'Register patients and keep their contact and medical profile up to date.';
  }

  get navKey() {
    return '/patients';
  }

  get csvName() {
    return 'patients.csv';
  }

  actions() {
    return this.app.can('patients:write')
      ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.#register() }, icon('plus'), 'Register patient')
      : null;
  }

  rowActions() {
    return [this.#open, this.app.can('patients:write') ? [this.#edit, this.#delete] : null];
  }

  onSelectionChange() {
    const none = !this.table.selected;
    this.#edit.disabled = none;
    this.#delete.disabled = none;
    this.#open.disabled = none;
  }

  async refresh() {
    if (this.table.rows.length === 0) {
      this.table.loading = true;
    }
    this.table.rows = await this.app.api.patients(this.search.value);
  }

  async #register() {
    const patient = await new PatientDialog(this.app).open();
    if (patient) {
      this.app.toaster.success(`Registered ${patient.fullName}`, `Patient ID ${patient.id}`);
      await this.safeRefresh();
      this.table.select(patient.id);
    }
  }

  async #editSelected() {
    const selected = this.table.selected;
    if (!selected) return;
    const updated = await new PatientDialog(this.app, selected).open();
    if (updated) {
      this.app.toaster.success(`Saved ${updated.fullName}`);
      await this.safeRefresh();
    }
  }

  #openSelected() {
    const selected = this.table.selected;
    if (selected) this.app.router.go(`/patients/${encodeURIComponent(selected.id)}`);
  }

  async #deleteSelected() {
    const p = this.table.selected;
    if (!p) return;
    const ok = await new ConfirmDialog({
      title: `Delete ${p.fullName}?`,
      message: `${p.id} will be removed permanently. Patients with appointment history cannot be deleted.`,
      confirmLabel: 'Delete patient',
      danger: true,
    }).open();
    if (!ok) return;
    try {
      await this.app.api.deletePatient(p.id);
      this.app.toaster.success(`Deleted ${p.fullName}`);
      await this.safeRefresh();
    } catch (err) {
      this.app.toaster.error('Cannot delete this patient', /** @type {Error} */ (err).message);
    }
  }
}
