// @ts-check
import { Enumeration } from '../domain/Enumeration.js';
import { requireText } from '../domain/text.js';

/** The three kinds of account. */
export class UserRole extends Enumeration {
  static ADMIN = new UserRole('ADMIN', 'Admin');
  static RECEPTIONIST = new UserRole('RECEPTIONIST', 'Receptionist');
  static DOCTOR = new UserRole('DOCTOR', 'Doctor');
}
Enumeration.seal(UserRole);

/**
 * A person who can sign in. A Doctor account is linked to a MedicalStaff
 * record through `staffId`.
 *
 * ENCAPSULATION: the password hash is #private. It is never returned by a
 * getter; the only way to use it is verifyPassword().
 */
export class User {
  #id;
  #username;
  #displayName;
  #role;
  #staffId;
  #passwordHash;

  /**
   * @param {object} props
   * @param {string} props.id
   * @param {string} props.username
   * @param {string} props.displayName
   * @param {UserRole | string} props.role
   * @param {string} props.passwordHash  produced by PasswordHasher.hash()
   * @param {string} [props.staffId]     required for Doctor accounts
   */
  constructor({ id, username, displayName, role, passwordHash, staffId }) {
    this.#id = requireText(id, 'ID');
    this.#username = requireText(username, 'Username').toLowerCase();
    this.#displayName = requireText(displayName, 'Display name');
    this.#role = UserRole.from(role);
    this.#passwordHash = requireText(passwordHash, 'Password hash');
    if (this.#role === UserRole.DOCTOR && !staffId) {
      throw new TypeError('A Doctor account must be linked to a staff record.');
    }
    this.#staffId = staffId;
  }

  get id() {
    return this.#id;
  }

  get username() {
    return this.#username;
  }

  get displayName() {
    return this.#displayName;
  }

  get role() {
    return this.#role;
  }

  get staffId() {
    return this.#staffId;
  }

  /**
   * @param {string} password
   * @param {import('./PasswordHasher.js').PasswordHasher} hasher
   */
  verifyPassword(password, hasher) {
    return hasher.verify(password, this.#passwordHash);
  }

  /** What the browser is allowed to know about the signed-in user. */
  toPublic() {
    return { id: this.#id, username: this.#username, displayName: this.#displayName, role: this.#role.code, roleLabel: this.#role.label, staffId: this.#staffId ?? null };
  }
}
