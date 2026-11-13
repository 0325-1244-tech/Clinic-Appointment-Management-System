// @ts-check
import { Patient, PatientMapper, StaffFactory, StaffMapper } from '/domain/index.js';
import { h } from '../../core/dom.js';
import { FormDialog } from './FormDialog.js';

/** @typedef {import('../../App.js').App} App */
/** @typedef {import('/domain/MedicalStaff.js').MedicalStaff} MedicalStaff */

/**
 * Register or edit a patient (Java: PatientDialog).
 *
 * Before anything is sent, the form builds a real Patient object in the
 * browser; its setters run the same validation as on the server, so mistakes
 * show up instantly next to the right field.
 *
 * @extends {FormDialog<Patient>}
 */
export class PatientDialog extends FormDialog {
  #app;
  #patient;

  /** @param {App} app @param {Patient} [patient] edit this patient */
  constructor(app, patient) {
    super();
    this.#app = app;
    this.#patient = patient;
  }

  get title() {
    return this.#patient ? `Edit ${this.#patient.fullName}` : 'Register patient';
  }

  get description() {
    return this.#patient ? `Patient ID ${this.#patient.id}` : `New patient ID will be assigned automatically.`;
  }

  get saveLabel() {
    return this.#patient ? 'Save changes' : 'Register patient';
  }

  buildFields() {
    const p = this.#patient;
    const opts = this.#app.config.options;
    const text = (/** @type {string} */ value, /** @type {Record<string, string>} */ extra = {}) =>
      h('input', { class: 'input', type: 'text', value, ...extra });
    const select = (/** @type {readonly string[]} */ options, /** @type {string} */ selected, /** @type {string} */ placeholder) =>
      h('select', { class: 'select' },
        placeholder ? h('option', { value: '' }, placeholder) : null,
        options.map((o) => h('option', { value: o, selected: o === selected }, o)));
    return h('div', { class: 'form-grid' },
      this.field({ name: 'firstName', label: 'First name', required: true, control: text(p?.firstName ?? '', { autocomplete: 'off', maxlength: '80' }) }),
      this.field({ name: 'lastName', label: 'Last name', required: true, control: text(p?.lastName ?? '', { autocomplete: 'off', maxlength: '80' }) }),
      this.field({
        name: 'contactNumber', label: 'Contact number', required: true, hint: 'PH mobile, e.g. 0917 123 4567',
        control: text(p?.contactNumber ?? '', { inputmode: 'tel', maxlength: '20' }),
      }),
      this.field({ name: 'email', label: 'Email', hint: 'Optional', control: h('input', { class: 'input', type: 'email', value: p?.email ?? '', maxlength: '120' }) }),
      this.field({
        name: 'birthDate', label: 'Birth date', required: true,
        control: h('input', { class: 'input', type: 'date', value: p?.birthDate.toString() ?? '', max: this.#app.today().toString() }),
      }),
      this.field({ name: 'gender', label: 'Gender', required: true, control: select(opts.genders, p?.gender ?? '', 'Select…') }),
      this.field({ name: 'bloodType', label: 'Blood type', control: select(opts.bloodTypes, p?.bloodType ?? 'Unknown', '') }),
      this.field({ name: 'address', label: 'Address', required: true, wide: true, control: text(p?.address ?? '', { maxlength: '250' }) }));
  }

  async onSave() {
    const input = {
      firstName: this.value('firstName'), lastName: this.value('lastName'), contactNumber: this.value('contactNumber'),
      email: this.value('email'), birthDate: this.value('birthDate'), gender: this.value('gender'),
      address: this.value('address'), bloodType: this.value('bloodType'),
    };
    // Same rules as the server, checked here first by the shared domain class.
    const candidate = new Patient({ id: this.#patient?.id ?? 'P-NEW', ...input });
    const record = { ...new PatientMapper().toRecord(candidate) };
    const { id: _id, ...body } = record;
    return this.#patient ? this.#app.api.updatePatient(this.#patient.id, body) : this.#app.api.createPatient(body);
  }
}

/**
 * Add or edit a staff member (Java: StaffDialog). The role decides which
 * subclass the factory builds; it cannot change after creation.
 *
 * @extends {FormDialog<MedicalStaff>}
 */
export class StaffDialog extends FormDialog {
  #app;
  #staff;
  /** @type {HTMLSelectElement | null} */
  #role = null;
  /** @type {HTMLDataListElement | null} */
  #areas = null;
  /** @type {HTMLElement | null} */
  #areaLabel = null;

  /** @param {App} app @param {MedicalStaff} [staff] */
  constructor(app, staff) {
    super();
    this.#app = app;
    this.#staff = staff;
  }

  get title() {
    return this.#staff ? `Edit ${this.#staff.getDisplayName()}` : 'Add medical staff';
  }

  get description() {
    return this.#staff ? `${this.#staff.getRole()} · ${this.#staff.id}` : 'Doctors, dentists and nurses each have their own fee and appointment length.';
  }

  get saveLabel() {
    return this.#staff ? 'Save changes' : 'Add staff';
  }

  buildFields() {
    const s = this.#staff;
    const role = s?.getRole() ?? 'Doctor';
    this.#role = h('select', { class: 'select', disabled: Boolean(s), onchange: () => this.#updateAreas() },
      StaffFactory.ROLES.map((r) => h('option', { value: r, selected: r === role }, r)));
    this.#areas = h('datalist', { id: `${this.id}-areas` });
    const times = [];
    for (let m = 6 * 60; m <= 22 * 60; m += 30) {
      times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    const timeSelect = (/** @type {string} */ selected) => h('select', { class: 'select' },
      times.map((t) => h('option', { value: t, selected: t === selected }, this.#app.formatTime(t))));
    const days = h('div', { class: 'day-picker', role: 'group' }, this.#app.config.options.days.map((/** @type {any} */ d) =>
      h('label', { class: 'day-toggle' },
        h('input', { type: 'checkbox', name: 'day', value: d.code, checked: s ? s.workingDays.some((w) => w.code === d.code) : d.code !== 'SUNDAY', 'aria-label': d.label }),
        h('span', { 'aria-hidden': 'true' }, d.short))));
    const area = h('input', { class: 'input', type: 'text', list: `${this.id}-areas`, value: s?.serviceArea ?? '', maxlength: '80' });
    const fields = h('div', { class: 'form-grid' },
      this.field({ name: 'role', label: 'Role', required: true, control: this.#role, hint: s ? 'The role cannot change after creation.' : undefined }),
      this.field({ name: 'serviceArea', label: 'Specialization', required: true, control: area, hint: 'Pick a suggestion or type a new value.' }),
      this.field({ name: 'firstName', label: 'First name', required: true, control: h('input', { class: 'input', value: s?.firstName ?? '', maxlength: '80' }) }),
      this.field({ name: 'lastName', label: 'Last name', required: true, control: h('input', { class: 'input', value: s?.lastName ?? '', maxlength: '80' }) }),
      this.field({ name: 'contactNumber', label: 'Contact number', required: true, control: h('input', { class: 'input', inputmode: 'tel', value: s?.contactNumber ?? '', maxlength: '20' }) }),
      this.field({ name: 'email', label: 'Email', control: h('input', { class: 'input', type: 'email', value: s?.email ?? '', maxlength: '120' }) }),
      this.field({ name: 'licenseNumber', label: 'PRC license number', required: true, wide: true, control: h('input', { class: 'input', value: s?.licenseNumber ?? '', maxlength: '40' }) }),
      this.field({ name: 'workingDays', label: 'Working days', required: true, wide: true, control: days }),
      this.field({ name: 'shiftStart', label: 'Shift start', required: true, control: timeSelect(s?.shiftStart.toString() ?? '08:00') }),
      this.field({ name: 'shiftEnd', label: 'Shift end', required: true, control: timeSelect(s?.shiftEnd.toString() ?? '17:00') }),
      this.#areas);
    this.#areaLabel = /** @type {HTMLElement} */ (fields.querySelector(`label[for="${this.id}-serviceArea"]`));
    this.#updateAreas();
    return fields;
  }

  #updateAreas() {
    const role = this.#role?.value ?? 'Doctor';
    this.#areas?.replaceChildren(...StaffFactory.serviceAreaOptions(role).map((o) => h('option', { value: o })));
    if (this.#areaLabel) {
      this.#areaLabel.replaceChildren(StaffFactory.serviceAreaLabel(role), h('span', { class: 'req', 'aria-hidden': 'true' }, ' *'));
    }
  }

  async onSave() {
    const role = this.#role?.value ?? 'Doctor';
    const workingDays = [...this.element.querySelectorAll('input[name="day"]:checked')].map((el) => /** @type {HTMLInputElement} */ (el).value);
    const input = {
      firstName: this.value('firstName'), lastName: this.value('lastName'), contactNumber: this.value('contactNumber'),
      email: this.value('email'), licenseNumber: this.value('licenseNumber'), serviceArea: this.value('serviceArea'),
      workingDays, shiftStart: this.value('shiftStart'), shiftEnd: this.value('shiftEnd'),
    };
    // The factory builds the right subclass in the browser, so its validation runs before sending.
    const candidate = StaffFactory.create(role, { id: this.#staff?.id ?? 'S-NEW', ...input });
    const { id: _id, active: _active, role: _role, ...body } = new StaffMapper().toRecord(candidate);
    return this.#staff
      ? this.#app.api.updateStaff(this.#staff.id, body)
      : this.#app.api.createStaff({ role, ...body });
  }
}
