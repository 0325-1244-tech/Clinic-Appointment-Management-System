import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { newDb } from 'pg-mem';
import { Clock } from '../../src/domain/index.js';
import { startServer } from './harness.js';

/**
 * Official mode: PostgreSQL storage (an in-memory PostgreSQL here), an empty
 * clinic, no demo accounts, and the first administrator from the settings.
 */
const { Pool } = newDb().adapters.createPg();
const pool = new Pool();
const official = { demoMode: false, storage: 'postgres', sqlClient: pool, admin: { username: 'owner', password: 'owner-password' } };

/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
/** @type {import('./harness.js').TestClient} */
let owner;

before(async () => {
  srv = await startServer(official);
  owner = await srv.login('owner', 'owner-password');
});
after(async () => {
  await srv.close();
  Clock.use(undefined);
});

const nurse = {
  role: 'Nurse', firstName: 'Rosa', lastName: 'Lim', contactNumber: '09171239999', email: '', licenseNumber: 'PRC-7777',
  serviceArea: 'Triage', workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], shiftStart: '08:00', shiftEnd: '12:00',
};
const doctor = { ...nurse, role: 'Doctor', firstName: 'Paolo', lastName: 'Cruz', licenseNumber: 'PRC-8888', serviceArea: 'General Medicine' };

describe('official mode', () => {
  it('shows no demo accounts and starts with an empty clinic', async () => {
    const config = (await srv.client().get('/api/config')).data;
    assert.equal(config.demoMode, false);
    assert.deepEqual(config.demoAccounts, []);
    assert.equal(config.needsSetup, false);
    assert.deepEqual((await owner.get('/api/patients')).data.patients, []);
    assert.deepEqual((await owner.get('/api/staff')).data.staff, []);
    const demo = await srv.client().post('/api/auth/login', { username: 'admin', password: 'admin123' });
    assert.equal(demo.status, 401, 'demo accounts do not exist');
  });

  it('lets the administrator create, edit and deactivate accounts; nobody else can', async () => {
    const created = await owner.post('/api/users', { username: 'frontdesk', displayName: 'Front Desk', role: 'RECEPTIONIST', password: 'desk-password' });
    assert.equal(created.status, 201);
    assert.equal(JSON.stringify(created.data).includes('scrypt'), false, 'password hashes never leave the server');
    const desk = await srv.login('frontdesk', 'desk-password');
    assert.equal((await desk.get('/api/users')).status, 403);

    const staff = (await owner.post('/api/staff', doctor)).data.staff;
    const noLink = await owner.post('/api/users', { username: 'drcruz', displayName: 'Dr. Cruz', role: 'DOCTOR', password: 'doctor-password' });
    assert.equal(noLink.status, 422);
    assert.equal(noLink.data.error.field, 'staffId');
    const badLink = await owner.post('/api/users', { username: 'drcruz', displayName: 'Dr. Cruz', role: 'DOCTOR', staffId: 'S-9999', password: 'doctor-password' });
    assert.equal(badLink.status, 404);
    const doc = await owner.post('/api/users', { username: 'drcruz', displayName: 'Dr. Cruz', role: 'DOCTOR', staffId: staff.id, password: 'doctor-password' });
    assert.equal(doc.data.user.staffName, 'Dr. Paolo Cruz');
    const short = await owner.post('/api/users', { username: 'x1y2', displayName: 'X', role: 'RECEPTIONIST', password: 'short' });
    assert.equal(short.status, 422);
    const taken = await owner.post('/api/users', { username: 'FrontDesk', displayName: 'X', role: 'RECEPTIONIST', password: 'desk-password' });
    assert.equal(taken.status, 409);

    const list = (await owner.get('/api/users')).data.users;
    assert.deepEqual(list.map((u) => u.username), ['owner', 'frontdesk', 'drcruz']);

    const deskId = created.data.user.id;
    const off = await owner.put(`/api/users/${deskId}`, { displayName: 'Front Desk', role: 'RECEPTIONIST', active: false });
    assert.equal(off.data.user.active, false);
    assert.equal((await desk.get('/api/patients')).status, 401, 'deactivated accounts are signed out at once');
    const self = await owner.put(`/api/users/${list[0].id}`, { displayName: 'Owner', role: 'ADMIN', active: false });
    assert.equal(self.status, 422);
    await owner.put(`/api/users/${deskId}`, { displayName: 'Front Desk', role: 'RECEPTIONIST', active: true });
    const reset = await owner.post(`/api/users/${deskId}/password`, { password: 'reset-password-1' });
    assert.equal(reset.status, 204);
    assert.ok(await srv.login('frontdesk', 'reset-password-1'));
  });

  it('lets anyone change their own password', async () => {
    const desk = await srv.login('frontdesk', 'reset-password-1');
    const wrong = await desk.post('/api/auth/password', { currentPassword: 'nope', newPassword: 'another-password' });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.data.error.field, 'currentPassword');
    assert.equal((await desk.post('/api/auth/password', { currentPassword: 'reset-password-1', newPassword: 'another-password' })).status, 204);
    assert.equal((await desk.get('/api/auth/me')).data.user.username, 'frontdesk', 'the current session stays signed in');
    assert.equal((await srv.client().post('/api/auth/password', { currentPassword: 'x', newPassword: 'y' })).status, 401);
  });

  it('keeps every record and account in the database across a restart', async () => {
    const created = (await owner.post('/api/patients', {
      firstName: 'Bea', lastName: 'Navarro', contactNumber: '09181112206', email: '', birthDate: '2001-09-17', gender: 'Female',
      address: 'Brgy. Duhat, Santa Cruz, Laguna', bloodType: '',
    })).data.patient;
    await owner.post('/api/staff', nurse);
    await srv.context.close();
    await srv.close();

    srv = await startServer(official);
    owner = await srv.login('owner', 'owner-password');
    const patients = (await owner.get('/api/patients')).data.patients;
    assert.deepEqual(patients.map((p) => p.id), [created.id]);
    assert.equal((await owner.get('/api/staff')).data.staff.length, 2);
    assert.ok(await srv.login('frontdesk', 'another-password'), 'accounts and changed passwords are kept');
    const audit = (await owner.get('/api/audit?limit=500')).data.entries;
    assert.ok(audit.some((e) => e.action === 'user.created'), 'the audit log is kept too');
  });

  it('reports a database failure on the health check so the service is restarted', async () => {
    assert.equal((await srv.client().get('/api/health')).status, 200);
    srv.context.health.fail(new Error('write failed'));
    const res = await srv.client().get('/api/health');
    assert.equal(res.status, 503);
    assert.deepEqual(res.data, { status: 'degraded' });
  });
});

describe('official mode without an administrator', () => {
  it('asks for setup instead of exposing any default account', async () => {
    const empty = await startServer({ demoMode: false, storage: 'memory' });
    try {
      const config = (await empty.client().get('/api/config')).data;
      assert.equal(config.needsSetup, true);
      assert.deepEqual(config.demoAccounts, []);
      assert.equal((await empty.client().post('/api/auth/login', { username: 'admin', password: 'admin123' })).status, 401);
    } finally {
      await empty.close();
    }
  });

  it('can load the sample records when asked (SAMPLE_DATA=true)', async () => {
    const withSample = await startServer({ demoMode: false, storage: 'memory', sampleData: true, admin: { password: 'owner-password' } });
    try {
      const admin = await withSample.login('admin', 'owner-password');
      assert.equal((await admin.get('/api/patients')).data.patients.length, 8);
    } finally {
      await withSample.close();
    }
  });
});
