// @ts-check
import { ValidationError } from './errors.js';

/**
 * Trims a required text value, or throws "<field> is required." (same message as the Java version).
 *
 * @param {unknown} value
 * @param {string} fieldName  shown to the user, e.g. "First name"
 * @param {string} [fieldKey] property name reported to the form, e.g. "firstName"
 * @returns {string}
 */
export function requireText(value, fieldName, fieldKey) {
  const text = typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
  if (text === '') {
    throw new ValidationError(`${fieldName} is required.`, { field: fieldKey });
  }
  return text;
}

/**
 * Lower-cased, trimmed search keyword. Returns '' for a blank keyword (which matches everything).
 *
 * @param {unknown} keyword
 */
export function normalizeKeyword(keyword) {
  return typeof keyword === 'string' ? keyword.trim().toLowerCase() : '';
}

/**
 * Peso amount the way the Java version printed it: "PHP 1,234.50".
 *
 * @param {number} amount
 */
export function formatPeso(amount) {
  return `PHP ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
