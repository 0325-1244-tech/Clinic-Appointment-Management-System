// @ts-check
import { Appointment, AppointmentType, CalendarDate } from '/domain/index.js';
import { h, icon, peso } from '../../core/dom.js';
import { BaseDialog } from './BaseDialog.js';
import { FormDialog } from './FormDialog.js';

/** @typedef {import('../../App.js').App} App */
/** @typedef {import('/domain/Patient.js').Patient} Patient */
/** @typedef {import('/domain/MedicalStaff.js').MedicalStaff} MedicalStaff */

/**
 * Book a new appointment, or reschedule an existing one (Java: AppointmentDialog).
 * Only the open slots of the chosen staff member and date are offered, and
 * the fee estimate comes from the staff member's own (overridden) fee.
 *
 * @extends {FormDialog<Appointment>}
 */
export class AppointmentDialog extends FormDialog {
  #app;
  #existing;
  #defaults;
  /** @type {Patient[]} */
  #patients = [];
  /** @type {MedicalStaff[]} */
  #staff = [];
  #slotGrid = h('div', { class: 'slot-grid', role: 'radiogroup' });
  #slotStatus = h('p', { class: 'muted small', 'aria-live': 'polite' });
  #fee = h('div', { class: 'fee-preview', 'aria-live': 'polite' });
  /** @type {string} */
  #time = '';
  #loadToken = 0;

  /**
   * @param {App} app
   * @param {{ appointment?: Appointment, patientId?: string, staffId?: string, date?: string, time?: string }} [options]
   */
  constructor(app, { appointment, ...defaults } = {}) {
    super();
    this.#app = app;
    this.#existing = appointment;
    this.#defaults = defaults;
    this.#time = appointment?.time.toString() ?? defaults.time ?? '';
  }

  get title() {
    return this.#existing ? `Reschedule ${this.#existing.id}` : 'Book appointment';
  }

  get description() {
    return this.#existing
      ? `${this.#existing.patient.fullName} with ${this.#existing.staff.getDisplayName()}`
      : 'Only open time slots are shown. Double booking is not possible.';
  }

  get saveLabel() {
    return this.#existing ? 'Reschedule' : 'Book appointment';
  }

  /** Loads the patient and staff lists, then opens. */
  async load() {
    if (!this.#existing) {
      [this.#patients, this.#staff] = await Promise.all([this.#app.api.patients(), this.#app.api.staff({ active: true })]);
    }
    return this.open();
  }

  buildFields() {
    const e = this.#existing;
    const today = this.#app.today().toString();
    const patient = e
      ? h('input', { class: 'input', value: `${e.patient.fullName} (${e.patient.id})`, disabled: true })
      : h('select', { class: 'select' }, h('option', { value: '' }, 'Select a patient…'),
        this.#patients.map((p) => h('option', { value: p.id, selected: p.id === this.#defaults.patientId }, `${p.fullName} · ${p.id}`)));
    const staff = e
      ? h('input', { class: 'input', value: `${e.staff.getDisplayName()} · ${e.staff.getRole()}`, disabled: true })
      : h('select', { class: 'select', onchange: () => this.#refresh() }, h('option', { value: '' }, 'Select staff…'),
        this.#staff.map((s) => h('option', { value: s.id, selected: s.id === this.#defaults.staffId },
          `${s.getDisplayName()} · ${s.getRole()} (${s.serviceArea})`)));
    const date = h('input', {
      class: 'input', type: 'date', min: today, value: e?.date.toString() ?? this.#defaults.date ?? today, onchange: () => this.#refresh(),
    });
    const type = e
      ? h('input', { class: 'input', value: e.type.label, disabled: true })
      : h('select', { class: 'select', onchange: () => this.#updateFee() },
        AppointmentType.values().map((t) => h('option', { value: t.code }, `${t.label} (×${t.feeMultiplier.toFixed(2)})`)));
    const reason = e
      ? h('input', { class: 'input', value: e.reason, disabled: true })
      : h('textarea', { class: 'textarea', rows: '2', maxlength: '500', placeholder: 'e.g. Fever and cough for 3 days' });
    queueMicrotask(() => this.#refresh());
    return h('div', { class: 'form-grid' },
      this.field({ name: 'patientId', label: 'Patient', required: true, control: patient }),
      this.field({ name: 'staffId', label: 'Attending staff', required: true, control: staff }),
      this.field({ name: 'date', label: 'Date', required: true, control: date }),
      this.field({ name: 'type', label: 'Appointment type', required: true, control: type }),
      this.field({ name: 'time', label: 'Available time slots', required: true, wide: true, control: h('div', { role: 'group' }, this.#slotStatus, this.#slotGrid) }),
      this.field({ name: 'reason', label: 'Reason for visit', required: true, wide: true, control: reason }),
      h('div', { class: 'span-2' }, this.#fee));
  }

  /** @returns {MedicalStaff | undefined} */
  #selectedStaff() {
    return this.#existing?.staff ?? this.#staff.find((s) => s.id === this.value('staffId'));
  }

  async #refresh() {
    this.#updateFee();
    const staff = this.#selectedStaff();
    const date = this.value('date');
    const token = ++this.#loadToken;
    this.#slotGrid.replaceChildren();
    if (!staff || !date) {
      this.#slotStatus.textContent = 'Choose the staff member and date to see open slots.';
      return;
    }
    let parsed;
    try {
      parsed = CalendarDate.parse(date);
    } catch {
      this.#slotStatus.textContent = 'Enter a valid date.';
      return;
    }
    if (!staff.isAvailableOn(parsed)) {
      this.#slotStatus.textContent = `${staff.getDisplayName()} does not work on ${parsed.dayOfWeek.label}s. Working days: ${staff.getWorkingDaysText()}.`;
      return;
    }
    this.#slotStatus.textContent = 'Loading open slots…';
    const slots = await this.#app.api.slots(staff.id, date, this.#existing?.id);
    if (token !== this.#loadToken) {
      return;
    }
    if (!slots.includes(this.#time)) {
      this.#time = '';
    }
    this.#slotStatus.textContent = slots.length === 0
      ? 'No open slots on this date. Try another date.'
      : `${slots.length} open ${slots.length === 1 ? 'slot' : 'slots'} · ${staff.getSlotDurationMinutes()} minutes each`;
    this.#slotGrid.replaceChildren(...slots.map((slot, i) => h('button', {
      type: 'button', class: 'slot', role: 'radio', 'aria-checked': String(slot === this.#time),
      tabindex: slot === this.#time || (!this.#time && i === 0) ? '0' : '-1',
      onclick: () => this.#pick(slot),
      onkeydown: (/** @type {KeyboardEvent} */ ev) => this.#slotKeys(ev, slots, i),
    }, this.#app.formatTime(slot))));
  }

  /** @param {string} slot */
  #pick(slot) {
    this.#time = slot;
    for (const b of this.#slotGrid.querySelectorAll('.slot')) {
      const on = b.textContent === this.#app.formatTime(slot);
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('tabindex', on ? '0' : '-1');
    }
  }

  /** Arrow keys move between slots (radio group pattern). @param {KeyboardEvent} e @param {string[]} slots @param {number} i */
  #slotKeys(e, slots, i) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      const next = (i + step + slots.length) % slots.length;
      this.#pick(slots[next]);
      /** @type {HTMLElement} */ (this.#slotGrid.children[next]).focus();
    }
  }

  #updateFee() {
    const staff = this.#selectedStaff();
    const type = this.#existing?.type ?? AppointmentType.from(this.value('type') || 'CONSULTATION');
    if (!staff) {
      this.#fee.replaceChildren(h('span', { class: 'muted' }, 'Estimated fee'), h('strong', null, '—'));
      return;
    }
    // POLYMORPHISM: estimateFee() calls the staff member's own getConsultationFee().
    const fee = Appointment.estimateFee(staff, type);
    this.#fee.replaceChildren(
      h('span', { class: 'muted' }, `Estimated fee · ${staff.getRole()} ${peso(staff.getConsultationFee())} × ${type.feeMultiplier.toFixed(2)}`),
      h('strong', { class: 'num' }, peso(fee)));
  }

  async onSave() {
    if (!this.#time) {
      throw Object.assign(new Error('Please select a date and an available time slot.'), { field: 'time' });
    }
    if (this.#existing) {
      return this.#app.api.act(this.#existing.id, 'reschedule', { date: this.value('date'), time: this.#time });
    }
    return this.#app.api.book({
      patientId: this.value('patientId'), staffId: this.value('staffId'), date: this.value('date'),
      time: this.#time, type: this.value('type'), reason: this.value('reason'),
    });
  }
}

/**
 * Full details of an appointment (Java: the double-click details window),
 * with the actions the user may take and a printable appointment slip.
 *
 * @extends {BaseDialog<string>}
 */
export class AppointmentDetailsDialog extends BaseDialog {
  #app;
  #a;

  /** @param {App} app @param {Appointment} appointment */
  constructor(app, appointment) {
    super();
    this.#app = app;
    this.#a = appointment;
  }

  get title() {
    return `Appointment ${this.#a.id}`;
  }

  get description() {
    return this.#a.isActive() ? 'Appointment slip' : 'Visit summary';
  }

  buildBody() {
    const a = this.#a;
    const s = a.staff;
    const row = (/** @type {string} */ label, /** @type {import('../../core/dom.js').Child} */ value) => [h('dt', null, label), h('dd', null, value)];
    return h('div', { class: 'slip' },
      h('div', { class: 'print-only' }, h('h2', null, 'CareConnect Clinic'), h('p', { class: 'muted' }, this.description), h('hr')),
      h('dl', { class: 'summary-list' },
        row('Status', h('span', { class: `pill pill-${a.status.code}` }, a.status.label)),
        row('Patient', `${a.patient.fullName} (${a.patient.id})`),
        row('Attending staff', `${s.getDisplayName()} · ${s.getRole()} (${s.serviceArea})`),
        row('Date', a.date.formatLong()),
        row('Time', `${a.time.format12h()} – ${a.getEndTime().format12h()}`),
        row('Type', a.type.label),
        row('Reason for visit', a.reason),
        row('Fee', h('span', { class: 'num' }, peso(a.computeFee()))),
        row(a.status.code === 'COMPLETED' ? 'Findings' : 'Remarks', a.remarks || '—')),
      h('p', { class: 'print-only muted small' }, `Printed ${new Date().toLocaleString('en-PH')}. Please arrive 10 minutes early.`));
  }

  buildFooter() {
    const a = this.#a;
    const can = (/** @type {string} */ p) => this.#app.can(p) && (!this.#app.staffScope || a.staff.id === this.#app.staffScope);
    const action = (/** @type {string} */ label, /** @type {string} */ value, /** @type {string} */ cls) =>
      h('button', { class: ['btn', cls], type: 'button', onclick: () => this.close(value) }, label);
    return [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => this.print() }, icon('print'), 'Print'),
      h('span', { style: { flex: '1' } }),
      a.isActive() && can('appointments:manage') ? action('No-show', 'no-show', 'btn-secondary') : null,
      a.isActive() && can('appointments:manage') ? action('Cancel', 'cancel', 'btn-danger') : null,
      a.isActive() && can('appointments:manage') ? action('Reschedule', 'reschedule', 'btn-secondary') : null,
      a.isActive() && can('appointments:complete') ? action('Complete', 'complete', 'btn-success') : null,
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.close() }, 'Close'),
    ];
  }
}
