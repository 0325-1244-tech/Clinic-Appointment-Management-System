// @ts-check
import { Dentist } from './Dentist.js';
import { Doctor } from './Doctor.js';
import { ValidationError } from './errors.js';
import { Nurse } from './Nurse.js';

/**
 * FACTORY: creates the right MedicalStaff subclass from a role name. Callers
 * receive a MedicalStaff reference and never need to know the concrete class
 * (POLYMORPHISM). The browser uses the same factory to turn API data back
 * into real Doctor / Dentist / Nurse objects.
 */
export class StaffFactory {
  static ROLES = Object.freeze(['Doctor', 'Dentist', 'Nurse']);

  /** Role name -> class. Adding a new kind of staff only needs a new entry here. */
  static #CLASSES = Object.freeze({ Doctor, Dentist, Nurse });

  constructor() {
    throw new TypeError('StaffFactory only has static methods.');
  }

  /**
   * @param {string} role "Doctor", "Dentist" or "Nurse"
   * @param {import('./MedicalStaff.js').StaffProps} props
   * @returns {import('./MedicalStaff.js').MedicalStaff}
   */
  static create(role, props) {
    return new (StaffFactory.#classFor(role))(props);
  }

  /** @param {string} role */
  static serviceAreaLabel(role) {
    return StaffFactory.#classFor(role, Doctor).AREA_LABEL;
  }

  /**
   * Suggested values for the service area field of a role.
   *
   * @param {string} role
   * @returns {readonly string[]}
   */
  static serviceAreaOptions(role) {
    const cls = StaffFactory.#classFor(role, Doctor);
    if (cls === Dentist) {
      return Dentist.ROOMS;
    }
    if (cls === Nurse) {
      return Nurse.DEPARTMENTS;
    }
    return Doctor.SPECIALIZATIONS;
  }

  /**
   * @param {string} role
   * @param {typeof Doctor | typeof Dentist | typeof Nurse} [fallback] returned instead of throwing
   */
  static #classFor(role, fallback) {
    const cls = Object.hasOwn(StaffFactory.#CLASSES, role)
      ? StaffFactory.#CLASSES[/** @type {'Doctor' | 'Dentist' | 'Nurse'} */ (role)]
      : undefined;
    if (cls) {
      return cls;
    }
    if (fallback) {
      return fallback;
    }
    throw new ValidationError(`Unknown staff role: ${role}`, { field: 'role' });
  }
}
