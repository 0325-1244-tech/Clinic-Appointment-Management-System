// @ts-check
import crypto from 'node:crypto';

/**
 * @typedef {object} Session
 * @property {string} userId
 * @property {number} createdAt  ms
 * @property {number} lastSeen   ms
 */

/**
 * Server-side sessions kept in memory. The browser only holds a random
 * 256-bit token in an httpOnly cookie, so scripts can never read it.
 * Sessions end after `idleMinutes` without activity or `maxHours` in total.
 * (They also end when the server restarts; users then sign in again.)
 */
export class SessionStore {
  /** @type {Map<string, Session>} */
  #sessions = new Map();
  #idleMs;
  #maxMs;
  #now;

  /** @param {{ idleMinutes?: number, maxHours?: number, now?: () => number }} [options] */
  constructor({ idleMinutes = 60, maxHours = 12, now = Date.now } = {}) {
    this.#idleMs = idleMinutes * 60_000;
    this.#maxMs = maxHours * 3_600_000;
    this.#now = now;
  }

  /** @param {string} userId @returns {string} the token */
  create(userId) {
    this.#prune();
    const token = crypto.randomBytes(32).toString('base64url');
    const now = this.#now();
    this.#sessions.set(token, { userId, createdAt: now, lastSeen: now });
    return token;
  }

  /**
   * Returns the session and marks it as used, or undefined if it is missing or expired.
   *
   * @param {string | undefined} token
   */
  touch(token) {
    if (!token) {
      return undefined;
    }
    const session = this.#sessions.get(token);
    if (!session) {
      return undefined;
    }
    const now = this.#now();
    if (now - session.lastSeen > this.#idleMs || now - session.createdAt > this.#maxMs) {
      this.#sessions.delete(token);
      return undefined;
    }
    session.lastSeen = now;
    return session;
  }

  /** @param {string | undefined} token */
  destroy(token) {
    if (token) {
      this.#sessions.delete(token);
    }
  }

  /**
   * Ends every session of one user (after a password reset or deactivation).
   *
   * @param {string} userId
   * @param {string} [keepToken] a session to keep, e.g. the one changing its own password
   */
  destroyForUser(userId, keepToken) {
    for (const [token, session] of this.#sessions) {
      if (session.userId === userId && token !== keepToken) {
        this.#sessions.delete(token);
      }
    }
  }

  get size() {
    return this.#sessions.size;
  }

  #prune() {
    const now = this.#now();
    for (const [token, s] of this.#sessions) {
      if (now - s.lastSeen > this.#idleMs || now - s.createdAt > this.#maxMs) {
        this.#sessions.delete(token);
      }
    }
  }
}

/**
 * Counts attempts per key in a fixed time window (used for login).
 */
export class RateLimiter {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  #hits = new Map();
  #max;
  #windowMs;
  #now;

  /** @param {{ max: number, windowMinutes: number, now?: () => number }} options */
  constructor({ max, windowMinutes, now = Date.now }) {
    this.#max = max;
    this.#windowMs = windowMinutes * 60_000;
    this.#now = now;
  }

  /**
   * Seconds until the key may try again, or 0 if it may try now.
   *
   * @param {string} key
   */
  retryAfter(key) {
    const entry = this.#hits.get(key);
    const now = this.#now();
    if (!entry || now >= entry.resetAt) {
      return 0;
    }
    return entry.count >= this.#max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  /** @param {string} key */
  hit(key) {
    const now = this.#now();
    if (this.#hits.size > 10_000) {
      for (const [k, entry] of this.#hits) {
        if (now >= entry.resetAt) this.#hits.delete(k);
      }
    }
    const entry = this.#hits.get(key);
    if (!entry || now >= entry.resetAt) {
      this.#hits.set(key, { count: 1, resetAt: now + this.#windowMs });
    } else {
      entry.count += 1;
    }
  }

  /** @param {string} key */
  reset(key) {
    this.#hits.delete(key);
  }
}
