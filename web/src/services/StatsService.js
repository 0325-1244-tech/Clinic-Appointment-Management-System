// @ts-check
import { AppointmentStatus } from '../domain/AppointmentStatus.js';
import { StaffFactory } from '../domain/StaffFactory.js';

/** @typedef {import('../domain/Appointment.js').Appointment} Appointment */
/** @typedef {import('../domain/MedicalStaff.js').MedicalStaff} MedicalStaff */

/**
 * Dashboard numbers and analytics. Every method can be limited to one staff
 * member (a Doctor account only sees its own figures).
 */
export class StatsService {
  #service;

  /** @param {import('./ClinicService.js').ClinicService} service */
  constructor(service) {
    this.#service = service;
  }

  /**
   * The Java dashboard: counts, today's schedule, staff on duty and fees collected.
   *
   * @param {{ staff?: MedicalStaff }} [scope]
   */
  dashboard({ staff } = {}) {
    const today = this.#service.clock.today();
    const mine = (/** @type {Appointment[]} */ list) => (staff ? list.filter((a) => a.staff.equals(staff)) : list);
    const all = mine(this.#service.getAllAppointments());
    const completed = all.filter((a) => a.status === AppointmentStatus.COMPLETED);
    return {
      patientCount: staff ? new Set(all.map((a) => a.patient.id)).size : this.#service.getPatientCount(),
      activeStaffCount: this.#service.getActiveStaffCount(),
      todaysAppointments: all.filter((a) => a.date.equals(today)),
      upcomingCount: mine(this.#service.getUpcomingAppointments()).length,
      completedCount: completed.length,
      collectedFees: this.#service.computeTotal(completed),
      staffOnDuty: this.#service.getStaffOnDuty(today),
    };
  }

  /**
   * Charts for the dashboard.
   *
   * @param {{ staff?: MedicalStaff, days?: number }} [options]
   */
  analytics({ staff, days = 14 } = {}) {
    const today = this.#service.clock.today();
    const all = this.#service.getAllAppointments().filter((a) => !staff || a.staff.equals(staff));
    const statuses = AppointmentStatus.values();

    const perDay = Array.from({ length: days }, (_, i) => {
      const date = today.minusDays(days - 1 - i);
      const onDay = all.filter((a) => a.date.equals(date));
      return {
        date,
        total: onDay.length,
        byStatus: Object.fromEntries(statuses.map((s) => [s.code, onDay.filter((a) => a.status === s).length])),
      };
    });

    const statusBreakdown = statuses.map((status) => ({ status, count: all.filter((a) => a.status === status).length }));

    const completed = all.filter((a) => a.status === AppointmentStatus.COMPLETED);
    const feesByRole = StaffFactory.ROLES.map((role) => ({
      role,
      amount: this.#service.computeTotal(completed.filter((a) => a.staff.getRole() === role)),
      visits: completed.filter((a) => a.staff.getRole() === role).length,
    }));

    /** @type {Map<string, { staff: MedicalStaff, count: number }>} */
    const byStaff = new Map();
    for (const a of all.filter((x) => x.status !== AppointmentStatus.CANCELLED)) {
      const entry = byStaff.get(a.staff.id) ?? { staff: a.staff, count: 0 };
      entry.count += 1;
      byStaff.set(a.staff.id, entry);
    }
    const busiestStaff = [...byStaff.values()].sort((x, y) => y.count - x.count || x.staff.id.localeCompare(y.staff.id)).slice(0, 5);

    return { perDay, statusBreakdown, feesByRole, busiestStaff };
  }
}
