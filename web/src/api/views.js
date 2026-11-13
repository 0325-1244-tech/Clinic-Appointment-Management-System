// @ts-check
import { AppointmentMapper, PatientMapper, StaffMapper } from '../domain/mappers.js';

/** @typedef {import('../domain/Patient.js').Patient} Patient */
/** @typedef {import('../domain/MedicalStaff.js').MedicalStaff} MedicalStaff */
/** @typedef {import('../domain/Appointment.js').Appointment} Appointment */

const patients = new PatientMapper();
const staffMapper = new StaffMapper();
const appointments = new AppointmentMapper();

/**
 * JSON sent to the browser. Each view is the stored record (which the browser
 * turns back into a real domain object with the same mappers) plus a few
 * computed, read-only fields for convenience.
 */
export class Views {
  constructor() {
    throw new TypeError('Views only has static methods.');
  }

  /** @param {Patient} p */
  static patient(p) {
    return { ...patients.toRecord(p), fullName: p.fullName, age: p.age, details: p.getDetails() };
  }

  /** Completed visits store the clinical findings in the remarks. @param {Appointment} a */
  static hasFindings(a) {
    return a.status.code === 'COMPLETED';
  }

  /** @param {MedicalStaff} s */
  static staff(s) {
    return {
      ...staffMapper.toRecord(s),
      displayName: s.getDisplayName(),
      serviceAreaLabel: s.getServiceAreaLabel(),
      consultationFee: s.getConsultationFee(),
      slotMinutes: s.getSlotDurationMinutes(),
      workingDaysText: s.getWorkingDaysText(),
      shiftText: s.getShiftText(),
      details: s.getDetails(),
    };
  }

  /**
   * @param {Appointment} a
   * @param {{ findings?: boolean }} [options] findings: false hides the clinical notes of completed visits
   */
  static appointment(a, { findings = true } = {}) {
    const hidden = !findings && Views.hasFindings(a);
    return {
      ...appointments.toRecord(a),
      remarks: hidden ? '' : a.remarks,
      findingsHidden: hidden,
      endTime: a.getEndTime().toString(),
      fee: a.computeFee(),
      statusLabel: a.status.label,
      typeLabel: a.type.label,
      patient: patients.toRecord(a.patient),
      staff: staffMapper.toRecord(a.staff),
      patientName: a.patient.fullName,
      staffName: a.staff.getDisplayName(),
      staffRole: a.staff.getRole(),
    };
  }
}
