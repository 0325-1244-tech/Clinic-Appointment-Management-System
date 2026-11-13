// @ts-check
import crypto from 'node:crypto';
import { promisify } from 'node:util';

/** @type {(password: crypto.BinaryLike, salt: crypto.BinaryLike, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>} */
const scrypt = promisify(crypto.scrypt);

/**
 * Hashes passwords with scrypt (Node's built-in node:crypto). Stored format:
 * `scrypt$N$r$p$<salt base64>$<hash base64>`, so the cost settings travel
 * with each hash and can be raised later.
 */
export class PasswordHasher {
  #cost;
  #blockSize;
  #parallelization;
  static #KEY_LENGTH = 64;

  /** @param {{ cost?: number, blockSize?: number, parallelization?: number }} [options] */
  constructor({ cost = 16384, blockSize = 8, parallelization = 1 } = {}) {
    this.#cost = cost;
    this.#blockSize = blockSize;
    this.#parallelization = parallelization;
  }

  /** @param {string} password */
  async hash(password) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(password, salt, PasswordHasher.#KEY_LENGTH, this.#options(this.#cost, this.#blockSize, this.#parallelization));
    return ['scrypt', this.#cost, this.#blockSize, this.#parallelization, salt.toString('base64'), key.toString('base64')].join('$');
  }

  /**
   * Constant-time comparison, so response time does not reveal how much of the password matched.
   *
   * @param {string} password
   * @param {string} stored
   */
  async verify(password, stored) {
    const [scheme, n, r, p, saltText, keyText] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltText || !keyText || typeof password !== 'string') {
      return false;
    }
    const expected = Buffer.from(keyText, 'base64');
    const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length,
      this.#options(Number(n), Number(r), Number(p)));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  /** @param {number} N @param {number} r @param {number} p */
  #options(N, r, p) {
    return { N, r, p, maxmem: 128 * N * r * 2 };
  }
}
