// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { InMemoryRepository } from './InMemoryRepository.js';

/**
 * Keeps items in memory (INHERITANCE from InMemoryRepository) and writes them
 * to a JSON file after every change, so records survive a restart.
 *
 * Each write goes to a temporary file first and is then renamed over the old
 * one, so a crash in the middle of saving never leaves a half-written file
 * (same approach as the Java FileStorage).
 *
 * Note for Render's free plan: the disk is temporary and is wiped on every
 * deploy or restart. Empty storage is reseeded with the sample data.
 *
 * @template {{ id: string }} T
 * @extends {InMemoryRepository<T>}
 */
export class JsonFileRepository extends InMemoryRepository {
  #file;
  #mapper;

  /**
   * @param {object} options
   * @param {string} options.file    path of the JSON file
   * @param {string} options.prefix  ID prefix, e.g. "P"
   * @param {import('../domain/mappers.js').RecordMapper<T, any>} options.mapper converts items to and from plain records
   */
  constructor({ file, prefix, mapper }) {
    super(prefix);
    this.#file = file;
    this.#mapper = mapper;
    this.#load();
  }

  get file() {
    return this.#file;
  }

  /** @override @param {T} item */
  add(item) {
    super.add(item);
    this.#save();
  }

  /** @override @param {T} item */
  update(item) {
    super.update(item);
    this.#save();
  }

  /** @override @param {string} id */
  remove(id) {
    const removed = super.remove(id);
    if (removed) {
      this.#save();
    }
    return removed;
  }

  #load() {
    if (!fs.existsSync(this.#file)) {
      return;
    }
    const data = JSON.parse(fs.readFileSync(this.#file, 'utf8'));
    if (!data || !Array.isArray(data.items)) {
      throw new Error(`${this.#file} is not a valid clinic data file.`);
    }
    this.restore(data.counter, data.items.map((/** @type {any} */ record) => this.#mapper.fromRecord(record)));
  }

  #save() {
    const { counter, items } = this.snapshot();
    const json = JSON.stringify({ counter, items: items.map((item) => this.#mapper.toRecord(item)) }, null, 2);
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    const temp = `${this.#file}.tmp`;
    fs.writeFileSync(temp, json, 'utf8');
    fs.renameSync(temp, this.#file);
  }
}
