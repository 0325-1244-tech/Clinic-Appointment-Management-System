// @ts-check
import path from 'node:path';
import { AppointmentMapper, PatientMapper, StaffMapper } from '../domain/mappers.js';
import { InMemoryRepository } from './InMemoryRepository.js';
import { JsonFileRepository } from './JsonFileRepository.js';
import { PostgresRepository } from './PostgresRepository.js';
import { SqliteRepository } from './SqliteRepository.js';

/** @typedef {import('../domain/Patient.js').Patient} Patient */
/** @typedef {import('../domain/MedicalStaff.js').MedicalStaff} MedicalStaff */
/** @typedef {import('../domain/Appointment.js').Appointment} Appointment */
/** @typedef {import('./Repository.js').Repository<any>} AnyRepository */
/** @typedef {(name: string, prefix: string, mapper: import('../domain/mappers.js').RecordMapper<any, any>) => Promise<AnyRepository>} OpenRepository */

/**
 * Holds every repository of the clinic (COMPOSITION). The static factory
 * methods choose the storage; everything else only sees Repository objects.
 */
export class ClinicDatabase {
  #patients;
  #staff;
  #appointments;
  #open;
  /** @type {AnyRepository[]} */
  #extra = [];

  /**
   * @param {import('./Repository.js').Repository<Patient>} patients
   * @param {import('./Repository.js').Repository<MedicalStaff>} staff
   * @param {import('./Repository.js').Repository<Appointment>} appointments
   * @param {OpenRepository} [open] creates more repositories in the same storage (accounts, audit log)
   */
  constructor(patients, staff, appointments, open = async (_name, prefix) => new InMemoryRepository(prefix)) {
    this.#patients = patients;
    this.#staff = staff;
    this.#appointments = appointments;
    this.#open = open;
  }

  /** Everything in memory: used by the tests and by demo mode. */
  static inMemory() {
    return new ClinicDatabase(new InMemoryRepository('P'), new InMemoryRepository('S'), new InMemoryRepository('A'));
  }

  /**
   * One JSON file per repository inside `dir`.
   *
   * @param {string} dir
   */
  static jsonFiles(dir) {
    /** @type {OpenRepository} */
    const open = async (name, prefix, mapper) => new JsonFileRepository({ file: path.join(dir, `${name}.json`), prefix, mapper });
    /** @type {JsonFileRepository<Patient>} */
    const patients = new JsonFileRepository({ file: path.join(dir, 'patients.json'), prefix: 'P', mapper: new PatientMapper() });
    /** @type {JsonFileRepository<MedicalStaff>} */
    const staff = new JsonFileRepository({ file: path.join(dir, 'staff.json'), prefix: 'S', mapper: new StaffMapper() });
    /** @type {JsonFileRepository<Appointment>} */
    const appointments = new JsonFileRepository({
      file: path.join(dir, 'appointments.json'),
      prefix: 'A',
      mapper: ClinicDatabase.#appointmentMapper(patients, staff),
    });
    return new ClinicDatabase(patients, staff, appointments, open);
  }

  /**
   * Tables in a SQLite database (STORAGE=sqlite).
   *
   * @param {import('node:sqlite').DatabaseSync} db
   */
  static sqlite(db) {
    /** @type {OpenRepository} */
    const open = async (table, prefix, mapper) => new SqliteRepository({ db, table, prefix, mapper });
    /** @type {SqliteRepository<Patient>} */
    const patients = new SqliteRepository({ db, table: 'patients', prefix: 'P', mapper: new PatientMapper() });
    /** @type {SqliteRepository<MedicalStaff>} */
    const staff = new SqliteRepository({ db, table: 'staff', prefix: 'S', mapper: new StaffMapper() });
    /** @type {SqliteRepository<Appointment>} */
    const appointments = new SqliteRepository({
      db,
      table: 'appointments',
      prefix: 'A',
      mapper: ClinicDatabase.#appointmentMapper(patients, staff),
    });
    return new ClinicDatabase(patients, staff, appointments, open);
  }

  /**
   * Permanent storage in PostgreSQL (STORAGE=postgres, DATABASE_URL). Loads every table first.
   *
   * @param {import('./PostgresRepository.js').SqlClient} client  usually a `pg` Pool
   * @param {{ onError?: (error: unknown) => void }} [options]
   */
  static async postgres(client, { onError } = {}) {
    /** @type {OpenRepository} */
    const open = (table, prefix, mapper) => PostgresRepository.open({ client, table, prefix, mapper, onError });
    const patients = await open('patients', 'P', new PatientMapper());
    const staff = await open('staff', 'S', new StaffMapper());
    const appointments = await open('appointments', 'A', ClinicDatabase.#appointmentMapper(patients, staff));
    return new ClinicDatabase(patients, staff, appointments, open);
  }

  /**
   * @param {import('./Repository.js').Repository<Patient>} patients
   * @param {import('./Repository.js').Repository<MedicalStaff>} staff
   */
  static #appointmentMapper(patients, staff) {
    return new AppointmentMapper({ findPatient: (id) => patients.findById(id), findStaff: (id) => staff.findById(id) });
  }

  /**
   * Opens another repository in the same storage, e.g. the user accounts or the audit log.
   *
   * @param {string} name     table or file name (letters and underscores)
   * @param {string} prefix   ID prefix
   * @param {import('../domain/mappers.js').RecordMapper<any, any>} mapper
   */
  async openRepository(name, prefix, mapper) {
    const repo = await this.#open(name, prefix, mapper);
    this.#extra.push(repo);
    return repo;
  }

  get patients() {
    return this.#patients;
  }

  get staff() {
    return this.#staff;
  }

  get appointments() {
    return this.#appointments;
  }

  /** True when no clinic records exist yet (first run). */
  isEmpty() {
    return this.#patients.count() === 0 && this.#staff.count() === 0 && this.#appointments.count() === 0;
  }

  /** Waits until every write has been saved (PostgreSQL writes in the background). */
  async flush() {
    for (const repo of [this.#patients, this.#staff, this.#appointments, ...this.#extra]) {
      if (repo instanceof PostgresRepository) {
        await repo.flush();
      }
    }
  }
}
