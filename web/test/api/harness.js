// @ts-check
import { createApp, createContext } from '../../src/api/app.js';
import { FixedClock } from '../../src/domain/index.js';

/**
 * Starts the real Express app on a random port with in-memory storage, the
 * sample data and a frozen clock (Wednesday 2026-11-11, 08:00).
 */
export async function startServer({ date = '2026-11-11', time = '08:00', demoMode = true, storage = 'memory', sqlClient, admin, sampleData = false } = /** @type {any} */ ({})) {
  const clock = new FixedClock(date, time);
  const context = await createContext({
    storage, sqlClient, admin, sampleData, dataDir: '', demoMode, secureCookies: false, trustProxy: false, timeZone: 'Asia/Manila', clock,
  });
  /** @type {unknown[]} */
  const errors = [];
  const app = createApp(context, { log: (_m, e) => errors.push(e) });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    clock,
    context,
    errors,
    client: () => new TestClient(baseUrl),
    /** @param {string} username @param {string} password */
    async login(username, password) {
      const c = new TestClient(baseUrl);
      const res = await c.post('/api/auth/login', { username, password });
      if (res.status !== 200) {
        throw new Error(`login failed: ${res.status}`);
      }
      return c;
    },
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

/** A tiny HTTP client that keeps the session cookie like a browser would. */
export class TestClient {
  #baseUrl;
  #cookie = '';

  /** @param {string} baseUrl */
  constructor(baseUrl) {
    this.#baseUrl = baseUrl;
  }

  /** @param {string} method @param {string} path @param {unknown} [body] @param {Record<string, string>} [headers] */
  async request(method, path, body, headers = {}) {
    const res = await fetch(this.#baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.#cookie ? { Cookie: this.#cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.#cookie = setCookie.split(';')[0];
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, headers: res.headers, data: /** @type {any} */ (data), setCookie };
  }

  /** @param {string} path */
  get(path) {
    return this.request('GET', path);
  }

  /** @param {string} path @param {unknown} [body] @param {Record<string, string>} [headers] */
  post(path, body, headers) {
    return this.request('POST', path, body, headers);
  }

  /** @param {string} path @param {unknown} body */
  put(path, body) {
    return this.request('PUT', path, body);
  }

  /** @param {string} path @param {unknown} body */
  patch(path, body) {
    return this.request('PATCH', path, body);
  }

  /** @param {string} path */
  delete(path) {
    return this.request('DELETE', path);
  }
}
