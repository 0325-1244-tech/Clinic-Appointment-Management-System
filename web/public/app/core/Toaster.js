// @ts-check
import { h, icon, prefersReducedMotion } from './dom.js';

/**
 * Toast notifications. Messages are announced to screen readers through a
 * polite live region (errors use an assertive one), and a toast can carry an
 * action button such as "Undo".
 */
export class Toaster {
  #region;
  #politeAnnouncer;
  #assertiveAnnouncer;

  constructor() {
    this.#region = h('div', { class: 'toasts no-print' });
    this.#politeAnnouncer = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    this.#assertiveAnnouncer = h('div', { class: 'sr-only', role: 'alert', 'aria-live': 'assertive' });
    document.body.append(this.#region, this.#politeAnnouncer, this.#assertiveAnnouncer);
  }

  /** @param {string} title @param {string} [detail] */
  success(title, detail) {
    return this.show({ title, detail });
  }

  /** @param {string} title @param {string} [detail] */
  error(title, detail) {
    return this.show({ title, detail, kind: 'error', duration: 7000 });
  }

  /**
   * @param {object} options
   * @param {string} options.title
   * @param {string} [options.detail]
   * @param {'success' | 'error'} [options.kind]
   * @param {number} [options.duration] ms
   * @param {{ label: string, onAction: () => void }} [options.action]
   * @returns {{ dismiss: () => void, done: Promise<'timeout' | 'action' | 'dismissed'> }}
   */
  show({ title, detail, kind = 'success', duration = 4000, action }) {
    /** @type {(reason: 'timeout' | 'action' | 'dismissed') => void} */
    let resolve = () => {};
    const done = /** @type {Promise<'timeout' | 'action' | 'dismissed'>} */ (new Promise((r) => {
      resolve = r;
    }));
    let finished = false;
    const finish = (/** @type {'timeout' | 'action' | 'dismissed'} */ reason) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), prefersReducedMotion() ? 0 : 140);
      resolve(reason);
    };
    const toast = h('div', { class: ['toast', kind] },
      h('span', { class: 'toast-icon' }, icon(kind === 'error' ? 'alert' : 'check')),
      h('div', { class: 'toast-text' },
        h('strong', null, title),
        detail ? h('span', { class: 'muted small' }, detail) : null,
        action ? h('div', { class: 'toast-progress', style: { 'animation-duration': `${duration}ms` } }) : null),
      action ? h('button', {
        class: 'btn btn-secondary btn-sm', type: 'button',
        onclick: () => {
          action.onAction();
          finish('action');
        },
      }, icon('undo'), action.label) : null,
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Dismiss notification', onclick: () => finish('dismissed') }, icon('x')));
    this.#region.appendChild(toast);
    const announcer = kind === 'error' ? this.#assertiveAnnouncer : this.#politeAnnouncer;
    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = `${title}${detail ? `. ${detail}` : ''}${action ? `. Press ${action.label} to reverse.` : ''}`;
    }, 50);
    const timer = setTimeout(() => finish('timeout'), duration);
    return { dismiss: () => finish('dismissed'), done };
  }
}
