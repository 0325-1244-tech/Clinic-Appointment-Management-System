import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { newDb } from 'pg-mem';
import { AppointmentStatus, Clock, PatientMapper } from '../../../src/domain/index.js';
import { ClinicDatabase } from '../../../src/repositories/ClinicDatabase.js';
import { PostgresRepository } from '../../../src/repositories/PostgresRepository.js';
import { ClinicService } from '../../../src/services/ClinicService.js';
import { SampleDataLoader } from '../../../src/services/SampleDataLoader.js';
import { freezeClock, makePatient } from '../../helpers.js';

/** An in-memory PostgreSQL server (pg-mem) with the same API as the `pg` driver. */
function newPool() {
  const { Pool } = newDb().adapters.createPg();
  return new Pool();
}

before(() => freezeClock());
after(() => Clock.use(undefined));

describe('PostgresRepository', () => {
  it('creates its table, writes every change in order and reads it back', async () => {
    const pool = newPool();
    const repo = await PostgresRepository.open({ client: pool, table: 'patients', prefix: 'P', mapper: new PatientMapper() });
    const p = makePatient({ id: repo.nextId() });
    repo.add(p);
    p.firstName = 'Juanito';
    repo.update(p);
    repo.add(makePatient({ id: repo.nextId() }));
    assert.equal(repo.remove('P-0002'), true);
    assert.equal(repo.remove('P-0002'), false);
    await repo.flush();

    const again = await PostgresRepository.open({ client: pool, table: 'patients', prefix: 'P', mapper: new PatientMapper() });
    assert.equal(again.count(), 1);
    assert.equal(again.findById('P-0001')?.firstName, 'Juanito');
    assert.equal(again.nextId(), 'P-0003', 'the ID counter is stored too');
  });

  it('reports a failed write instead of crashing', async () => {
    /** @type {unknown[]} */
    const errors = [];
    const failing = {
      calls: 0,
      async query(/** @type {string} */ sql) {
        this.calls += 1;
        if (sql.startsWith('INSERT INTO patients')) throw new Error('connection lost');
        return { rows: [] };
      },
    };
    const repo = await PostgresRepository.open({ client: failing, table: 'patients', prefix: 'P', mapper: new PatientMapper(), onError: (e) => errors.push(e) });
    repo.add(makePatient());
    await repo.flush();
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /connection lost/);
    assert.equal(repo.count(), 1, 'the change stays in memory; the health check reports the failure');
  });

  it('rejects unsafe table names', () => {
    assert.throws(() => new PostgresRepository({ client: newPool(), table: 'x; DROP TABLE y', prefix: 'P', mapper: new PatientMapper() }), /Invalid table name/);
  });
});

describe('ClinicDatabase.postgres', () => {
  it('stores the whole clinic and links appointments back to their patients and staff', async () => {
    const pool = newPool();
    const db = await ClinicDatabase.postgres(pool);
    assert.ok(db.isEmpty());
    SampleDataLoader.populate(db, Clock.current());
    const service = new ClinicService(db);
    const juan = service.getPatient('P-0001');
    service.updatePatient(juan, { ...new PatientMapper().toRecord(juan), firstName: 'Johnny' });
    const extra = await db.openRepository('notes', 'N', new PatientMapper());
    extra.add(makePatient({ id: 'N-0001' }));
    await db.flush();

    const again = await ClinicDatabase.postgres(pool);
    assert.equal(again.patients.count(), 8);
    assert.equal(again.staff.count(), 6);
    assert.equal(again.appointments.count(), db.appointments.count());
    assert.equal(again.patients.findById('P-0001')?.firstName, 'Johnny');
    const first = again.appointments.findById('A-0001');
    assert.equal(first?.status, AppointmentStatus.COMPLETED);
    assert.equal(first?.patient, again.patients.findById('P-0001'), 'linked to the loaded patient object');
    assert.equal((await again.openRepository('notes', 'N', new PatientMapper())).count(), 1);
    assert.equal(new ClinicService(again).getCollectedFees(), service.getCollectedFees());
  });
});
