// @ts-check
import { abstractClass, abstractMethod, Identifiable, Searchable } from './contracts.js';
import { ValidationError } from './errors.js';
import { normalizeKeyword, requireText } from './text.js';

/**
 * @typedef {object} PersonProps
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} contactNumber
 * @property {string} [email]
 */

/**
 * ABSTRACTION: the common blueprint for every person in the clinic. It cannot
 * be instantiated on its own (`new Person()` throws); Patient and MedicalStaff
 * extend it (INHERITANCE).
 *
 * ENCAPSULATION: every field is #private and can only be changed through a
 * `set` accessor that validates the value first. The ID has no setter at all.
 *
 * Implements: Identifiable, Searchable.
 */
export class Person {
  static implements = Object.freeze([Identifiable, Searchable]);
  static #PHONE = /^(09|\+639)\d{9}$/;
  static #EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

  #id;
  /** @type {string} */
  #firstName = '';
  /** @type {string} */
  #lastName = '';
  /** @type {string} */
  #contactNumber = '';
  /** @type {string} */
  #email = '';

  /** @param {PersonProps} props */
  constructor({ id, firstName, lastName, contactNumber, email }) {
    if (new.target === Person) {
      throw abstractClass('Person');
    }
    this.#id = requireText(id, 'ID', 'id');
    this.firstName = firstName;
    this.lastName = lastName;
    this.contactNumber = contactNumber;
    this.email = email ?? '';
  }

  /** Read-only: an ID never changes after creation. */
  get id() {
    return this.#id;
  }

  get firstName() {
    return this.#firstName;
  }

  set firstName(value) {
    this.#firstName = requireText(value, 'First name', 'firstName');
  }

  get lastName() {
    return this.#lastName;
  }

  set lastName(value) {
    this.#lastName = requireText(value, 'Last name', 'lastName');
  }

  get contactNumber() {
    return this.#contactNumber;
  }

  /** Spaces and dashes are removed, then the number must be a PH mobile number. */
  set contactNumber(value) {
    const number = requireText(value, 'Contact number', 'contactNumber').replace(/[\s-]/g, '');
    if (!Person.#PHONE.test(number)) {
      throw new ValidationError('Contact number must be a valid PH mobile number (e.g. 09171234567).', {
        field: 'contactNumber',
      });
    }
    this.#contactNumber = number;
  }

  get email() {
    return this.#email;
  }

  /** Optional, but must look like an email address when given. */
  set email(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text !== '' && !Person.#EMAIL.test(text)) {
      throw new ValidationError('Email address is not valid.', { field: 'email' });
    }
    this.#email = text;
  }

  get fullName() {
    return `${this.#firstName} ${this.#lastName}`;
  }

  /** Initials only, e.g. "J.D." — used where full names must not be shown (the public queue board). */
  get initials() {
    return `${this.#firstName.charAt(0)}.${this.#lastName.charAt(0)}.`.toUpperCase();
  }

  /**
   * Each subclass names its own role ("Patient", "Doctor", ...).
   *
   * @abstract
   * @returns {string}
   */
  getRole() {
    throw abstractMethod(this, 'getRole');
  }

  /**
   * Each subclass builds its own one-line description.
   *
   * @abstract
   * @returns {string}
   */
  getDetails() {
    throw abstractMethod(this, 'getDetails');
  }

  /**
   * Searchable: true when the keyword appears in the ID, name, contact number
   * or email. A blank keyword matches everyone. Subclasses widen the search.
   *
   * @param {string} [keyword]
   */
  matches(keyword) {
    const k = normalizeKeyword(keyword);
    if (k === '') {
      return true;
    }
    return (
      this.#id.toLowerCase().includes(k) ||
      this.fullName.toLowerCase().includes(k) ||
      this.#contactNumber.includes(k) ||
      this.#email.toLowerCase().includes(k)
    );
  }

  /**
   * Two people are equal when they are the same class with the same ID.
   *
   * @param {unknown} other
   */
  equals(other) {
    return other instanceof Person && other.constructor === this.constructor && other.id === this.#id;
  }

  toString() {
    return `${this.fullName} (${this.#id})`;
  }
}
