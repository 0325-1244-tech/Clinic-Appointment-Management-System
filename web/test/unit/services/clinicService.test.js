import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import {
  AppointmentStatus, AppointmentType, CalendarDate, Clock, ConflictError, Doctor, NotFoundError, Nurse, TimeOfDay,
  ValidationError,
} from '../../../src/domain/index.js';
import { ClinicDatabase } from '../../../src/repositories/ClinicDatabase.js';
import { ClinicService } from '../../../src/services/ClinicService.js';
import { freezeClock, makeDentist, makeDoctor, makeNurse, makePatient } from '../../helpers.js';

/** @type {ClinicService} */
let service;
/** @type {import('../../../src/domain/time/Clock.js').FixedClock} */
let clock;
/** @type {import('../../../src/domain/Patient.js').Patient} */
let juan;
/** @type {import('../../../src/domain/Patient.js').Patient} */
let angela;
/** @type {Doctor} */
let santos;
/** @type {import('../../../src/domain/Dentist.js').Dentist} */
let mendoza;
/** @type {Nurse} */
let bautista;
/** @type {any[]} */
let events;

const THURSDAY = '2026-11-12';
const SUNDAY = '2026-11-15';

beforeEach(() => {
  clock = freezeClock('2026-11-11', '10:00'); // Wednesday
  service = new ClinicService(ClinicDatabase.inMemory(), { clock });
  events = [];
  service.on('change', (e) => events.push(e));
  juan = service.addPatient(makePatient({ id: service.generatePatientId() }));
  angela = service.addPatient(makePatient({ id: service.generatePatientId(), firstName: 'Angela', lastName: 'Ramos' }));
  santos = /** @type {Doctor} */ (service.addStaff(makeDoctor({ id: service.generateStaffId() })));
  mendoza = /** @type {any} */ (service.addStaff(makeDentist({ id: service.generateStaffId() })));
  bautista = /** @type {Nurse} */ (service.addStaff(makeNurse({ id: service.generateStaffId(), shiftStart: '07:00', shiftEnd: '15:00' })));
});
after(() => Clock.use(undefined));

/** @param {Partial<Parameters<ClinicService['bookAppointment']>[0]>} [overrides] */
function book(overrides = {}) {
  return service.bookAppointment({
    patient: juan, staff: santos, date: THURSDAY, time: '09:00', type: AppointmentType.CONSULTATION, reason: 'Fever',
    ...overrides,
  });
}

describe('ClinicService: patients', () => {
  it('generates IDs P-0001, P-0002 and only advances when the ID is used', () => {
    assert.equal(juan.id, 'P-0001');
    assert.equal(angela.id, 'P-0002');
    assert.equal(service.generatePatientId(), 'P-0003');
    assert.equal(service.generatePatientId(), 'P-0003');
  });

  it('registers a patient from form input and announces it', () => {
    const p = service.registerPatient({
      firstName: 'Bea', lastName: 'Navarro', contactNumber: '09181112206', birthDate: '2001-09-17', gender: 'Female',
      address: 'Brgy. Duhat',
    });
    assert.equal(p.id, 'P-0003');
    assert.equal(service.getPatientCount(), 3);
    assert.deepEqual(events.at(-1), { action: 'patient.registered', entityType: 'patient', entityId: 'P-0003', summary: 'Registered patient P-0003' });
  });

  it('updates all fields only when every field is valid', () => {
    const input = {
      firstName: 'Juanito', lastName: 'Cruz', contactNumber: '0918 111 2299', email: '', birthDate: '1991-01-01',
      gender: 'Male', address: 'Pila', bloodType: '',
    };
    assert.throws(() => service.updatePatient(juan, { ...input, contactNumber: '123' }), /valid PH mobile number/);
    assert.equal(juan.firstName, 'Juan', 'a failed edit changes nothing');
    service.updatePatient(juan, input);
    assert.equal(juan.fullName, 'Juanito Cruz');
    assert.equal(juan.contactNumber, '09181112299');
    assert.equal(juan.bloodType, 'Unknown');
    assert.equal(events.at(-1).action, 'patient.updated');
  });

  it('removes a patient without appointment records', () => {
    service.removePatient(angela);
    assert.equal(service.getPatients().length, 1);
    assert.throws(() => service.getPatient('P-0002'), NotFoundError);
  });

  it('keeps a patient with any appointment record', () => {
    book();
    assert.throws(() => service.removePatient(juan), (err) => {
      assert.ok(err instanceof ConflictError);
      assert.equal(err.message, 'Juan Dela Cruz has 1 appointment record(s). Patient records with appointment history must be kept.');
      return true;
    });
  });

  it('searches patients', () => {
    assert.deepEqual(service.searchPatients('ramos').map((p) => p.id), ['P-0002']);
    assert.equal(service.searchPatients('').length, 2);
    assert.equal(service.getPatient('P-0001'), juan);
  });
});

describe('ClinicService: staff', () => {
  it('creates the right subclass through the factory', () => {
    const nurse = service.createStaff('Nurse', {
      firstName: 'Mark', lastName: 'Dela Cruz', contactNumber: '09171234506', email: '', licenseNumber: 'PRC-0678901',
      serviceArea: 'Triage', workingDays: ['MONDAY'], shiftStart: '13:00', shiftEnd: '21:00',
    });
    assert.ok(nurse instanceof Nurse);
    assert.equal(nurse.id, 'S-0004');
    assert.equal(events.at(-1).summary, 'Added nurse Mark Dela Cruz, RN');
  });

  it('edits a staff member but keeps the role', () => {
    const input = {
      firstName: 'Maria', lastName: 'Santos-Reyes', contactNumber: '09171234501', email: 'm@x.ph', licenseNumber: 'PRC-1',
      serviceArea: 'Cardiology', workingDays: ['MONDAY', 'TUESDAY'], shiftStart: '09:00', shiftEnd: '12:00',
    };
    service.updateStaff(santos, input);
    assert.ok(santos instanceof Doctor);
    assert.equal(santos.getDisplayName(), 'Dr. Maria Santos-Reyes');
    assert.equal(santos.getConsultationFee(), 800);
    assert.equal(santos.getShiftText(), '09:00 AM - 12:00 PM');
    assert.throws(() => service.updateStaff(santos, { ...input, licenseNumber: '' }), /License number is required/);
    assert.equal(santos.licenseNumber, 'PRC-1');
  });

  it('cannot change a schedule in a way that strands scheduled appointments', () => {
    const a = book({ time: '16:00' });
    const message = `Cannot change the schedule: appointment ${a.id} on ${THURSDAY} at 16:00 would fall outside the new schedule. Reschedule or cancel it first.`;
    assert.throws(() => service.updateStaffSchedule(santos, ['MONDAY', 'THURSDAY'], '08:00', '16:00'), { message });
    assert.throws(() => service.updateStaffSchedule(santos, ['MONDAY'], '08:00', '17:00'), ConflictError);
    assert.throws(() => service.updateStaffSchedule(santos, ['THURSDAY'], '16:30', '17:00'), ConflictError);
    assert.equal(santos.getWorkingDaysText(), 'Mon, Tue, Wed, Thu, Fri, Sat', 'nothing changed');
    service.updateStaffSchedule(santos, ['THURSDAY'], '15:00', '17:00');
    assert.equal(santos.getWorkingDaysText(), 'Thu');
  });

  it('a failed schedule change leaves the schedule untouched', () => {
    assert.throws(() => service.updateStaffSchedule(santos, ['MONDAY'], '17:00', '08:00'), /Shift end must be later/);
    assert.throws(() => service.updateStaffSchedule(santos, [], '08:00', '17:00'), /Select at least one working day/);
    assert.equal(santos.getWorkingDaysText(), 'Mon, Tue, Wed, Thu, Fri, Sat');
    assert.equal(santos.shiftStart.toString(), '08:00');
  });

  it('closed appointments do not block a schedule change', () => {
    const a = book({ time: '16:00' });
    service.cancelAppointment(a, 'x');
    service.updateStaffSchedule(santos, ['MONDAY'], '08:00', '12:00');
    assert.equal(santos.getWorkingDaysText(), 'Mon');
  });

  it('cannot deactivate staff who still have scheduled appointments', () => {
    const a = book();
    assert.throws(() => service.setStaffActive(santos, false), {
      message: 'Dr. Maria Santos still has 1 scheduled appointment(s). Reschedule or cancel them first.',
    });
    service.completeAppointment(a, 'ok');
    service.setStaffActive(santos, false);
    assert.equal(santos.active, false);
    assert.equal(events.at(-1).action, 'staff.deactivated');
    assert.equal(service.getActiveStaffCount(), 2);
    service.setStaffActive(santos, true);
    assert.equal(events.at(-1).action, 'staff.activated');
  });

  it('cannot delete staff with any appointment record', () => {
    book();
    assert.throws(() => service.removeStaff(santos), {
      message: 'Dr. Maria Santos has 1 appointment record(s) and cannot be removed. Deactivate the account instead.',
    });
    service.removeStaff(bautista);
    assert.equal(service.getStaff().length, 2);
    assert.throws(() => service.getStaffMember(bautista.id), NotFoundError);
  });

  it('searches staff and lists who is on duty', () => {
    assert.deepEqual(service.searchStaff('dentist').map((s) => s.id), [mendoza.id]);
    assert.equal(service.getStaffOnDuty().length, 3);
    assert.equal(service.getStaffOnDuty(CalendarDate.parse(SUNDAY)).length, 0);
    santos.active = false;
    assert.equal(service.getStaffOnDuty().length, 2);
    assert.equal(service.getStaffMember(mendoza.id), mendoza);
  });
});

describe('ClinicService: booking rules', () => {
  it('books a valid appointment as A-0001 and announces it', () => {
    const a = book();
    assert.equal(a.id, 'A-0001');
    assert.equal(a.status, AppointmentStatus.SCHEDULED);
    assert.equal(events.at(-1).action, 'appointment.booked');
    assert.equal(service.getAppointment('A-0001'), a);
    assert.throws(() => service.getAppointment('A-9999'), NotFoundError);
  });

  it('requires patient, staff, date and time', () => {
    assert.throws(() => book({ patient: undefined }), { message: 'Please select a patient.' });
    assert.throws(() => book({ staff: undefined }), { message: 'Please select the attending medical staff.' });
    assert.throws(() => book({ date: '' }), { message: 'Please select a date and an available time slot.' });
    assert.throws(() => book({ time: undefined }), { message: 'Please select a date and an available time slot.' });
  });

  it('requires a type and a reason', () => {
    assert.throws(() => book({ type: undefined }), { message: 'Please select an appointment type.' });
    assert.throws(() => book({ reason: '  ' }), { message: 'Please enter the reason for the visit.' });
  });

  it('refuses bookings in the past, including earlier today', () => {
    assert.throws(() => book({ date: '2026-11-10' }), { message: 'Appointments cannot be scheduled in the past.' });
    assert.throws(() => book({ date: '2026-11-11', time: '09:30' }), { message: 'Appointments cannot be scheduled in the past.' });
    assert.equal(book({ date: '2026-11-11', time: '10:00' }).time.toString(), '10:00');
  });

  it('refuses inactive staff', () => {
    santos.active = false;
    assert.throws(() => book(), { message: 'Dr. Maria Santos is currently inactive.' });
  });

  it('only books on the staff member\'s working days', () => {
    assert.throws(() => book({ date: SUNDAY }), {
      message: 'Dr. Maria Santos does not work on Sunday. Working days: Mon, Tue, Wed, Thu, Fri, Sat.',
    });
  });

  it('only books valid slots within the shift', () => {
    const shift = '(08:00 AM - 05:00 PM)';
    assert.throws(() => book({ time: '09:15' }), { message: `The selected time is not a valid slot within Dr. Maria Santos's shift ${shift}.` });
    assert.throws(() => book({ time: '07:30' }), ValidationError);
    assert.throws(() => book({ time: '17:00' }), ValidationError);
    assert.equal(book({ staff: bautista, time: '09:15' }).getEndTime().toString(), '09:30');
  });

  it('blocks double booking of the same staff member', () => {
    book();
    assert.throws(() => book({ patient: angela }), (err) => {
      assert.ok(err instanceof ConflictError);
      assert.equal(err.message, 'Dr. Maria Santos already has an appointment at that time.');
      return true;
    });
  });

  it('blocks overlapping appointments for the same patient, even with different staff', () => {
    book({ staff: mendoza, time: '09:00' }); // dentist 09:00-10:00
    assert.throws(() => book({ staff: santos, time: '09:30' }), {
      message: 'Juan Dela Cruz already has another appointment that overlaps with this time.',
    });
    assert.equal(book({ staff: santos, time: '10:00' }).time.toString(), '10:00');
  });

  it('allows a slot again once the earlier appointment is cancelled or a no-show', () => {
    const first = book();
    service.cancelAppointment(first, 'Sick');
    const second = book({ patient: angela });
    service.markNoShow(second);
    assert.equal(book().id, 'A-0003');
  });
});

describe('ClinicService: changing appointments', () => {
  it('reschedules within the same rules, keeping its own slot available', () => {
    const a = book();
    service.rescheduleAppointment(a, THURSDAY, '09:30');
    assert.equal(a.time.toString(), '09:30');
    service.rescheduleAppointment(a, THURSDAY, '09:30');
    const other = book({ patient: angela, time: '10:00' });
    assert.throws(() => service.rescheduleAppointment(a, THURSDAY, '10:00'), /already has an appointment at that time/);
    assert.throws(() => service.rescheduleAppointment(a, SUNDAY, '10:00'), /does not work on Sunday/);
    assert.throws(() => service.rescheduleAppointment(a, '2026-11-10', '10:00'), /cannot be scheduled in the past/);
    assert.equal(events.filter((e) => e.action === 'appointment.rescheduled').length, 2);
    assert.match(events.find((e) => e.action === 'appointment.rescheduled').summary, /from 2026-11-12 09:00 to 2026-11-12 09:30/);
    assert.ok(other.isActive());
  });

  it('completes with findings, cancels with a reason, marks no-show', () => {
    const a = book();
    assert.throws(() => service.completeAppointment(a, ''), /Please enter the findings/);
    service.completeAppointment(a, 'Fine');
    assert.equal(a.status, AppointmentStatus.COMPLETED);
    const b = book({ time: '10:00' });
    assert.throws(() => service.cancelAppointment(b, ''), /Please enter a reason for cancelling/);
    service.cancelAppointment(b, 'Conflict');
    assert.equal(b.remarks, 'Cancelled: Conflict');
    const c = book({ time: '10:30' });
    service.markNoShow(c);
    assert.equal(c.status, AppointmentStatus.NO_SHOW);
    assert.deepEqual(events.slice(-4).map((e) => e.action),
      ['appointment.booked', 'appointment.cancelled', 'appointment.booked', 'appointment.no-show']);
  });

  it('only scheduled appointments can be rescheduled, completed, cancelled or marked no-show', () => {
    const a = book();
    service.completeAppointment(a, 'Fine');
    const message = 'Appointment A-0001 is already Completed and can no longer be changed.';
    assert.throws(() => service.rescheduleAppointment(a, THURSDAY, '10:00'), { message });
    assert.throws(() => service.completeAppointment(a, 'again'), { message });
    assert.throws(() => service.cancelAppointment(a, 'x'), { message });
    assert.throws(() => service.markNoShow(a), { message });
    assert.throws(() => service.markNoShow(/** @type {any} */ (null)), { message: 'Please select an appointment.' });
  });
});

describe('ClinicService: open slots', () => {
  it('lists every open slot of the shift on a future working day', () => {
    assert.equal(service.getAvailableSlots(santos, CalendarDate.parse(THURSDAY)).length, 18);
    assert.equal(service.getAvailableSlots(mendoza, CalendarDate.parse(THURSDAY)).length, 9);
  });

  it('hides taken slots and keeps the appointment\'s own slot when rescheduling', () => {
    const a = book({ time: '09:00' });
    const day = CalendarDate.parse(THURSDAY);
    const open = service.getAvailableSlots(santos, day).map(String);
    assert.equal(open.includes('09:00'), false);
    assert.ok(open.includes('09:30'));
    assert.ok(service.getAvailableSlots(santos, day, a).map(String).includes('09:00'));
  });

  it('hides slots that overlap a longer appointment of the same staff', () => {
    book({ staff: bautista, time: '09:00' });
    const open = service.getAvailableSlots(bautista, CalendarDate.parse(THURSDAY)).map(String);
    assert.equal(open.includes('09:00'), false);
    assert.ok(open.includes('09:15'));
  });

  it('skips slots that already passed today, and returns nothing for past or non-working days', () => {
    const today = service.getAvailableSlots(santos, CalendarDate.parse('2026-11-11')).map(String);
    assert.equal(today[0], '10:00');
    assert.deepEqual(service.getAvailableSlots(santos, CalendarDate.parse('2026-11-10')), []);
    assert.deepEqual(service.getAvailableSlots(santos, CalendarDate.parse(SUNDAY)), []);
    assert.deepEqual(service.getAvailableSlots(undefined, CalendarDate.parse(THURSDAY)), []);
    assert.deepEqual(service.getAvailableSlots(santos, null), []);
    santos.active = false;
    assert.deepEqual(service.getAvailableSlots(santos, CalendarDate.parse(THURSDAY)), []);
  });
});

describe('ClinicService: findAppointments(criteria) dispatches on the argument type', () => {
  beforeEach(() => {
    book({ time: '11:00' });
    book({ patient: angela, staff: mendoza, time: '09:00', reason: 'Toothache' });
    book({ date: '2026-11-13', staff: bautista, time: '08:00', reason: 'Vaccine' });
  });

  it('by date, patient, staff, status, keyword, or everything (sorted)', () => {
    const ids = (/** @type {any[]} */ list) => list.map((a) => a.id);
    assert.deepEqual(ids(service.findAppointments()), ['A-0002', 'A-0001', 'A-0003']);
    assert.deepEqual(ids(service.getAllAppointments()), ['A-0002', 'A-0001', 'A-0003']);
    assert.deepEqual(ids(service.findAppointments(CalendarDate.parse(THURSDAY))), ['A-0002', 'A-0001']);
    assert.deepEqual(ids(service.findAppointments(angela)), ['A-0002']);
    assert.deepEqual(ids(service.findAppointments(bautista)), ['A-0003']);
    service.cancelAppointment(service.getAppointment('A-0003'), 'x');
    assert.deepEqual(ids(service.findAppointments(AppointmentStatus.CANCELLED)), ['A-0003']);
    assert.deepEqual(ids(service.findAppointments('tooth')), ['A-0002']);
  });

  it('with a criteria object combining filters', () => {
    const ids = (/** @type {any} */ c) => service.findAppointments(c).map((a) => a.id);
    assert.deepEqual(ids({ patient: 'P-0001', status: 'SCHEDULED' }), ['A-0001', 'A-0003']);
    assert.deepEqual(ids({ staff: santos }), ['A-0001']);
    assert.deepEqual(ids({ from: '2026-11-13' }), ['A-0003']);
    assert.deepEqual(ids({ to: THURSDAY, keyword: 'fever' }), ['A-0001']);
    assert.deepEqual(ids({ date: THURSDAY, patient: angela, staff: 'S-0002' }), ['A-0002']);
    assert.deepEqual(ids({ closedOnly: true }), []);
  });

  it('rejects arguments it cannot handle', () => {
    assert.throws(() => service.findAppointments(/** @type {any} */ (42)), TypeError);
  });

  it('lists upcoming appointments and closed records', () => {
    assert.equal(service.getUpcomingAppointments().length, 3);
    clock.set(THURSDAY, '10:00');
    assert.deepEqual(service.getUpcomingAppointments().map((a) => a.id), ['A-0001', 'A-0003']);
    service.completeAppointment(service.getAppointment('A-0001'), 'Viral fever, rest');
    service.cancelAppointment(service.getAppointment('A-0002'), 'Out of town');
    assert.deepEqual(service.getRecords().map((a) => a.id), ['A-0002', 'A-0001']);
    assert.deepEqual(service.getRecords({ patient: juan }).map((a) => a.id), ['A-0001']);
    assert.deepEqual(service.getRecords({ keyword: 'viral' }).map((a) => a.id), ['A-0001'], 'searches remarks too');
    assert.deepEqual(service.getRecords({ keyword: 'ramos' }).map((a) => a.id), ['A-0002']);
  });
});

describe('ClinicService: totals', () => {
  it('computes totals from any Billable list and collects only completed fees', () => {
    const a = book(); // GP consultation 500
    const b = book({ staff: mendoza, patient: angela, time: '10:00', type: 'CHECK_UP' }); // 560
    const c = book({ staff: bautista, time: '13:00', type: 'EMERGENCY' }); // 375
    assert.equal(service.computeTotal([a, b, c]), 1435);
    assert.equal(service.computeTotal([{ computeFee: () => 10.005 }, { computeFee: () => 0.1 }]), 10.11);
    assert.throws(() => service.computeTotal([/** @type {any} */ ({})]), /does not implement Billable/);
    service.completeAppointment(a, 'ok');
    service.completeAppointment(b, 'ok');
    service.cancelAppointment(c, 'x');
    assert.equal(service.getCollectedFees(), 1060);
  });

  it('exposes the clock', () => {
    assert.equal(service.clock, clock);
    assert.ok(new ClinicService(ClinicDatabase.inMemory()).clock);
    assert.ok(TimeOfDay.of(1));
  });
});
