// @ts-check
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * @typedef {object} Actor  who is making the current request
 * @property {string} username
 * @property {string} role
 */

const storage = new AsyncLocalStorage();

/**
 * Carries the signed-in user through one HTTP request without passing it to
 * every method, so the audit log can record who made each change.
 */
export class RequestContext {
  constructor() {
    throw new TypeError('RequestContext only has static methods.');
  }

  /**
   * Runs `fn` with `actor` as the current actor.
   *
   * @template T
   * @param {Actor} actor
   * @param {() => T} fn
   * @returns {T}
   */
  static run(actor, fn) {
    return storage.run(Object.freeze({ ...actor }), fn);
  }

  /** @returns {Actor} */
  static actor() {
    return storage.getStore() ?? { username: 'system', role: 'System' };
  }
}
