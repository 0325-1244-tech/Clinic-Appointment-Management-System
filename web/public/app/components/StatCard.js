// @ts-check
import { h, icon, replace } from '../core/dom.js';

/**
 * <cc-stat-card label="Patients" icon="patients" value="8" note="registered">
 * A Web Component for one dashboard number. ENCAPSULATION: its markup is
 * built from its attributes; pages only set attributes.
 */
export class StatCard extends HTMLElement {
  static observedAttributes = ['label', 'value', 'note', 'icon'];

  connectedCallback() {
    this.classList.add('card');
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this.#render();
    }
  }

  #render() {
    const name = /** @type {import('../core/dom.js').IconName} */ (this.getAttribute('icon') ?? 'activity');
    const value = this.getAttribute('value');
    replace(this, h('div', { class: 'stat' },
      h('div', { class: 'stat-top' }, h('span', { class: 'stat-icon' }, icon(name)), this.getAttribute('label')),
      value === null ? h('span', { class: 'skeleton', style: { width: '60%', height: '26px' } }) : h('div', { class: 'stat-value' }, value),
      this.getAttribute('note') ? h('div', { class: 'stat-note' }, this.getAttribute('note')) : null));
  }
}
customElements.define('cc-stat-card', StatCard);
