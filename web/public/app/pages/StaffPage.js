// @ts-check
import { StaffFactory } from '/domain/index.js';
import { ConfirmDialog } from '../components/dialogs/BaseDialog.js';
import { StaffDialog } from '../components/dialogs/EntityDialogs.js';
import { h, icon, peso } from '../core/dom.js';
import { ListPage } from './ListPage.js';

/** @typedef {import('/domain/MedicalStaff.js').MedicalStaff} MedicalStaff */

/**
 * Doctors, dentists and nurses (Java: StaffPanel). Every row calls the same
 * methods (getDisplayName, getConsultationFee, getSlotDurationMinutes) and each
 * subclass answers with its own values: POLYMORPHISM on screen.
 */
export class StaffPage extends ListPage {
  #role = h('select', { class: 'select', 'aria-label': 'Filter by role', onchange: () => this.safeRefresh() },
    h('option', { value: '' }, 'All roles'), StaffFactory.ROLES.map((r) => h('option', { value: r }, `${r}s`)));
  #details = h('p', { class: 'muted small', 'aria-live': 'polite' });
  #edit = h('button', { class: 'btn btn-secondary', type: 'button', disabled: true, onclick: () => this.#editSelected() }, icon('edit'), 'Edit');
  #toggle = h('button', { class: 'btn btn-secondary', type: 'button', disabled: true, onclick: () => this.#toggleSelected() }, 'Deactivate');
  #delete = h('button', { class: 'btn btn-danger', type: 'button', disabled: true, onclick: () => this.#deleteSelected() }, icon('trash'), 'Delete');

  /** @param {import('../App.js').App} app */
  constructor(app) {
    super(app);
    this.withPlaceholder('Search name, role, specialization or license');
    this.table.label = 'Medical staff';
    this.table.empty = { title: 'No staff found', message: 'Try a different search or role.' };
    this.table.columns = /** @type {import('../components/DataTable.js').Column<MedicalStaff>[]} */ ([
      { key: 'id', label: 'Staff ID', render: (s) => h('span', { class: 'mono' }, s.id), sortValue: (s) => s.id },
      { key: 'name', label: 'Name', primary: true, render: (s) => h('span', { class: 'cell-primary' }, s.getDisplayName()), sortValue: (s) => s.getDisplayName() },
      { key: 'role', label: 'Role', render: (s) => h('span', { class: `role-tag role-${s.getRole()}` }, s.getRole()), sortValue: (s) => s.getRole() },
      {
        key: 'area', label: 'Service area',
        render: (s) => h('span', null, s.serviceArea, h('span', { class: 'cell-sub' }, s.getServiceAreaLabel())), sortValue: (s) => s.serviceArea,
      },
      { key: 'fee', label: 'Base fee', align: 'right', render: (s) => h('span', { class: 'num' }, peso(s.getConsultationFee())), sortValue: (s) => s.getConsultationFee() },
      { key: 'slot', label: 'Slot', align: 'right', render: (s) => `${s.getSlotDurationMinutes()} min`, sortValue: (s) => s.getSlotDurationMinutes() },
      { key: 'days', label: 'Working days', render: (s) => s.getWorkingDaysText(), sortValue: (s) => s.getWorkingDaysText() },
      { key: 'shift', label: 'Shift', render: (s) => h('span', { class: 'num' }, s.getShiftText()), sortValue: (s) => s.shiftStart.totalMinutes, csv: (s) => s.getShiftText() },
      {
        key: 'status', label: 'Status',
        render: (s) => h('span', { class: `pill ${s.active ? 'pill-active' : 'pill-inactive'}` }, s.active ? 'Active' : 'Inactive'),
        sortValue: (s) => (s.active ? 'Active' : 'Inactive'),
      },
    ]);
    this.table.addEventListener('activate', () => {
      if (this.app.can('staff:write')) this.#editSelected();
    });
  }

  get title() {
    return 'Medical Staff';
  }

  get subtitle() {
    return 'Doctors (30-min slots), dentists (60-min) and nurses (15-min), with their schedules and fees.';
  }

  get navKey() {
    return '/staff';
  }

  get csvName() {
    return 'medical-staff.csv';
  }

  actions() {
    return this.app.can('staff:write')
      ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.#add() }, icon('plus'), 'Add staff')
      : null;
  }

  filters() {
    return this.#role;
  }

  rowActions() {
    return this.app.can('staff:write') ? [this.#edit, this.#toggle, this.#delete] : null;
  }

  /** @override */
  render() {
    const card = super.render();
    card.insertBefore(h('div', { class: 'toolbar' }, this.#details), this.table);
    this.#details.textContent = 'Select a staff member to see their details.';
    return card;
  }

  onSelectionChange() {
    const s = this.table.selected;
    this.#edit.disabled = !s;
    this.#toggle.disabled = !s;
    this.#delete.disabled = !s;
    this.#toggle.textContent = s && !s.active ? 'Activate' : 'Deactivate';
    // getDetails() is overridden per role (POLYMORPHISM), exactly like the Java details line.
    this.#details.textContent = s ? s.getDetails() : 'Select a staff member to see their details.';
  }

  async refresh() {
    if (this.table.rows.length === 0) {
      this.table.loading = true;
    }
    this.table.rows = await this.app.api.staff({ q: this.search.value, role: this.#role.value || undefined });
    this.onSelectionChange();
  }

  async #add() {
    const staff = await new StaffDialog(this.app).open();
    if (staff) {
      this.app.toaster.success(`Added ${staff.getDisplayName()}`, `${staff.getRole()} · ${staff.id}`);
      await this.safeRefresh();
      this.table.select(staff.id);
    }
  }

  async #editSelected() {
    const selected = this.table.selected;
    if (!selected) return;
    const updated = await new StaffDialog(this.app, selected).open();
    if (updated) {
      this.app.toaster.success(`Saved ${updated.getDisplayName()}`);
      await this.safeRefresh();
    }
  }

  async #toggleSelected() {
    const s = this.table.selected;
    if (!s) return;
    const activate = !s.active;
    const ok = await new ConfirmDialog({
      title: `${activate ? 'Activate' : 'Deactivate'} ${s.getDisplayName()}?`,
      message: activate
        ? 'They will appear in booking again.'
        : 'They will no longer appear in booking. Staff with scheduled appointments cannot be deactivated.',
      confirmLabel: activate ? 'Activate' : 'Deactivate',
      danger: !activate,
    }).open();
    if (!ok) return;
    try {
      await this.app.api.setStaffActive(s.id, activate);
      this.app.toaster.success(`${activate ? 'Activated' : 'Deactivated'} ${s.getDisplayName()}`);
      await this.safeRefresh();
    } catch (err) {
      this.app.toaster.error('Cannot change this account', /** @type {Error} */ (err).message);
    }
  }

  async #deleteSelected() {
    const s = this.table.selected;
    if (!s) return;
    const ok = await new ConfirmDialog({
      title: `Delete ${s.getDisplayName()}?`,
      message: 'This removes the staff member permanently. Staff with appointment records cannot be deleted; deactivate them instead.',
      confirmLabel: 'Delete staff member',
      danger: true,
    }).open();
    if (!ok) return;
    try {
      await this.app.api.deleteStaff(s.id);
      this.app.toaster.success(`Deleted ${s.getDisplayName()}`);
      await this.safeRefresh();
    } catch (err) {
      this.app.toaster.error('Cannot delete this staff member', /** @type {Error} */ (err).message);
    }
  }
}
