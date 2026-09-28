/**
 * Date formatting and calculation utilities for Attendance API
 */

/**
 * Formats a Date object to MM/DD/YYYY string
 * @param {Date} dateObj 
 * @returns {string}
 */
export function formatDate(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Safely parses Excel date values (number serial, Date object, or string)
 * @param {number|Date|string} val 
 * @returns {Date|null}
 */
export function parseDate(val) {
  if (val === undefined || val === null || val === '') return null;

  if (typeof val === 'number') {
    // Excel serial date to JS Date (Excel epoch starts 1900-01-01, with leap year bug offset)
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  const str = String(val).trim().split(' ')[0];
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns a new Date shifted by the given number of days
 * @param {Date} date 
 * @param {number} days 
 * @returns {Date}
 */
export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Returns a valid past date (MM/DD/YYYY) shifted by daysAgo from today.
 * Prevents future date errors while guaranteeing unique non-colliding slots.
 * @param {number} daysAgo 
 * @returns {string} MM/DD/YYYY
 */
export function getPastDate(daysAgo = 1) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return formatDate(date);
}
