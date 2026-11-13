// @ts-check
import { PatientDialog } from '../components/dialogs/EntityDialogs.js';
import { h, icon, initialsOf, peso, replace } from '../core/dom.js';
import { BasePage } from './BasePage.js';

/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */

/**
 * One patient's profile: details, totals, upcoming appointments and the
 * visit timeline with findings. "Print summary" prints a visit summary.
 */
export class PatientProfilePage extends BasePage {
  #id;
  #head = h('section', { class: 'card card-body' });
  #stats = {
    visits: h('cc-stat-card', { label: 'Completed visits', icon: 'check' }),
    billed: h('cc-stat-card', { label: 'Total billed', icon: 'peso' }),
    upcoming: h('cc-stat-card', { label: 'Upcoming', icon: 'calendar' }),
    records: h('cc-stat-card', { label: 'Records', icon: 'records' }),
  };
  #upcoming = h('div');
  #history = h('div');
  /** @type {import('/domain/Patient.js').Patient | null} */
  #patient = null;

  /** @param {import('../App.js').App} app @param {string} id */
  constructor(app, id) {
    super(app);
    this.#id = id;
  }

  get title() {
    return 'Patient profile';
  }

  get navKey() {
    return '/patients';
  }

  actions() {
    return [
      h('a', { class: 'btn btn-ghost', href: '#/patients' }, icon('chevronLeft'), 'All patients'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => window.print() }, icon('print'), 'Print summary'),
      this.app.can('patients:write') ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.#edit() }, icon('edit'), 'Edit') : null,
      this.app.can('appointments:book') ? h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
        if (await this.app.actions.book({ patientId: this.#id })) await this.safeRefresh();
      } }, icon('plus'), 'Book') : null,
    ];
  }

  render() {
    const section = (/** @type {string} */ title, /** @type {Node} */ body) =>
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title)), body);
    return h('div', { class: 'stack' },
      this.#head,
      h('div', { class: 'grid grid-stats' }, Object.values(this.#stats)),
      h('div', { class: 'grid grid-2' },
        section('Visit timeline', this.#history),
        section('Upcoming appointments', this.#upcoming)));
  }

  async refresh() {
    const { patient, appointments, upcoming, totals } = await this.app.api.patientProfile(this.#id);
    this.#patient = patient;
    document.title = `${patient.fullName} · CareConnect`;
    replace(this.#head, h('div', { class: 'profile-head' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initialsOf(patient.fullName)),
      h('div', null, h('h2', null, patient.fullName), h('p', { class: 'muted' }, `${patient.id} · ${patient.getDetails()}`))),
    h('hr', { style: { border: '0', 'border-top': '1px solid var(--border)', margin: '16px 0' } }),
    h('dl', { class: 'facts' },
      [['Age', `${patient.age} years`], ['Birth date', patient.birthDate.formatMedium()], ['Gender', patient.gender],
        ['Blood type', patient.bloodType], ['Contact', patient.contactNumber], ['Email', patient.email || '—'], ['Address', patient.address]]
        .map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))));
    this.#stats.visits.setAttribute('value', String(totals.visits));
    this.#stats.billed.setAttribute('value', peso(totals.billed));
    this.#stats.upcoming.setAttribute('value', String(upcoming.length));
    this.#stats.upcoming.setAttribute('note', totals.upcomingEstimate ? `≈ ${peso(totals.upcomingEstimate)} estimated` : '');
    this.#stats.records.setAttribute('value', String(totals.records));

    replace(this.#upcoming, upcoming.length === 0
      ? h('div', { class: 'empty-state' }, h('strong', null, 'Nothing booked'), h('span', null, 'Book the next visit with the Book button.'))
      : h('ul', { class: 'today-list' }, upcoming.map((a) => h('li', { class: 'today-item' },
        h('div', { class: 'today-time' }, a.date.formatMedium(), h('span', null, a.time.format12h())),
        h('div', null, h('strong', null, a.staff.getDisplayName()), h('div', { class: 'muted small' }, `${a.type.label} · ${a.reason}`)),
        h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: async () => {
          if (await this.app.actions.details(a)) await this.safeRefresh();
        } }, 'Open')))));

    const past = [...appointments].filter((a) => !a.isActive() || !upcoming.some((u) => u.id === a.id)).reverse();
    replace(this.#history, past.length === 0
      ? h('div', { class: 'empty-state' }, h('strong', null, 'No visits yet'))
      : h('ol', { class: 'timeline-v' }, past.map((a) => h('li', { class: a.status.code },
        h('div', { class: 'when' }, `${a.date.formatLong()} · ${a.time.format12h()}`),
        h('div', null, h('strong', null, `${a.type.label} with ${a.staff.getDisplayName()}`), ' ',
          h('span', { class: `pill pill-${a.status.code}` }, a.status.label)),
        h('div', { class: 'muted small' }, `Reason: ${a.reason} · Fee ${peso(a.computeFee())}`),
        a.remarks ? h('div', { class: 'findings' }, a.remarks) : null))));
  }

  async #edit() {
    if (!this.#patient) return;
    const updated = await new PatientDialog(this.app, this.#patient).open();
    if (updated) {
      this.app.toaster.success(`Saved ${updated.fullName}`);
      await this.safeRefresh();
    }
  }
}
