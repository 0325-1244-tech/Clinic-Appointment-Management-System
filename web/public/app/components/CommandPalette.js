// @ts-check
import { h, icon } from '../core/dom.js';

/**
 * @typedef {object} Command
 * @property {string} group
 * @property {string} label
 * @property {string} [sub]
 * @property {import('../core/dom.js').IconName} icon
 * @property {() => void} run
 */

/**
 * Global search and command palette (Ctrl+K). Searches pages, actions,
 * patients, staff and appointments. Uses the ARIA combobox + listbox pattern:
 * Up/Down to move, Enter to run, Escape to close.
 */
export class CommandPalette {
  #app;
  #dialog = h('dialog', { class: 'palette', 'aria-label': 'Search and commands' });
  #input = h('input', {
    type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-autocomplete': 'list',
    placeholder: 'Search patients, staff, appointments, or type a command…', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false',
  });
  #list = h('ul', { class: 'palette-results', id: 'palette-list', role: 'listbox', 'aria-label': 'Results' });
  #status = h('div', { class: 'sr-only', role: 'status' });
  /** @type {Command[]} */
  #results = [];
  #active = 0;
  /** @type {{ patients: import('/domain/Patient.js').Patient[], staff: import('/domain/MedicalStaff.js').MedicalStaff[], appointments: import('/domain/Appointment.js').Appointment[] } | null} */
  #data = null;

  /** @param {import('../App.js').App} app */
  constructor(app) {
    this.#app = app;
    this.#dialog.append(h('div', { class: 'palette-input' }, icon('search'), this.#input, h('span', { class: 'kbd' }, 'Esc')), this.#list, this.#status);
    this.#input.addEventListener('input', () => this.#search());
    this.#input.addEventListener('keydown', (e) => this.#keys(e));
    this.#dialog.addEventListener('click', (e) => {
      if (e.target === this.#dialog) this.#dialog.close();
    });
    this.#dialog.addEventListener('close', () => this.#dialog.remove());
  }

  async open() {
    if (this.#dialog.open) return;
    document.body.append(this.#dialog);
    this.#input.value = '';
    this.#dialog.showModal();
    this.#input.focus();
    this.#search();
    try {
      const [patients, staff, appointments] = await Promise.all([
        this.#app.can('patients:read') ? this.#app.api.patients() : [],
        this.#app.can('staff:read') ? this.#app.api.staff() : [],
        this.#app.can('appointments:read') ? this.#app.api.appointments({ period: 'upcoming' }) : [],
      ]);
      this.#data = { patients, staff, appointments };
      this.#search();
    } catch {
      this.#data = null;
    }
  }

  /** @returns {Command[]} */
  #commands() {
    const app = this.#app;
    const go = (/** @type {string} */ path) => () => app.router.go(path);
    /** @type {Command[]} */
    const list = [
      { group: 'Pages', label: 'Dashboard', icon: 'dashboard', run: go('/dashboard') },
      { group: 'Pages', label: 'Appointments', icon: 'appointments', run: go('/appointments') },
      { group: 'Pages', label: "Today's appointments", icon: 'clock', run: go('/appointments?period=today') },
      { group: 'Pages', label: 'Calendar', icon: 'calendar', run: go('/calendar') },
      { group: 'Pages', label: 'Queue', icon: 'queue', run: go('/queue') },
      { group: 'Pages', label: 'Patients', icon: 'patients', run: go('/patients') },
      { group: 'Pages', label: 'Medical staff', icon: 'staff', run: go('/staff') },
      { group: 'Pages', label: 'Appointment records', icon: 'records', run: go('/records') },
    ];
    if (app.can('audit:read')) list.push({ group: 'Pages', label: 'Audit log', icon: 'audit', run: go('/audit') });
    if (app.can('users:manage')) list.push({ group: 'Pages', label: 'Accounts', icon: 'key', run: go('/accounts') });
    if (app.can('appointments:book')) list.push({ group: 'Actions', label: 'Book appointment', sub: 'N', icon: 'plus', run: () => app.actions.book().then((c) => c && app.refreshPage()) });
    list.push({ group: 'Actions', label: 'Toggle dark mode', icon: 'moon', run: () => app.theme.toggle() });
    list.push({ group: 'Actions', label: 'Sign out', icon: 'logout', run: () => app.signOut() });
    return list;
  }

  #search() {
    const k = this.#input.value.trim().toLowerCase();
    const commands = this.#commands().filter((c) => !k || c.label.toLowerCase().includes(k));
    /** @type {Command[]} */
    const found = [];
    if (k && this.#data) {
      for (const p of this.#data.patients.filter((x) => x.matches(k)).slice(0, 6)) {
        found.push({ group: 'Patients', label: p.fullName, sub: p.id, icon: 'user', run: () => this.#app.router.go(`/patients/${encodeURIComponent(p.id)}`) });
      }
      for (const s of this.#data.staff.filter((x) => x.matches(k)).slice(0, 4)) {
        found.push({ group: 'Staff', label: s.getDisplayName(), sub: `${s.getRole()} · ${s.serviceArea}`, icon: 'staff', run: () => this.#app.router.go('/staff') });
      }
      for (const a of this.#data.appointments.filter((x) => x.matches(k)).slice(0, 5)) {
        found.push({
          group: 'Upcoming appointments', label: `${a.patient.fullName} with ${a.staff.getDisplayName()}`,
          sub: `${a.date.formatMedium()} ${a.time.format12h()}`, icon: 'appointments',
          run: () => this.#app.actions.details(a).then((c) => c && this.#app.refreshPage()),
        });
      }
    }
    this.#results = [...found, ...commands];
    this.#active = 0;
    this.#paint();
  }

  #paint() {
    this.#status.textContent = this.#results.length === 0 ? 'No matches.' : `${this.#results.length} results.`;
    if (this.#results.length === 0) {
      this.#list.replaceChildren();
      this.#list.after(this.#status);
      this.#status.className = 'palette-empty';
      this.#status.textContent = 'No matches. Try a name, ID or page.';
      this.#input.removeAttribute('aria-activedescendant');
      return;
    }
    this.#status.className = 'sr-only';
    /** @type {Node[]} */
    const items = [];
    let group = '';
    this.#results.forEach((c, i) => {
      if (c.group !== group) {
        group = c.group;
        items.push(h('li', { class: 'palette-group', role: 'presentation' }, group));
      }
      items.push(h('li', {
        id: `palette-opt-${i}`, class: 'palette-item', role: 'option', 'aria-selected': String(i === this.#active),
        onclick: () => this.#run(i), onmousemove: () => {
          if (this.#active !== i) {
            this.#active = i;
            this.#paint();
          }
        },
      }, icon(c.icon), h('span', null, c.label), c.sub ? h('span', { class: 'sub' }, c.sub) : null));
    });
    this.#list.replaceChildren(...items);
    this.#input.setAttribute('aria-activedescendant', `palette-opt-${this.#active}`);
    this.#list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  /** @param {KeyboardEvent} e */
  #keys(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.#results.length;
      if (n === 0) return;
      this.#active = (this.#active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      this.#paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.#run(this.#active);
    }
  }

  /** @param {number} i */
  #run(i) {
    const command = this.#results[i];
    if (!command) return;
    this.#dialog.close();
    command.run();
  }
}
