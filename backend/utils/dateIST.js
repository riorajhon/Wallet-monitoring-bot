/**
 * IST (Asia/Kolkata) timezone for all date/time display.
 * Use for transaction age strings and any user-facing time.
 */

const IST_TZ = 'Asia/Kolkata';

/**
 * Format a timestamp to IST string for storage/display.
 * @param {number|Date} ts - Unix seconds, or Date
 * @returns {string} e.g. "30 Jan 2025, 3:45:00 pm (IST)"
 */
export function toAgeStringIST(ts) {
  let d;
  if (ts == null) return '';
  if (typeof ts === 'number') {
    d = ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
  } else if (ts instanceof Date) {
    d = ts;
  } else {
    return '';
  }
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    timeZone: IST_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' (IST)';
}

/**
 * Parse a scraped age string (e.g. from Etherscan/BscScan) and return IST.
 * Common formats: "Jan-30-2025 10:15:30 AM", "2025-01-30 10:15:30", ISO.
 * Assumes UTC if no timezone in string.
 * @param {string} ageStr - Raw age from HTML
 * @returns {string} IST formatted string, or original if unparseable
 */
export function ageStringToIST(ageStr) {
  if (!ageStr || typeof ageStr !== 'string') return ageStr || '';
  const trimmed = ageStr.trim();
  if (!trimmed) return trimmed;
  let d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    d = new Date(trimmed + ' UTC');
  }
  if (Number.isNaN(d.getTime())) return trimmed;
  return toAgeStringIST(d);
}
