// @ts-check
import { Enumeration } from '../domain/Enumeration.js';
import { ValidationError } from '../domain/errors.js';
import { RecordMapper } from '../domain/mappers.js';
import { requireText } from '../domain/text.js';

/** The three kinds of account. */
export class UserRole extends Enumeration {
  static ADMIN = new UserRole('ADMIN', 'Admin');
  static RECEPTIONIST = new UserRole('RECEPTIONIST', 'Receptionist');
  static DOCTOR = new UserRole('DOCTOR', 'Doctor');
}
Enumeration.seal(UserRole);

/**
 * @typedef {object} UserRecord  how an account is stored (server only; never sent to the browser)
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {string} role
 * @property {string | null} staffId
 * @property {boolean} active
 * @property {string} passwordHash
 */

/**
 * A person who can sign in. A Doctor account is linked to a MedicalStaff
 * record through `staffId`.
 *
 * ENCAPSULATION: the password hash is #private. It is never returned by a
 * getter; it can only be checked with verifyPassword() or replaced with
 * setPassword(), and only the storage mapper may read it through toRecord().
 */
export class User {
  static USERNAME = /^[a-z0-9._-]{3,30}$/;

  #id;
  #username;
  /** @type {string} */
  #displayName = '';
  /** @type {UserRole} */
  #role = UserRole.RECEPTIONIST;
  /** @type {string | undefined} */
  #staffId;
  #active;
  #passwordHash;

  /**
   * @param {object} props
   * @param {string} props.id
   * @param {string} props.username
   * @param {string} props.displayName
   * @param {UserRole | string} props.role
   * @param {string} props.passwordHash  produced by PasswordHasher.hash()
   * @param {string | null} [props.staffId] required for Doctor accounts
   * @param {boolean} [props.active]
   */
  constructor({ id, username, displayName, role, passwordHash, staffId, active = true }) {
    this.#id = requireText(id, 'ID');
    const name = requireText(username, 'Username', 'username').toLowerCase();
    if (!User.USERNAME.test(name)) {
      throw new ValidationError('Username must be 3 to 30 letters, numbers, dots, dashes or underscores.', { field: 'username' });
    }
    this.#username = name;
    this.displayName = displayName;
    this.setRole(role, staffId ?? undefined);
    this.#passwordHash = requireText(passwordHash, 'Password hash');
    this.#active = Boolean(active);
  }

  get id() {
    return this.#id;
  }

  /** Read-only: a username never changes (the audit log refers to it). */
  get username() {
    return this.#username;
  }

  get displayName() {
    return this.#displayName;
  }

  set displayName(value) {
    this.#displayName = requireText(value, 'Display name', 'displayName');
  }

  get role() {
    return this.#role;
  }

  get staffId() {
    return this.#staffId;
  }

  get active() {
    return this.#active;
  }

  set active(value) {
    this.#active = Boolean(value);
  }

  /**
   * Role and staff link change together, because a Doctor must be linked to a staff record.
   *
   * @param {UserRole | string} role
   * @param {string} [staffId]
   */
  setRole(role, staffId) {
    const next = UserRole.from(role);
    if (next === UserRole.DOCTOR && !staffId) {
      throw new ValidationError('A Doctor account must be linked to a staff record.', { field: 'staffId' });
    }
    this.#role = next;
    this.#staffId = next === UserRole.DOCTOR ? staffId : undefined;
  }

  /**
   * @param {string} password
   * @param {import('./PasswordHasher.js').PasswordHasher} hasher
   */
  verifyPassword(password, hasher) {
    return hasher.verify(password, this.#passwordHash);
  }

  /**
   * Replaces the password (the policy is checked by AuthService before hashing).
   *
   * @param {string} passwordHash  produced by PasswordHasher.hash()
   */
  setPasswordHash(passwordHash) {
    this.#passwordHash = requireText(passwordHash, 'Password hash');
  }

  /** What the browser is allowed to know about an account. */
  toPublic() {
    return {
      id: this.#id, username: this.#username, displayName: this.#displayName, role: this.#role.code,
      roleLabel: this.#role.label, staffId: this.#staffId ?? null, active: this.#active,
    };
  }

  /**
   * The stored form, including the password hash. Only UserMapper calls this.
   *
   * @returns {UserRecord}
   */
  toRecord() {
    return { ...this.toPublic(), role: this.#role.code, passwordHash: this.#passwordHash };
  }
}

/** Saves accounts to the same storage as the clinic records. @extends {RecordMapper<User, UserRecord>} */
export class UserMapper extends RecordMapper {
  /** @param {User} user */
  toRecord(user) {
    const { id, username, displayName, role, staffId, active, passwordHash } = user.toRecord();
    return { id, username, displayName, role, staffId, active, passwordHash };
  }

  /** @param {UserRecord} record */
  fromRecord(record) {
    return new User(record);
  }
}
