// @ts-check
import { AppointmentMapper, PatientMapper, StaffMapper } from '/domain/index.js';

/** @typedef {import('/domain/Patient.js').Patient} Patient */
/** @typedef {import('/domain/MedicalStaff.js').MedicalStaff} MedicalStaff */
/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */

/**
 * An error returned by the API. INHERITANCE: extends Error and keeps the
 * server's code, HTTP status and the form field it refers to.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status: number, code: string, field?: string }} details
   */
  constructor(message, { status, code, field }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const patientMapper = new PatientMapper();
const staffMapper = new StaffMapper();
const appointmentMapper = new AppointmentMapper();

/**
 * Talks to the REST API and turns the JSON it gets back into real domain
 * objects (Patient, Doctor, Dentist, Nurse, Appointment) using the same
 * mapper classes as the server. The UI then calls their methods, such as
 * getDisplayName() or computeFee(), polymorphically.
 */
export class ApiClient extends EventTarget {
  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @returns {Promise<any>}
   */
  async request(method, path, body) {
    /** @type {Response} */
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', { status: 0, code: 'NETWORK' });
    }
    if (res.status === 204) {
      return null;
    }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const err = data?.error ?? { code: 'HTTP_ERROR', message: `Request failed (${res.status}).` };
      if (res.status === 401 && !path.startsWith('/api/auth/')) {
        this.dispatchEvent(new Event('unauthorized'));
      }
      throw new ApiError(err.message, { status: res.status, code: err.code, field: err.field });
    }
    return data;
  }

  /** @param {string} path */
  get(path) {
    return this.request('GET', path);
  }

  /** @param {string} path @param {unknown} [body] */
  post(path, body) {
    return this.request('POST', path, body ?? {});
  }

  /** @param {Record<string, string | number | boolean | undefined | null>} params */
  static query(params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        q.set(k, String(v));
      }
    }
    const text = q.toString();
    return text ? `?${text}` : '';
  }

  // ---- Session ----
  config() {
    return this.get('/api/config');
  }

  /** @param {string} username @param {string} password */
  async login(username, password) {
    return (await this.post('/api/auth/login', { username, password })).user;
  }

  logout() {
    return this.post('/api/auth/logout');
  }

  async me() {
    return (await this.get('/api/auth/me')).user;
  }

  // ---- Patients ----
  /** @param {string} [q] @returns {Promise<Patient[]>} */
  async patients(q) {
    const data = await this.get(`/api/patients${ApiClient.query({ q })}`);
    return data.patients.map((/** @type {any} */ r) => patientMapper.fromRecord(r));
  }

  /** @param {object} input @returns {Promise<Patient>} */
  async createPatient(input) {
    return patientMapper.fromRecord((await this.post('/api/patients', input)).patient);
  }

  /** @param {string} id @param {object} input @returns {Promise<Patient>} */
  async updatePatient(id, input) {
    return patientMapper.fromRecord((await this.request('PUT', `/api/patients/${encodeURIComponent(id)}`, input)).patient);
  }

  /** @param {string} id */
  deletePatient(id) {
    return this.request('DELETE', `/api/patients/${encodeURIComponent(id)}`);
  }

  /** @param {string} id */
  async patientProfile(id) {
    const data = await this.get(`/api/patients/${encodeURIComponent(id)}/profile`);
    return {
      patient: patientMapper.fromRecord(data.patient),
      appointments: data.appointments.map(ApiClient.toAppointment),
      upcoming: data.upcoming.map(ApiClient.toAppointment),
      totals: data.totals,
    };
  }

  // ---- Staff ----
  /** @param {{ q?: string, role?: string, active?: boolean }} [filters] @returns {Promise<MedicalStaff[]>} */
  async staff(filters = {}) {
    const data = await this.get(`/api/staff${ApiClient.query(filters)}`);
    return data.staff.map((/** @type {any} */ r) => staffMapper.fromRecord(r));
  }

  /** @param {object} input @returns {Promise<MedicalStaff>} */
  async createStaff(input) {
    return staffMapper.fromRecord((await this.post('/api/staff', input)).staff);
  }

  /** @param {string} id @param {object} input @returns {Promise<MedicalStaff>} */
  async updateStaff(id, input) {
    return staffMapper.fromRecord((await this.request('PUT', `/api/staff/${encodeURIComponent(id)}`, input)).staff);
  }

  /** @param {string} id @param {boolean} active */
  setStaffActive(id, active) {
    return this.request('PATCH', `/api/staff/${encodeURIComponent(id)}/active`, { active });
  }

  /** @param {string} id */
  deleteStaff(id) {
    return this.request('DELETE', `/api/staff/${encodeURIComponent(id)}`);
  }

  /** @param {string} staffId @param {string} date @param {string} [exclude] @returns {Promise<string[]>} */
  async slots(staffId, date, exclude) {
    return (await this.get(`/api/staff/${encodeURIComponent(staffId)}/slots${ApiClient.query({ date, exclude })}`)).slots;
  }

  // ---- Appointments ----
  /** @param {Record<string, string | undefined>} [filters] @returns {Promise<Appointment[]>} */
  async appointments(filters = {}) {
    return (await this.get(`/api/appointments${ApiClient.query(filters)}`)).appointments.map(ApiClient.toAppointment);
  }

  /** @param {string} id */
  async appointment(id) {
    return ApiClient.toAppointment((await this.get(`/api/appointments/${encodeURIComponent(id)}`)).appointment);
  }

  /** @param {object} input @returns {Promise<Appointment>} */
  async book(input) {
    return ApiClient.toAppointment((await this.post('/api/appointments', input)).appointment);
  }

  /**
   * @param {string} id
   * @param {'reschedule' | 'complete' | 'cancel' | 'no-show'} action
   * @param {object} [body]
   * @returns {Promise<Appointment>}
   */
  async act(id, action, body) {
    return ApiClient.toAppointment((await this.post(`/api/appointments/${encodeURIComponent(id)}/${action}`, body)).appointment);
  }

  // ---- Records, stats, audit, queue ----
  /** @param {{ patientId?: string, q?: string }} [filters] */
  async records(filters = {}) {
    const data = await this.get(`/api/records${ApiClient.query(filters)}`);
    return { records: data.records.map(ApiClient.toAppointment), summary: data.summary };
  }

  /** @param {{ patientId?: string, q?: string }} [filters] */
  recordsCsvUrl(filters = {}) {
    return `/api/records/export.csv${ApiClient.query(filters)}`;
  }

  async dashboard() {
    const data = await this.get('/api/stats/dashboard');
    return {
      ...data,
      todaysAppointments: data.todaysAppointments.map(ApiClient.toAppointment),
      staffOnDuty: data.staffOnDuty.map((/** @type {any} */ r) => staffMapper.fromRecord(r)),
    };
  }

  /** @param {number} [days] */
  analytics(days = 14) {
    return this.get(`/api/stats/analytics?days=${days}`);
  }

  /** @returns {Promise<any[]>} */
  async audit() {
    return (await this.get('/api/audit?limit=300')).entries;
  }

  async queue() {
    const data = await this.get('/api/queue');
    return data.entries.map((/** @type {any} */ e) => ({ appointment: ApiClient.toAppointment(e.appointment), state: e.state }));
  }

  /** @param {string} appointmentId @param {'check-in' | 'call'} action */
  queueAction(appointmentId, action) {
    return this.post(`/api/queue/${encodeURIComponent(appointmentId)}/${action}`);
  }

  /** @param {string} appointmentId */
  queueRemove(appointmentId) {
    return this.request('DELETE', `/api/queue/${encodeURIComponent(appointmentId)}`);
  }

  /** @param {any} record @returns {Appointment} */
  static toAppointment(record) {
    return appointmentMapper.fromRecord(record);
  }
}
