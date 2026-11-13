// @ts-check
import { ValidationError } from './errors.js';
import { Person } from './Person.js';
import { normalizeKeyword, requireText } from './text.js';
import { CalendarDate } from './time/CalendarDate.js';
import { Clock } from './time/Clock.js';

/**
 * @typedef {import('./Person.js').PersonProps & {
 *   birthDate: CalendarDate | string,
 *   gender: string,
 *   address: string,
 *   bloodType?: string,
 * }} PatientProps
 */

/**
 * INHERITANCE: a Patient is a Person with medical-profile information.
 * POLYMORPHISM: overrides getRole(), getDetails() and matches().
 */
export class Patient extends Person {
  static GENDERS = Object.freeze(['Male', 'Female', 'Other']);
  static BLOOD_TYPES = Object.freeze(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']);

  /** @type {CalendarDate} */
  #birthDate;
  /** @type {string} */
  #gender = '';
  /** @type {string} */
  #address = '';
  /** @type {string} */
  #bloodType = 'Unknown';

  /** @param {PatientProps} props */
  constructor(props) {
    super(props);
    this.birthDate = props.birthDate;
    this.gender = props.gender;
    this.address = props.address;
    this.bloodType = props.bloodType;
  }

  get birthDate() {
    return this.#birthDate;
  }

  /** Required, and cannot be in the future (measured in clinic time). */
  set birthDate(value) {
    if (value === null || value === undefined || value === '') {
      throw new ValidationError('Birth date is required.', { field: 'birthDate' });
    }
    const date = CalendarDate.parse(value);
    if (date.isAfter(Clock.current().today())) {
      throw new ValidationError('Birth date cannot be in the future.', { field: 'birthDate' });
    }
    this.#birthDate = date;
  }

  /** Age in whole years today. */
  get age() {
    return this.#birthDate.yearsUntil(Clock.current().today());
  }

  get gender() {
    return this.#gender;
  }

  set gender(value) {
    this.#gender = requireText(value, 'Gender', 'gender');
  }

  get address() {
    return this.#address;
  }

  set address(value) {
    this.#address = requireText(value, 'Address', 'address');
  }

  get bloodType() {
    return this.#bloodType;
  }

  /** Optional: a blank value becomes "Unknown". */
  set bloodType(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    this.#bloodType = text === '' ? 'Unknown' : text;
  }

  /** @override */
  getRole() {
    return 'Patient';
  }

  /** @override */
  getDetails() {
    return `${this.fullName} | ${this.age} yrs old | ${this.#gender} | Blood type: ${this.#bloodType} | ${this.#address}`;
  }

  /**
   * Also searches the address.
   *
   * @override
   * @param {string} [keyword]
   */
  matches(keyword) {
    return super.matches(keyword) || this.#address.toLowerCase().includes(normalizeKeyword(keyword));
  }
}
