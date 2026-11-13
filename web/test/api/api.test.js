import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Clock } from '../../src/domain/index.js';
import { startServer } from './harness.js';

/** @type {Awaited<ReturnType<typeof startServer>>} */
let srv;
/** @type {import('./harness.js').TestClient} */
let admin;
/** @type {import('./harness.js').TestClient} */
let reception;
/** @type {import('./harness.js').TestClient} */
let doctor;

const THURSDAY = '2026-11-12';
const newPatient = {
  firstName: 'Bea', lastName: 'Navarro', contactNumber: '0918 111 2299', email: '', birthDate: '2001-09-17',
  gender: 'Female', address: 'Brgy. Duhat, Santa Cruz, Laguna', bloodType: '',
};
const newNurse = {
  role: 'Nurse', firstName: 'Rosa', lastName: 'Lim', contactNumber: '09171239999', email: 'rosa@careconnect.ph',
  licenseNumber: 'PRC-7777', serviceArea: 'Wound Care', workingDays: ['MONDAY', 'THURSDAY'], shiftStart: '08:00', shiftEnd: '12:00',
};

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  reception = await srv.login('reception', 'reception123');
  doctor = await srv.login('drsantos', 'doctor123');
});
after(async () => {
  await srv.close();
  Clock.use(undefined);
});

describe('public endpoints and security headers', () => {
  it('reports health and the configuration the login page needs', async () => {
    const health = await srv.client().get('/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.data, { status: 'ok' });
    const config = await srv.client().get('/api/config');
    assert.equal(config.data.today, '2026-11-11');
    assert.equal(config.data.demoMode, true);
    assert.deepEqual(config.data.demoAccounts.map((a) => a.username), ['admin', 'reception', 'drsantos']);
    assert.equal(config.data.options.appointmentTypes.length, 4);
    assert.deepEqual(config.data.options.roles.map((r) => r.serviceAreaLabel), ['Specialization', 'Dental Room', 'Department']);
  });

  it('sends strict security headers and no framework banner', async () => {
    const res = await srv.client().get('/api/health');
    assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self';script-src 'self';style-src 'self'/);
    assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('serves the shared domain classes to the browser', async () => {
    const res = await srv.client().get('/domain/Appointment.js');
    assert.equal(res.status, 200);
    assert.match(String(res.data), /export class Appointment/);
  });

  it('returns JSON 404 for unknown API paths', async () => {
    const res = await srv.client().get('/api/nothing-here');
    assert.equal(res.status, 404);
    assert.equal(res.data.error.code, 'NOT_FOUND');
  });
});

describe('authentication', () => {
  it('requires sign-in for clinic data', async () => {
    for (const path of ['/api/patients', '/api/staff', '/api/appointments', '/api/records', '/api/stats/dashboard', '/api/audit', '/api/queue']) {
      const res = await srv.client().get(path);
      assert.equal(res.status, 401, path);
      assert.equal(res.data.error.code, 'UNAUTHENTICATED');
    }
    const me = await srv.client().get('/api/auth/me');
    assert.deepEqual(me.data, { user: null });
  });

  it('signs in with an httpOnly, SameSite=Strict cookie and reports permissions', async () => {
    const c = srv.client();
    const res = await c.post('/api/auth/login', { username: ' Admin ', password: 'admin123' });
    assert.equal(res.status, 200);
    assert.match(res.setCookie ?? '', /cc_session=.+; Max-Age=43200; Path=\/; Expires=.+; HttpOnly; SameSite=Strict/);
    assert.equal(res.data.user.role, 'ADMIN');
    assert.ok(res.data.user.permissions.includes('audit:read'));
    assert.equal(JSON.stringify(res.data).includes('scrypt'), false, 'the password hash never leaves the server');
    const me = await c.get('/api/auth/me');
    assert.equal(me.data.user.username, 'admin');
    assert.equal((await c.post('/api/auth/logout')).status, 204);
    assert.equal((await c.get('/api/auth/me')).data.user, null);
  });

  it('rejects a wrong password with the same message as an unknown user', async () => {
    const wrong = await srv.client().post('/api/auth/login', { username: 'admin', password: 'nope' });
    const unknown = await srv.client().post('/api/auth/login', { username: 'ghost', password: 'nope' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.error.message, 'Incorrect username or password.');
    assert.equal(unknown.data.error.message, wrong.data.error.message);
  });

  it('rate-limits repeated failures for a username', async () => {
    const c = srv.client();
    for (let i = 0; i < 5; i += 1) {
      await c.post('/api/auth/login', { username: 'reception', password: `bad${i}` });
    }
    const blocked = await c.post('/api/auth/login', { username: 'reception', password: 'reception123' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.data.error.code, 'RATE_LIMITED');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });

  it('validates the login body', async () => {
    const res = await srv.client().post('/api/auth/login', { username: 'admin' });
    assert.equal(res.status, 400);
    assert.equal(res.data.error.field, 'password');
  });
});

describe('request checks', () => {
  it('rejects cross-site writes, non-JSON bodies, invalid JSON and unknown fields', async () => {
    const cross = await admin.post('/api/patients', newPatient, { Origin: 'https://evil.example' });
    assert.equal(cross.status, 403);
    const form = await admin.request('POST', '/api/patients', 'a=b', { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(form.status, 400);
    const broken = await admin.request('POST', '/api/patients', '{bad json', { 'Content-Type': 'application/json' });
    assert.equal(broken.status, 400);
    assert.equal(broken.data.error.message, 'The request body is not valid JSON.');
    const extra = await admin.post('/api/patients', { ...newPatient, isAdmin: true });
    assert.equal(extra.status, 400);
    assert.equal(extra.data.error.field, 'isAdmin');
    const wrongType = await admin.post('/api/patients', { ...newPatient, firstName: 5 });
    assert.equal(wrongType.status, 400);
    const array = await admin.post('/api/patients', [1]);
    assert.equal(array.status, 400);
    const huge = await admin.post('/api/patients', { ...newPatient, address: 'x'.repeat(30_000) });
    assert.equal(huge.status, 413);
    const tooLong = await admin.post('/api/patients', { ...newPatient, address: 'x'.repeat(300) });
    assert.equal(tooLong.status, 400);
    const sameSite = await admin.post('/api/patients', { ...newPatient, firstName: 'Origin' }, { Origin: srv.baseUrl });
    assert.equal(sameSite.status, 201);
  });
});

describe('patients API', () => {
  it('lists and searches patients', async () => {
    const all = await reception.get('/api/patients');
    assert.ok(all.data.patients.length >= 8);
    const found = await reception.get('/api/patients?q=aquino');
    assert.deepEqual(found.data.patients.map((p) => p.fullName), ['Sofia Aquino']);
    assert.equal(found.data.patients[0].age, 61);
  });

  it('registers a patient (201) and reports domain validation errors (422 with the field)', async () => {
    const bad = await reception.post('/api/patients', { ...newPatient, contactNumber: '12345' });
    assert.equal(bad.status, 422);
    assert.deepEqual(bad.data.error, {
      code: 'VALIDATION_ERROR', message: 'Contact number must be a valid PH mobile number (e.g. 09171234567).', field: 'contactNumber',
    });
    const future = await reception.post('/api/patients', { ...newPatient, birthDate: '2030-01-01' });
    assert.equal(future.data.error.message, 'Birth date cannot be in the future.');
    const res = await reception.post('/api/patients', newPatient);
    assert.equal(res.status, 201);
    assert.match(res.headers.get('location') ?? '', /^\/api\/patients\/P-\d{4}$/);
    assert.equal(res.data.patient.contactNumber, '09181112299');
    assert.equal(res.data.patient.bloodType, 'Unknown');
  });

  it('edits and deletes a patient without history, but keeps one with history', async () => {
    const created = (await reception.post('/api/patients', { ...newPatient, firstName: 'Temp' })).data.patient;
    const edited = await reception.put(`/api/patients/${created.id}`, { ...newPatient, firstName: 'Tempo' });
    assert.equal(edited.data.patient.fullName, 'Tempo Navarro');
    assert.equal((await reception.delete(`/api/patients/${created.id}`)).status, 204);
    assert.equal((await reception.get(`/api/patients/${created.id}`)).status, 404);
    const keep = await reception.delete('/api/patients/P-0001');
    assert.equal(keep.status, 409);
    assert.match(keep.data.error.message, /Patient records with appointment history must be kept/);
  });

  it('builds a patient profile with visits, totals and upcoming appointments', async () => {
    const res = await admin.get('/api/patients/P-0001/profile');
    assert.equal(res.data.patient.fullName, 'Juan Dela Cruz');
    assert.equal(res.data.totals.visits, 2);
    assert.equal(res.data.totals.billed, 800);
    assert.equal(res.data.upcoming.length, 1);
    assert.equal(res.data.appointments.length, 3);
  });
});

describe('staff API', () => {
  it('lists staff with role and active filters and computed details', async () => {
    const nurses = await reception.get('/api/staff?role=Nurse');
    assert.deepEqual(nurses.data.staff.map((s) => s.displayName), ['Liza Bautista, RN', 'Mark Dela Cruz, RN']);
    const santos = (await reception.get('/api/staff/S-0001')).data.staff;
    assert.equal(santos.consultationFee, 500);
    assert.equal(santos.slotMinutes, 30);
    assert.match(santos.details, /^Dr\. Maria Santos \| Doctor \| Specialization: General Medicine/);
    assert.equal((await reception.get('/api/staff?active=false')).data.staff.length, 0);
  });

  it('only admins can add, edit, activate or delete staff', async () => {
    assert.equal((await reception.post('/api/staff', newNurse)).status, 403);
    assert.equal((await doctor.patch('/api/staff/S-0006/active', { active: false })).status, 403);
    const created = await admin.post('/api/staff', newNurse);
    assert.equal(created.status, 201);
    assert.equal(created.data.staff.displayName, 'Rosa Lim, RN');
    assert.equal(created.data.staff.consultationFee, 250);
    const unknownRole = await admin.post('/api/staff', { ...newNurse, role: 'Janitor' });
    assert.equal(unknownRole.status, 422);
    const edited = await admin.put(`/api/staff/${created.data.staff.id}`, { ...newNurse, role: 'Doctor', lastName: 'Lim-Cruz' });
    assert.equal(edited.data.staff.role, 'Nurse', 'the role cannot change');
    assert.equal(edited.data.staff.displayName, 'Rosa Lim-Cruz, RN');
    const deactivated = await admin.patch(`/api/staff/${created.data.staff.id}/active`, { active: false });
    assert.equal(deactivated.data.staff.active, false);
    assert.equal((await admin.delete(`/api/staff/${created.data.staff.id}`)).status, 204);
  });

  it('protects staff with appointments', async () => {
    const deactivate = await admin.patch('/api/staff/S-0001/active', { active: false });
    assert.equal(deactivate.status, 409);
    assert.match(deactivate.data.error.message, /still has \d+ scheduled appointment\(s\)/);
    const remove = await admin.delete('/api/staff/S-0001');
    assert.equal(remove.status, 409);
    const strand = await admin.put('/api/staff/S-0001', {
      ...newNurse, role: undefined, firstName: 'Maria', lastName: 'Santos', serviceArea: 'General Medicine', workingDays: ['SUNDAY'],
    });
    assert.equal(strand.status, 409);
    assert.match(strand.data.error.message, /^Cannot change the schedule/);
  });

  it('lists open slots for a staff member and date', async () => {
    const res = await reception.get(`/api/staff/S-0004/slots?date=${THURSDAY}`);
    assert.equal(res.data.slotMinutes, 60);
    assert.deepEqual(res.data.slots, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']);
    const sunday = await reception.get('/api/staff/S-0004/slots?date=2026-11-15');
    assert.deepEqual(sunday.data.slots, []);
    const bad = await reception.get('/api/staff/S-0004/slots?date=tomorrow');
    assert.equal(bad.status, 422);
  });
});

describe('appointments API', () => {
  /** @type {string} */
  let id;

  it('books an appointment and blocks double booking (409)', async () => {
    const body = { patientId: 'P-0002', staffId: 'S-0004', date: THURSDAY, time: '08:00', type: 'CONSULTATION', reason: 'Wisdom tooth' };
    const res = await reception.post('/api/appointments', body);
    assert.equal(res.status, 201);
    id = res.data.appointment.id;
    assert.equal(res.data.appointment.fee, 700);
    assert.equal(res.data.appointment.endTime, '09:00');
    assert.equal(res.data.appointment.staffName, 'Dr. Carlo Mendoza, DMD');
    const staffClash = await reception.post('/api/appointments', { ...body, patientId: 'P-0003' });
    assert.equal(staffClash.status, 409);
    assert.equal(staffClash.data.error.message, 'Dr. Carlo Mendoza, DMD already has an appointment at that time.');
    const patientClash = await reception.post('/api/appointments', { ...body, staffId: 'S-0001', time: '08:30' });
    assert.equal(patientClash.status, 409);
    assert.equal(patientClash.data.error.message, 'Angela Ramos already has another appointment that overlaps with this time.');
    const past = await reception.post('/api/appointments', { ...body, date: '2026-11-10' });
    assert.equal(past.data.error.message, 'Appointments cannot be scheduled in the past.');
    const missing = await reception.post('/api/appointments', { ...body, patientId: 'P-9999' });
    assert.equal(missing.status, 404);
    assert.equal((await doctor.post('/api/appointments', body)).status, 403, 'doctors do not book');
  });

  it('shows details with the Java summary', async () => {
    const res = await reception.get(`/api/appointments/${id}`);
    assert.match(res.data.summary, /^Appointment ID: {3}A-\d{4}\nStatus: {11}Scheduled/);
  });

  it('filters by status, period, date and keyword', async () => {
    const today = await reception.get('/api/appointments?period=today');
    assert.ok(today.data.appointments.every((a) => a.date === '2026-11-11'));
    const past = await reception.get('/api/appointments?period=past');
    assert.ok(past.data.appointments.every((a) => a.date < '2026-11-11'));
    const upcoming = await reception.get('/api/appointments?period=upcoming&status=SCHEDULED');
    assert.ok(upcoming.data.appointments.every((a) => a.status === 'SCHEDULED' && a.date >= '2026-11-11'));
    const keyword = await reception.get('/api/appointments?q=wisdom');
    assert.deepEqual(keyword.data.appointments.map((a) => a.id), [id]);
    assert.equal((await reception.get('/api/appointments?period=soon')).status, 400);
    assert.equal((await reception.get('/api/appointments?status=LOST')).status, 422);
  });

  it('reschedules, then completes; closed appointments cannot change (409)', async () => {
    const moved = await reception.post(`/api/appointments/${id}/reschedule`, { date: THURSDAY, time: '10:00' });
    assert.equal(moved.data.appointment.time, '10:00');
    assert.equal((await reception.post(`/api/appointments/${id}/complete`, { findings: 'x' })).status, 403, 'reception cannot record findings');
    const empty = await admin.post(`/api/appointments/${id}/complete`, { findings: ' ' });
    assert.equal(empty.data.error.message, 'Please enter the findings or notes for this visit.');
    const done = await admin.post(`/api/appointments/${id}/complete`, { findings: 'Extraction scheduled.' });
    assert.equal(done.data.appointment.status, 'COMPLETED');
    const again = await reception.post(`/api/appointments/${id}/cancel`, { reason: 'x' });
    assert.equal(again.status, 409);
    assert.match(again.data.error.message, /is already Completed and can no longer be changed/);
  });

  it('cancels with a reason and marks no-shows', async () => {
    const book = (/** @type {string} */ time) => reception.post('/api/appointments', {
      patientId: 'P-0008', staffId: 'S-0005', date: THURSDAY, time, type: 'CHECK_UP', reason: 'Vitals',
    });
    const a = (await book('09:00')).data.appointment;
    const noReason = await reception.post(`/api/appointments/${a.id}/cancel`, { reason: '' });
    assert.equal(noReason.status, 422);
    const cancelled = await reception.post(`/api/appointments/${a.id}/cancel`, { reason: 'Feeling better' });
    assert.equal(cancelled.data.appointment.remarks, 'Cancelled: Feeling better');
    assert.equal(cancelled.data.appointment.fee, 0);
    const b = (await book('09:00')).data.appointment;
    const noShow = await reception.post(`/api/appointments/${b.id}/no-show`);
    assert.equal(noShow.data.appointment.statusLabel, 'No-Show');
  });
});

describe('records, stats and audit', () => {
  it('lists closed appointments with totals and exports the Java CSV format', async () => {
    const res = await reception.get('/api/records');
    assert.ok(res.data.records.every((r) => r.status !== 'SCHEDULED'));
    assert.equal(res.data.summary.total, res.data.records.length);
    const juan = await reception.get('/api/records?patientId=P-0001');
    assert.deepEqual(juan.data.summary, { total: 2, completed: 2, cancelled: 0, noShow: 0, fees: 800 });
    const remarks = await reception.get('/api/records?q=amlodipine');
    assert.equal(remarks.data.records.length, 1);
    const csv = await admin.get('/api/records/export.csv?patientId=P-0001');
    assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.match(csv.headers.get('content-disposition') ?? '', /appointment-records\.csv/);
    const lines = String(csv.data).trim().split('\r\n');
    assert.equal(lines[0], '"Appointment ID","Date","Time","Patient ID","Patient","Staff","Role","Type","Reason","Status","Fee (PHP)","Remarks"');
    assert.equal(lines.length, 3);
    assert.match(lines[1], /^"A-0001",".+","09:00","P-0001","Juan Dela Cruz","Dr\. Maria Santos","Doctor","Consultation",".+","Completed",500\.00,"Acute/);
  });

  it('hides clinical findings from the front desk (JSON, summary and CSV) and logs exports', async () => {
    const record = (await reception.get('/api/records?patientId=P-0001')).data.records[0];
    assert.equal(record.remarks, '');
    assert.equal(record.findingsHidden, true);
    const detail = (await reception.get('/api/appointments/A-0001')).data;
    assert.equal(detail.summary.includes('Acute'), false);
    assert.match(detail.summary, /\(clinical notes hidden\)$/);
    const csv = String((await reception.get('/api/records/export.csv?patientId=P-0001')).data);
    assert.equal(csv.includes('Acute'), false);
    assert.match(csv, /"\(clinical notes hidden\)"/);
    const forDoctor = (await doctor.get('/api/records?patientId=P-0001')).data.records[0];
    assert.match(forDoctor.remarks, /^Acute/);
    const log = (await admin.get('/api/audit?limit=1000')).data.entries;
    assert.ok(log.some((e) => e.action === 'records.exported' && e.actor === 'reception'));
    assert.ok(log.some((e) => e.action === 'auth.login' && e.actor === 'admin'));
  });

  it('builds the dashboard and analytics', async () => {
    const d = (await reception.get('/api/stats/dashboard')).data;
    assert.equal(d.today, '2026-11-11');
    assert.ok(d.patientCount >= 8);
    assert.ok(Array.isArray(d.todaysAppointments));
    assert.ok(d.staffOnDuty.every((s) => s.active));
    const a = (await reception.get('/api/stats/analytics?days=7')).data;
    assert.equal(a.perDay.length, 7);
    assert.equal(a.statusBreakdown.length, 4);
    assert.equal(a.feesByRole.length, 3);
    assert.equal(a.busiestStaff[0].name, 'Dr. Maria Santos');
  });

  it('records who changed what; only admins can read the audit log', async () => {
    assert.equal((await reception.get('/api/audit')).status, 403);
    const res = await admin.get('/api/audit?limit=500');
    const booked = res.data.entries.find((e) => e.action === 'appointment.booked' && e.actor === 'reception');
    assert.ok(booked, 'booking by reception is logged');
    assert.equal(booked.actorRole, 'Receptionist');
    assert.ok(res.data.entries.some((e) => e.action === 'auth.failed'));
  });
});

describe('doctor accounts only see their own work', () => {
  it('limits appointments, patients, records and stats to Dr. Santos', async () => {
    const list = (await doctor.get('/api/appointments')).data.appointments;
    assert.ok(list.length > 0);
    assert.ok(list.every((a) => a.staffId === 'S-0001'));
    const patients = (await doctor.get('/api/patients')).data.patients.map((p) => p.id);
    assert.deepEqual(patients.sort(), ['P-0001', 'P-0005', 'P-0006']);
    assert.equal((await doctor.get('/api/patients/P-0002')).status, 404);
    const records = (await doctor.get('/api/records')).data.records;
    assert.ok(records.every((r) => r.staffId === 'S-0001'));
    const stats = (await doctor.get('/api/stats/dashboard')).data;
    assert.ok(stats.todaysAppointments.every((a) => a.staffId === 'S-0001'));
    assert.equal((await doctor.get('/api/audit')).status, 403);
  });

  it('cannot open or change another staff member\'s appointment', async () => {
    const other = (await admin.get('/api/appointments?staffId=S-0004')).data.appointments[0];
    assert.equal((await doctor.get(`/api/appointments/${other.id}`)).status, 404, 'not-yours looks the same as missing');
    assert.equal((await doctor.post(`/api/appointments/${other.id}/no-show`)).status, 404);
    assert.equal((await doctor.get('/api/records?patientId=P-0002')).status, 404);
  });
});

describe('queue board', () => {
  it('checks patients in, calls them, and shows only initials on the public board', async () => {
    const queue = (await reception.get('/api/queue')).data.entries;
    const juan = queue.find((e) => e.appointment.patientId === 'P-0001');
    assert.equal(juan.state, null);
    assert.equal((await reception.post(`/api/queue/${juan.appointment.id}/check-in`)).status, 204);
    const twice = await reception.post(`/api/queue/${juan.appointment.id}/check-in`);
    assert.equal(twice.status, 409);
    assert.equal((await doctor.post(`/api/queue/${juan.appointment.id}/call`)).status, 204);
    const board = (await srv.client().get('/api/queue/board')).data;
    const row = board.rows.find((r) => r.staffId === 'S-0001');
    assert.deepEqual(row.nowServing, { ticket: 'Q-001', initials: 'J.D.' }, 'a per-day queue number, not the appointment ID');
    assert.equal(JSON.stringify(board).includes(juan.appointment.id), false);
    assert.equal(JSON.stringify(board).includes('Juan'), false);
    assert.equal((await srv.client().post(`/api/queue/${juan.appointment.id}/check-in`)).status, 401);
    assert.equal((await reception.delete(`/api/queue/${juan.appointment.id}`)).status, 204);
  });

  it('streams the board with Server-Sent Events', async () => {
    const controller = new AbortController();
    const res = await fetch(`${srv.baseUrl}/api/queue/stream`, { signal: controller.signal });
    assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
    const reader = /** @type {ReadableStreamDefaultReader<Uint8Array>} */ (res.body?.getReader());
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /event: board\ndata: \{"date":"2026-11-11"/);
    controller.abort();
  });
});

describe('server errors', () => {
  it('ignore a malformed session cookie instead of failing', async () => {
    const res = await srv.client().request('GET', '/api/health', undefined, { Cookie: 'cc_session=%E0%A4%A' });
    assert.equal(res.status, 200);
  });

  it('refuse cross-site fetches flagged by the browser', async () => {
    const res = await admin.post('/api/patients', newPatient, { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(res.status, 403);
  });

  it('never leak internal details', async () => {
    const original = srv.context.service.getPatients;
    srv.context.service.getPatients = () => {
      throw new Error('database exploded at /secret/path');
    };
    srv.context.service.searchPatients = srv.context.service.getPatients;
    const res = await admin.get('/api/patients');
    assert.equal(res.status, 500);
    assert.deepEqual(res.data.error, { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server. Please try again.' });
    assert.equal(srv.errors.length, 1);
    srv.context.service.getPatients = original;
  });
});
