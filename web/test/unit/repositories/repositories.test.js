import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, afterEach, before, describe, it } from 'node:test';
import { AppointmentStatus, Clock, ConflictError, NotFoundError, ValidationError } from '../../../src/domain/index.js';
import { PatientMapper } from '../../../src/domain/mappers.js';
import { ClinicDatabase } from '../../../src/repositories/ClinicDatabase.js';
import { InMemoryRepository } from '../../../src/repositories/InMemoryRepository.js';
import { JsonFileRepository } from '../../../src/repositories/JsonFileRepository.js';
import { Repository } from '../../../src/repositories/Repository.js';
import { ClinicService } from '../../../src/services/ClinicService.js';
import { SampleDataLoader } from '../../../src/services/SampleDataLoader.js';
import { freezeClock, makePatient } from '../../helpers.js';

/** @type {string[]} */
const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'careconnect-'));
  tempDirs.push(dir);
  return dir;
}

before(() => freezeClock());
after(() => Clock.use(undefined));
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Repository (abstract)', () => {
  it('cannot be instantiated, and unimplemented methods fail clearly', () => {
    assert.throws(() => new Repository(), /Repository is abstract/);
    class Empty extends Repository {}
    const repo = new Empty();
    for (const call of [() => repo.nextId(), () => repo.add({ id: 'x' }), () => repo.update({ id: 'x' }),
      () => repo.remove('x'), () => repo.findById('x'), () => repo.findAll(), () => repo.count(), () => repo.findWhere(() => true)]) {
      assert.throws(call, /must implement the abstract method/);
    }
  });
});

describe('InMemoryRepository', () => {
  it('generates IDs with the prefix and only advances the counter when the ID is used', () => {
    const repo = new InMemoryRepository('P');
    assert.equal(repo.prefix, 'P');
    assert.equal(repo.nextId(), 'P-0001');
    assert.equal(repo.nextId(), 'P-0001');
    repo.add({ id: repo.nextId() });
    assert.equal(repo.nextId(), 'P-0002');
    repo.add({ id: 'CUSTOM' });
    assert.equal(repo.nextId(), 'P-0002', 'a non-generated ID does not move the counter');
    repo.add({ id: 'P-0003' });
    assert.equal(repo.nextId(), 'P-0004');
  });

  it('never hands out an ID that is already taken', () => {
    const repo = new InMemoryRepository('A');
    repo.restore(0, [{ id: 'A-0001' }]);
    assert.equal(repo.nextId(), 'A-0002');
  });

  it('rejects empty items, items without an ID and duplicates', () => {
    const repo = new InMemoryRepository('P');
    assert.throws(() => repo.add(/** @type {any} */ (null)), ValidationError);
    assert.throws(() => repo.add(/** @type {any} */ ({ name: 'x' })), /does not implement Identifiable/);
    repo.add({ id: 'P-0001' });
    assert.throws(() => repo.add({ id: 'P-0001' }), (err) => err instanceof ConflictError && /P-0001 already exists/.test(err.message));
  });

  it('finds, filters, counts, updates and removes, returning copies of the list', () => {
    const repo = new InMemoryRepository('P');
    const a = { id: 'P-0001', n: 1 };
    const b = { id: 'P-0002', n: 2 };
    repo.add(a);
    repo.add(b);
    assert.equal(repo.findById('P-0002'), b);
    assert.equal(repo.findById('nope'), undefined);
    assert.deepEqual(repo.findWhere((x) => x.n > 1), [b]);
    const list = repo.findAll();
    list.pop();
    assert.equal(repo.count(), 2, 'changing the returned list does not change the repository');
    repo.update(a);
    assert.throws(() => repo.update({ id: 'P-0001', n: 9 }), NotFoundError);
    assert.throws(() => repo.update(/** @type {any} */ (undefined)), NotFoundError);
    assert.equal(repo.remove('P-0001'), true);
    assert.equal(repo.remove('P-0001'), false);
    assert.equal(repo.count(), 1);
  });
});

describe('JsonFileRepository', () => {
  it('writes every change to disk and reads it back', () => {
    const file = path.join(tempDir(), 'nested', 'patients.json');
    const repo = new JsonFileRepository({ file, prefix: 'P', mapper: new PatientMapper() });
    assert.equal(repo.file, file);
    const p = makePatient({ id: repo.nextId() });
    repo.add(p);
    p.firstName = 'Juanito';
    repo.update(p);
    repo.add(makePatient({ id: repo.nextId() }));
    assert.equal(repo.remove('P-0002'), true);
    assert.equal(repo.remove('P-0002'), false);
    assert.equal(fs.existsSync(`${file}.tmp`), false, 'temporary file is renamed away');

    const reopened = new JsonFileRepository({ file, prefix: 'P', mapper: new PatientMapper() });
    assert.equal(reopened.count(), 1);
    assert.equal(reopened.findById('P-0001')?.firstName, 'Juanito');
    assert.equal(reopened.nextId(), 'P-0003', 'the counter is saved too');
  });

  it('refuses a file that is not clinic data', () => {
    const file = path.join(tempDir(), 'bad.json');
    fs.writeFileSync(file, '{"hello":1}');
    assert.throws(() => new JsonFileRepository({ file, prefix: 'P', mapper: new PatientMapper() }), /not a valid clinic data file/);
  });
});

describe('ClinicDatabase', () => {
  it('starts empty and loads the Java sample data on first run', () => {
    const db = ClinicDatabase.inMemory();
    assert.ok(db.isEmpty());
    SampleDataLoader.populate(db, Clock.current());
    assert.equal(db.isEmpty(), false);
    assert.equal(db.staff.count(), 6);
    assert.equal(db.patients.count(), 8);
    const appointments = db.appointments.findAll();
    assert.ok(appointments.length >= 14 && appointments.length <= 16);
    const count = (/** @type {AppointmentStatus} */ s) => appointments.filter((a) => a.status === s).length;
    assert.equal(count(AppointmentStatus.COMPLETED), 6);
    assert.equal(count(AppointmentStatus.CANCELLED), 1);
    assert.equal(count(AppointmentStatus.NO_SHOW), 1);
    assert.deepEqual(db.staff.findAll().map((s) => s.getDisplayName()), [
      'Dr. Maria Santos', 'Dr. Jose Reyes', 'Dr. Ana Villanueva', 'Dr. Carlo Mendoza, DMD', 'Liza Bautista, RN', 'Mark Dela Cruz, RN',
    ]);
  });

  it('sample data never double-books anyone and every visit is on a working day', () => {
    const db = ClinicDatabase.inMemory();
    SampleDataLoader.populate(db, Clock.current());
    const active = db.appointments.findAll().filter((a) => a.isActive());
    for (const a of db.appointments.findAll()) {
      assert.ok(a.staff.worksOn(a.date.dayOfWeek), `${a.id} is on a working day`);
      assert.ok(a.staff.isValidSlot(a.time), `${a.id} is on a valid slot`);
    }
    for (const a of active) {
      const clash = active.find((b) => b !== a && (b.staff === a.staff || b.patient === a.patient) &&
        b.overlapsWith(a.date, a.time, a.getEndTime()));
      assert.equal(clash, undefined, `${a.id} overlaps ${clash?.id}`);
    }
    assert.throws(() => new SampleDataLoader(), TypeError);
  });

  it('saves everything as JSON files and links appointments back on load', () => {
    const dir = tempDir();
    const db = ClinicDatabase.jsonFiles(dir);
    SampleDataLoader.populate(db, Clock.current());
    assert.deepEqual(fs.readdirSync(dir).sort(), ['appointments.json', 'patients.json', 'staff.json']);

    const again = ClinicDatabase.jsonFiles(dir);
    assert.equal(again.appointments.count(), db.appointments.count());
    const a = again.appointments.findById('A-0001');
    assert.equal(a?.patient, again.patients.findById(a?.patient.id ?? ''), 'appointment points to the loaded patient object');
    assert.equal(a?.status, AppointmentStatus.COMPLETED);
    const service = new ClinicService(again);
    assert.equal(service.getCollectedFees(), new ClinicService(db).getCollectedFees());
  });

  it('works the same on SQLite (node:sqlite)', () => {
    const file = path.join(tempDir(), 'clinic.db');
    const sqlite = new DatabaseSync(file);
    const db = ClinicDatabase.sqlite(sqlite);
    SampleDataLoader.populate(db, Clock.current());
    const service = new ClinicService(db);
    const first = service.getPatient('P-0001');
    service.updatePatient(first, { ...new PatientMapper().toRecord(first), firstName: 'Johnny' });
    const removable = service.registerPatient({ ...new PatientMapper().toRecord(first), firstName: 'Temp' });
    service.removePatient(removable);
    sqlite.close();

    const reopened = new DatabaseSync(file);
    const again = ClinicDatabase.sqlite(reopened);
    assert.equal(again.patients.count(), 8);
    assert.equal(again.patients.findById('P-0001')?.firstName, 'Johnny');
    assert.equal(again.patients.nextId(), 'P-0010');
    assert.equal(again.appointments.count(), db.appointments.count());
    reopened.close();
  });
});
