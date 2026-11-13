// @ts-check
import { abstractClass, abstractMethod } from '../domain/contracts.js';

/**
 * ABSTRACTION: a generic storage contract (Java: `interface Repository<T extends Identifiable>`).
 * The services depend on this class only, so storage can be swapped (memory,
 * JSON files, SQLite) without touching any business rule.
 *
 * Every method is abstract; subclasses provide the storage.
 *
 * @template {{ id: string }} T  any entity that has an ID (Identifiable)
 */
export class Repository {
  constructor() {
    if (new.target === Repository) {
      throw abstractClass('Repository');
    }
  }

  /**
   * The ID the next added item should use, e.g. "P-0007". Calling it does not
   * reserve the ID: the counter only moves once an item with that ID is added.
   *
   * @abstract
   * @returns {string}
   */
  nextId() {
    throw abstractMethod(this, 'nextId');
  }

  /**
   * @abstract
   * @param {T} _item
   * @returns {void}
   */
  add(_item) {
    throw abstractMethod(this, 'add');
  }

  /**
   * Saves changes made to an item that is already stored.
   *
   * @abstract
   * @param {T} _item
   * @returns {void}
   */
  update(_item) {
    throw abstractMethod(this, 'update');
  }

  /**
   * @abstract
   * @param {string} _id
   * @returns {boolean} true if something was removed
   */
  remove(_id) {
    throw abstractMethod(this, 'remove');
  }

  /**
   * @abstract
   * @param {string} _id
   * @returns {T | undefined}
   */
  findById(_id) {
    throw abstractMethod(this, 'findById');
  }

  /**
   * @abstract
   * @returns {T[]} a new array; changing it does not change the repository
   */
  findAll() {
    throw abstractMethod(this, 'findAll');
  }

  /**
   * @param {(item: T) => boolean} condition
   * @returns {T[]}
   */
  findWhere(condition) {
    return this.findAll().filter(condition);
  }

  /** @returns {number} */
  count() {
    return this.findAll().length;
  }
}
