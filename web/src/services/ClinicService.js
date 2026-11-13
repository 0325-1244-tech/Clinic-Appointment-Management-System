// @ts-check
import { EventEmitter } from 'node:events';
import { Appointment } from '../domain/Appointment.js';
import { AppointmentStatus } from '../domain/AppointmentStatus.js';
import { AppointmentType } from '../domain/AppointmentType.js';
import { assertImplements, Billable } from '../domain/contracts.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { StaffMapper } from '../domain/mappers.js';
import { MedicalStaff } from '../domain/MedicalStaff.js';
import { Patient } from '../domain/Patient.js';
import { StaffFactory } from '../domain/StaffFactory.js';
import { normalizeKeyword } from '../domain/text.js';
import { CalendarDate } from '../domain/time/CalendarDate.js';
import { Clock } from '../domain/time/Clock.js';
/** @typedef {import('../domain/time/DayOfWeek.js').DayOfWeek} DayOfWeek */
import { TimeOfDay } from '../domain/time/TimeOfDay.js';

/**
 * @typedef {object} ChangeEvent  sent to listeners after every change (Observer pattern)
 * @property {string} action       e.g. "appointment.booked"
 * @property {'patient' | 'staff' | 'appointment'} entityType
 * @property {string} entityId
 * @property {string} summary      one line for the audit log
 */

/**
 * @typedef {object} AppointmentCriteria  combined filters for findAppointments({...})
 * @property {CalendarDate | string} [date]
 * @property {CalendarDate | string} [from]  inclusive
 * @property {CalendarDate | string} [to]    inclusive
 * @property {Patient | string} [patient]    object or ID
 * @property {MedicalStaff | string} [staff] object or ID
 * @property {AppointmentStatus | string} [status]
 * @property {string} [keyword]
 * @property {boolean} [closedOnly]           only completed, cancelled and no-show (the records)
 */

/** @typedef {Omit<import('../domain/Patient.js').PatientProps, 'id'>} PatientInput */
/** @typedef {Omit<import('../domain/MedicalStaff.js').StaffProps, 'id'>} StaffInput */

/**
 * The business-logic layer. The API talks only to this class, never to the
 * repositories directly, so rules such as "no double booking" live in one place.
 *
 * INHERITANCE: extends Node's EventEmitter, so other objects (the audit log and
 * the queue board) can subscribe to its "change" events (Observer pattern).
 */
export class ClinicService extends EventEmitter {
  #db;
  #clock;

  /**
   * @param {import('../repositories/ClinicDatabase.js').ClinicDatabase} database
   * @param {{ clock?: Clock }} [options]
   */
  constructor(database, { clock } = {}) {
    super();
    this.#db = database;
    this.#clock = clock ?? Clock.current();
  }

  get clock() {
    return this.#clock;
  }

  // =====================================================================
  //  Patients
  // =====================================================================

  generatePatientId() {
    return this.#db.patients.nextId();
  }

  /** @param {Patient} patient */
  addPatient(patient) {
    this.#db.patients.add(patient);
    this.#notify('patient.registered', 'patient', patient.id, `Registered patient ${patient.fullName}`);
    return patient;
  }

  /**
   * Builds a new Patient with the next ID. The constructor validates every field.
   *
   * @param {PatientInput} input
   */
  registerPatient(input) {
    return this.addPatient(new Patient({ ...input, id: this.generatePatientId() }));
  }

  /**
   * A complete candidate is built (and validated) first; values are copied
   * only if every field is valid, so a failed edit changes nothing.
   *
   * @param {Patient} patient
   * @param {PatientInput} input
   */
  updatePatient(patient, input) {
    const candidate = new Patient({ ...input, id: patient.id });
    patient.firstName = candidate.firstName;
    patient.lastName = candidate.lastName;
    patient.contactNumber = candidate.contactNumber;
    patient.email = candidate.email;
    patient.birthDate = candidate.birthDate;
    patient.gender = candidate.gender;
    patient.address = candidate.address;
    patient.bloodType = candidate.bloodType;
    this.#db.patients.update(patient);
    this.#notify('patient.updated', 'patient', patient.id, `Updated patient ${patient.fullName}`);
    return patient;
  }

  /** Patients with any appointment history must be kept. @param {Patient} patient */
  removePatient(patient) {
    const records = this.findAppointments(patient).length;
    if (records > 0) {
      throw new ConflictError(
        `${patient.fullName} has ${records} appointment record(s). Patient records with appointment history must be kept.`,
      );
    }
    this.#db.patients.remove(patient.id);
    this.#notify('patient.removed', 'patient', patient.id, `Removed patient ${patient.fullName}`);
  }

  /** @param {string} id */
  getPatient(id) {
    const patient = this.#db.patients.findById(id);
    if (!patient) {
      throw new NotFoundError(`Patient ${id} was not found.`);
    }
    return patient;
  }

  getPatients() {
    return this.#db.patients.findAll();
  }

  /** @param {string} [keyword] */
  searchPatients(keyword) {
    return this.#db.patients.findWhere((p) => p.matches(keyword));
  }

  // =====================================================================
  //  Medical staff
  // =====================================================================

  generateStaffId() {
    return this.#db.staff.nextId();
  }

  /** Accepts any subclass (Doctor, Dentist, Nurse). This is POLYMORPHISM. @param {MedicalStaff} staff */
  addStaff(staff) {
    this.#db.staff.add(staff);
    this.#notify('staff.added', 'staff', staff.id, `Added ${staff.getRole().toLowerCase()} ${staff.getDisplayName()}`);
    return staff;
  }

  /**
   * The factory creates the right subclass for the role.
   *
   * @param {string} role
   * @param {StaffInput} input
   */
  createStaff(role, input) {
    return this.addStaff(StaffFactory.create(role, { ...input, id: this.generateStaffId(), active: true }));
  }

  /**
   * Edits a staff member. The role cannot change. The schedule can only change
   * if no scheduled appointment would fall outside it.
   *
   * @param {MedicalStaff} staff
   * @param {StaffInput} input
   */
  updateStaff(staff, input) {
    const candidate = StaffFactory.create(staff.getRole(), { ...input, id: staff.id, active: staff.active });
    this.#checkScheduleChange(staff, candidate.workingDays, candidate.shiftStart, candidate.shiftEnd);
    staff.workingDays = candidate.workingDays;
    staff.setShift(candidate.shiftStart, candidate.shiftEnd);
    staff.firstName = candidate.firstName;
    staff.lastName = candidate.lastName;
    staff.contactNumber = candidate.contactNumber;
    staff.email = candidate.email;
    staff.licenseNumber = candidate.licenseNumber;
    staff.serviceArea = candidate.serviceArea;
    this.#db.staff.update(staff);
    this.#notify('staff.updated', 'staff', staff.id, `Updated ${staff.getDisplayName()}`);
    return staff;
  }

  /**
   * Changes only the schedule (Java: updateStaffSchedule).
   *
   * @param {MedicalStaff} staff
   * @param {Iterable<DayOfWeek | string>} days
   * @param {TimeOfDay | string} start
   * @param {TimeOfDay | string} end
   */
  updateStaffSchedule(staff, days, start, end) {
    // A throwaway copy validates the new schedule before anything on the real object changes.
    const candidate = StaffFactory.create(staff.getRole(), {
      ...new StaffMapper().toRecord(staff), workingDays: [...(days ?? [])], shiftStart: start, shiftEnd: end,
    });
    this.#checkScheduleChange(staff, candidate.workingDays, candidate.shiftStart, candidate.shiftEnd);
    staff.workingDays = candidate.workingDays;
    staff.setShift(candidate.shiftStart, candidate.shiftEnd);
    this.#db.staff.update(staff);
    this.#notify('staff.updated', 'staff', staff.id, `Changed the schedule of ${staff.getDisplayName()}`);
  }

  /**
   * Staff with scheduled appointments cannot be deactivated.
   *
   * @param {MedicalStaff} staff
   * @param {boolean} active
   */
  setStaffActive(staff, active) {
    if (!active) {
      const scheduled = this.findAppointments(staff).filter((a) => a.isActive()).length;
      if (scheduled > 0) {
        throw new ConflictError(
          `${staff.getDisplayName()} still has ${scheduled} scheduled appointment(s). Reschedule or cancel them first.`,
        );
      }
    }
    staff.active = active;
    this.#db.staff.update(staff);
    this.#notify(active ? 'staff.activated' : 'staff.deactivated', 'staff', staff.id,
      `${active ? 'Activated' : 'Deactivated'} ${staff.getDisplayName()}`);
  }

  /** Staff with any appointment record cannot be removed; deactivate them instead. @param {MedicalStaff} staff */
  removeStaff(staff) {
    const records = this.findAppointments(staff).length;
    if (records > 0) {
      throw new ConflictError(
        `${staff.getDisplayName()} has ${records} appointment record(s) and cannot be removed. Deactivate the account instead.`,
      );
    }
    this.#db.staff.remove(staff.id);
    this.#notify('staff.removed', 'staff', staff.id, `Removed ${staff.getDisplayName()}`);
  }

  /** @param {string} id */
  getStaffMember(id) {
    const staff = this.#db.staff.findById(id);
    if (!staff) {
      throw new NotFoundError(`Staff member ${id} was not found.`);
    }
    return staff;
  }

  getStaff() {
    return this.#db.staff.findAll();
  }

  getActiveStaff() {
    return this.#db.staff.findWhere((s) => s.active);
  }

  /** @param {string} [keyword] */
  searchStaff(keyword) {
    return this.#db.staff.findWhere((s) => s.matches(keyword));
  }

  /** @param {CalendarDate} [date] defaults to today */
  getStaffOnDuty(date = this.#clock.today()) {
    return this.#db.staff.findWhere((s) => s.isAvailableOn(date));
  }

  // =====================================================================
  //  Appointments
  // =====================================================================

  /**
   * @param {object} request
   * @param {Patient} request.patient
   * @param {MedicalStaff} request.staff
   * @param {CalendarDate | string} request.date
   * @param {TimeOfDay | string} request.time
   * @param {AppointmentType | string} request.type
   * @param {string} request.reason
   */
  bookAppointment({ patient, staff, date, time, type, reason }) {
    this.#validateSchedule(patient, staff, date, time, undefined);
    if (!type) {
      throw new ValidationError('Please select an appointment type.', { field: 'type' });
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new ValidationError('Please enter the reason for the visit.', { field: 'reason' });
    }
    const appointment = new Appointment({
      id: this.#db.appointments.nextId(), patient, staff, date, time, type: AppointmentType.from(type), reason,
    });
    this.#db.appointments.add(appointment);
    this.#notify('appointment.booked', 'appointment', appointment.id,
      `Booked ${appointment.patient.fullName} with ${staff.getDisplayName()} on ${appointment.date} at ${appointment.time}`);
    return appointment;
  }

  /**
   * @param {Appointment} appointment
   * @param {CalendarDate | string} newDate
   * @param {TimeOfDay | string} newTime
   */
  rescheduleAppointment(appointment, newDate, newTime) {
    this.#ensureScheduled(appointment);
    this.#validateSchedule(appointment.patient, appointment.staff, newDate, newTime, appointment);
    const from = `${appointment.date} ${appointment.time}`;
    appointment.reschedule(newDate, newTime);
    this.#db.appointments.update(appointment);
    this.#notify('appointment.rescheduled', 'appointment', appointment.id,
      `Rescheduled from ${from} to ${appointment.date} ${appointment.time}`);
    return appointment;
  }

  /** @param {Appointment} appointment @param {string} findings */
  completeAppointment(appointment, findings) {
    this.#ensureScheduled(appointment);
    appointment.complete(findings);
    this.#db.appointments.update(appointment);
    this.#notify('appointment.completed', 'appointment', appointment.id, 'Completed with findings');
    return appointment;
  }

  /** @param {Appointment} appointment @param {string} reason */
  cancelAppointment(appointment, reason) {
    this.#ensureScheduled(appointment);
    appointment.cancel(reason);
    this.#db.appointments.update(appointment);
    this.#notify('appointment.cancelled', 'appointment', appointment.id, appointment.remarks);
    return appointment;
  }

  /** @param {Appointment} appointment */
  markNoShow(appointment) {
    this.#ensureScheduled(appointment);
    appointment.markNoShow();
    this.#db.appointments.update(appointment);
    this.#notify('appointment.no-show', 'appointment', appointment.id, 'Marked as no-show');
    return appointment;
  }

  /**
   * Open time slots for a staff member on a date. Pass the appointment being
   * rescheduled as `exclude` so its own slot stays available.
   *
   * @param {MedicalStaff | null | undefined} staff
   * @param {CalendarDate | null | undefined} date
   * @param {Appointment} [exclude]
   * @returns {TimeOfDay[]}
   */
  getAvailableSlots(staff, date, exclude) {
    if (!staff || !date || !staff.isAvailableOn(date) || date.isBefore(this.#clock.today())) {
      return [];
    }
    const minutes = staff.getSlotDurationMinutes();
    return staff.getTimeSlots().filter((slot) =>
      !this.#clock.isPast(date, slot) &&
      !this.#hasConflict((a) => a.staff.equals(staff), date, slot, slot.plusMinutes(minutes), exclude));
  }

  /**
   * POLYMORPHISM without overloading. Java had five overloaded
   * findAppointments(...) methods chosen by the compiler from the argument's
   * type. JavaScript has no overloading, so this single method looks at the
   * argument's type at runtime and dispatches to the matching search:
   *
   *   findAppointments(date: CalendarDate)            appointments on that date
   *   findAppointments(patient: Patient)              that patient's appointments
   *   findAppointments(staff: MedicalStaff)           that staff member's appointments
   *   findAppointments(status: AppointmentStatus)     appointments with that status
   *   findAppointments(keyword: string)               keyword search
   *   findAppointments({ ...criteria })               any combination of filters
   *   findAppointments()                              everything
   *
   * Results are always sorted by date and time.
   *
   * @param {CalendarDate | Patient | MedicalStaff | AppointmentStatus | string | AppointmentCriteria} [criteria]
   * @returns {Appointment[]}
   */
  findAppointments(criteria) {
    if (criteria === undefined || criteria === null) {
      return this.#query(() => true);
    }
    if (criteria instanceof CalendarDate) {
      return this.#query((a) => a.date.equals(criteria));
    }
    if (criteria instanceof Patient) {
      return this.#query((a) => a.patient.equals(criteria));
    }
    if (criteria instanceof MedicalStaff) {
      return this.#query((a) => a.staff.equals(criteria));
    }
    if (criteria instanceof AppointmentStatus) {
      return this.#query((a) => a.status === criteria);
    }
    if (typeof criteria === 'string') {
      return this.#query((a) => a.matches(criteria));
    }
    if (typeof criteria === 'object') {
      return this.#query(this.#criteriaFilter(criteria));
    }
    throw new TypeError(`findAppointments() does not accept ${typeof criteria}.`);
  }

  getAllAppointments() {
    return this.findAppointments();
  }

  /** Scheduled appointments that have not started yet. */
  getUpcomingAppointments() {
    return this.#query((a) => a.isActive() && !this.#clock.isPast(a.date, a.time));
  }

  /** @param {string} id */
  getAppointment(id) {
    const appointment = this.#db.appointments.findById(id);
    if (!appointment) {
      throw new NotFoundError(`Appointment ${id} was not found.`);
    }
    return appointment;
  }

  /**
   * Appointment records: closed appointments (completed, cancelled, no-show),
   * optionally for one patient. The keyword also searches the remarks.
   *
   * @param {{ patient?: Patient, keyword?: string }} [filters]
   */
  getRecords({ patient, keyword } = {}) {
    const k = normalizeKeyword(keyword);
    return this.findAppointments(patient ?? undefined)
      .filter((a) => !a.isActive())
      .filter((a) => a.matches(k) || a.remarks.toLowerCase().includes(k));
  }

  // =====================================================================
  //  Statistics
  // =====================================================================

  /**
   * Works with ANY list of Billable objects. It relies only on the contract (ABSTRACTION).
   *
   * @param {Iterable<{ computeFee(): number }>} items
   */
  computeTotal(items) {
    let total = 0;
    for (const item of items) {
      total += assertImplements(item, Billable).computeFee();
    }
    return Math.round(total * 100) / 100;
  }

  getCollectedFees() {
    return this.computeTotal(this.findAppointments(AppointmentStatus.COMPLETED));
  }

  getPatientCount() {
    return this.#db.patients.count();
  }

  getActiveStaffCount() {
    return this.getActiveStaff().length;
  }

  // =====================================================================
  //  Private helpers
  // =====================================================================

  /** @param {(a: Appointment) => boolean} condition */
  #query(condition) {
    return this.#db.appointments.findWhere(condition).sort((a, b) => a.compareTo(b));
  }

  /** @param {AppointmentCriteria} c */
  #criteriaFilter(c) {
    const date = c.date ? CalendarDate.parse(c.date) : undefined;
    const from = c.from ? CalendarDate.parse(c.from) : undefined;
    const to = c.to ? CalendarDate.parse(c.to) : undefined;
    const patientId = c.patient instanceof Patient ? c.patient.id : c.patient;
    const staffId = c.staff instanceof MedicalStaff ? c.staff.id : c.staff;
    const status = c.status ? AppointmentStatus.from(c.status) : undefined;
    return (/** @type {Appointment} */ a) =>
      (!date || a.date.equals(date)) &&
      (!from || !a.date.isBefore(from)) &&
      (!to || !a.date.isAfter(to)) &&
      (!patientId || a.patient.id === patientId) &&
      (!staffId || a.staff.id === staffId) &&
      (!status || a.status === status) &&
      (!c.closedOnly || !a.isActive()) &&
      a.matches(c.keyword);
  }

  /** @param {Appointment | null | undefined} appointment */
  #ensureScheduled(appointment) {
    if (!appointment) {
      throw new ValidationError('Please select an appointment.');
    }
    if (!appointment.isActive()) {
      throw new ConflictError(
        `Appointment ${appointment.id} is already ${appointment.status.label} and can no longer be changed.`,
      );
    }
  }

  /**
   * @param {(a: Appointment) => boolean} owner
   * @param {CalendarDate} date
   * @param {TimeOfDay} start
   * @param {TimeOfDay} end
   * @param {Appointment | undefined} exclude
   */
  #hasConflict(owner, date, start, end, exclude) {
    return this.#db.appointments.findAll()
      .some((a) => a !== exclude && a.isActive() && owner(a) && a.overlapsWith(date, start, end));
  }

  /**
   * @param {MedicalStaff} staff
   * @param {readonly DayOfWeek[]} days
   * @param {TimeOfDay} start
   * @param {TimeOfDay} end
   */
  #checkScheduleChange(staff, days, start, end) {
    for (const a of this.findAppointments(staff)) {
      if (!a.isActive()) {
        continue;
      }
      const outside = !days.includes(a.date.dayOfWeek) || a.time.isBefore(start) || a.getEndTime().isAfter(end);
      if (outside) {
        throw new ConflictError(
          `Cannot change the schedule: appointment ${a.id} on ${a.date} at ${a.time} would fall outside the new schedule. ` +
            'Reschedule or cancel it first.',
        );
      }
    }
  }

  /**
   * @param {Patient | null | undefined} patient
   * @param {MedicalStaff | null | undefined} staff
   * @param {CalendarDate | string | null | undefined} dateInput
   * @param {TimeOfDay | string | null | undefined} timeInput
   * @param {Appointment | undefined} exclude
   */
  #validateSchedule(patient, staff, dateInput, timeInput, exclude) {
    if (!patient) {
      throw new ValidationError('Please select a patient.', { field: 'patientId' });
    }
    if (!staff) {
      throw new ValidationError('Please select the attending medical staff.', { field: 'staffId' });
    }
    if (!dateInput || !timeInput) {
      throw new ValidationError('Please select a date and an available time slot.', { field: 'time' });
    }
    const date = CalendarDate.parse(dateInput);
    const time = TimeOfDay.parse(timeInput);
    if (this.#clock.isPast(date, time)) {
      throw new ValidationError('Appointments cannot be scheduled in the past.', { field: 'date' });
    }
    if (!staff.active) {
      throw new ValidationError(`${staff.getDisplayName()} is currently inactive.`, { field: 'staffId' });
    }
    if (!staff.isAvailableOn(date)) {
      throw new ValidationError(
        `${staff.getDisplayName()} does not work on ${date.dayOfWeek.label}. Working days: ${staff.getWorkingDaysText()}.`,
        { field: 'date' },
      );
    }
    if (!staff.isValidSlot(time)) {
      throw new ValidationError(
        `The selected time is not a valid slot within ${staff.getDisplayName()}'s shift (${staff.getShiftText()}).`,
        { field: 'time' },
      );
    }
    const end = time.plusMinutes(staff.getSlotDurationMinutes());
    if (this.#hasConflict((a) => a.staff.equals(staff), date, time, end, exclude)) {
      throw new ConflictError(`${staff.getDisplayName()} already has an appointment at that time.`, { field: 'time' });
    }
    if (this.#hasConflict((a) => a.patient.equals(patient), date, time, end, exclude)) {
      throw new ConflictError(`${patient.fullName} already has another appointment that overlaps with this time.`, {
        field: 'time',
      });
    }
  }

  /**
   * @param {string} action
   * @param {ChangeEvent['entityType']} entityType
   * @param {string} entityId
   * @param {string} summary
   */
  #notify(action, entityType, entityId, summary) {
    /** @type {ChangeEvent} */
    const event = Object.freeze({ action, entityType, entityId, summary });
    this.emit('change', event);
  }
}
