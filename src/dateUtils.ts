// src/dateUtils.ts
// Reusable, timezone-safe date helpers for device-local calendar operations.
// Avoids UTC shifts from date-only strings (e.g. new Date("YYYY-MM-DD") which parses as UTC midnight).

export interface MonthGridCell {
  date: Date;
  dateString: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Format a Date object into device-local "YYYY-MM-DD" string.
 * Never uses toISOString() which shifts dates into UTC.
 */
export function formatLocalDate(d: Date): string {
  if (!d || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const toLocalDateString = formatLocalDate;

/**
 * Parse a date-only ("YYYY-MM-DD") or local datetime ("YYYY-MM-DDTHH:mm") string
 * into a local Date object without UTC shifts.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
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
 * Returns today's device-local date as "YYYY-MM-DD".
 * Accepts an optional reference date for deterministic testing.
 */
export function getTodayDateString(refDate: Date = new Date()): string {
  return formatLocalDate(refDate);
}

/**
 * Returns tomorrow's device-local date as "YYYY-MM-DD",
 * correctly handling month and year rollovers.
 * Accepts an optional reference date for deterministic testing.
 */
export function getTomorrowDateString(refDate: Date = new Date()): string {
  const d = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate() + 1
  );
  return formatLocalDate(d);
}

/**
 * Compare two "YYYY-MM-DD" calendar dates lexicographically.
 * Returns negative if d1 < d2, 0 if equal, positive if d1 > d2.
 */
export function compareCalendarDates(d1: string, d2: string): number {
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * Formats a calendar date for friendly display:
 * - Returns "Today" if dateStr matches today's local date
 * - Returns "Tomorrow" if dateStr matches tomorrow's local date
 * - Returns formatted "MMM D" otherwise (e.g. "Oct 23")
 * Accepts an optional reference date for deterministic testing.
 */
export function formatDisplayDate(
  dateStr?: string | null,
  refDate: Date = new Date()
): string {
  if (!dateStr || typeof dateStr !== "string") return "";
  const trimmed = dateStr.trim();
  const todayStr = getTodayDateString(refDate);
  const tomorrowStr = getTomorrowDateString(refDate);

  if (trimmed === todayStr) {
    return "Today";
  }
  if (trimmed === tomorrowStr) {
    return "Tomorrow";
  }

  const parsed = parseLocalDate(trimmed);
  if (!parsed) return trimmed;

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a deadline string for friendly display without UTC shift:
 * - "14:00" -> "14:00"
 * - "2026-10-23T14:00" -> "Today, 14:00" (if today is 2026-10-23)
 * - "2026-10-24T09:30" -> "Tomorrow, 09:30" (if today is 2026-10-23)
 * - Date-only "2026-10-23" -> "Today" or "Oct 23"
 */
export function formatDisplayDeadline(
  deadlineStr?: string | null,
  refDate: Date = new Date()
): string {
  if (!deadlineStr || typeof deadlineStr !== "string") return "";
  const trimmed = deadlineStr.trim();

  // Time-only HH:mm
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const todayStr = getTodayDateString(refDate);
  const tomorrowStr = getTomorrowDateString(refDate);

  // Extract date part YYYY-MM-DD
  const dateMatch = trimmed.match(/^(\d{4}-\d{1,2}-\d{1,2})/);
  if (dateMatch) {
    const datePart = dateMatch[1];
    const timeMatch = trimmed.match(/[T ](\d{1,2}:\d{2})/);
    const timeStr = timeMatch ? timeMatch[1] : "";

    if (datePart === todayStr) {
      return timeStr ? `Today, ${timeStr}` : "Today";
    }
    if (datePart === tomorrowStr) {
      return timeStr ? `Tomorrow, ${timeStr}` : "Tomorrow";
    }

    const d = parseLocalDate(trimmed);
    if (!d) return trimmed;

    const isSameYear = d.getFullYear() === refDate.getFullYear();
    const dateFormatted = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: isSameYear ? undefined : "numeric",
    });

    return timeStr ? `${dateFormatted} at ${timeStr}` : dateFormatted;
  }

  // Fallback for full ISO timestamps with timezone offsets
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return trimmed;

  const dLocalDate = formatLocalDate(d);
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (dLocalDate === todayStr) {
    return `Today, ${timeStr}`;
  }
  if (dLocalDate === tomorrowStr) {
    return `Tomorrow, ${timeStr}`;
  }

  const isSameYear = d.getFullYear() === refDate.getFullYear();
  const dateStr = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: isSameYear ? undefined : "numeric",
  });
  return `${dateStr} at ${timeStr}`;
}

/**
 * Check whether a task is overdue relative to refDate without UTC shifts.
 */
export function isTaskOverdue(
  task: { deadline?: string | null; scheduledDate?: string | null; done?: boolean },
  now: Date = new Date()
): boolean {
  if (!task || task.done) return false;
  const todayStr = getTodayDateString(now);

  // If task was scheduled for a calendar date before today and is unfinished, it is overdue
  if (
    task.scheduledDate &&
    typeof task.scheduledDate === "string" &&
    task.scheduledDate.trim()
  ) {
    const sDate = task.scheduledDate.trim();
    if (sDate < todayStr) {
      return true;
    }
  }

  if (!task.deadline || typeof task.deadline !== "string") return false;
  const trimmed = task.deadline.trim();

  // Time-only HH:mm on current day
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(":").map(Number);
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

/**
 * Returns Monday (start of week) at local 00:00:00 for the provided date.
 */
export function getMondayOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Returns the 7 days of the week starting from Monday.
 */
export function getDaysOfWeek(mondayDate: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      new Date(
        mondayDate.getFullYear(),
        mondayDate.getMonth(),
        mondayDate.getDate() + i
      )
    );
  }
  return days;
}

/**
 * Formats weekly navigation heading (e.g. "Oct 19 – 25, 2026").
 */
export function formatWeekHeading(mondayDate: Date): string {
  const sundayDate = new Date(
    mondayDate.getFullYear(),
    mondayDate.getMonth(),
    mondayDate.getDate() + 6
  );

  const sameMonth = mondayDate.getMonth() === sundayDate.getMonth();
  const sameYear = mondayDate.getFullYear() === sundayDate.getFullYear();

  const monMonth = mondayDate.toLocaleDateString(undefined, { month: "short" });
  const sunMonth = sundayDate.toLocaleDateString(undefined, { month: "short" });

  if (sameMonth && sameYear) {
    return `${monMonth} ${mondayDate.getDate()} – ${sundayDate.getDate()}, ${mondayDate.getFullYear()}`;
  }
  if (sameYear) {
    return `${monMonth} ${mondayDate.getDate()} – ${sunMonth} ${sundayDate.getDate()}, ${mondayDate.getFullYear()}`;
  }
  return `${monMonth} ${mondayDate.getDate()}, ${mondayDate.getFullYear()} – ${sunMonth} ${sundayDate.getDate()}, ${sundayDate.getFullYear()}`;
}

/**
 * Formats monthly navigation heading (e.g. "October 2026").
 */
export function formatMonthHeading(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Constructs the month grid cells (Monday through Sunday) for the month view.
 */
export function getMonthGrid(
  displayedMonthDate: Date,
  todayDateStr: string = getTodayDateString()
): MonthGridCell[] {
  const year = displayedMonthDate.getFullYear();
  const month = displayedMonthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat
  // We want Monday as first column (0), Sunday as last column (6)
  const dayOfWeek = firstDay.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const cells: MonthGridCell[] = [];

  // Previous month filler days
  const prevMonthDaysCount = new Date(year, month, 0).getDate();
  for (let i = mondayOffset - 1; i >= 0; i--) {
    const dayNum = prevMonthDaysCount - i;
    const cellDate = new Date(year, month - 1, dayNum);
    const dateString = formatLocalDate(cellDate);
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: dateString === todayDateStr,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    const dateString = formatLocalDate(cellDate);
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dateString === todayDateStr,
    });
  }

  // Next month filler days to complete 7-day rows
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const cellDate = new Date(year, month + 1, i);
    const dateString = formatLocalDate(cellDate);
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: i,
      isCurrentMonth: false,
      isToday: dateString === todayDateStr,
    });
  }

  return cells;
}

/**
 * Formats day detail heading (e.g. "Friday, Oct 23, 2026").
 */
export function formatDayDetailHeading(dateStr: string): string {
  try {
    const d = parseLocalDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Generates an array of "YYYY-MM-DD" date strings between startStr and endStr inclusive.
 */
export function getDatesInRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  if (!startStr || !endStr) return dates;
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (!start || !end) return dates;

  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let count = 0;
  while (cur <= end && count < 60) {
    dates.push(formatLocalDate(cur));
    cur.setDate(cur.getDate() + 1);
    count++;
  }
  return dates;
}
