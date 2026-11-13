// @ts-check
import { abstractClass, abstractMethod } from '/domain/contracts.js';
import { h, icon } from '../../core/dom.js';
import { BaseDialog } from './BaseDialog.js';

/**
 * @typedef {object} FieldOptions
 * @property {string} name
 * @property {string} label
 * @property {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement} control
 * @property {boolean} [required]
 * @property {string} [hint]
 * @property {boolean} [wide]   spans both grid columns
 */

/**
 * ABSTRACTION + INHERITANCE: a dialog with a form (Java: FormDialog).
 * Subclasses build their fields and implement `onSave()`. This class handles
 * the shared work: submitting, disabling the buttons while saving, and showing
 * errors next to the right field (from the domain classes in the browser, or
 * from the server).
 *
 * @template R
 * @extends {BaseDialog<R>}
 */
export class FormDialog extends BaseDialog {
  /** @type {Map<string, { control: HTMLElement, error: HTMLElement }>} */
  #fields = new Map();
  #alert = h('div', { class: 'form-alert', role: 'alert', hidden: true });
  #saveButton = h('button', { class: 'btn btn-primary', type: 'submit' });

  constructor() {
    super();
    if (new.target === FormDialog) {
      throw abstractClass('FormDialog');
    }
  }

  /** Text of the save button. */
  get saveLabel() {
    return 'Save';
  }

  /**
   * Builds the form fields.
   *
   * @abstract
   * @returns {import('../../core/dom.js').Child}
   */
  buildFields() {
    throw abstractMethod(this, 'buildFields');
  }

  /**
   * Validates and saves. Throw an error with a `field` property to mark a field.
   *
   * @abstract
   * @returns {Promise<R>}
   */
  async onSave() {
    throw abstractMethod(this, 'onSave');
  }

  /** @override */
  buildBody() {
    return [this.#alert, this.buildFields()];
  }

  /** @override */
  buildFooter() {
    this.#saveButton.textContent = this.saveLabel;
    return [h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.close() }, 'Cancel'), this.#saveButton];
  }

  /** @override @param {...import('../../core/dom.js').Child} parts */
  wrap(...parts) {
    return h('form', { novalidate: true, onsubmit: (/** @type {SubmitEvent} */ e) => this.#submit(e) }, ...parts);
  }

  /** @override */
  afterOpen() {
    /** @type {HTMLElement | null} */ (this.element.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])'))?.focus();
  }

  /**
   * A labelled field with a hint and an error slot, wired for screen readers.
   *
   * @param {FieldOptions} options
   */
  field({ name, label, control, required = false, hint, wide = false }) {
    const id = `${this.id}-${name}`;
    const errorId = `${id}-error`;
    const hintId = hint ? `${id}-hint` : undefined;
    control.id = id;
    control.setAttribute('name', name);
    if (required) {
      control.setAttribute('aria-required', 'true');
    }
    control.setAttribute('aria-describedby', [hintId, errorId].filter(Boolean).join(' '));
    const error = h('div', { class: 'error', id: errorId, hidden: true });
    this.#fields.set(name, { control, error });
    const isGroup = control.getAttribute('role') === 'group' || control.getAttribute('role') === 'radiogroup';
    if (isGroup) {
      control.setAttribute('aria-labelledby', `${id}-label`);
    }
    return h('div', { class: ['field', wide ? 'span-2' : ''] },
      isGroup
        ? h('span', { class: 'label', id: `${id}-label` }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null)
        : h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
      control,
      hint ? h('div', { class: 'hint', id: hintId }, hint) : null,
      error);
  }

  /** @param {string} name */
  value(name) {
    const control = this.#fields.get(name)?.control;
    return control && 'value' in control ? String(/** @type {HTMLInputElement} */ (control).value) : '';
  }

  /** @param {unknown} err */
  showError(err) {
    const error = /** @type {{ message?: string, field?: string }} */ (err);
    const message = error?.message ?? 'Something went wrong.';
    const target = error?.field ? this.#fields.get(error.field) : undefined;
    if (target) {
      target.error.replaceChildren(icon('alert'), message);
      target.error.hidden = false;
      target.control.setAttribute('aria-invalid', 'true');
      target.control.focus();
    } else {
      this.#alert.replaceChildren(icon('alert'), h('span', null, message));
      this.#alert.hidden = false;
      this.#alert.setAttribute('tabindex', '-1');
      this.#alert.focus();
    }
  }

  #clearErrors() {
    this.#alert.hidden = true;
    for (const { control, error } of this.#fields.values()) {
      error.hidden = true;
      control.removeAttribute('aria-invalid');
    }
  }

  /** @param {SubmitEvent} e */
  async #submit(e) {
    e.preventDefault();
    this.#clearErrors();
    this.#saveButton.disabled = true;
    const label = this.#saveButton.textContent;
    this.#saveButton.textContent = 'Saving…';
    try {
      const result = await this.onSave();
      this.close(result);
    } catch (err) {
      this.showError(err);
    } finally {
      this.#saveButton.disabled = false;
      this.#saveButton.textContent = label;
    }
  }
}

/**
 * Asks for one piece of text, e.g. the findings when completing a visit or
 * the reason for cancelling.
 *
 * @extends {FormDialog<string>}
 */
export class TextPromptDialog extends FormDialog {
  #options;

  /**
   * @param {{ title: string, description?: string, label: string, saveLabel: string, placeholder?: string,
   *   validate?: (text: string) => void }} options  validate() throws with a message when the text is not acceptable
   */
  constructor(options) {
    super();
    this.#options = options;
  }

  get title() {
    return this.#options.title;
  }

  get description() {
    return this.#options.description ?? '';
  }

  get saveLabel() {
    return this.#options.saveLabel;
  }

  buildFields() {
    return this.field({
      name: 'text', label: this.#options.label, required: true,
      control: h('textarea', { class: 'textarea', rows: '4', maxlength: '4000', placeholder: this.#options.placeholder ?? '' }),
    });
  }

  async onSave() {
    const text = this.value('text');
    try {
      this.#options.validate?.(text);
    } catch (err) {
      throw Object.assign(new Error(/** @type {Error} */ (err).message), { field: 'text' });
    }
    return text.trim();
  }
}
