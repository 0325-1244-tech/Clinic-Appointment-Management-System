// @ts-check
import { RecordMapper } from '../domain/mappers.js';
import { RequestContext } from './RequestContext.js';

/**
 * @typedef {object} AuditRecord
 * @property {string} id
 * @property {string} at          ISO timestamp
 * @property {string} actor       username
 * @property {string} actorRole
 * @property {string} action      e.g. "appointment.cancelled"
 * @property {string} entityType
 * @property {string} entityId
 * @property {string} summary
 */

/**
 * One line of the audit log. An immutable value object: frozen, no setters.
 */
export class AuditEntry {
  #record;

  /** @param {AuditRecord} record */
  constructor(record) {
    this.#record = Object.freeze({ ...record });
    Object.freeze(this);
  }

  get id() {
    return this.#record.id;
  }

  get at() {
    return this.#record.at;
  }

  get actor() {
    return this.#record.actor;
  }

  get actorRole() {
    return this.#record.actorRole;
  }

  get action() {
    return this.#record.action;
  }

  get entityType() {
    return this.#record.entityType;
  }

  get entityId() {
    return this.#record.entityId;
  }

  get summary() {
    return this.#record.summary;
  }

  /** @returns {AuditRecord} */
  toRecord() {
    return { ...this.#record };
  }
}

/** @extends {RecordMapper<AuditEntry, AuditRecord>} */
export class AuditEntryMapper extends RecordMapper {
  /** @param {AuditEntry} entry */
  toRecord(entry) {
    return entry.toRecord();
  }

  /** @param {AuditRecord} record */
  fromRecord(record) {
    return new AuditEntry(record);
  }
}

/**
 * OBSERVER pattern: the audit log subscribes to the ClinicService's "change"
 * events and records who changed what, and when. The service does not know
 * the audit log exists, so either side can change independently.
 */
export class AuditLog {
  #repository;
  #limit;

  /**
   * @param {object} options
   * @param {import('../repositories/Repository.js').Repository<AuditEntry>} options.repository
   * @param {number} [options.limit] oldest entries are dropped beyond this many
   */
  constructor({ repository, limit = 2000 }) {
    this.#repository = repository;
    this.#limit = limit;
  }

  /**
   * Starts listening to a subject's "change" events.
   *
   * @param {import('node:events').EventEmitter} subject
   */
  observe(subject) {
    subject.on('change', (/** @type {import('./ClinicService.js').ChangeEvent} */ event) => this.record(event));
    return this;
  }

  /**
   * Adds an entry. The actor is the signed-in user of the current request.
   *
   * @param {{ action: string, entityType: string, entityId: string, summary: string }} event
   * @param {import('./RequestContext.js').Actor} [actor] defaults to the signed-in user of the current request
   */
  record({ action, entityType, entityId, summary }, actor = RequestContext.actor()) {
    const entry = new AuditEntry({
      id: this.#repository.nextId(),
      at: new Date().toISOString(),
      actor: actor.username,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      summary,
    });
    this.#repository.add(entry);
    const all = this.#repository.findAll();
    for (const old of all.slice(0, Math.max(0, all.length - this.#limit))) {
      this.#repository.remove(old.id);
    }
    return entry;
  }

  /**
   * Newest first.
   *
   * @param {{ entityId?: string, limit?: number }} [filters]
   */
  list({ entityId, limit = 200 } = {}) {
    return this.#repository.findAll()
      .filter((e) => !entityId || e.entityId === entityId)
      .reverse()
      .slice(0, limit);
  }
}
