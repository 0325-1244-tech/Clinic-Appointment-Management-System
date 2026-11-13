// @ts-check
import { h, icon } from '../core/dom.js';
import { BasePage } from './BasePage.js';

/** Sign-in screen. In demo mode it lists the demo accounts; clicking one fills the form. */
export class LoginPage extends BasePage {
  #username = h('input', { class: 'input', id: 'login-username', name: 'username', autocomplete: 'username', required: true, maxlength: '60' });
  #password = h('input', { class: 'input', id: 'login-password', name: 'password', type: 'password', autocomplete: 'current-password', required: true, maxlength: '200' });
  #error = h('div', { class: 'form-alert', role: 'alert', hidden: true });
  #submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Sign in');

  get title() {
    return 'Sign in';
  }

  render() {
    const demo = this.app.config.demoMode ? this.app.config.demoAccounts : [];
    return h('div', { class: 'login' },
      h('section', { class: 'login-aside' },
        h('div', { class: 'brand' },
          h('span', { class: 'brand-mark' }, icon('logo')),
          h('span', null, h('span', { class: 'brand-name' }, 'CareConnect'), h('span', { class: 'brand-sub' }, 'Clinic Appointment Management'))),
        h('div', { class: 'tagline' },
          h('h1', null, 'Every patient, every slot, one calm view.'),
          h('p', null, 'Register patients, book open slots without double booking, record findings and keep appointment history in one place.')),
        h('p', { class: 'small' }, 'LSPU · Object-Oriented Programming · Final Project')),
      h('main', { class: 'login-main', id: 'main' },
        h('form', { class: 'login-card', novalidate: true, onsubmit: (/** @type {SubmitEvent} */ e) => this.#login(e) },
          h('div', null, h('h2', { tabindex: '-1' }, 'Sign in to CareConnect'), h('p', { class: 'muted small' }, 'Use your clinic account.')),
          this.#error,
          h('div', { class: 'field' }, h('label', { for: 'login-username' }, 'Username'), this.#username),
          h('div', { class: 'field' }, h('label', { for: 'login-password' }, 'Password'), this.#password),
          this.#submit,
          demo.length > 0 ? h('div', { class: 'demo-accounts' },
            h('p', { class: 'small muted' }, 'Demo accounts (sample data only):'),
            demo.map((/** @type {any} */ a) => h('button', {
              class: 'demo-account', type: 'button', onclick: () => {
                this.#username.value = a.username;
                this.#password.value = a.password;
                this.#submit.focus();
              },
            }, h('span', null, h('strong', null, a.role), h('span', { class: 'muted small' }, ` · ${a.displayName}`)),
            h('code', null, `${a.username} / ${a.password}`)))) : null)));
  }

  afterRender() {
    this.#username.focus();
  }

  async refresh() {}

  /** @param {SubmitEvent} e */
  async #login(e) {
    e.preventDefault();
    this.#error.hidden = true;
    if (!this.#username.value.trim() || !this.#password.value) {
      this.#showError('Enter your username and password.');
      return;
    }
    this.#submit.disabled = true;
    this.#submit.textContent = 'Signing in…';
    try {
      const user = await this.app.api.login(this.#username.value, this.#password.value);
      this.app.signedIn(user);
    } catch (err) {
      this.#showError(/** @type {Error} */ (err).message);
      this.#password.value = '';
      this.#password.focus();
    } finally {
      this.#submit.disabled = false;
      this.#submit.textContent = 'Sign in';
    }
  }

  /** @param {string} message */
  #showError(message) {
    this.#error.replaceChildren(icon('alert'), h('span', null, message));
    this.#error.hidden = false;
  }
}
