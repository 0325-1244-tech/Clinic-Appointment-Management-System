// @ts-check
import { Clock } from '/domain/index.js';
import { h, icon, replace } from '../core/dom.js';
import { BasePage } from './BasePage.js';

/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */
/** @typedef {import('/domain/MedicalStaff.js').MedicalStaff} MedicalStaff */

const PX_PER_MINUTE = 1.6;

/**
 * Calendar: a week view for one staff member, or a day view for the whole
 * clinic. Open slots are worked out in the browser with the same domain
 * methods the server uses (getTimeSlots, overlapsWith, isAvailableOn).
 *
 * Drag an appointment onto an open slot to reschedule it; the server applies
 * the same rules as the Reschedule dialog. Dragging is optional: every
 * appointment can also be opened (click or Enter) and rescheduled from there,
 * so the calendar works with a keyboard alone (WCAG 2.5.7).
 */
export class CalendarPage extends BasePage {
  /** @type {'week' | 'day'} */
  #view = 'week';
  #date = Clock.current().today();
  /** @type {MedicalStaff[]} */
  #staff = [];
  #staffSelect = h('select', { class: 'select', 'aria-label': 'Staff member', onchange: () => this.safeRefresh() });
  #viewButtons = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Calendar view' });
  #rangeLabel = h('strong', { 'aria-live': 'polite' });
  #grid = h('div', { class: 'calendar', role: 'region', 'aria-label': 'Calendar' });
  /** @type {Appointment | null} */
  #dragging = null;

  get title() {
    return 'Calendar';
  }

  get subtitle() {
    return 'Click an open slot to book. Drag an appointment to an open slot to reschedule, or open it and choose Reschedule.';
  }

  get navKey() {
    return '/calendar';
  }

  render() {
    this.#paintViewButtons();
    return h('section', { class: 'card' },
      h('div', { class: 'toolbar' },
        this.#viewButtons,
        this.#staffSelect,
        h('div', { class: 'btn-group' },
          h('button', { class: 'btn btn-secondary btn-icon', type: 'button', 'aria-label': 'Previous', onclick: () => this.#shift(-1) }, icon('chevronLeft')),
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.#goToday() }, 'Today'),
          h('button', { class: 'btn btn-secondary btn-icon', type: 'button', 'aria-label': 'Next', onclick: () => this.#shift(1) }, icon('chevronRight'))),
        this.#rangeLabel),
      h('div', { class: 'table-wrap' }, this.#grid));
  }

  async refresh() {
    if (this.#staff.length === 0) {
      this.#staff = await this.app.api.staff({ active: true });
      const scope = this.app.staffScope;
      const choices = scope ? this.#staff.filter((s) => s.id === scope) : this.#staff;
      this.#staffSelect.replaceChildren(...choices.map((s) => h('option', { value: s.id }, `${s.getDisplayName()} · ${s.getRole()}`)));
      if (choices.length === 0) {
        replace(this.#grid, h('div', { class: 'empty-state' }, h('strong', null, 'No active staff')));
        return;
      }
    }
    this.#staffSelect.hidden = this.#view === 'day';
    const days = this.#view === 'week'
      ? Array.from({ length: 7 }, (_, i) => this.#date.startOfWeek().plusDays(i))
      : [this.#date];
    const from = days[0];
    const to = days[days.length - 1];
    this.#rangeLabel.textContent = this.#view === 'week'
      ? `${from.formatMedium()} – ${to.formatMedium()}`
      : from.formatLong();
    const staffId = this.#view === 'week' ? this.#staffSelect.value : undefined;
    const appointments = await this.app.api.appointments({ from: from.toString(), to: to.toString(), staffId });
    if (this.#view === 'week') {
      const staff = this.#staff.find((s) => s.id === staffId) ?? this.#staff[0];
      this.#drawColumns(days.map((d) => ({ date: d, staff, heading: [d.dayOfWeek.shortLabel, String(d.day)] })), appointments);
    } else {
      const onDuty = this.#staff.filter((s) => s.isAvailableOn(from) && (!this.app.staffScope || s.id === this.app.staffScope));
      if (onDuty.length === 0) {
        replace(this.#grid, h('div', { class: 'empty-state' }, h('strong', null, 'Nobody works on this day'), h('span', null, 'Try another date.')));
        return;
      }
      this.#drawColumns(onDuty.map((s) => ({ date: from, staff: s, heading: [s.getRole(), s.getDisplayName()] })), appointments);
    }
  }

  /**
   * @param {{ date: import('/domain/time/CalendarDate.js').CalendarDate, staff: MedicalStaff, heading: [string, string] }[]} columns
   * @param {Appointment[]} appointments
   */
  #drawColumns(columns, appointments) {
    const start = Math.min(...columns.map((c) => c.staff.shiftStart.totalMinutes));
    const end = Math.max(...columns.map((c) => c.staff.shiftEnd.totalMinutes));
    const height = (end - start) * PX_PER_MINUTE;
    const y = (/** @type {number} */ minutes) => `${(minutes - start) * PX_PER_MINUTE}px`;
    const clock = Clock.current();
    const today = clock.today();
    const canManage = this.app.can('appointments:manage');
    const canBook = this.app.can('appointments:book');

    const times = h('div', { class: 'cal-times', style: { position: 'relative', height: `${height}px` } });
    for (let m = Math.ceil(start / 60) * 60; m < end; m += 60) {
      times.append(h('div', { class: 'cal-time', style: { position: 'absolute', top: y(m), right: '0' } }, this.app.formatTime(`${String(m / 60).padStart(2, '0')}:00`)));
    }

    const heads = [h('div', { class: 'cal-head', 'aria-hidden': 'true' })];
    const cols = [times];
    for (const { date, staff, heading } of columns) {
      const works = staff.isAvailableOn(date);
      heads.push(h('div', { class: ['cal-head', date.equals(today) && this.#view === 'week' ? 'today' : '', works ? '' : 'off'] },
        h('span', null, heading[0]), h('strong', null, heading[1])));
      const col = h('div', { class: ['cal-col', works ? '' : 'off'], style: { height: `${height}px` }, role: 'group', 'aria-label': `${heading.join(' ')} ${date.formatMedium()}` });
      const mine = appointments.filter((a) => a.staff.id === staff.id && a.date.equals(date));
      if (works) {
        const minutes = staff.getSlotDurationMinutes();
        for (const slot of staff.getTimeSlots()) {
          const endSlot = slot.plusMinutes(minutes);
          const taken = mine.some((a) => a.isActive() && a.overlapsWith(date, slot, endSlot));
          const past = clock.isPast(date, slot);
          const open = !taken && !past;
          const label = `${slot.format12h()} ${open ? 'open' : past ? 'past' : 'booked'}, ${staff.getDisplayName()}, ${date.formatMedium()}`;
          const button = h('button', {
            type: 'button', class: ['cal-slot', open ? 'open' : 'unavailable'], 'aria-label': label,
            disabled: !open || !canBook, style: { position: 'absolute', left: '0', right: '0', top: y(slot.totalMinutes), height: `${minutes * PX_PER_MINUTE}px` },
            onclick: async () => {
              if (await this.app.actions.book({ staffId: staff.id, date: date.toString(), time: slot.toString() })) await this.safeRefresh();
            },
          }, open ? `+ ${slot.format12h()}` : '');
          if (open && canManage) {
            button.addEventListener('dragover', (e) => {
              if (this.#dragging && this.#dragging.staff.id === staff.id) {
                e.preventDefault();
                button.classList.add('drop-target');
              }
            });
            button.addEventListener('dragleave', () => button.classList.remove('drop-target'));
            button.addEventListener('drop', async (e) => {
              e.preventDefault();
              button.classList.remove('drop-target');
              const a = this.#dragging;
              this.#dragging = null;
              if (a && await this.app.actions.moveTo(a, date.toString(), slot.toString())) await this.safeRefresh();
            });
          }
          col.append(button);
        }
      }
      for (const a of mine) {
        const draggable = a.isActive() && canManage && !clock.isPast(a.date, a.time);
        const event = h('button', {
          type: 'button', class: ['cal-event', a.status.code], draggable: draggable ? 'true' : 'false',
          style: { top: y(a.time.totalMinutes), height: `${Math.max(22, a.staff.getSlotDurationMinutes() * PX_PER_MINUTE - 2)}px` },
          'aria-label': `${a.time.format12h()} ${a.patient.fullName}, ${a.type.label}, ${a.status.label}. Open details.`,
          onclick: async () => {
            if (await this.app.actions.details(a)) await this.safeRefresh();
          },
        }, h('strong', null, a.patient.fullName), h('span', null, `${a.time.format12h()} · ${a.type.label}`));
        if (draggable) {
          event.addEventListener('dragstart', (e) => {
            this.#dragging = a;
            event.classList.add('dragging');
            e.dataTransfer?.setData('text/plain', a.id);
          });
          event.addEventListener('dragend', () => {
            event.classList.remove('dragging');
          });
        }
        col.append(event);
      }
      if (date.equals(today)) {
        const now = clock.now().time.totalMinutes;
        if (now >= start && now <= end) {
          col.append(h('div', { class: 'cal-now', style: { top: y(now) }, 'aria-hidden': 'true' }));
        }
      }
      cols.push(col);
    }
    this.#grid.style.setProperty('--days', String(columns.length));
    replace(this.#grid, heads, cols);
  }

  #paintViewButtons() {
    this.#viewButtons.replaceChildren(...[['week', 'Week (one staff)'], ['day', 'Day (whole clinic)']].map(([v, label]) => h('button', {
      type: 'button', 'aria-pressed': String(this.#view === v),
      onclick: () => {
        this.#view = /** @type {'week' | 'day'} */ (v);
        this.#paintViewButtons();
        this.safeRefresh();
      },
    }, label)));
  }

  /** @param {number} direction */
  #shift(direction) {
    this.#date = this.#date.plusDays(direction * (this.#view === 'week' ? 7 : 1));
    this.safeRefresh();
  }

  #goToday() {
    this.#date = Clock.current().today();
    this.safeRefresh();
  }
}
