// @ts-check
import { abstractClass, abstractMethod } from '/domain/contracts.js';
import { h } from '../core/dom.js';

/**
 * ABSTRACTION: every screen of the app (Java: BasePanel). A page builds its
 * layout once in `render()` and loads or reloads its data in `refresh()`.
 *
 * POLYMORPHISM: the App only ever holds a BasePage reference and calls
 * mount(), refresh() and unmount(); each subclass runs its own version.
 */
export class BasePage {
  #app;
  /** @type {AbortController} */
  #lifetime = new AbortController();
  #loadSeq = 0;

  /** @param {import('../App.js').App} app */
  constructor(app) {
    if (new.target === BasePage) {
      throw abstractClass('BasePage');
    }
    this.#app = app;
  }

  get app() {
    return this.#app;
  }

  /** Aborted when the page is left; pass it to listeners and timers. */
  get signal() {
    return this.#lifetime.signal;
  }

  /**
   * Title shown in the header and the browser tab.
   *
   * @abstract
   * @returns {string}
   */
  get title() {
    throw abstractMethod(this, 'title');
  }

  /** Short line under the title. @returns {string} */
  get subtitle() {
    return '';
  }

  /** Navigation key that is highlighted in the sidebar. @returns {string} */
  get navKey() {
    return '';
  }

  /**
   * Builds the page layout (no data yet).
   *
   * @abstract
   * @returns {Node}
   */
  render() {
    throw abstractMethod(this, 'render');
  }

  /**
   * Loads or reloads the data shown on the page.
   *
   * @abstract
   * @returns {Promise<void>}
   */
  async refresh() {
    throw abstractMethod(this, 'refresh');
  }

  /** Buttons on the right of the page header. @returns {import('../core/dom.js').Child} */
  actions() {
    return null;
  }

  /**
   * Renders the page into the container and loads its data.
   *
   * @param {HTMLElement} container
   */
  async mount(container) {
    const heading = h('h1', { tabindex: '-1' }, this.title);
    container.replaceChildren(
      h('div', { class: 'page-head' },
        h('div', null, heading, this.subtitle ? h('p', null, this.subtitle) : null),
        h('div', { class: 'page-actions' }, this.actions())),
      this.render());
    heading.focus({ preventScroll: true });
    await this.safeRefresh();
  }

  /**
   * Call before an await in refresh(); `isStale(ticket)` afterwards tells whether a newer
   * refresh started (or the page was left) meanwhile, so an old response never overwrites a new one.
   */
  beginLoad() {
    this.#loadSeq += 1;
    return this.#loadSeq;
  }

  /** @param {number} ticket */
  isStale(ticket) {
    return ticket !== this.#loadSeq || this.signal.aborted;
  }

  /** Called when refresh() fails; list pages clear their loading state. @param {unknown} _err */
  onLoadError(_err) {}

  /** refresh() with errors reported as a toast instead of breaking the page. */
  async safeRefresh() {
    try {
      await this.refresh();
    } catch (err) {
      this.onLoadError(err);
      if (/** @type {any} */ (err)?.status !== 401) {
        this.app.toaster.error('Could not load data', /** @type {Error} */ (err).message);
      }
    }
  }

  /** Called when the user leaves the page. */
  unmount() {
    this.#lifetime.abort();
  }
}
