// @ts-check
import { Clock, DayOfWeek, Dentist, Doctor, FixedClock, Nurse, Patient } from '../src/domain/index.js';

/** Wednesday, 11 November 2026, 10:00 clinic time. Monday of that week is 2026-11-09. */
export const TODAY = '2026-11-11';
export const NOW = '10:00';

/** Freezes the domain clock and returns it so a test can move it. */
export function freezeClock(date = TODAY, time = NOW) {
  const clock = new FixedClock(date, time);
  Clock.use(clock);
  return clock;
}

export const WEEKDAYS = [...DayOfWeek.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY)];
export const MON_TO_SAT = [...DayOfWeek.range(DayOfWeek.MONDAY, DayOfWeek.SATURDAY)];

/** @param {Partial<import('../src/domain/Patient.js').PatientProps>} [overrides] */
export function makePatient(overrides = {}) {
  return new Patient({
    id: 'P-0001',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    contactNumber: '09181112201',
    email: 'juan.dc@gmail.com',
    birthDate: '1990-03-14',
    gender: 'Male',
    address: 'Brgy. Bagumbayan, Santa Cruz, Laguna',
    bloodType: 'O+',
    ...overrides,
  });
}

/** @param {Partial<import('../src/domain/MedicalStaff.js').StaffProps>} [overrides] */
function staffProps(overrides = {}) {
  return {
    id: 'S-0001',
    firstName: 'Maria',
    lastName: 'Santos',
    contactNumber: '09171234501',
    email: 'maria.santos@careconnect.ph',
    licenseNumber: 'PRC-0123456',
    serviceArea: 'General Medicine',
    workingDays: MON_TO_SAT,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    ...overrides,
  };
}

/** @param {Partial<import('../src/domain/MedicalStaff.js').StaffProps>} [overrides] */
export function makeDoctor(overrides = {}) {
  return new Doctor(staffProps(overrides));
}

/** @param {Partial<import('../src/domain/MedicalStaff.js').StaffProps>} [overrides] */
export function makeDentist(overrides = {}) {
  return new Dentist(staffProps({ id: 'S-0002', firstName: 'Carlo', lastName: 'Mendoza', serviceArea: 'Dental Room 1', ...overrides }));
}

/** @param {Partial<import('../src/domain/MedicalStaff.js').StaffProps>} [overrides] */
export function makeNurse(overrides = {}) {
  return new Nurse(staffProps({ id: 'S-0003', firstName: 'Liza', lastName: 'Bautista', serviceArea: 'Immunization', ...overrides }));
}
