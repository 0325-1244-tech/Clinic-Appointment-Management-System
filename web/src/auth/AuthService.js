// @ts-check
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { InMemoryRepository } from '../repositories/InMemoryRepository.js';
import { AccessPolicy } from './AccessPolicy.js';
import { AuthenticationError, RateLimitError } from './errors.js';
import { PasswordHasher } from './PasswordHasher.js';
import { RateLimiter, SessionStore } from './SessionStore.js';
import { User, UserRole } from './User.js';

/**
 * @typedef {object} AccountSeed
 * @property {string} username
 * @property {string} displayName
 * @property {UserRole} role
 * @property {string} [staffId]
 * @property {string} demoPassword
 */

/** Demo-mode accounts. They exist only in demo mode, are kept in memory, and sit on made-up sample data. */
export const DEMO_ACCOUNTS = Object.freeze(/** @type {AccountSeed[]} */ ([
  { username: 'admin', displayName: 'Clinic Administrator', role: UserRole.ADMIN, demoPassword: 'admin123' },
  { username: 'reception', displayName: 'Front Desk', role: UserRole.RECEPTIONIST, demoPassword: 'reception123' },
  { username: 'drsantos', displayName: 'Dr. Maria Santos', role: UserRole.DOCTOR, staffId: 'S-0001', demoPassword: 'doctor123' },
]));

/** Minimum length for real (non-demo) passwords. */
export const MIN_PASSWORD_LENGTH = 10;

/** @typedef {{ record(event: { action: string, entityType: string, entityId: string, summary: string }, actor?: { username: string, role: string }): unknown }} AuditSink */

/**
 * Signs users in and out, and manages the accounts.
 *
 * Passwords are hashed with scrypt, sessions live on the server, repeated
 * failures are rate-limited per address and per address + username, and an
 * account can be deactivated (which also ends its sessions).
 */
export class AuthService {
  #users;
  #hasher;
  #sessions;
  #limiter;
  #addressLimiter;
  #audit;

  /**
   * @param {object} [options]
   * @param {import('../repositories/Repository.js').Repository<User>} [options.users]
   * @param {PasswordHasher} [options.hasher]
   * @param {SessionStore} [options.sessions]
   * @param {RateLimiter} [options.limiter]         failures per address + username
   * @param {RateLimiter} [options.addressLimiter]  failures per address
   * @param {AuditSink} [options.audit]
   */
  constructor({ users, hasher, sessions, limiter, addressLimiter, audit } = {}) {
    this.#users = users ?? new InMemoryRepository('U');
    this.#hasher = hasher ?? new PasswordHasher();
    this.#sessions = sessions ?? new SessionStore();
    this.#limiter = limiter ?? new RateLimiter({ max: 5, windowMinutes: 15 });
    this.#addressLimiter = addressLimiter ?? new RateLimiter({ max: 20, windowMinutes: 15 });
    this.#audit = audit;
  }

  // ---------------------------------------------------------------- setup

  /**
   * Demo mode: creates the three published demo accounts (only if there are no accounts yet).
   *
   * @returns {Promise<string[]>} usernames created
   */
  async seedDemoAccounts() {
    if (this.#users.count() > 0) {
      return [];
    }
    for (const seed of DEMO_ACCOUNTS) {
      await this.#store({ ...seed, password: seed.demoPassword });
    }
    return DEMO_ACCOUNTS.map((a) => a.username);
  }

  /**
   * Official mode: creates the first administrator from the server settings
   * (ADMIN_USERNAME / ADMIN_PASSWORD) when no administrator exists yet.
   * After that, the administrator manages every other account in the app.
   *
   * @param {{ username?: string, password?: string, displayName?: string }} settings
   * @returns {Promise<'created' | 'exists' | 'missing'>}
   */
  async ensureAdministrator({ username = 'admin', password, displayName = 'Clinic Administrator' }) {
    if (this.#users.findWhere((u) => u.role === UserRole.ADMIN && u.active).length > 0) {
      return 'exists';
    }
    if (!password) {
      return 'missing';
    }
    AuthService.#checkPassword(password, 'ADMIN_PASSWORD');
    const user = await this.#store({ username, displayName, role: UserRole.ADMIN, password });
    this.#audit?.record({ action: 'user.created', entityType: 'user', entityId: user.username, summary: 'First administrator created from the server settings' });
    return 'created';
  }

  /** True when nobody can sign in yet (official mode without ADMIN_PASSWORD). */
  needsSetup() {
    return this.#users.findWhere((u) => u.role === UserRole.ADMIN && u.active).length === 0;
  }

  // ---------------------------------------------------------------- sign-in

  /**
   * @param {string} username
   * @param {string} password
   * @param {string} address  client IP, for rate limiting
   * @returns {Promise<{ user: User, token: string }>}
   */
  async login(username, password, address) {
    const name = String(username ?? '').trim().toLowerCase();
    // Per address + username (so nobody can lock a user out from elsewhere) and per address overall.
    const pairKey = `${address}|${name}`;
    const wait = Math.max(this.#limiter.retryAfter(pairKey), this.#addressLimiter.retryAfter(address));
    if (wait > 0) {
      throw new RateLimitError(`Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, wait);
    }
    const user = this.#findByUsername(name);
    const ok = user ? await user.verifyPassword(String(password ?? ''), this.#hasher) : await this.#fakeVerify();
    if (!user || !ok || !user.active) {
      this.#limiter.hit(pairKey);
      this.#addressLimiter.hit(address);
      this.#audit?.record({ action: 'auth.failed', entityType: 'user', entityId: name.replace(/[^\w.@-]/g, '').slice(0, 40) || '-', summary: 'Failed sign-in' });
      throw new AuthenticationError('Incorrect username or password.');
    }
    // Only this pair is cleared; the address counter keeps counting other guesses.
    this.#limiter.reset(pairKey);
    return { user, token: this.#sessions.create(user.id) };
  }

  /** @param {string | undefined} token */
  logout(token) {
    this.#sessions.destroy(token);
  }

  /**
   * The signed-in user for a session token, or undefined (also for deactivated accounts).
   *
   * @param {string | undefined} token
   */
  userForToken(token) {
    const session = this.#sessions.touch(token);
    const user = session ? this.#users.findById(session.userId) : undefined;
    return user?.active ? user : undefined;
  }

  /** @param {User} user */
  policyFor(user) {
    return AccessPolicy.for(user);
  }

  // ---------------------------------------------------------------- accounts

  /** Every account, administrators first. */
  listUsers() {
    const order = [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.DOCTOR];
    return this.#users.findAll().sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.username.localeCompare(b.username));
  }

  /** @param {string} id */
  getUser(id) {
    const user = this.#users.findById(id);
    if (!user) {
      throw new NotFoundError(`Account ${id} was not found.`);
    }
    return user;
  }

  /**
   * @param {{ username: string, displayName: string, role: string, staffId?: string, password: string }} input
   */
  async createUser({ username, displayName, role, staffId, password }) {
    const name = String(username ?? '').trim().toLowerCase();
    if (this.#findByUsername(name)) {
      throw new ConflictError(`The username "${name}" is already taken.`, { field: 'username' });
    }
    if (UserRole.from(role) === UserRole.DOCTOR && staffId && this.#users.findWhere((u) => u.staffId === staffId).length > 0) {
      throw new ConflictError('That staff member already has an account.', { field: 'staffId' });
    }
    AuthService.#checkPassword(password);
    const user = await this.#store({ username: name, displayName, role: UserRole.from(role), staffId, password });
    this.#audit?.record({ action: 'user.created', entityType: 'user', entityId: user.username, summary: `Created ${user.role.label} account` });
    return user;
  }

  /**
   * Changes name, role, staff link or active flag. The last active administrator
   * cannot be demoted or deactivated, and nobody can deactivate their own account.
   *
   * @param {User} actor  who is making the change
   * @param {string} id
   * @param {{ displayName: string, role: string, staffId?: string, active: boolean }} input
   */
  updateUser(actor, id, { displayName, role, staffId, active }) {
    const user = this.getUser(id);
    const nextRole = UserRole.from(role);
    if (user.id === actor.id && (!active || nextRole !== UserRole.ADMIN)) {
      throw new ValidationError('You cannot deactivate your own account or remove your own administrator role.');
    }
    const otherAdmins = this.#users.findWhere((u) => u.role === UserRole.ADMIN && u.active && u.id !== user.id).length;
    if (user.role === UserRole.ADMIN && user.active && (!active || nextRole !== UserRole.ADMIN) && otherAdmins === 0) {
      throw new ConflictError('The clinic must keep at least one active administrator.');
    }
    if (nextRole === UserRole.DOCTOR && staffId && this.#users.findWhere((u) => u.staffId === staffId && u.id !== user.id).length > 0) {
      throw new ConflictError('That staff member already has an account.', { field: 'staffId' });
    }
    // Validate everything before changing anything.
    const check = new User({ ...user.toRecord(), displayName, role: nextRole, staffId: staffId ?? null, active });
    user.displayName = check.displayName;
    user.setRole(check.role, check.staffId);
    user.active = check.active;
    this.#users.update(user);
    if (!user.active) {
      this.#sessions.destroyForUser(user.id);
    }
    this.#audit?.record({ action: 'user.updated', entityType: 'user', entityId: user.username, summary: `${user.role.label}, ${user.active ? 'active' : 'deactivated'}` });
    return user;
  }

  /**
   * An administrator sets a new password for someone; their open sessions end.
   *
   * @param {string} id
   * @param {string} password
   */
  async resetPassword(id, password) {
    const user = this.getUser(id);
    AuthService.#checkPassword(password);
    user.setPasswordHash(await this.#hasher.hash(password));
    this.#users.update(user);
    this.#sessions.destroyForUser(user.id);
    this.#audit?.record({ action: 'user.password-reset', entityType: 'user', entityId: user.username, summary: 'Password reset by an administrator' });
  }

  /**
   * A signed-in user changes their own password (the current one is required).
   * Their other sessions end; the current one stays signed in.
   *
   * @param {User} user
   * @param {string} currentPassword
   * @param {string} newPassword
   * @param {string | undefined} keepToken
   */
  async changeOwnPassword(user, currentPassword, newPassword, keepToken) {
    if (!(await user.verifyPassword(String(currentPassword ?? ''), this.#hasher))) {
      throw new ValidationError('Your current password is not correct.', { field: 'currentPassword' });
    }
    AuthService.#checkPassword(newPassword, undefined, 'newPassword');
    if (currentPassword === newPassword) {
      throw new ValidationError('Choose a password different from the current one.', { field: 'newPassword' });
    }
    user.setPasswordHash(await this.#hasher.hash(newPassword));
    this.#users.update(user);
    this.#sessions.destroyForUser(user.id, keepToken);
    this.#audit?.record({ action: 'user.password-changed', entityType: 'user', entityId: user.username, summary: 'Changed own password' });
  }

  // ---------------------------------------------------------------- helpers

  /** @param {{ username: string, displayName: string, role: UserRole, staffId?: string, password: string }} input */
  async #store({ username, displayName, role, staffId, password }) {
    const user = new User({
      id: this.#users.nextId(), username, displayName, role, staffId, passwordHash: await this.#hasher.hash(password),
    });
    this.#users.add(user);
    return user;
  }

  /** @param {string} name */
  #findByUsername(name) {
    return this.#users.findWhere((u) => u.username === name)[0];
  }

  /**
   * @param {string} password
   * @param {string} [setting]  name of the server setting, for the message
   * @param {string} [field]
   */
  static #checkPassword(password, setting, field = 'password') {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`${setting ?? 'The password'} must be at least ${MIN_PASSWORD_LENGTH} characters long.`, { field });
    }
    if (password.length > 200) {
      throw new ValidationError('The password is too long (at most 200 characters).', { field });
    }
  }

  /** Spends the same time as a real check, so unknown usernames are not revealed by timing. */
  async #fakeVerify() {
    await this.#hasher.verify('x', 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==');
    return false;
  }
}
