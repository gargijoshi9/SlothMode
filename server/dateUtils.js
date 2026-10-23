// server/dateUtils.js
// Timezone-safe local calendar helpers for the backend scheduler and test suite.
// Guarantees zero UTC shift for date-only strings (e.g. "YYYY-MM-DD").

/**
 * Format Date to local "YYYY-MM-DD" string.
 * Never uses toISOString() which shifts dates into UTC.
 */
export function formatLocalDate(d) {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const toLocalDateString = formatLocalDate;

/**
 * Parse a date-only ("YYYY-MM-DD") or local datetime ("YYYY-MM-DDTHH:mm") string
 * into a local Date object without UTC shifts.
 */
export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  // YYYY-MM-DD or YYYY-MM-DDTHH:mm(:ss)
  const match = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) {
    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  const hh = match[4] ? parseInt(match[4], 10) : 0;
  const mm = match[5] ? parseInt(match[5], 10) : 0;
  const ss = match[6] ? parseInt(match[6], 10) : 0;

  const date = new Date(y, m, d, hh, mm, ss, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * Safely parse a reference date input from client options into a local Date object,
 * immune to UTC shift even if Node.js runs in a different timezone from the client.
 */
export function parseReferenceDate(input) {
  if (!input) return new Date();
  if (input instanceof Date) return isNaN(input.getTime()) ? new Date() : input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
      const parsed = parseLocalDate(trimmed);
      if (parsed) return parsed;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Returns today's local date as "YYYY-MM-DD".
 */
export function getTodayDateString(refDate = new Date()) {
  return formatLocalDate(refDate);
}

/**
 * Returns tomorrow's local date as "YYYY-MM-DD", correctly handling month and year boundaries.
 */
export function getTomorrowDateString(refDate = new Date()) {
  const d = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate() + 1
  );
  return formatLocalDate(d);
}

/**
 * Compare two "YYYY-MM-DD" calendar dates lexicographically.
 */
export function compareCalendarDates(d1, d2) {
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * Friendly display format for a date string: "Today", "Tomorrow", or formatted date.
 */
export function formatDisplayDate(dateStr, refDate = new Date()) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  const todayStr = getTodayDateString(refDate);
  const tomorrowStr = getTomorrowDateString(refDate);

  if (trimmed === todayStr) {
    return 'Today';
  }
  if (trimmed === tomorrowStr) {
    return 'Tomorrow';
  }

  const parsed = parseLocalDate(trimmed);
  if (!parsed) return trimmed;

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Check whether a task is overdue relative to refDate without UTC shifts.
 * An unfinished task is overdue if:
 * 1. It has a scheduledDate strictly before today's local date.
 * 2. Or it has a deadline that has passed.
 */
export function isTaskOverdue(task, now = new Date()) {
  if (!task || task.done) return false;
  const todayStr = getTodayDateString(now);

  if (task.scheduledDate && typeof task.scheduledDate === 'string' && task.scheduledDate.trim()) {
    const sDate = task.scheduledDate.trim();
    if (sDate < todayStr) {
      return true;
    }
  }

  if (!task.deadline || typeof task.deadline !== 'string') return false;
  const trimmed = task.deadline.trim();

  // Time-only HH:mm on current day
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':').map(Number);
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0,
      0
    );
    return d < now;
  }

  // Date-only deadline YYYY-MM-DD expires at the end of that day (23:59:59)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const parsed = parseLocalDate(trimmed);
    if (!parsed) return false;
    const endOfDay = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      23,
      59,
      59,
      999
    );
    return endOfDay < now;
  }

  // Datetime-local YYYY-MM-DDTHH:mm
  const parsed = parseLocalDate(trimmed);
  if (parsed) {
    return parsed < now;
  }

  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return false;
  return d < now;
}
