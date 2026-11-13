// @ts-check
import { AppointmentStatus } from './AppointmentStatus.js';
import { AppointmentType } from './AppointmentType.js';
import { Billable, Identifiable, Searchable } from './contracts.js';
import { InvalidStateError, ValidationError } from './errors.js';
import { MedicalStaff } from './MedicalStaff.js';
import { Patient } from './Patient.js';
import { formatPeso, normalizeKeyword, requireText } from './text.js';
import { CalendarDate } from './time/CalendarDate.js';
import { TimeOfDay } from './time/TimeOfDay.js';

/**
 * @typedef {object} AppointmentProps
 * @property {string} id
 * @property {Patient} patient
 * @property {MedicalStaff} staff
 * @property {CalendarDate | string} date
 * @property {TimeOfDay | string} time
 * @property {AppointmentType | string} type
 * @property {string} reason
 */

/**
 * @typedef {object} SavedState  extra state restored from storage
 * @property {AppointmentStatus | string} status
 * @property {string} [remarks]
 * @property {string} [createdAt] ISO timestamp
 */

/**
 * An appointment links one Patient with one MedicalStaff member (ASSOCIATION).
 *
 * ENCAPSULATION: there is no status setter. The status only changes through
 * complete(), cancel(), markNoShow() and reschedule(), and those methods
 * enforce the rule that only a SCHEDULED appointment can change.
 *
 * Implements: Identifiable, Billable, Searchable.
 */
export class Appointment {
  static implements = Object.freeze([Identifiable, Billable, Searchable]);

  #id;
  #patient;
  #staff;
  #type;
  #reason;
  #createdAt;
  /** @type {CalendarDate} */
  #date;
  /** @type {TimeOfDay} */
  #time;
  #status = AppointmentStatus.SCHEDULED;
  #remarks = '';

  /** @param {AppointmentProps} props */
  constructor({ id, patient, staff, date, time, type, reason }) {
    if (!(patient instanceof Patient) || !(staff instanceof MedicalStaff) || !date || !time || !type) {
      throw new ValidationError('Patient, staff, date, time and type are required.');
    }
    this.#id = requireText(id, 'ID');
    this.#patient = patient;
    this.#staff = staff;
    this.#date = CalendarDate.parse(date);
    this.#time = TimeOfDay.parse(time);
    this.#type = AppointmentType.from(type);
    this.#reason = requireText(reason, 'Reason for visit', 'reason');
    this.#createdAt = new Date().toISOString();
  }

  /**
   * Rebuilds an appointment loaded from storage, including its saved status.
   * Only this static method can set the status directly, because a stored
   * record already went through the state-change rules when it was saved.
   *
   * @param {AppointmentProps} props
   * @param {SavedState} saved
   */
  static restore(props, { status, remarks = '', createdAt }) {
    const appointment = new Appointment(props);
    appointment.#status = AppointmentStatus.from(status);
    appointment.#remarks = remarks;
    if (createdAt) {
      appointment.#createdAt = createdAt;
    }
    return appointment;
  }

  /**
   * Fee estimate before an appointment exists. Uses the staff member's overridden fee (POLYMORPHISM).
   *
   * @param {MedicalStaff} staff
   * @param {AppointmentType | string} type
   */
  static estimateFee(staff, type) {
    return roundCentavos(staff.getConsultationFee() * AppointmentType.from(type).feeMultiplier);
  }

  /** Billable: base fee x type multiplier; nothing is charged for a cancellation or no-show. */
  computeFee() {
    return this.#status.isBillable ? Appointment.estimateFee(this.#staff, this.#type) : 0;
  }

  // ---- State changes (the only way to modify an appointment) ----

  /**
   * @param {CalendarDate | string} newDate
   * @param {TimeOfDay | string} newTime
   */
  reschedule(newDate, newTime) {
    this.#ensureScheduled('rescheduled');
    if (!newDate || !newTime) {
      throw new ValidationError('New date and time are required.');
    }
    this.#date = CalendarDate.parse(newDate);
    this.#time = TimeOfDay.parse(newTime);
  }

  /** @param {string} findings */
  complete(findings) {
    this.#ensureScheduled('completed');
    if (typeof findings !== 'string' || findings.trim() === '') {
      throw new ValidationError('Please enter the findings or notes for this visit.', { field: 'findings' });
    }
    this.#status = AppointmentStatus.COMPLETED;
    this.#remarks = findings.trim();
  }

  /** @param {string} cancelReason */
  cancel(cancelReason) {
    this.#ensureScheduled('cancelled');
    if (typeof cancelReason !== 'string' || cancelReason.trim() === '') {
      throw new ValidationError('Please enter a reason for cancelling.', { field: 'reason' });
    }
    this.#status = AppointmentStatus.CANCELLED;
    this.#remarks = `Cancelled: ${cancelReason.trim()}`;
  }

  markNoShow() {
    this.#ensureScheduled('marked as no-show');
    this.#status = AppointmentStatus.NO_SHOW;
    this.#remarks = 'Patient did not arrive.';
  }

  /** @param {string} action */
  #ensureScheduled(action) {
    if (this.#status !== AppointmentStatus.SCHEDULED) {
      throw new InvalidStateError(
        `Only scheduled appointments can be ${action}. Appointment ${this.#id} is already ${this.#status.label}.`,
      );
    }
  }

  // ---- Queries ----

  /** True while the appointment is still scheduled. */
  isActive() {
    return this.#status === AppointmentStatus.SCHEDULED;
  }

  getEndTime() {
    return this.#time.plusMinutes(this.#staff.getSlotDurationMinutes());
  }

  /**
   * True if this appointment overlaps the given time window on the given date.
   *
   * @param {CalendarDate} otherDate
   * @param {TimeOfDay} start
   * @param {TimeOfDay} end
   */
  overlapsWith(otherDate, start, end) {
    return this.#date.equals(otherDate) && this.#time.isBefore(end) && start.isBefore(this.getEndTime());
  }

  /**
   * Orders appointments by date, then time.
   *
   * @param {Appointment} other
   */
  compareTo(other) {
    return this.#date.compareTo(other.#date) || this.#time.compareTo(other.#time) || this.#id.localeCompare(other.#id);
  }

  /** Multi-line summary, same layout as the Java version's details window. */
  getSummary() {
    const s = this.#staff;
    return [
      `Appointment ID:   ${this.#id}`,
      `Status:           ${this.#status.label}`,
      `Patient:          ${this.#patient.fullName} (${this.#patient.id})`,
      `Attending Staff:  ${s.getDisplayName()} - ${s.getRole()} (${s.serviceArea})`,
      `Date:             ${this.#date.formatLong()}`,
      `Time:             ${this.#time.format12h()} - ${this.getEndTime().format12h()}`,
      `Type:             ${this.#type.label}`,
      `Reason for Visit: ${this.#reason}`,
      `Fee:              ${formatPeso(this.computeFee())}`,
      `Remarks:          ${this.#remarks === '' ? '-' : this.#remarks}`,
    ].join('\n');
  }

  /**
   * Searchable: ID, patient name or ID, staff name, reason or type.
   *
   * @param {string} [keyword]
   */
  matches(keyword) {
    const k = normalizeKeyword(keyword);
    if (k === '') {
      return true;
    }
    return [this.#id, this.#patient.fullName, this.#patient.id, this.#staff.getDisplayName(), this.#reason, this.#type.label]
      .some((field) => field.toLowerCase().includes(k));
  }

  get id() {
    return this.#id;
  }

  get patient() {
    return this.#patient;
  }

  get staff() {
    return this.#staff;
  }

  get date() {
    return this.#date;
  }

  get time() {
    return this.#time;
  }

  get type() {
    return this.#type;
  }

  get reason() {
    return this.#reason;
  }

  /** Read-only: change it with complete(), cancel(), markNoShow(). */
  get status() {
    return this.#status;
  }

  get remarks() {
    return this.#remarks;
  }

  get createdAt() {
    return this.#createdAt;
  }

  toString() {
    return `${this.#id} - ${this.#patient.fullName} with ${this.#staff.getDisplayName()}`;
  }
}

/** @param {number} amount */
function roundCentavos(amount) {
  return Math.round(amount * 100) / 100;
}
