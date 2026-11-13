import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Appointment, AppointmentMapper, AppointmentStatus, AppointmentType, Billable, CalendarDate, Clock, Identifiable,
  InvalidStateError, NotFoundError, PatientMapper, RecordMapper, Searchable, StaffMapper, TimeOfDay, ValidationError,
  abstractMethod, assertImplements, defineContract, formatPeso, implementsInterface,
} from '../../../src/domain/index.js';
import { freezeClock, makeDentist, makeDoctor, makeNurse, makePatient } from '../../helpers.js';

before(() => freezeClock());
after(() => Clock.use(undefined));

/** @param {Partial<import('../../../src/domain/Appointment.js').AppointmentProps>} [overrides] */
function makeAppointment(overrides = {}) {
  return new Appointment({
    id: 'A-0001',
    patient: makePatient(),
    staff: makeDoctor({ serviceArea: 'Cardiology' }),
    date: '2026-11-12',
    time: '09:00',
    type: AppointmentType.CONSULTATION,
    reason: '  Chest pain ',
    ...overrides,
  });
}

describe('AppointmentStatus and AppointmentType', () => {
  it('have the same values and labels as the Java enums', () => {
    assert.deepEqual(AppointmentStatus.values().map((s) => s.label), ['Scheduled', 'Completed', 'Cancelled', 'No-Show']);
    assert.deepEqual(
      AppointmentType.values().map((t) => [t.label, t.feeMultiplier]),
      [['Consultation', 1], ['Follow-up', 0.6], ['General Check-up', 0.8], ['Emergency', 1.5]],
    );
    assert.equal(AppointmentStatus.from('NO_SHOW'), AppointmentStatus.NO_SHOW);
    assert.ok(AppointmentStatus.COMPLETED.isClosed);
    assert.equal(AppointmentStatus.SCHEDULED.isClosed, false);
  });
});

describe('Appointment', () => {
  it('starts as Scheduled and trims the reason', () => {
    const a = makeAppointment();
    assert.equal(a.status, AppointmentStatus.SCHEDULED);
    assert.ok(a.isActive());
    assert.equal(a.reason, 'Chest pain');
    assert.equal(a.remarks, '');
    assert.equal(a.date.toString(), '2026-11-12');
    assert.equal(a.time.toString(), '09:00');
    assert.ok(Date.parse(a.createdAt) > 0);
    assert.equal(String(a), 'A-0001 - Juan Dela Cruz with Dr. Maria Santos');
  });

  it('implements Identifiable, Billable and Searchable', () => {
    const a = makeAppointment();
    for (const contract of [Identifiable, Billable, Searchable]) {
      assert.ok(implementsInterface(a, contract));
    }
  });

  it('requires patient, staff, date, time, type and reason', () => {
    assert.throws(() => makeAppointment({ patient: undefined }), /Patient, staff, date, time and type are required/);
    assert.throws(() => makeAppointment({ staff: /** @type {any} */ (makePatient()) }), /are required/);
    assert.throws(() => makeAppointment({ date: undefined }), /are required/);
    assert.throws(() => makeAppointment({ time: '' }), /are required/);
    assert.throws(() => makeAppointment({ type: undefined }), /are required/);
    assert.throws(() => makeAppointment({ reason: ' ' }), /Reason for visit is required/);
    assert.throws(() => makeAppointment({ type: 'SURGERY' }), ValidationError);
  });

  it('has no status setter (encapsulation)', () => {
    const a = makeAppointment();
    assert.throws(() => {
      /** @type {any} */ (a).status = AppointmentStatus.COMPLETED;
    }, TypeError);
    assert.equal(a.status, AppointmentStatus.SCHEDULED);
  });

  it('computes the fee as staff base fee x type multiplier', () => {
    const cardiologist = makeDoctor({ serviceArea: 'Cardiology' });
    assert.equal(makeAppointment({ staff: cardiologist, type: 'CONSULTATION' }).computeFee(), 800);
    assert.equal(makeAppointment({ staff: makeDoctor(), type: 'FOLLOW_UP' }).computeFee(), 300);
    assert.equal(makeAppointment({ staff: makeDentist(), type: 'CHECK_UP' }).computeFee(), 560);
    assert.equal(makeAppointment({ staff: makeNurse(), type: 'EMERGENCY' }).computeFee(), 375);
    assert.equal(Appointment.estimateFee(makeNurse(), AppointmentType.FOLLOW_UP), 150);
  });

  it('charges nothing when cancelled or a no-show', () => {
    const cancelled = makeAppointment();
    cancelled.cancel('Conflict');
    assert.equal(cancelled.computeFee(), 0);
    const noShow = makeAppointment();
    noShow.markNoShow();
    assert.equal(noShow.computeFee(), 0);
    const done = makeAppointment();
    done.complete('OK');
    assert.equal(done.computeFee(), 800);
  });

  it('completes with findings', () => {
    const a = makeAppointment();
    assert.throws(() => a.complete('  '), /Please enter the findings or notes for this visit/);
    assert.throws(() => a.complete(/** @type {any} */ (undefined)), /findings/);
    a.complete(' Normal. ');
    assert.equal(a.status, AppointmentStatus.COMPLETED);
    assert.equal(a.remarks, 'Normal.');
    assert.equal(a.isActive(), false);
  });

  it('cancels with a reason', () => {
    const a = makeAppointment();
    assert.throws(() => a.cancel(''), /Please enter a reason for cancelling/);
    a.cancel(' Patient is out of town ');
    assert.equal(a.status, AppointmentStatus.CANCELLED);
    assert.equal(a.remarks, 'Cancelled: Patient is out of town');
  });

  it('marks a no-show', () => {
    const a = makeAppointment();
    a.markNoShow();
    assert.equal(a.status, AppointmentStatus.NO_SHOW);
    assert.equal(a.remarks, 'Patient did not arrive.');
  });

  it('reschedules', () => {
    const a = makeAppointment();
    a.reschedule('2026-11-13', TimeOfDay.of(14));
    assert.equal(a.date.toString(), '2026-11-13');
    assert.equal(a.time.toString(), '14:00');
    assert.throws(() => a.reschedule(/** @type {any} */ (null), '10:00'), /New date and time are required/);
  });

  it('only a scheduled appointment can change', () => {
    const a = makeAppointment();
    a.complete('Done');
    const expected = (/** @type {string} */ action) => (/** @type {unknown} */ err) => {
      assert.ok(err instanceof InvalidStateError);
      assert.equal(err.message, `Only scheduled appointments can be ${action}. Appointment A-0001 is already Completed.`);
      return true;
    };
    assert.throws(() => a.complete('Again'), expected('completed'));
    assert.throws(() => a.cancel('x'), expected('cancelled'));
    assert.throws(() => a.markNoShow(), expected('marked as no-show'));
    assert.throws(() => a.reschedule('2026-11-20', '09:00'), expected('rescheduled'));
  });

  it('ends after one slot of the staff member', () => {
    assert.equal(makeAppointment({ staff: makeDentist() }).getEndTime().toString(), '10:00');
    assert.equal(makeAppointment({ staff: makeNurse() }).getEndTime().toString(), '09:15');
  });

  it('detects overlapping time windows on the same date', () => {
    const a = makeAppointment(); // 09:00-09:30 on 2026-11-12
    const day = CalendarDate.parse('2026-11-12');
    const t = (/** @type {string} */ s) => TimeOfDay.parse(s);
    assert.ok(a.overlapsWith(day, t('09:00'), t('09:30')));
    assert.ok(a.overlapsWith(day, t('08:30'), t('09:30')));
    assert.ok(a.overlapsWith(day, t('09:15'), t('09:30')));
    assert.equal(a.overlapsWith(day, t('08:30'), t('09:00')), false);
    assert.equal(a.overlapsWith(day, t('09:30'), t('10:00')), false);
    assert.equal(a.overlapsWith(day.plusDays(1), t('09:00'), t('09:30')), false);
  });

  it('sorts by date, then time', () => {
    const later = makeAppointment({ id: 'A-0002', time: '10:00' });
    const earlier = makeAppointment({ id: 'A-0003', time: '08:00' });
    const nextDay = makeAppointment({ id: 'A-0004', date: '2026-11-13', time: '08:00' });
    assert.deepEqual([nextDay, later, earlier].sort((x, y) => x.compareTo(y)).map((x) => x.id), ['A-0003', 'A-0002', 'A-0004']);
  });

  it('matches the ID, patient, staff, reason or type', () => {
    const a = makeAppointment();
    for (const k of ['', 'a-0001', 'juan', 'P-0001', 'santos', 'chest', 'consult']) {
      assert.ok(a.matches(k), k);
    }
    assert.equal(a.matches('dental'), false);
  });

  it('prints the same summary layout as the Java details window', () => {
    const a = makeAppointment();
    a.complete('Stable.');
    assert.equal(
      a.getSummary(),
      [
        'Appointment ID:   A-0001',
        'Status:           Completed',
        'Patient:          Juan Dela Cruz (P-0001)',
        'Attending Staff:  Dr. Maria Santos - Doctor (Cardiology)',
        'Date:             November 12, 2026 (Thursday)',
        'Time:             09:00 AM - 09:30 AM',
        'Type:             Consultation',
        'Reason for Visit: Chest pain',
        'Fee:              PHP 800.00',
        'Remarks:          Stable.',
      ].join('\n'),
    );
    assert.match(makeAppointment().getSummary(), /Remarks:\s+-$/);
  });
});

describe('Record mappers', () => {
  it('RecordMapper is abstract', () => {
    assert.throws(() => new RecordMapper(), /abstract/);
    class Half extends RecordMapper {}
    assert.throws(() => new Half().toRecord({}), /toRecord/);
    assert.throws(() => new Half().fromRecord({}), /fromRecord/);
  });

  it('round-trips a patient', () => {
    const mapper = new PatientMapper();
    const record = mapper.toRecord(makePatient());
    assert.equal(record.birthDate, '1990-03-14');
    assert.deepEqual(mapper.toRecord(mapper.fromRecord(record)), record);
  });

  it('round-trips each kind of staff through the factory', () => {
    const mapper = new StaffMapper();
    for (const staff of [makeDoctor(), makeDentist({ active: false }), makeNurse()]) {
      const record = mapper.toRecord(staff);
      const copy = mapper.fromRecord(record);
      assert.equal(copy.constructor, staff.constructor);
      assert.deepEqual(mapper.toRecord(copy), record);
    }
  });

  it('round-trips an appointment, restoring its status and linking patient and staff', () => {
    const patient = makePatient();
    const staff = makeDoctor();
    const a = makeAppointment({ patient, staff });
    a.cancel('Rain');
    const mapper = new AppointmentMapper({ findPatient: () => patient, findStaff: () => staff });
    const record = mapper.toRecord(a);
    assert.equal(record.status, 'CANCELLED');
    const copy = mapper.fromRecord(record);
    assert.equal(copy.status, AppointmentStatus.CANCELLED);
    assert.equal(copy.remarks, 'Cancelled: Rain');
    assert.equal(copy.patient, patient);
    assert.equal(copy.createdAt, a.createdAt);
    assert.deepEqual(mapper.toRecord(copy), record);
  });

  it('accepts patient and staff inline, and fails when a link is missing', () => {
    const a = makeAppointment();
    const record = {
      ...new AppointmentMapper().toRecord(a),
      patient: new PatientMapper().toRecord(a.patient),
      staff: new StaffMapper().toRecord(a.staff),
    };
    assert.equal(new AppointmentMapper().fromRecord(record).staff.getDisplayName(), 'Dr. Maria Santos');
    const { patient: _p, staff: _s, ...bare } = record;
    assert.throws(() => new AppointmentMapper().fromRecord(bare), NotFoundError);
    const restored = Appointment.restore(
      { id: 'A-1', patient: a.patient, staff: a.staff, date: '2026-11-12', time: '09:00', type: 'CONSULTATION', reason: 'x' },
      { status: 'SCHEDULED' },
    );
    assert.equal(restored.remarks, '');
  });
});

describe('contracts (interfaces)', () => {
  it('checks methods and properties', () => {
    assert.ok(implementsInterface({ computeFee() {} }, ['computeFee']));
    assert.equal(implementsInterface({ computeFee: 5 }, ['computeFee']), false);
    assert.equal(implementsInterface(null, Billable), false);
    assert.equal(implementsInterface('text', Billable), false);
    assert.equal(implementsInterface({}, Identifiable), false);
    assert.ok(implementsInterface({ id: 'x' }, Identifiable));
    const Printable = defineContract('Printable', { methods: ['print'] });
    assert.ok(Object.isFrozen(Printable));
    assert.throws(() => assertImplements({}, Printable), /does not implement Printable/);
    const ok = { print() {} };
    assert.equal(assertImplements(ok, Printable), ok);
    assert.match(abstractMethod({}, 'x').message, /Object must implement the abstract method x/);
  });

  it('formats pesos like the Java version', () => {
    assert.equal(formatPeso(1234.5), 'PHP 1,234.50');
    assert.equal(formatPeso(0), 'PHP 0.00');
  });
});
