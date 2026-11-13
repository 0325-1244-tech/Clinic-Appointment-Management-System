// @ts-check
import { h, peso } from '../core/dom.js';

/** @typedef {import('/domain/Appointment.js').Appointment} Appointment */
/** @typedef {import('/domain/Patient.js').Patient} Patient */
/** @typedef {import('/domain/MedicalStaff.js').MedicalStaff} MedicalStaff */

/**
 * Column definitions shared by several tables. Each one is a small strategy
 * object telling <cc-data-table> how to render, sort and export a cell.
 */
export class Columns {
  constructor() {
    throw new TypeError('Columns only has static members.');
  }

  /** @param {Appointment} a */
  static statusPill(a) {
    return h('span', { class: `pill pill-${a.status.code}` }, a.status.label);
  }

  /** @returns {import('../components/DataTable.js').Column<Appointment>[]} */
  static appointments() {
    return [
      { key: 'id', label: 'ID', render: (a) => h('span', { class: 'mono' }, a.id), sortValue: (a) => a.id },
      {
        key: 'when', label: 'Date & time',
        render: (a) => h('span', null, h('span', { class: 'cell-primary' }, a.date.formatMedium()), h('span', { class: 'cell-sub' }, `${a.time.format12h()} – ${a.getEndTime().format12h()}`)),
        sortValue: (a) => `${a.date} ${a.time}`, csv: (a) => `${a.date} ${a.time}`,
      },
      {
        key: 'patient', label: 'Patient', primary: true,
        render: (a) => h('span', null, h('a', { href: `#/patients/${encodeURIComponent(a.patient.id)}`, class: 'cell-primary' }, a.patient.fullName), h('span', { class: 'cell-sub' }, a.patient.id)),
        sortValue: (a) => a.patient.fullName,
      },
      {
        key: 'staff', label: 'Attending staff',
        render: (a) => h('span', null, h('span', { class: 'cell-primary' }, a.staff.getDisplayName()), h('span', { class: `cell-sub role-tag role-${a.staff.getRole()}` }, a.staff.getRole())),
        sortValue: (a) => a.staff.getDisplayName(),
      },
      { key: 'type', label: 'Type', render: (a) => a.type.label, sortValue: (a) => a.type.label },
      { key: 'reason', label: 'Reason', render: (a) => a.reason, sortValue: (a) => a.reason },
      { key: 'fee', label: 'Fee', align: 'right', render: (a) => h('span', { class: 'num' }, peso(a.computeFee())), sortValue: (a) => a.computeFee() },
      { key: 'status', label: 'Status', render: Columns.statusPill, sortValue: (a) => a.status.label },
    ];
  }

  /** @returns {import('../components/DataTable.js').Column<Appointment>[]} */
  static records() {
    return [
      ...Columns.appointments().filter((c) => c.key !== 'reason'),
      { key: 'remarks', label: 'Findings / remarks', render: (a) => a.remarks || '—', sortValue: (a) => a.remarks },
    ];
  }
}
