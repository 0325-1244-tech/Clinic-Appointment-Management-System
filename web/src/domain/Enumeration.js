// @ts-check
import { abstractClass } from './contracts.js';
import { ValidationError } from './errors.js';

/** Classes whose list of constants is complete; no more instances may be created. */
const sealed = new WeakSet();

/**
 * ABSTRACTION: the base of every enum in the system (JavaScript has no `enum`).
 * A subclass declares its constants as frozen static instances and then calls
 * `Enumeration.seal(Subclass)`, after which `new Subclass(...)` throws.
 *
 * ENCAPSULATION: the code and label are #private and read-only.
 */
export class Enumeration {
  #code;
  #label;

  /**
   * @param {string} code   stable value used in JSON and the API, e.g. "NO_SHOW"
   * @param {string} label  text shown to people, e.g. "No-Show"
   */
  constructor(code, label) {
    if (new.target === Enumeration) {
      throw abstractClass('Enumeration');
    }
    if (sealed.has(new.target)) {
      throw new TypeError(`${new.target.name} is an enum; use its constants instead of new.`);
    }
    this.#code = code;
    this.#label = label;
  }

  get code() {
    return this.#code;
  }

  get label() {
    return this.#label;
  }

  toString() {
    return this.#label;
  }

  toJSON() {
    return this.#code;
  }

  /**
   * Freezes the class and every constant on it, then blocks further `new` calls.
   *
   * @param {Function} enumClass
   */
  static seal(enumClass) {
    for (const value of Object.values(enumClass)) {
      if (value instanceof Enumeration) {
        Object.freeze(value);
      }
    }
    sealed.add(enumClass);
    Object.freeze(enumClass);
  }

  /**
   * All constants of the subclass this is called on, in declaration order.
   *
   * @template {Enumeration} T
   * @this {{ new (...args: any[]): T }}
   * @returns {T[]}
   */
  static values() {
    return /** @type {T[]} */ (Object.values(this).filter((v) => v instanceof this));
  }

  /**
   * Looks a constant up by its code (or returns the argument if it already is one).
   *
   * @template {Enumeration} T
   * @this {{ new (...args: any[]): T, values(): T[], name: string }}
   * @param {string | T} code
   * @returns {T}
   */
  static from(code) {
    if (code instanceof this) {
      return code;
    }
    const found = this.values().find((v) => v.code === code);
    if (!found) {
      throw new ValidationError(`Unknown ${this.name} value: ${String(code)}.`);
    }
    return found;
  }
}
