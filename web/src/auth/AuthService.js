// @ts-check
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
 * @property {string} demoPassword   used when DEMO_MODE is on
 * @property {string} passwordEnv    environment variable used when DEMO_MODE is off
 */

/** The three accounts the clinic starts with. Only made-up sample data is ever behind them. */
export const DEFAULT_ACCOUNTS = Object.freeze(/** @type {AccountSeed[]} */ ([
  { username: 'admin', displayName: 'Clinic Administrator', role: UserRole.ADMIN, demoPassword: 'admin123', passwordEnv: 'ADMIN_PASSWORD' },
  { username: 'reception', displayName: 'Front Desk', role: UserRole.RECEPTIONIST, demoPassword: 'reception123', passwordEnv: 'RECEPTION_PASSWORD' },
  { username: 'drsantos', displayName: 'Dr. Maria Santos', role: UserRole.DOCTOR, staffId: 'S-0001', demoPassword: 'doctor123', passwordEnv: 'DOCTOR_PASSWORD' },
]));

/**
 * Signs users in and out. Passwords are checked with scrypt, sessions live on
 * the server, and repeated failures are rate-limited per address and per
 * username so passwords cannot be guessed quickly.
 */
export class AuthService {
  #users;
  #hasher;
  #sessions;
  #limiter;
  #audit;

  /**
   * @param {object} [options]
   * @param {import('../repositories/Repository.js').Repository<User>} [options.users]
   * @param {PasswordHasher} [options.hasher]
   * @param {SessionStore} [options.sessions]
   * @param {RateLimiter} [options.limiter]
   * @param {{ record(event: { action: string, entityType: string, entityId: string, summary: string }): unknown }} [options.audit]
   */
  constructor({ users, hasher, sessions, limiter, audit } = {}) {
    this.#users = users ?? new InMemoryRepository('U');
    this.#hasher = hasher ?? new PasswordHasher();
    this.#sessions = sessions ?? new SessionStore();
    this.#limiter = limiter ?? new RateLimiter({ max: 5, windowMinutes: 15 });
    this.#audit = audit;
  }

  /**
   * Creates the default accounts. In demo mode they use the published demo
   * passwords; otherwise each password comes from its environment variable,
   * and an account without one is not created.
   *
   * @param {{ demoMode: boolean, env?: Record<string, string | undefined> }} options
   * @returns {Promise<string[]>} usernames created
   */
  async seedAccounts({ demoMode, env = {} }) {
    const created = [];
    for (const seed of DEFAULT_ACCOUNTS) {
      const password = demoMode ? seed.demoPassword : env[seed.passwordEnv];
      if (!password) {
        continue;
      }
      if (!demoMode && password.length < 10) {
        throw new Error(`${seed.passwordEnv} must be at least 10 characters long.`);
      }
      await this.addUser({ ...seed, password });
      created.push(seed.username);
    }
    return created;
  }

  /**
   * @param {{ username: string, displayName: string, role: UserRole, staffId?: string, password: string }} input
   */
  async addUser({ username, displayName, role, staffId, password }) {
    const user = new User({
      id: this.#users.nextId(), username, displayName, role, staffId, passwordHash: await this.#hasher.hash(password),
    });
    this.#users.add(user);
    return user;
  }

  /**
   * @param {string} username
   * @param {string} password
   * @param {string} address  client IP, for rate limiting
   * @returns {Promise<{ user: User, token: string }>}
   */
  async login(username, password, address) {
    const name = String(username ?? '').trim().toLowerCase();
    const keys = [`ip:${address}`, `user:${name}`];
    const wait = Math.max(...keys.map((k) => this.#limiter.retryAfter(k)));
    if (wait > 0) {
      throw new RateLimitError(`Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, wait);
    }
    const user = this.#users.findWhere((u) => u.username === name)[0];
    const ok = user ? await user.verifyPassword(String(password ?? ''), this.#hasher) : await this.#fakeVerify();
    if (!user || !ok) {
      keys.forEach((k) => this.#limiter.hit(k));
      this.#audit?.record({ action: 'auth.failed', entityType: 'user', entityId: name.slice(0, 40) || '-', summary: 'Failed sign-in' });
      throw new AuthenticationError('Incorrect username or password.');
    }
    keys.forEach((k) => this.#limiter.reset(k));
    return { user, token: this.#sessions.create(user.id) };
  }

  /** @param {string | undefined} token */
  logout(token) {
    this.#sessions.destroy(token);
  }

  /**
   * The signed-in user for a session token, or undefined.
   *
   * @param {string | undefined} token
   */
  userForToken(token) {
    const session = this.#sessions.touch(token);
    return session ? this.#users.findById(session.userId) : undefined;
  }

  /** @param {User} user */
  policyFor(user) {
    return AccessPolicy.for(user);
  }

  /** Spends the same time as a real check, so unknown usernames are not revealed by timing. */
  async #fakeVerify() {
    await this.#hasher.verify('x', 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==');
    return false;
  }
}
