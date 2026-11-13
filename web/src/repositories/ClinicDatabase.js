// @ts-check
import path from 'node:path';
import { AppointmentMapper, PatientMapper, StaffMapper } from '../domain/mappers.js';
import { InMemoryRepository } from './InMemoryRepository.js';
import { JsonFileRepository } from './JsonFileRepository.js';
import { SqliteRepository } from './SqliteRepository.js';

/** @typedef {import('../domain/Patient.js').Patient} Patient */
/** @typedef {import('../domain/MedicalStaff.js').MedicalStaff} MedicalStaff */
/** @typedef {import('../domain/Appointment.js').Appointment} Appointment */
/** @typedef {import('./Repository.js').Repository<any>} AnyRepository */

/**
 * Holds every repository of the clinic (COMPOSITION). The static factory
 * methods choose the storage; everything else only sees Repository objects.
 */
export class ClinicDatabase {
  #patients;
  #staff;
  #appointments;

  /**
   * @param {import('./Repository.js').Repository<Patient>} patients
   * @param {import('./Repository.js').Repository<MedicalStaff>} staff
   * @param {import('./Repository.js').Repository<Appointment>} appointments
   */
  constructor(patients, staff, appointments) {
    this.#patients = patients;
    this.#staff = staff;
    this.#appointments = appointments;
  }

  /** Everything in memory: used by the tests. */
  static inMemory() {
    return new ClinicDatabase(new InMemoryRepository('P'), new InMemoryRepository('S'), new InMemoryRepository('A'));
  }

  /**
   * One JSON file per repository inside `dir` (the default storage).
   *
   * @param {string} dir
   */
  static jsonFiles(dir) {
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
    return new ClinicDatabase(patients, staff, appointments);
  }

  /**
   * Tables in a SQLite database (STORAGE=sqlite).
   *
   * @param {import('node:sqlite').DatabaseSync} db
   */
  static sqlite(db) {
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
    return new ClinicDatabase(patients, staff, appointments);
  }

  /**
   * @param {import('./Repository.js').Repository<Patient>} patients
   * @param {import('./Repository.js').Repository<MedicalStaff>} staff
   */
  static #appointmentMapper(patients, staff) {
    return new AppointmentMapper({ findPatient: (id) => patients.findById(id), findStaff: (id) => staff.findById(id) });
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

  /** True when nothing has been stored yet (first run): the sample data is loaded then. */
  isEmpty() {
    return this.#patients.count() === 0 && this.#staff.count() === 0 && this.#appointments.count() === 0;
  }
}
