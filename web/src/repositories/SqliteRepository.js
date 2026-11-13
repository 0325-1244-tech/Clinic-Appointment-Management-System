// @ts-check
import { InMemoryRepository } from './InMemoryRepository.js';

/**
 * Optional storage on Node's built-in SQLite (`node:sqlite`), chosen with
 * STORAGE=sqlite. Items are cached in memory (INHERITANCE from
 * InMemoryRepository) and every change is written to its own table row.
 *
 * Same contract as every other Repository, so the services do not change.
 *
 * @template {{ id: string }} T
 * @extends {InMemoryRepository<T>}
 */
export class SqliteRepository extends InMemoryRepository {
  #db;
  #table;
  #mapper;

  /**
   * @param {object} options
   * @param {import('node:sqlite').DatabaseSync} options.db  an open database
   * @param {string} options.table   table name (letters and underscores only)
   * @param {string} options.prefix  ID prefix
   * @param {import('../domain/mappers.js').RecordMapper<T, any>} options.mapper
   */
  constructor({ db, table, prefix, mapper }) {
    super(prefix);
    if (!/^[a-z_]+$/.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    this.#db = db;
    this.#table = table;
    this.#mapper = mapper;
    db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, record TEXT NOT NULL)`);
    db.exec('CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)');
    this.#load();
  }

  /** @override @param {T} item */
  add(item) {
    super.add(item);
    this.#write(item);
  }

  /** @override @param {T} item */
  update(item) {
    super.update(item);
    this.#write(item);
  }

  /** @override @param {string} id */
  remove(id) {
    const removed = super.remove(id);
    if (removed) {
      this.#db.prepare(`DELETE FROM ${this.#table} WHERE id = ?`).run(id);
    }
    return removed;
  }

  #load() {
    const rows = /** @type {{ record: string }[]} */ (this.#db.prepare(`SELECT record FROM ${this.#table} ORDER BY rowid`).all());
    const counter = /** @type {{ value: number } | undefined} */ (
      this.#db.prepare('SELECT value FROM counters WHERE name = ?').get(this.#table)
    );
    this.restore(counter?.value ?? 0, rows.map((row) => this.#mapper.fromRecord(JSON.parse(row.record))));
  }

  /** @param {T} item */
  #write(item) {
    const record = JSON.stringify(this.#mapper.toRecord(item));
    this.#db.prepare(`INSERT INTO ${this.#table} (id, record) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record`)
      .run(item.id, record);
    this.#db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
      .run(this.#table, this.snapshot().counter);
  }
}
