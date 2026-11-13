// @ts-check
import { assertImplements, Identifiable } from '../domain/contracts.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { Repository } from './Repository.js';

/**
 * @typedef {object} Snapshot
 * @property {number} counter
 * @property {object[]} items
 */

/**
 * Stores items in a Map keyed by ID. Used directly by the tests, and extended
 * by JsonFileRepository (INHERITANCE).
 *
 * ENCAPSULATION: the map and the ID counter are #private, and callers only
 * ever receive copies of the list.
 *
 * @template {{ id: string }} T
 * @extends {Repository<T>}
 */
export class InMemoryRepository extends Repository {
  /** @type {Map<string, T>} */
  #items = new Map();
  #prefix;
  #counter = 0;

  /** @param {string} prefix e.g. "P" for P-0001 */
  constructor(prefix) {
    super();
    this.#prefix = prefix;
  }

  get prefix() {
    return this.#prefix;
  }

  /** @override */
  nextId() {
    let n = this.#counter + 1;
    while (this.#items.has(this.#format(n))) {
      n += 1;
    }
    return this.#format(n);
  }

  /** @override @param {T} item */
  add(item) {
    if (item === null || item === undefined) {
      throw new ValidationError('Cannot add an empty record.');
    }
    assertImplements(item, Identifiable);
    if (this.#items.has(item.id)) {
      throw new ConflictError(`A record with ID ${item.id} already exists.`);
    }
    // The counter only moves forward once a generated-style ID has really been used.
    const n = this.#numberOf(item.id);
    if (n > this.#counter) {
      this.#counter = n;
    }
    this.#items.set(item.id, item);
  }

  /** @override @param {T} item */
  update(item) {
    if (!item || this.#items.get(item.id) !== item) {
      throw new NotFoundError(`No stored record with ID ${item?.id}.`);
    }
  }

  /** @override @param {string} id */
  remove(id) {
    return this.#items.delete(id);
  }

  /** @override @param {string} id */
  findById(id) {
    return this.#items.get(id);
  }

  /** @override */
  findAll() {
    return [...this.#items.values()];
  }

  /** @override */
  count() {
    return this.#items.size;
  }

  /**
   * The counter and items, for subclasses that save to disk.
   *
   * @protected
   * @returns {{ counter: number, items: T[] }}
   */
  snapshot() {
    return { counter: this.#counter, items: this.findAll() };
  }

  /**
   * Replaces everything with loaded data, for subclasses that load from disk.
   *
   * @protected
   * @param {number} counter
   * @param {T[]} items
   */
  restore(counter, items) {
    this.#items = new Map(items.map((item) => [item.id, item]));
    this.#counter = Math.max(0, Number(counter) || 0);
  }

  /** @param {number} n */
  #format(n) {
    return `${this.#prefix}-${String(n).padStart(4, '0')}`;
  }

  /** Number part of an ID with this repository's prefix, or 0. @param {string} id */
  #numberOf(id) {
    const match = new RegExp(`^${this.#prefix}-(\\d+)$`).exec(id);
    return match ? Number(match[1]) : 0;
  }
}
