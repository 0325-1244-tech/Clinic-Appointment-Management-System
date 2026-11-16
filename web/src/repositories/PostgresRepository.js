// @ts-check
import { InMemoryRepository } from './InMemoryRepository.js';

/**
 * @typedef {object} SqlClient  the part of a `pg` Pool this class uses
 * @property {(text: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 */

/**
 * Permanent storage in PostgreSQL (STORAGE=postgres, e.g. a free Neon database).
 *
 * The services expect synchronous repositories, so this class keeps every row
 * in memory (INHERITANCE from InMemoryRepository): it loads the table once at
 * start-up, and every add/update/remove is written through to PostgreSQL in
 * the background, strictly in order. If a write ever fails, `onError` is told,
 * the health check turns unhealthy and Render restarts the service, which then
 * reloads the true state from the database.
 *
 * @template {{ id: string }} T
 * @extends {InMemoryRepository<T>}
 */
export class PostgresRepository extends InMemoryRepository {
  #client;
  #table;
  #mapper;
  #onError;
  /** @type {Promise<void>} */
  #pending = Promise.resolve();

  /**
   * Use `PostgresRepository.open()`, which creates the table and loads the rows first.
   *
   * @param {object} options
   * @param {SqlClient} options.client
   * @param {string} options.table
   * @param {string} options.prefix
   * @param {import('../domain/mappers.js').RecordMapper<T, any>} options.mapper
   * @param {(error: unknown) => void} [options.onError]
   */
  constructor({ client, table, prefix, mapper, onError = () => {} }) {
    super(prefix);
    if (!/^[a-z_]+$/.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    this.#client = client;
    this.#table = table;
    this.#mapper = mapper;
    this.#onError = onError;
  }

  /**
   * Creates the table if needed and loads every stored item.
   *
   * @template {{ id: string }} R
   * @param {ConstructorParameters<typeof PostgresRepository<R>>[0]} options
   * @returns {Promise<PostgresRepository<R>>}
   */
  static async open(options) {
    /** @type {PostgresRepository<R>} */
    const repo = new PostgresRepository(options);
    await repo.#load();
    return repo;
  }

  /** @override @param {T} item */
  add(item) {
    super.add(item);
    this.#upsert(item);
  }

  /** @override @param {T} item */
  update(item) {
    super.update(item);
    this.#upsert(item);
  }

  /** @override @param {string} id */
  remove(id) {
    const removed = super.remove(id);
    if (removed) {
      this.#enqueue(`DELETE FROM ${this.#table} WHERE id = $1`, [id]);
    }
    return removed;
  }

  /** Resolves once every queued write has reached the database. */
  flush() {
    return this.#pending;
  }

  async #load() {
    if (!(await this.#tableExists(this.#table))) {
      await this.#client.query(
        `CREATE TABLE ${this.#table} (id TEXT PRIMARY KEY, record JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
      );
    }
    if (!(await this.#tableExists('id_counters'))) {
      await this.#client.query('CREATE TABLE id_counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)');
    }
    const { rows } = await this.#client.query(`SELECT record FROM ${this.#table} ORDER BY created_at, id`);
    const counter = await this.#client.query('SELECT value FROM id_counters WHERE name = $1', [this.#table]);
    this.restore(counter.rows[0]?.value ?? 0, rows.map((row) => this.#mapper.fromRecord(
      typeof row.record === 'string' ? JSON.parse(row.record) : row.record,
    )));
  }

  /** @param {string} name */
  async #tableExists(name) {
    const { rows } = await this.#client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1', [name],
    );
    return rows.length > 0;
  }

  /** @param {T} item */
  #upsert(item) {
    const record = JSON.stringify(this.#mapper.toRecord(item));
    this.#enqueue(
      `INSERT INTO ${this.#table} (id, record) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET record = EXCLUDED.record`,
      [item.id, record],
    );
    this.#enqueue(
      'INSERT INTO id_counters (name, value) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value',
      [this.#table, this.snapshot().counter],
    );
  }

  /** Writes run one after another, in the order the changes happened. @param {string} sql @param {unknown[]} params */
  #enqueue(sql, params) {
    this.#pending = this.#pending
      .then(() => this.#client.query(sql, params))
      .then(() => undefined, (error) => this.#onError(error));
  }
}
