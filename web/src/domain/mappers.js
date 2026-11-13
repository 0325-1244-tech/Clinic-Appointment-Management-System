// @ts-check
import { Appointment } from './Appointment.js';
import { abstractClass, abstractMethod } from './contracts.js';
import { NotFoundError } from './errors.js';
/** @typedef {import('./MedicalStaff.js').MedicalStaff} MedicalStaff */
import { Patient } from './Patient.js';
import { StaffFactory } from './StaffFactory.js';

/**
 * @typedef {{ id: string, firstName: string, lastName: string, contactNumber: string, email: string,
 *   birthDate: string, gender: string, address: string, bloodType: string }} PatientRecord
 * @typedef {{ id: string, role: string, firstName: string, lastName: string, contactNumber: string, email: string,
 *   licenseNumber: string, serviceArea: string, workingDays: string[], shiftStart: string, shiftEnd: string,
 *   active: boolean }} StaffRecord
 * @typedef {{ id: string, patientId: string, staffId: string, date: string, time: string, type: string,
 *   reason: string, status: string, remarks: string, createdAt: string,
 *   patient?: PatientRecord, staff?: StaffRecord }} AppointmentRecord
 */

/**
 * ABSTRACTION: converts a domain object to a plain JSON record and back.
 * The same mappers are used by the JSON file storage on the server and by the
 * browser when it turns API responses back into real domain objects.
 *
 * @template T, R
 */
export class RecordMapper {
  constructor() {
    if (new.target === RecordMapper) {
      throw abstractClass('RecordMapper');
    }
  }

  /**
   * @abstract
   * @param {T} _entity
   * @returns {R}
   */
  toRecord(_entity) {
    throw abstractMethod(this, 'toRecord');
  }

  /**
   * @abstract
   * @param {R} _record
   * @returns {T}
   */
  fromRecord(_record) {
    throw abstractMethod(this, 'fromRecord');
  }
}

/** @extends {RecordMapper<Patient, PatientRecord>} */
export class PatientMapper extends RecordMapper {
  /** @param {Patient} p */
  toRecord(p) {
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      contactNumber: p.contactNumber,
      email: p.email,
      birthDate: p.birthDate.toString(),
      gender: p.gender,
      address: p.address,
      bloodType: p.bloodType,
    };
  }

  /** @param {PatientRecord} r */
  fromRecord(r) {
    return new Patient(r);
  }
}

/** @extends {RecordMapper<MedicalStaff, StaffRecord>} */
export class StaffMapper extends RecordMapper {
  /** @param {MedicalStaff} s */
  toRecord(s) {
    return {
      id: s.id,
      role: s.getRole(),
      firstName: s.firstName,
      lastName: s.lastName,
      contactNumber: s.contactNumber,
      email: s.email,
      licenseNumber: s.licenseNumber,
      serviceArea: s.serviceArea,
      workingDays: s.workingDays.map((d) => d.code),
      shiftStart: s.shiftStart.toString(),
      shiftEnd: s.shiftEnd.toString(),
      active: s.active,
    };
  }

  /** The factory picks Doctor, Dentist or Nurse from the saved role. @param {StaffRecord} r */
  fromRecord(r) {
    return StaffFactory.create(r.role, r);
  }
}

/** @extends {RecordMapper<Appointment, AppointmentRecord>} */
export class AppointmentMapper extends RecordMapper {
  #findPatient;
  #findStaff;
  #patients = new PatientMapper();
  #staff = new StaffMapper();

  /**
   * Appointments are saved with patient and staff IDs; these functions link them back to the real objects.
   * Records may also carry the patient and staff inline (as the API sends them).
   *
   * @param {{ findPatient?: (id: string) => Patient | undefined, findStaff?: (id: string) => MedicalStaff | undefined }} [lookups]
   */
  constructor({ findPatient = () => undefined, findStaff = () => undefined } = {}) {
    super();
    this.#findPatient = findPatient;
    this.#findStaff = findStaff;
  }

  /** @param {Appointment} a */
  toRecord(a) {
    return {
      id: a.id,
      patientId: a.patient.id,
      staffId: a.staff.id,
      date: a.date.toString(),
      time: a.time.toString(),
      type: a.type.code,
      reason: a.reason,
      status: a.status.code,
      remarks: a.remarks,
      createdAt: a.createdAt,
    };
  }

  /** @param {AppointmentRecord} r */
  fromRecord(r) {
    const patient = r.patient ? this.#patients.fromRecord(r.patient) : this.#findPatient(r.patientId);
    const staff = r.staff ? this.#staff.fromRecord(r.staff) : this.#findStaff(r.staffId);
    if (!patient || !staff) {
      throw new NotFoundError(`Appointment ${r.id} refers to a patient or staff member that no longer exists.`);
    }
    return Appointment.restore(
      { id: r.id, patient, staff, date: r.date, time: r.time, type: r.type, reason: r.reason },
      { status: r.status, remarks: r.remarks, createdAt: r.createdAt },
    );
  }
}
