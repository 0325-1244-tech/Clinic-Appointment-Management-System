// @ts-check
import { abstractClass, abstractMethod } from '/domain/contracts.js';
import { h, icon } from '../../core/dom.js';

let counter = 0;

/**
 * ABSTRACTION: every pop-up window in the app. It uses the native <dialog>
 * element, which traps focus, closes on Escape and makes the page behind it
 * inert. When the dialog closes, focus goes back to whatever opened it.
 *
 * Subclasses provide the body (`buildBody`) and the buttons (`buildFooter`).
 *
 * @template R the value open() resolves with
 */
export class BaseDialog {
  /** @type {HTMLDialogElement} */
  #dialog;
  /** @type {(value: R | undefined) => void} */
  #resolve = () => {};
  /** @type {Element | null} */
  #opener = null;
  #id = `dlg-${++counter}`;

  constructor() {
    if (new.target === BaseDialog) {
      throw abstractClass('BaseDialog');
    }
    this.#dialog = h('dialog', { class: ['dialog', this.size === 'sm' ? 'dialog-sm' : ''], 'aria-labelledby': `${this.#id}-title` });
    this.#dialog.addEventListener('close', () => this.#finish());
    this.#dialog.addEventListener('cancel', () => this.#finish());
  }

  /** @abstract @returns {string} */
  get title() {
    throw abstractMethod(this, 'title');
  }

  /** Optional line under the title. @returns {string} */
  get description() {
    return '';
  }

  /** "sm" or "md". */
  get size() {
    return 'md';
  }

  get element() {
    return this.#dialog;
  }

  get id() {
    return this.#id;
  }

  /**
   * @abstract
   * @returns {import('../../core/dom.js').Child}
   */
  buildBody() {
    throw abstractMethod(this, 'buildBody');
  }

  /** @returns {import('../../core/dom.js').Child} */
  buildFooter() {
    return h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.close() }, 'Close');
  }

  /**
   * Content wrapper; FormDialog overrides this to use a <form>.
   *
   * @param {...import('../../core/dom.js').Child} parts
   * @returns {HTMLElement}
   */
  wrap(...parts) {
    return h('div', { class: 'dialog-frame' }, ...parts);
  }

  /** Shows the dialog. Resolves with the result, or undefined if it was closed. @returns {Promise<R | undefined>} */
  open() {
    this.#opener = document.activeElement;
    const head = h('div', { class: 'dialog-head' },
      h('div', null,
        h('h2', { id: `${this.#id}-title` }, this.title),
        this.description ? h('p', null, this.description) : null),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close dialog', onclick: () => this.close() }, icon('x')));
    this.#dialog.replaceChildren(this.wrap(head, h('div', { class: 'dialog-body' }, this.buildBody()), h('div', { class: 'dialog-foot' }, this.buildFooter())));
    document.body.appendChild(this.#dialog);
    this.#dialog.showModal();
    this.afterOpen();
    return new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  /** Called once the dialog is visible (e.g. to focus the first field). */
  afterOpen() {}

  /** @param {R} [value] */
  close(value) {
    const resolve = this.#resolve;
    this.#resolve = () => {};
    resolve(value);
    if (this.#dialog.open) {
      this.#dialog.close();
    }
  }

  #finish() {
    this.close(undefined);
    this.#dialog.remove();
    if (this.#opener instanceof HTMLElement && this.#opener.isConnected) {
      this.#opener.focus();
    } else {
      // The opener was re-rendered (e.g. a table row): go to the selected row, or the page heading.
      /** @type {HTMLElement | null} */ (document.querySelector('tr[aria-selected="true"], main h1'))?.focus();
    }
  }

  /** Prints only this dialog (appointment slip, visit summary). */
  print() {
    document.body.classList.add('printing-dialog');
    this.#dialog.classList.add('printing');
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing-dialog');
      this.#dialog.classList.remove('printing');
    }, { once: true });
    window.print();
  }
}

/**
 * "Are you sure?" with a clear consequence and a named action button.
 *
 * @extends {BaseDialog<boolean>}
 */
export class ConfirmDialog extends BaseDialog {
  #title;
  #message;
  #confirmLabel;
  #danger;

  /** @param {{ title: string, message: string, confirmLabel: string, danger?: boolean }} options */
  constructor({ title, message, confirmLabel, danger = false }) {
    super();
    this.#title = title;
    this.#message = message;
    this.#confirmLabel = confirmLabel;
    this.#danger = danger;
  }

  get title() {
    return this.#title;
  }

  get size() {
    return 'sm';
  }

  buildBody() {
    return h('p', null, this.#message);
  }

  buildFooter() {
    return [
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.close(false) }, 'Go back'),
      h('button', { class: ['btn', this.#danger ? 'btn-danger' : 'btn-primary'], type: 'button', 'data-confirm': '', onclick: () => this.close(true) }, this.#confirmLabel),
    ];
  }

  afterOpen() {
    /** @type {HTMLElement | null} */ (this.element.querySelector('[data-confirm]'))?.focus();
  }
}
