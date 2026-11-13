// @ts-check
/**
 * The clinic's domain layer: plain ES classes with no framework or Node.js
 * imports, so the same files run on the server and in the browser.
 */
export { Appointment } from './Appointment.js';
export { AppointmentStatus } from './AppointmentStatus.js';
export { AppointmentType } from './AppointmentType.js';
export { Billable, Identifiable, Searchable, abstractClass, abstractMethod, assertImplements, defineContract, implementsInterface } from './contracts.js';
export { Dentist } from './Dentist.js';
export { Doctor } from './Doctor.js';
export { Enumeration } from './Enumeration.js';
export { ClinicError, ConflictError, InvalidStateError, NotFoundError, ValidationError } from './errors.js';
export { AppointmentMapper, PatientMapper, RecordMapper, StaffMapper } from './mappers.js';
export { MedicalStaff } from './MedicalStaff.js';
export { Nurse } from './Nurse.js';
export { Patient } from './Patient.js';
export { Person } from './Person.js';
export { StaffFactory } from './StaffFactory.js';
export { formatPeso, normalizeKeyword, requireText } from './text.js';
export { CalendarDate } from './time/CalendarDate.js';
export { CLINIC_TIME_ZONE, Clock, FixedClock, ZoneClock } from './time/Clock.js';
export { DayOfWeek } from './time/DayOfWeek.js';
export { TimeOfDay } from './time/TimeOfDay.js';
