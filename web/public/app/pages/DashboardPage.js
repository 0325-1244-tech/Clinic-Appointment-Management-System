// @ts-check
import { Clock } from '/domain/index.js';
import { BarListChart, DailyVolumeChart, StatusDonutChart } from '../components/charts.js';
import { h, icon, initialsOf, peso, replace } from '../core/dom.js';
import { BasePage } from './BasePage.js';

/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */
/** @typedef {import('/domain/MedicalStaff.js').MedicalStaff} MedicalStaff */

/**
 * The dashboard (Java: DashboardPanel) plus analytics: counts, today's
 * schedule, an on-duty timeline with a "now" line, and four charts.
 */
export class DashboardPage extends BasePage {
  #cards = {
    patients: h('cc-stat-card', { label: 'Patients', icon: 'patients' }),
    staff: h('cc-stat-card', { label: 'Active staff', icon: 'staff' }),
    today: h('cc-stat-card', { label: 'Today', icon: 'clock' }),
    upcoming: h('cc-stat-card', { label: 'Upcoming', icon: 'appointments' }),
    completed: h('cc-stat-card', { label: 'Completed visits', icon: 'check' }),
    fees: h('cc-stat-card', { label: 'Fees collected', icon: 'peso' }),
  };
  #today = h('div', { 'aria-busy': 'true' });
  #timeline = h('div', { class: 'timeline' });
  #duty = h('ul', { class: 'duty-list' });
  #charts = { volume: h('div'), status: h('div'), fees: h('div'), busiest: h('div') };
  /** @type {number | undefined} */
  #timer;

  get title() {
    const hour = Clock.current().now().time.hour;
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return `${greeting}, ${this.app.user?.displayName ?? ''}`;
  }

  get subtitle() {
    const scope = this.app.staffScope ? 'Your schedule and numbers' : 'Clinic overview';
    return `${scope} · ${this.app.today().formatLong()}`;
  }

  get navKey() {
    return '/dashboard';
  }

  actions() {
    return this.app.can('appointments:book')
      ? h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
        if (await this.app.actions.book()) await this.safeRefresh();
      } }, icon('plus'), 'Book appointment')
      : null;
  }

  render() {
    const card = (/** @type {string} */ title, /** @type {string} */ note, /** @type {Node} */ body, /** @type {import('../core/dom.js').Child} */ extra = null) =>
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h2', null, title), note ? h('p', null, note) : null), extra), body);
    return h('div', { class: 'stack' },
      h('div', { class: 'grid grid-stats' }, Object.values(this.#cards)),
      h('div', { class: 'grid grid-2' },
        card("Today's schedule", 'Select an appointment for details and actions.', this.#today,
          h('a', { class: 'btn btn-ghost btn-sm', href: '#/appointments?period=today' }, 'All of today', icon('arrowRight'))),
        card('Staff on duty', 'Working today and active.', this.#duty)),
      card('On duty today', 'Each bar is a shift; blocks are appointments. The red line is now.', this.#timeline),
      h('div', { class: 'grid grid-halves' },
        card('Appointments per day', 'Last 14 days', h('div', { class: 'card-body' }, this.#charts.volume)),
        card('Status breakdown', 'All appointments', h('div', { class: 'card-body' }, this.#charts.status))),
      h('div', { class: 'grid grid-halves' },
        card('Fees by staff type', 'Completed visits', h('div', { class: 'card-body' }, this.#charts.fees)),
        card('Busiest staff', 'Appointments, excluding cancellations', h('div', { class: 'card-body' }, this.#charts.busiest))));
  }

  async refresh() {
    const ticket = this.beginLoad();
    const [d, a] = await Promise.all([this.app.api.dashboard(), this.app.api.analytics(14)]);
    if (this.isStale(ticket)) return;
    this.#cards.patients.setAttribute('value', String(d.patientCount));
    this.#cards.patients.setAttribute('note', this.app.staffScope ? 'seen by you' : 'registered');
    this.#cards.staff.setAttribute('value', String(d.activeStaffCount));
    this.#cards.staff.setAttribute('note', `${d.staffOnDuty.length} on duty today`);
    this.#cards.today.setAttribute('value', String(d.todaysAppointments.length));
    this.#cards.today.setAttribute('note', `${d.todaysAppointments.filter((/** @type {Appointment} */ x) => x.isActive()).length} still scheduled`);
    this.#cards.upcoming.setAttribute('value', String(d.upcomingCount));
    this.#cards.completed.setAttribute('value', String(d.completedCount));
    this.#cards.fees.setAttribute('value', peso(d.collectedFees));
    this.#cards.fees.setAttribute('note', 'from completed visits');
    this.#renderToday(d.todaysAppointments);
    this.#renderDuty(d.staffOnDuty, d.todaysAppointments);
    replace(this.#charts.volume, new DailyVolumeChart('Appointments per day', a.perDay).element());
    replace(this.#charts.status, new StatusDonutChart('Status breakdown', a.statusBreakdown).element());
    replace(this.#charts.fees, new BarListChart('Fees by staff type',
      a.feesByRole.map((/** @type {any} */ f) => ({ label: `${f.role}s`, value: f.amount, role: f.role, note: `${f.visits} visit(s)` })), { money: true }).element());
    replace(this.#charts.busiest, new BarListChart('Busiest staff',
      a.busiestStaff.map((/** @type {any} */ b) => ({ label: b.name, value: b.count, role: b.role, note: b.role }))).element());
    // Redraw the timeline every minute so the "now" line moves; one timer per page.
    clearInterval(this.#timer);
    this.#timer = window.setInterval(() => this.#renderDuty(d.staffOnDuty, d.todaysAppointments), 60_000);
  }

  /** @override */
  unmount() {
    clearInterval(this.#timer);
    super.unmount();
  }

  /** @param {Appointment[]} list */
  #renderToday(list) {
    this.#today.removeAttribute('aria-busy');
    if (list.length === 0) {
      replace(this.#today, h('div', { class: 'empty-state' },
        h('div', { class: 'empty-icon' }, icon('calendar')), h('strong', null, 'No appointments today'),
        h('span', null, 'Booked visits for today will show up here.')));
      return;
    }
    replace(this.#today, h('ul', { class: 'today-list' }, list.map((a) => h('li', { class: 'today-item' },
      h('div', { class: 'today-time' }, a.time.format12h(), h('span', null, `${a.staff.getSlotDurationMinutes()} min`)),
      h('div', null,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: { padding: '0', 'min-height': '0', 'font-weight': '650' },
          onclick: async () => {
            if (await this.app.actions.details(a)) await this.safeRefresh();
          } }, a.patient.fullName),
        h('div', { class: 'muted small' }, `${a.type.label} · ${a.staff.getDisplayName()} · ${a.reason}`)),
      h('span', { class: `pill pill-${a.status.code}` }, a.status.label)))));
  }

  /** @param {MedicalStaff[]} staff @param {Appointment[]} today */
  #renderDuty(staff, today) {
    replace(this.#duty, staff.length === 0
      ? h('li', { class: 'empty-state' }, h('strong', null, 'Nobody is on duty today'))
      : staff.map((s) => h('li', { class: 'duty-item' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, initialsOf(s.fullName)),
        h('div', { class: 'meta' }, h('strong', null, s.getDisplayName()), h('span', null, `${s.getRole()} · ${s.serviceArea}`)),
        h('span', { class: 'muted small num' }, s.getShiftText()))));

    // Timeline from the earliest shift start to the latest end.
    if (staff.length === 0) {
      replace(this.#timeline, h('p', { class: 'muted' }, 'No shifts today.'));
      return;
    }
    const start = Math.min(...staff.map((s) => s.shiftStart.totalMinutes));
    const end = Math.max(...staff.map((s) => s.shiftEnd.totalMinutes));
    const pct = (/** @type {number} */ m) => `${((m - start) / (end - start)) * 100}%`;
    const now = Clock.current().now().time.totalMinutes;
    const rows = staff.map((s) => h('div', { class: ['timeline-row', `role-${s.getRole()}`] },
      h('span', { class: 'timeline-name', title: s.getDisplayName() }, s.getDisplayName()),
      h('div', { class: 'timeline-track', role: 'img', 'aria-label': `${s.getDisplayName()}: shift ${s.getShiftText()}, ${today.filter((a) => a.staff.id === s.id).length} appointment(s)` },
        h('span', { class: 'timeline-shift', style: { left: pct(s.shiftStart.totalMinutes), width: `calc(${pct(s.shiftEnd.totalMinutes)} - ${pct(s.shiftStart.totalMinutes)})` } }),
        today.filter((a) => a.staff.id === s.id).map((a) => h('span', {
          class: ['timeline-appt', a.isActive() ? '' : 'closed'],
          title: `${a.time.format12h()} ${a.patient.fullName}`,
          style: { left: pct(a.time.totalMinutes), width: `calc(${pct(a.getEndTime().totalMinutes)} - ${pct(a.time.totalMinutes)})` },
        })),
        now >= start && now <= end ? h('span', { class: 'timeline-now', style: { left: pct(now) } }) : null)));
    const hours = [];
    for (let m = Math.ceil(start / 120) * 120; m <= end; m += 120) {
      hours.push(h('span', { style: { left: pct(m) } }, `${((Math.floor(m / 60) + 11) % 12) + 1}${m < 720 ? 'a' : 'p'}`));
    }
    replace(this.#timeline, rows, h('div', { class: 'timeline-scale' }, h('span'), h('div', { class: 'ticks' }, hours)));
  }
}
