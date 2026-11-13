// @ts-check
import { abstractClass, abstractMethod } from './contracts.js';
import { ValidationError } from './errors.js';
import { Person } from './Person.js';
import { formatPeso, normalizeKeyword, requireText } from './text.js';
import { CalendarDate } from './time/CalendarDate.js';
import { DayOfWeek } from './time/DayOfWeek.js';
import { TimeOfDay } from './time/TimeOfDay.js';

/**
 * @typedef {import('./Person.js').PersonProps & {
 *   licenseNumber: string,
 *   serviceArea: string,
 *   workingDays: Iterable<DayOfWeek | string>,
 *   shiftStart: TimeOfDay | string,
 *   shiftEnd: TimeOfDay | string,
 *   active?: boolean,
 * }} StaffProps
 */

/**
 * ABSTRACTION + INHERITANCE: the shared blueprint for every kind of medical
 * personnel. It handles the work schedule; the subclasses (Doctor, Dentist,
 * Nurse) decide their own fee, appointment length and service area.
 *
 * POLYMORPHISM: the rest of the system works with MedicalStaff references, and
 * the right overridden method runs for each concrete type at runtime.
 */
export class MedicalStaff extends Person {
  /** @type {string} */
  #licenseNumber = '';
  /** @type {Set<DayOfWeek>} */
  #workingDays = new Set();
  /** @type {TimeOfDay} */
  #shiftStart;
  /** @type {TimeOfDay} */
  #shiftEnd;
  #active = true;

  /** @param {StaffProps} props */
  constructor(props) {
    if (new.target === MedicalStaff) {
      throw abstractClass('MedicalStaff');
    }
    super(props);
    this.licenseNumber = props.licenseNumber;
    this.workingDays = props.workingDays;
    this.setShift(props.shiftStart, props.shiftEnd);
    this.#active = props.active ?? true;
  }

  // ---- Abstract members: every subclass MUST provide its own version ----

  /**
   * Base consultation fee for this kind of staff, in pesos.
   *
   * @abstract
   * @returns {number}
   */
  getConsultationFee() {
    throw abstractMethod(this, 'getConsultationFee');
  }

  /**
   * How long one appointment slot lasts, in minutes.
   *
   * @abstract
   * @returns {number}
   */
  getSlotDurationMinutes() {
    throw abstractMethod(this, 'getSlotDurationMinutes');
  }

  /**
   * Label of the service area field, e.g. "Specialization" or "Department".
   *
   * @abstract
   * @returns {string}
   */
  getServiceAreaLabel() {
    throw abstractMethod(this, 'getServiceAreaLabel');
  }

  /**
   * The specialization, dental room or department.
   *
   * @abstract
   * @returns {string}
   */
  get serviceArea() {
    throw abstractMethod(this, 'serviceArea');
  }

  /** @abstract @param {string} _value */
  set serviceArea(_value) {
    throw abstractMethod(this, 'serviceArea');
  }

  // ---- Shared behaviour ----

  /** Name as shown to patients. Subclasses override this to add titles like "Dr." or "RN". */
  getDisplayName() {
    return this.fullName;
  }

  get licenseNumber() {
    return this.#licenseNumber;
  }

  set licenseNumber(value) {
    this.#licenseNumber = requireText(value, 'License number', 'licenseNumber');
  }

  /** A sorted, frozen copy, so outside code cannot change the schedule directly. */
  get workingDays() {
    return Object.freeze([...this.#workingDays].sort((a, b) => a.number - b.number));
  }

  /** @param {Iterable<DayOfWeek | string>} days at least one */
  set workingDays(days) {
    const set = new Set([...(days ?? [])].map((d) => DayOfWeek.from(d)));
    if (set.size === 0) {
      throw new ValidationError('Select at least one working day.', { field: 'workingDays' });
    }
    this.#workingDays = set;
  }

  get shiftStart() {
    return this.#shiftStart;
  }

  get shiftEnd() {
    return this.#shiftEnd;
  }

  /**
   * Sets both ends of the shift together, because each one is validated against the other.
   *
   * @param {TimeOfDay | string} start
   * @param {TimeOfDay | string} end
   */
  setShift(start, end) {
    if (!start || !end) {
      throw new ValidationError('Shift start and end are required.', { field: 'shiftStart' });
    }
    const from = TimeOfDay.parse(start);
    const to = TimeOfDay.parse(end);
    if (!to.isAfter(from)) {
      throw new ValidationError('Shift end must be later than shift start.', { field: 'shiftEnd' });
    }
    if (from.minutesUntil(to) < this.getSlotDurationMinutes()) {
      throw new ValidationError(`Shift must be at least ${this.getSlotDurationMinutes()} minutes long.`, {
        field: 'shiftEnd',
      });
    }
    this.#shiftStart = from;
    this.#shiftEnd = to;
  }

  get active() {
    return this.#active;
  }

  /**
   * Deactivation rules (no scheduled appointments) live in ClinicService,
   * which is the only caller.
   */
  set active(value) {
    this.#active = Boolean(value);
  }

  /** @param {CalendarDate | null | undefined} date */
  isAvailableOn(date) {
    return this.#active && date instanceof CalendarDate && this.#workingDays.has(date.dayOfWeek);
  }

  /** @param {DayOfWeek} day */
  worksOn(day) {
    return this.#workingDays.has(day);
  }

  /** Every appointment start time within the shift, based on this staff member's slot length. */
  getTimeSlots() {
    const slot = this.getSlotDurationMinutes();
    const count = Math.floor(this.#shiftStart.minutesUntil(this.#shiftEnd) / slot);
    return Array.from({ length: count }, (_, i) => this.#shiftStart.plusMinutes(i * slot));
  }

  /** @param {TimeOfDay} time */
  isValidSlot(time) {
    return this.getTimeSlots().some((slot) => slot.equals(time));
  }

  getWorkingDaysText() {
    return DayOfWeek.describe(this.#workingDays);
  }

  getShiftText() {
    return `${this.#shiftStart.format12h()} - ${this.#shiftEnd.format12h()}`;
  }

  /** @override */
  getDetails() {
    return `${this.getDisplayName()} | ${this.getRole()} | ${this.getServiceAreaLabel()}: ${this.serviceArea} | ` +
      `Fee: ${formatPeso(this.getConsultationFee())} | ${this.getSlotDurationMinutes()}-min slots | ` +
      `${this.getWorkingDaysText()}, ${this.getShiftText()}`;
  }

  /**
   * Also searches the role, service area and license number.
   *
   * @override
   * @param {string} [keyword]
   */
  matches(keyword) {
    if (super.matches(keyword)) {
      return true;
    }
    const k = normalizeKeyword(keyword);
    return (
      this.getRole().toLowerCase().includes(k) ||
      this.serviceArea.toLowerCase().includes(k) ||
      this.#licenseNumber.toLowerCase().includes(k)
    );
  }

  toString() {
    return `${this.getDisplayName()} - ${this.getRole()} (${this.serviceArea})`;
  }
}
