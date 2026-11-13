// @ts-check
/**
 * ABSTRACTION through "interfaces".
 *
 * JavaScript has no `interface` keyword. A contract here is a frozen object that
 * lists the members a class promises to provide. `implementsInterface()` checks
 * an object against it at runtime, and each class declares the contracts it
 * implements in a static `implements` list, the way a Java class writes
 * `implements Identifiable, Searchable`.
 */

/**
 * @typedef {object} Contract
 * @property {string} name
 * @property {readonly string[]} methods     members that must be functions
 * @property {readonly string[]} properties  members that must exist (getters or fields)
 */

/** Anything stored and looked up by a unique ID (Java: Identifiable). */
export const Identifiable = defineContract('Identifiable', { properties: ['id'] });

/** Anything that can be filtered by a search keyword (Java: Searchable). */
export const Searchable = defineContract('Searchable', { methods: ['matches'] });

/** Anything that produces a charge (Java: Billable). */
export const Billable = defineContract('Billable', { methods: ['computeFee'] });

/**
 * @param {string} name
 * @param {{ methods?: string[], properties?: string[] }} members
 * @returns {Readonly<Contract>}
 */
export function defineContract(name, { methods = [], properties = [] }) {
  return Object.freeze({ name, methods: Object.freeze([...methods]), properties: Object.freeze([...properties]) });
}

/**
 * True when `obj` provides every member of the contract.
 * A plain array of method names is accepted too: `implementsInterface(obj, ['computeFee'])`.
 *
 * @param {unknown} obj
 * @param {Contract | string[]} contract
 * @returns {boolean}
 */
export function implementsInterface(obj, contract) {
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
    return false;
  }
  const target = /** @type {Record<string, unknown>} */ (obj);
  const methods = Array.isArray(contract) ? contract : contract.methods;
  const properties = Array.isArray(contract) ? [] : contract.properties;
  return methods.every((m) => typeof target[m] === 'function') && properties.every((p) => p in target);
}

/**
 * Throws a TypeError if `obj` does not satisfy the contract. Used by the
 * repositories and services to reject objects that don't fit.
 *
 * @template T
 * @param {T} obj
 * @param {Contract} contract
 * @returns {T}
 */
export function assertImplements(obj, contract) {
  if (!implementsInterface(obj, contract)) {
    throw new TypeError(`Object does not implement ${contract.name}.`);
  }
  return obj;
}

/**
 * Error thrown by an abstract method that a subclass forgot to override.
 *
 * @param {object} instance
 * @param {string} method
 * @returns {TypeError}
 */
export function abstractMethod(instance, method) {
  return new TypeError(`${instance.constructor.name} must implement the abstract method ${method}().`);
}

/**
 * Error thrown when code tries to instantiate an abstract class directly.
 *
 * @param {string} className
 * @returns {TypeError}
 */
export function abstractClass(className) {
  return new TypeError(`${className} is abstract and cannot be instantiated directly.`);
}
