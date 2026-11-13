// @ts-check
import { Permission } from '../../auth/AccessPolicy.js';
import { BadRequestError } from '../../auth/errors.js';
import { AppointmentStatus } from '../../domain/AppointmentStatus.js';
import { RECORD_CSV } from '../../domain/CsvWriter.js';
import { NotFoundError } from '../../domain/errors.js';
import { CalendarDate } from '../../domain/time/CalendarDate.js';
import { requirePermission as can } from '../middleware.js';
import { Schemas } from '../validation.js';
import { Views } from '../views.js';
import { Controller } from './Controller.js';

/** @typedef {import('../../domain/Appointment.js').Appointment} Appointment */
/** @typedef {import('../../domain/Patient.js').Patient} Patient */

/** /api/patients: register, edit, search, delete, profile. */
export class PatientController extends Controller {
  get basePath() {
    return '/api/patients';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/', can(Permission.PATIENTS_READ), (req, res) => {
      const list = this.service.searchPatients(this.query(req, 'q')).filter((p) => this.#visible(req, p));
      res.json({ patients: list.map(Views.patient) });
    });
    r.post('/', can(Permission.PATIENTS_WRITE), (req, res) => {
      const patient = this.service.registerPatient(/** @type {any} */ (Schemas.patient.parse(req.body)));
      res.status(201).location(`${this.basePath}/${patient.id}`).json({ patient: Views.patient(patient) });
    });
    r.get('/:id', can(Permission.PATIENTS_READ), (req, res) => {
      res.json({ patient: Views.patient(this.#patientFor(req)) });
    });
    r.put('/:id', can(Permission.PATIENTS_WRITE), (req, res) => {
      const patient = this.service.updatePatient(this.#patientFor(req), /** @type {any} */ (Schemas.patient.parse(req.body)));
      res.json({ patient: Views.patient(patient) });
    });
    r.delete('/:id', can(Permission.PATIENTS_WRITE), (req, res) => {
      this.service.removePatient(this.#patientFor(req));
      res.status(204).end();
    });
    r.get('/:id/profile', can(Permission.PATIENTS_READ), (req, res) => {
      const patient = this.#patientFor(req);
      const policy = this.policy(req);
      const all = this.service.findAppointments(patient).filter((a) => policy.canAccess(a));
      const completed = all.filter((a) => a.status === AppointmentStatus.COMPLETED);
      const upcoming = all.filter((a) => a.isActive() && !this.service.clock.isPast(a.date, a.time));
      res.json({
        patient: Views.patient(patient),
        appointments: all.map(Views.appointment),
        upcoming: upcoming.map(Views.appointment),
        totals: {
          visits: completed.length,
          billed: this.service.computeTotal(completed),
          upcomingEstimate: this.service.computeTotal(upcoming),
          records: all.filter((a) => !a.isActive()).length,
        },
      });
    });
  }

  /** A doctor only sees patients who have an appointment with them. @param {import('express').Request} req @param {Patient} p */
  #visible(req, p) {
    const policy = this.policy(req);
    return !policy.staffScope || this.service.findAppointments(p).some((a) => policy.canAccess(a));
  }

  /** @param {import('express').Request} req */
  #patientFor(req) {
    const patient = this.service.getPatient(String(req.params.id));
    if (!this.#visible(req, patient)) {
      throw new NotFoundError(`Patient ${patient.id} was not found.`);
    }
    return patient;
  }
}

/** /api/staff: add, edit, activate, delete, open slots. */
export class StaffController extends Controller {
  get basePath() {
    return '/api/staff';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/', can(Permission.STAFF_READ), (req, res) => {
      const role = this.query(req, 'role');
      const active = this.query(req, 'active');
      const list = this.service.searchStaff(this.query(req, 'q'))
        .filter((s) => !role || s.getRole() === role)
        .filter((s) => active === undefined || String(s.active) === active);
      res.json({ staff: list.map(Views.staff) });
    });
    r.post('/', can(Permission.STAFF_WRITE), (req, res) => {
      const { role, ...input } = Schemas.staff.parse(req.body);
      const staff = this.service.createStaff(role ?? '', /** @type {any} */ (input));
      res.status(201).location(`${this.basePath}/${staff.id}`).json({ staff: Views.staff(staff) });
    });
    r.get('/:id', can(Permission.STAFF_READ), (req, res) => {
      res.json({ staff: Views.staff(this.service.getStaffMember(String(req.params.id))) });
    });
    r.put('/:id', can(Permission.STAFF_WRITE), (req, res) => {
      const { role: _ignored, ...input } = Schemas.staff.parse(req.body);
      const staff = this.service.updateStaff(this.service.getStaffMember(String(req.params.id)), /** @type {any} */ (input));
      res.json({ staff: Views.staff(staff) });
    });
    r.patch('/:id/active', can(Permission.STAFF_WRITE), (req, res) => {
      const staff = this.service.getStaffMember(String(req.params.id));
      this.service.setStaffActive(staff, Schemas.active.parse(req.body).active);
      res.json({ staff: Views.staff(staff) });
    });
    r.delete('/:id', can(Permission.STAFF_WRITE), (req, res) => {
      this.service.removeStaff(this.service.getStaffMember(String(req.params.id)));
      res.status(204).end();
    });
    r.get('/:id/slots', can(Permission.APPOINTMENTS_READ), (req, res) => {
      const staff = this.service.getStaffMember(String(req.params.id));
      const date = CalendarDate.parse(this.query(req, 'date') ?? '');
      const excludeId = this.query(req, 'exclude');
      const exclude = excludeId ? this.appointmentFor(req, excludeId) : undefined;
      const slots = this.service.getAvailableSlots(staff, date, exclude);
      res.json({ date: date.toString(), slotMinutes: staff.getSlotDurationMinutes(), slots: slots.map(String) });
    });
  }
}

/** /api/appointments: book, list with filters, reschedule, complete, cancel, no-show. */
export class AppointmentController extends Controller {
  get basePath() {
    return '/api/appointments';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/', can(Permission.APPOINTMENTS_READ), (req, res) => {
      res.json({ appointments: this.#list(req).map(Views.appointment) });
    });
    r.post('/', can(Permission.APPOINTMENTS_BOOK), (req, res) => {
      const body = Schemas.booking.parse(req.body);
      const appointment = this.service.bookAppointment({
        patient: this.service.getPatient(body.patientId),
        staff: this.service.getStaffMember(body.staffId),
        date: body.date,
        time: body.time,
        type: body.type,
        reason: body.reason,
      });
      res.status(201).location(`${this.basePath}/${appointment.id}`).json({ appointment: Views.appointment(appointment) });
    });
    r.get('/:id', can(Permission.APPOINTMENTS_READ), (req, res) => {
      const appointment = this.appointmentFor(req, String(req.params.id));
      res.json({ appointment: Views.appointment(appointment), summary: appointment.getSummary() });
    });
    r.post('/:id/reschedule', can(Permission.APPOINTMENTS_MANAGE), (req, res) => {
      const { date, time } = Schemas.reschedule.parse(req.body);
      const appointment = this.service.rescheduleAppointment(this.appointmentFor(req, String(req.params.id)), date, time);
      res.json({ appointment: Views.appointment(appointment) });
    });
    r.post('/:id/complete', can(Permission.APPOINTMENTS_COMPLETE), (req, res) => {
      const { findings } = Schemas.complete.parse(req.body);
      const appointment = this.service.completeAppointment(this.appointmentFor(req, String(req.params.id)), findings);
      res.json({ appointment: Views.appointment(appointment) });
    });
    r.post('/:id/cancel', can(Permission.APPOINTMENTS_MANAGE), (req, res) => {
      const { reason } = Schemas.cancel.parse(req.body);
      const appointment = this.service.cancelAppointment(this.appointmentFor(req, String(req.params.id)), reason);
      res.json({ appointment: Views.appointment(appointment) });
    });
    r.post('/:id/no-show', can(Permission.APPOINTMENTS_MANAGE), (req, res) => {
      Schemas.empty.parse(req.body ?? {});
      const appointment = this.service.markNoShow(this.appointmentFor(req, String(req.params.id)));
      res.json({ appointment: Views.appointment(appointment) });
    });
  }

  /**
   * Filters from the query string: q, status, period (today | upcoming | past),
   * date, from, to, staffId, patientId.
   *
   * @param {import('express').Request} req
   */
  #list(req) {
    const policy = this.policy(req);
    const today = this.service.clock.today();
    const status = this.query(req, 'status');
    const period = this.query(req, 'period');
    if (period && !['today', 'upcoming', 'past'].includes(period)) {
      throw new BadRequestError('period must be today, upcoming or past.', { field: 'period' });
    }
    return this.service.findAppointments({
      keyword: this.query(req, 'q'),
      status: status ? AppointmentStatus.from(status) : undefined,
      date: this.query(req, 'date'),
      from: this.query(req, 'from'),
      to: this.query(req, 'to'),
      staff: this.query(req, 'staffId'),
      patient: this.query(req, 'patientId'),
    }).filter((a) => policy.canAccess(a))
      .filter((a) => period !== 'today' || a.date.equals(today))
      .filter((a) => period !== 'upcoming' || !a.date.isBefore(today))
      .filter((a) => period !== 'past' || a.date.isBefore(today));
  }
}

/** /api/records: closed appointments with totals, and the CSV export. */
export class RecordController extends Controller {
  get basePath() {
    return '/api/records';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/', can(Permission.RECORDS_READ), (req, res) => {
      const records = this.#records(req);
      const count = (/** @type {AppointmentStatus} */ s) => records.filter((a) => a.status === s).length;
      res.json({
        records: records.map(Views.appointment),
        summary: {
          total: records.length,
          completed: count(AppointmentStatus.COMPLETED),
          cancelled: count(AppointmentStatus.CANCELLED),
          noShow: count(AppointmentStatus.NO_SHOW),
          fees: this.service.computeTotal(records),
        },
      });
    });
    r.get('/export.csv', can(Permission.RECORDS_READ), (req, res) => {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="appointment-records.csv"');
      res.send(String.fromCharCode(0xfeff) + `${RECORD_CSV.write(this.#records(req))}`);
    });
  }

  /** @param {import('express').Request} req @returns {Appointment[]} */
  #records(req) {
    const policy = this.policy(req);
    const patientId = this.query(req, 'patientId');
    const patient = patientId ? this.service.getPatient(patientId) : undefined;
    return this.service.getRecords({ patient, keyword: this.query(req, 'q') }).filter((a) => policy.canAccess(a));
  }
}

/** /api/stats: the dashboard and its charts. A doctor gets their own numbers. */
export class StatsController extends Controller {
  get basePath() {
    return '/api/stats';
  }

  /** @param {import('express').Router} r */
  routes(r) {
    r.get('/dashboard', can(Permission.STATS_READ), (req, res) => {
      const d = this.context.stats.dashboard({ staff: this.#scope(req) });
      res.json({
        ...d,
        today: this.service.clock.today().toString(),
        todaysAppointments: d.todaysAppointments.map(Views.appointment),
        staffOnDuty: d.staffOnDuty.map(Views.staff),
      });
    });
    r.get('/analytics', can(Permission.STATS_READ), (req, res) => {
      const days = Math.min(Math.max(Number(this.query(req, 'days') ?? 14) || 14, 7), 60);
      const a = this.context.stats.analytics({ staff: this.#scope(req), days });
      res.json({
        perDay: a.perDay.map((d) => ({ ...d, date: d.date.toString() })),
        statusBreakdown: a.statusBreakdown.map((s) => ({ status: s.status.code, label: s.status.label, count: s.count })),
        feesByRole: a.feesByRole,
        busiestStaff: a.busiestStaff.map((b) => ({ staffId: b.staff.id, name: b.staff.getDisplayName(), role: b.staff.getRole(), count: b.count })),
      });
    });
  }

  /** @param {import('express').Request} req */
  #scope(req) {
    const id = this.policy(req).staffScope;
    return id ? this.service.getStaffMember(id) : undefined;
  }
}
