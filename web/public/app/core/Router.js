// @ts-check

/**
 * @typedef {object} Route
 * @property {string} pattern   e.g. "/patients/:id"
 * @property {(params: Record<string, string>) => import('../pages/BasePage.js').BasePage} create
 */

/**
 * A small hash router (#/patients, #/patients/P-0001). Hash routes need no
 * server configuration, so the same static files work locally and on Render.
 */
export class Router extends EventTarget {
  /** @type {{ regex: RegExp, keys: string[], route: Route }[]} */
  #routes = [];
  #fallback;

  /** @param {string} fallback path used for unknown routes */
  constructor(fallback = '/dashboard') {
    super();
    this.#fallback = fallback;
    window.addEventListener('hashchange', () => this.dispatchEvent(new Event('change')));
  }

  /** @param {Route} route */
  add(route) {
    const keys = [];
    const regex = new RegExp(`^${route.pattern.replace(/:([a-zA-Z]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    })}$`);
    this.#routes.push({ regex, keys, route });
    return this;
  }

  /** The current path without the leading "#". */
  get path() {
    const raw = window.location.hash.replace(/^#/, '');
    return raw.split('?')[0] || this.#fallback;
  }

  /** Query parameters after "?" in the hash. */
  get params() {
    const raw = window.location.hash.replace(/^#/, '');
    return new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '');
  }

  /** @returns {{ route: Route, params: Record<string, string> }} */
  resolve() {
    const found = this.#match(this.path);
    if (found) {
      return found;
    }
    history.replaceState(null, '', `#${this.#fallback}`);
    return this.#match(this.#fallback) ?? { route: this.#routes[0].route, params: {} };
  }

  /** @param {string} path */
  #match(path) {
    for (const { regex, keys, route } of this.#routes) {
      const match = regex.exec(path);
      if (match) {
        /** @type {Record<string, string>} */
        const params = {};
        keys.forEach((k, i) => {
          params[k] = decodeURIComponent(match[i + 1]);
        });
        return { route, params };
      }
    }
    return undefined;
  }

  /** @param {string} path */
  go(path) {
    if (window.location.hash === `#${path}`) {
      this.dispatchEvent(new Event('change'));
    } else {
      window.location.hash = `#${path}`;
    }
  }
}
