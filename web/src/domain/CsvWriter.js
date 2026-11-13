// @ts-check

/**
 * @template T
 * @typedef {object} CsvColumn
 * @property {string} header
 * @property {(row: T) => string | number} value
 */

/**
 * Builds CSV text. Used by the server for the records export (same 12 columns
 * as the Java version) and by the browser's "Export CSV" button on every table.
 *
 * Every text cell is quoted. A cell that starts with = + - @ (or a tab or
 * carriage return) gets a leading apostrophe, so spreadsheet programs never run
 * it as a formula (CSV injection).
 *
 * @template T
 */
export class CsvWriter {
  #columns;

  /** @param {CsvColumn<T>[]} columns */
  constructor(columns) {
    this.#columns = Object.freeze([...columns]);
  }

  /**
   * @param {Iterable<T>} rows
   * @returns {string} CSV with CRLF line endings
   */
  write(rows) {
    const lines = [this.#columns.map((c) => CsvWriter.quote(c.header)).join(',')];
    for (const row of rows) {
      lines.push(this.#columns.map((c) => CsvWriter.cell(c.value(row))).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  /** @param {string | number} value */
  static cell(value) {
    return typeof value === 'number' ? value.toFixed(2) : CsvWriter.quote(value);
  }

  /** @param {string} value */
  static quote(value) {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }
}

/** @typedef {import('./Appointment.js').Appointment} Appointment */

/**
 * The Java version's "Export CSV" format for appointment records.
 * With findings: false, the clinical notes of completed visits are left out.
 *
 * @param {{ findings?: boolean }} [options]
 */
export function recordCsv({ findings = true } = {}) {
  return new CsvWriter(/** @type {CsvColumn<Appointment>[]} */ ([
  { header: 'Appointment ID', value: (a) => a.id },
  { header: 'Date', value: (a) => a.date.toString() },
  { header: 'Time', value: (a) => a.time.toString() },
  { header: 'Patient ID', value: (a) => a.patient.id },
  { header: 'Patient', value: (a) => a.patient.fullName },
  { header: 'Staff', value: (a) => a.staff.getDisplayName() },
  { header: 'Role', value: (a) => a.staff.getRole() },
  { header: 'Type', value: (a) => a.type.label },
  { header: 'Reason', value: (a) => a.reason },
  { header: 'Status', value: (a) => a.status.label },
  { header: 'Fee (PHP)', value: (a) => a.computeFee() },
  { header: 'Remarks', value: (a) => (!findings && a.status.code === 'COMPLETED' ? '(clinical notes hidden)' : a.remarks) },
  ]));
}
