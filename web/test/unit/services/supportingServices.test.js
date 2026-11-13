import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { AppointmentStatus, Clock, PatientMapper } from '../../../src/domain/index.js';
import { ClinicDatabase } from '../../../src/repositories/ClinicDatabase.js';
import { InMemoryRepository } from '../../../src/repositories/InMemoryRepository.js';
import { AuditEntry, AuditEntryMapper, AuditLog } from '../../../src/services/AuditLog.js';
import { ClinicService } from '../../../src/services/ClinicService.js';
import { QueueService, QueueState } from '../../../src/services/QueueService.js';
import { RequestContext } from '../../../src/services/RequestContext.js';
import { SampleDataLoader } from '../../../src/services/SampleDataLoader.js';
import { StatsService } from '../../../src/services/StatsService.js';
import { freezeClock } from '../../helpers.js';

/** @type {ClinicService} */
let service;
/** @type {import('../../../src/domain/time/Clock.js').FixedClock} */
let clock;

beforeEach(() => {
  clock = freezeClock('2026-11-11', '08:00'); // Wednesday: everybody except Dr. Villanueva works today
  const db = ClinicDatabase.inMemory();
  SampleDataLoader.populate(db, clock);
  service = new ClinicService(db, { clock });
});
after(() => Clock.use(undefined));

describe('StatsService', () => {
  it('builds the dashboard numbers from the sample data', () => {
    const d = new StatsService(service).dashboard();
    assert.equal(d.patientCount, 8);
    assert.equal(d.activeStaffCount, 6);
    assert.deepEqual(d.todaysAppointments.map((a) => a.reason), ['Blood pressure monitoring', 'Annual physical examination']);
    assert.equal(d.upcomingCount, 8);
    assert.equal(d.completedCount, 6);
    assert.equal(d.collectedFees, 500 + 640 + 800 + 700 + 200 + 300);
    assert.equal(d.staffOnDuty.length, 5);
  });

  it('limits the dashboard to one staff member', () => {
    const santos = service.getStaffMember('S-0001');
    const d = new StatsService(service).dashboard({ staff: santos });
    assert.equal(d.patientCount, 3);
    assert.equal(d.completedCount, 2);
    assert.equal(d.collectedFees, 800);
    assert.ok(d.todaysAppointments.every((a) => a.staff === santos));
  });

  it('computes 14-day volume, status breakdown, fees by staff type and busiest staff', () => {
    const a = new StatsService(service).analytics();
    assert.equal(a.perDay.length, 14);
    assert.equal(a.perDay.at(-1)?.date.toString(), '2026-11-11');
    assert.equal(a.perDay.reduce((sum, d) => sum + d.total, 0), 9, 'days -13..0: 7 closed visits (the one 14 days ago is outside) + 2 today');
    assert.deepEqual(a.statusBreakdown.map((s) => [s.status.code, s.count]),
      [['SCHEDULED', 8], ['COMPLETED', 6], ['CANCELLED', 1], ['NO_SHOW', 1]]);
    assert.deepEqual(a.feesByRole.map((f) => [f.role, f.amount, f.visits]),
      [['Doctor', 2240, 4], ['Dentist', 700, 1], ['Nurse', 200, 1]]);
    assert.equal(a.busiestStaff[0].staff.id, 'S-0001');
    assert.ok(a.busiestStaff.length <= 5);
    const mine = new StatsService(service).analytics({ staff: service.getStaffMember('S-0004'), days: 7 });
    assert.equal(mine.perDay.length, 7);
    assert.deepEqual(mine.feesByRole.map((f) => f.amount), [0, 700, 0]);
  });
});

describe('AuditLog (observer)', () => {
  it('records each service change with the signed-in user', () => {
    const log = new AuditLog({ repository: new InMemoryRepository('L') }).observe(service);
    const juan = service.getPatient('P-0001');
    RequestContext.run({ username: 'reception', role: 'Receptionist' }, () => {
      service.updatePatient(juan, { ...new PatientMapper().toRecord(juan), firstName: 'Juanito' });
    });
    service.setStaffActive(service.getStaffMember('S-0006'), false);
    const [latest, first] = log.list();
    assert.equal(first.actor, 'reception');
    assert.equal(first.actorRole, 'Receptionist');
    assert.equal(first.action, 'patient.updated');
    assert.equal(first.entityId, 'P-0001');
    assert.equal(first.summary, 'Updated patient P-0001', 'IDs, not names, in the audit log');
    assert.ok(Date.parse(first.at) > 0);
    assert.equal(latest.actor, 'system', 'changes outside a request are made by "system"');
    assert.equal(log.list({ entityId: 'S-0006' }).length, 1);
    assert.equal(log.list({ limit: 1 }).length, 1);
  });

  it('drops the oldest entries beyond its limit, and entries are immutable', () => {
    const log = new AuditLog({ repository: new InMemoryRepository('L'), limit: 2 });
    for (const n of [1, 2, 3]) {
      log.record({ action: 'test', entityType: 'patient', entityId: `P-${n}`, summary: String(n) });
    }
    assert.deepEqual(log.list().map((e) => e.summary), ['3', '2']);
    const entry = log.list()[0];
    assert.ok(Object.isFrozen(entry));
    const mapper = new AuditEntryMapper();
    assert.deepEqual(mapper.toRecord(mapper.fromRecord(entry.toRecord())), entry.toRecord());
    assert.ok(new AuditEntry(entry.toRecord()) instanceof AuditEntry);
    assert.throws(() => new RequestContext(), TypeError);
  });
});

describe('QueueService', () => {
  /** @type {QueueService} */
  let queue;
  /** @type {any[]} */
  let today;
  beforeEach(() => {
    queue = new QueueService(service);
    today = service.findAppointments(clock.today()); // [Paolo with Nurse Bautista 14:00, Juan with Dr. Santos 16:00]
  });

  it('checks in today\'s scheduled patients and calls them in', () => {
    let updates = 0;
    queue.on('update', () => {
      updates += 1;
    });
    const [paolo, juan] = today;
    queue.checkIn(juan);
    queue.checkIn(paolo);
    assert.equal(queue.stateOf(juan), QueueState.WAITING);
    assert.deepEqual(queue.entries().map((e) => e.appointment.id), [paolo.id, juan.id]);
    queue.call(juan);
    assert.equal(queue.stateOf(juan), QueueState.SERVING);
    assert.equal(updates, 3);

    const board = queue.board();
    const santos = board.find((row) => row.staffId === 'S-0001');
    assert.deepEqual(santos?.nowServing, { ticket: 'Q-001', initials: 'J.D.' });
    assert.equal(queue.ticketOf(paolo), 'Q-002');
    assert.equal(santos?.staffName, 'Dr. Maria Santos');
    const nurse = board.find((row) => row.staffId === 'S-0005');
    assert.deepEqual(nurse?.waiting, [{ ticket: 'Q-002', initials: 'P.M.' }]);
    assert.equal(JSON.stringify(board).includes('Juan') || JSON.stringify(board).includes('Mercado'), false, 'board never shows patient names');
  });

  it('calling the next patient marks the previous one as seen', () => {
    const [, juan] = today;
    const extra = service.bookAppointment({
      patient: service.getPatient('P-0002'), staff: juan.staff, date: clock.today(), time: '16:30', type: 'CHECK_UP', reason: 'x',
    });
    queue.checkIn(juan);
    queue.checkIn(extra);
    queue.call(juan);
    queue.call(extra);
    assert.equal(queue.stateOf(juan), QueueState.SEEN);
    assert.equal(queue.stateOf(extra), QueueState.SERVING);
  });

  it('refuses invalid check-ins and calls', () => {
    const [paolo] = today;
    queue.checkIn(paolo);
    assert.throws(() => queue.checkIn(paolo), /already checked in/);
    const future = service.getUpcomingAppointments().find((a) => !a.date.equals(clock.today()));
    assert.throws(() => queue.checkIn(future), /Only today's appointments/);
    const closed = service.findAppointments(AppointmentStatus.COMPLETED)[0];
    assert.throws(() => queue.checkIn(closed), /cannot be checked in/);
    assert.throws(() => queue.call(today[1]), /has not checked in yet/);
  });

  it('leaves the queue when the appointment is closed, removed by hand, or the day changes', () => {
    const [paolo, juan] = today;
    queue.checkIn(paolo);
    queue.checkIn(juan);
    service.completeAppointment(paolo, 'BP normal');
    assert.equal(queue.stateOf(paolo), undefined);
    service.rescheduleAppointment(juan, '2026-11-12', '16:00');
    assert.equal(queue.stateOf(juan), undefined);
    const other = service.bookAppointment({
      patient: service.getPatient('P-0003'), staff: paolo.staff, date: clock.today(), time: '14:30', type: 'CHECK_UP', reason: 'x',
    });
    queue.checkIn(other);
    service.updatePatient(other.patient, { ...new PatientMapper().toRecord(other.patient), firstName: 'Mike' });
    queue.remove(other);
    queue.remove(other);
    assert.equal(queue.entries().length, 0);
    queue.checkIn(other);
    let updates = 0;
    queue.on('update', () => {
      updates += 1;
    });
    clock.set('2026-11-12');
    queue.tick();
    assert.equal(updates, 1, 'the board is told when the day rolls over');
    assert.equal(queue.entries().length, 0);
  });
});
