// @ts-check
import { abstractClass, abstractMethod } from '../domain/contracts.js';
import { NotFoundError } from '../domain/errors.js';
import { ForbiddenError } from './errors.js';
import { UserRole } from './User.js';

/** @typedef {import('../domain/Appointment.js').Appointment} Appointment */

/**
 * Every action the API protects.
 *
 * @readonly
 * @enum {string}
 */
export const Permission = Object.freeze({
  PATIENTS_READ: 'patients:read',
  PATIENTS_WRITE: 'patients:write',
  STAFF_READ: 'staff:read',
  STAFF_WRITE: 'staff:write',
  APPOINTMENTS_READ: 'appointments:read',
  APPOINTMENTS_BOOK: 'appointments:book',
  APPOINTMENTS_MANAGE: 'appointments:manage', // reschedule, cancel, no-show
  APPOINTMENTS_COMPLETE: 'appointments:complete',
  RECORDS_READ: 'records:read',
  STATS_READ: 'stats:read',
  AUDIT_READ: 'audit:read',
  QUEUE_MANAGE: 'queue:manage',
  FINDINGS_READ: 'findings:read', // clinical findings written when a visit is completed
  USERS_MANAGE: 'users:manage', // create accounts, reset passwords (administrators only)
});

/**
 * ABSTRACTION + POLYMORPHISM: what a signed-in user may see and do. The API
 * asks `policy.can(...)` and `policy.canAccess(appointment)` without knowing
 * which role it is talking to; each subclass answers for its own role.
 */
export class AccessPolicy {
  constructor() {
    if (new.target === AccessPolicy) {
      throw abstractClass('AccessPolicy');
    }
  }

  /**
   * The right policy for a user (a small factory).
   *
   * @param {import('./User.js').User} user
   * @returns {AccessPolicy}
   */
  static for(user) {
    switch (user.role) {
      case UserRole.ADMIN:
        return new AdminPolicy();
      case UserRole.RECEPTIONIST:
        return new ReceptionistPolicy();
      default:
        return new DoctorPolicy(/** @type {string} */ (user.staffId));
    }
  }

  /**
   * @abstract
   * @param {string} _permission
   * @returns {boolean}
   */
  can(_permission) {
    throw abstractMethod(this, 'can');
  }

  /**
   * When set, the user only sees appointments (and their patients) of this staff member.
   *
   * @returns {string | undefined}
   */
  get staffScope() {
    return undefined;
  }

  /** @param {Appointment} appointment */
  canAccess(appointment) {
    return !this.staffScope || appointment.staff.id === this.staffScope;
  }

  /** @param {string} permission */
  require(permission) {
    if (!this.can(permission)) {
      throw new ForbiddenError('Your account is not allowed to do that.');
    }
  }

  /** @param {Appointment} appointment */
  requireAccess(appointment) {
    if (!this.canAccess(appointment)) {
      // 404, not 403, so other staff members' appointment IDs cannot be probed.
      throw new NotFoundError(`Appointment ${appointment.id} was not found.`);
    }
  }

  /** The permission list sent to the browser so it can hide buttons the user cannot use. */
  permissions() {
    return Object.values(Permission).filter((p) => this.can(p));
  }
}

/** Admins can do everything. */
export class AdminPolicy extends AccessPolicy {
  /** @override */
  can() {
    return true;
  }
}

/** Front desk: patients, booking and records. No staff changes, no clinical findings, no audit log. */
export class ReceptionistPolicy extends AccessPolicy {
  /** @type {Set<string>} */
  static #DENIED = new Set([Permission.STAFF_WRITE, Permission.APPOINTMENTS_COMPLETE, Permission.AUDIT_READ, Permission.FINDINGS_READ, Permission.USERS_MANAGE]);

  /** @override @param {string} permission */
  can(permission) {
    return !ReceptionistPolicy.#DENIED.has(permission);
  }
}

/** A doctor works with their own schedule and patients only. */
export class DoctorPolicy extends AccessPolicy {
  /** @type {Set<string>} */
  static #ALLOWED = new Set([
    Permission.PATIENTS_READ, Permission.STAFF_READ, Permission.APPOINTMENTS_READ, Permission.APPOINTMENTS_MANAGE,
    Permission.APPOINTMENTS_COMPLETE, Permission.RECORDS_READ, Permission.STATS_READ, Permission.QUEUE_MANAGE,
    Permission.FINDINGS_READ,
  ]);

  #staffId;

  /** @param {string} staffId */
  constructor(staffId) {
    super();
    // Fail closed: without a staff link the doctor would otherwise see everyone's data.
    if (!staffId) {
      throw new TypeError('A doctor account must be linked to a staff record.');
    }
    this.#staffId = staffId;
  }

  /** @override @param {string} permission */
  can(permission) {
    return DoctorPolicy.#ALLOWED.has(permission);
  }

  /** @override */
  get staffScope() {
    return this.#staffId;
  }
}
