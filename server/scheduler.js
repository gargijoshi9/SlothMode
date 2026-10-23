// server/scheduler.js
// Deterministic daily and multi-horizon scheduler adhering to the Hacktoberfest "Slow and Steady" theme.
// Supports Today, Tomorrow, This Week, and This Month planning horizons.
// Splits tasks into manageable focus sessions, inserts restorative breaks, respects deadlines, and avoids overlaps.

const URGENCY_WEIGHTS = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Format minutes from midnight to "HH:mm" string.
 */
export function minutesToTime(totalMinutes) {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, Math.floor(totalMinutes)));
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Parse "HH:mm" string into minutes from midnight.
 */
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
}

/**
 * Local-time safe date string YYYY-MM-DD.
 */
export function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a deadline string (ISO timestamp, date string, or HH:mm) into minutes from start of day,
 * or null if no valid deadline is provided.
 */
export function parseDeadlineToMinutes(deadlineStr, referenceDate = new Date()) {
  if (!deadlineStr) return null;

  // Direct HH:mm match (assumed reference date's time)
  if (/^\d{1,2}:\d{2}$/.test(deadlineStr.trim())) {
    return timeToMinutes(deadlineStr.trim());
  }

  const d = new Date(deadlineStr);
  if (isNaN(d.getTime())) return null;

  const startOfRefDay = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0, 0, 0, 0
  );

  const diffMs = d.getTime() - startOfRefDay.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

/**
 * Evaluate if a task's deadline is violated or passed for a specific calendar date and end minute.
 */
export function evaluateDeadlineForDate(deadlineStr, targetDateStr, dayEndMinutes = 18 * 60) {
  if (!deadlineStr || typeof deadlineStr !== 'string') {
    return {
      hasDeadline: false,
      isPastBeforeDay: false,
      isDeadlineOnDate: false,
      isViolated: () => false,
      label: '',
    };
  }

  const trimmed = deadlineStr.trim();

  // Format: HH:mm (time of scheduled day)
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const deadlineMinute = timeToMinutes(trimmed);
    return {
      hasDeadline: true,
      isPastBeforeDay: false,
      isDeadlineOnDate: true,
      isViolated: (endMin) => endMin > deadlineMinute,
      label: trimmed,
      deadlineMinute,
    };
  }

  const d = new Date(trimmed);
  if (isNaN(d.getTime())) {
    return {
      hasDeadline: false,
      isPastBeforeDay: false,
      isDeadlineOnDate: false,
      isViolated: () => false,
      label: trimmed,
    };
  }

  const deadlineDateStr = toLocalDateString(d);
  const hasTimeComponent = /T\d{1,2}:\d{2}|\s\d{1,2}:\d{2}/.test(trimmed);
  const deadlineMinute = hasTimeComponent ? d.getHours() * 60 + d.getMinutes() : dayEndMinutes;
  const label = trimmed.replace('T', ' ');

  if (targetDateStr > deadlineDateStr) {
    // Target date is strictly after deadline date
    return {
      hasDeadline: true,
      isPastBeforeDay: true,
      isDeadlineOnDate: false,
      isViolated: () => true,
      label,
      deadlineMinute,
    };
  }

  if (targetDateStr < deadlineDateStr) {
    // Target date is strictly before deadline date
    return {
      hasDeadline: true,
      isPastBeforeDay: false,
      isDeadlineOnDate: false,
      isViolated: () => false,
      label,
      deadlineMinute,
    };
  }

  // Same day as deadline
  return {
    hasDeadline: true,
    isPastBeforeDay: false,
    isDeadlineOnDate: true,
    isViolated: (endMin) => endMin > deadlineMinute,
    label,
    deadlineMinute,
  };
}

/**
 * Sort tasks deterministically by urgency, deadline proximity, and duration.
 */
export function sortTasksForScheduling(tasks, referenceDate = new Date()) {
  return [...tasks].sort((a, b) => {
    // 1. Urgency (critical > high > medium > low)
    const urgA = URGENCY_WEIGHTS[a.urgency?.toLowerCase()] || 2;
    const urgB = URGENCY_WEIGHTS[b.urgency?.toLowerCase()] || 2;
    if (urgB !== urgA) return urgB - urgA;

    // 2. Deadline proximity (earlier deadline first)
    const deadA = parseDeadlineToMinutes(a.deadline, referenceDate);
    const deadB = parseDeadlineToMinutes(b.deadline, referenceDate);

    if (deadA !== null && deadB !== null) {
      if (deadA !== deadB) return deadA - deadB;
    } else if (deadA !== null) {
      return -1; // a has deadline, goes first
    } else if (deadB !== null) {
      return 1;
    }

    // 3. Duration: longer tasks earlier in the day for fresh mental energy
    const durA = a.duration || a.estimatedMinutes || 30;
    const durB = b.duration || b.estimatedMinutes || 30;
    return durB - durA;
  });
}

/**
 * Splits a task's total duration into focus sessions between minSessionMinutes (45m)
 * and maxSessionMinutes (120m), preserving total effort with 0 lost or duplicated minutes.
 * Short tasks (< minSessionMinutes) remain intact as a single session without padding.
 */
export function calculateSessionParts(totalDuration, minSessionMinutes = 45, maxSessionMinutes = 120) {
  // If task is short or fits within maxSessionMinutes, keep it as a single session
  if (totalDuration <= maxSessionMinutes) {
    return [{
      partIndex: 1,
      totalParts: 1,
      durationMinutes: totalDuration,
    }];
  }

  const partsCount = Math.ceil(totalDuration / maxSessionMinutes);
  const parts = [];
  let rem = totalDuration;

  for (let i = 0; i < partsCount; i++) {
    const dur = Math.min(rem, maxSessionMinutes);
    parts.push(dur);
    rem -= dur;
  }

  // If the trailing remainder is less than minSessionMinutes, rebalance with the preceding part
  // so both parts stay within [minSessionMinutes, maxSessionMinutes] if possible
  if (parts.length >= 2) {
    const lastIdx = parts.length - 1;
    const prevIdx = lastIdx - 1;
    const deficit = minSessionMinutes - parts[lastIdx];
    if (deficit > 0) {
      const availableFromPrev = parts[prevIdx] - minSessionMinutes;
      if (availableFromPrev > 0) {
        const transfer = Math.min(deficit, availableFromPrev);
        parts[prevIdx] -= transfer;
        parts[lastIdx] += transfer;
      }
    }
  }

  return parts.map((dur, idx) => ({
    partIndex: idx + 1,
    totalParts: parts.length,
    durationMinutes: dur,
  }));
}

/**
 * Default routine blocks per Step 2 specifications:
 * - Day starts at 09:00
 * - Lunch: 13:00–14:00 (60 minutes)
 * - Nap: 14:00–14:30 (30 minutes)
 * - Evening snack: 17:00–17:15 (15 minutes)
 * - Dinner: 19:00–19:30 (30 minutes)
 * - Scheduling day ends at 20:00
 */
export const DEFAULT_ROUTINE_BLOCKS = [
  {
    id: 'lunch',
    label: 'Lunch',
    icon: '🍱',
    enabled: true,
    startTime: '13:00',
    durationMinutes: 60,
  },
  {
    id: 'nap',
    label: 'Nap',
    icon: '😴',
    enabled: true,
    startTime: '14:00',
    durationMinutes: 30,
  },
  {
    id: 'evening_snack',
    label: 'Evening snack',
    icon: '🍵',
    enabled: true,
    startTime: '17:00',
    durationMinutes: 15,
  },
  {
    id: 'dinner',
    label: 'Dinner',
    icon: '🍲',
    enabled: true,
    startTime: '19:00',
    durationMinutes: 30,
  },
];

export const DEFAULT_ROUTINE_SETTINGS = {
  dayStartTime: '09:00',
  dayEndTime: '20:00',
  blocks: DEFAULT_ROUTINE_BLOCKS,
};

/**
 * Validate routine settings times, durations, and detect overlapping blocks.
 * Requirement 6: Handle overlapping routine blocks explicitly: display a clear validation message and do not silently move the user's selected times.
 */
export function validateRoutineSettings(settings) {
  const errors = [];
  if (!settings) return { isValid: true, errors: [] };

  const dayStartStr = settings.dayStartTime || '09:00';
  const dayEndStr = settings.dayEndTime || '20:00';

  const dayStartMin = timeToMinutes(dayStartStr);
  const dayEndMin = timeToMinutes(dayEndStr);

  if (dayStartMin >= dayEndMin) {
    errors.push(`Day start time (${dayStartStr}) must be earlier than day end time (${dayEndStr}).`);
  }

  const blocks = Array.isArray(settings.blocks) ? settings.blocks : [];
  const enabledBlocks = blocks.filter((b) => b.enabled !== false);

  const processedBlocks = [];
  for (const block of enabledBlocks) {
    const label = block.label || block.title || block.id || 'Routine block';
    const startStr = block.startTime;
    const dur = Number(block.durationMinutes);

    if (!startStr || !/^\d{1,2}:\d{2}$/.test(String(startStr).trim())) {
      errors.push(`Routine block "${label}" has an invalid start time: "${startStr}". Expected HH:mm.`);
      continue;
    }

    if (isNaN(dur) || dur <= 0) {
      errors.push(`Routine block "${label}" duration must be greater than 0 minutes.`);
      continue;
    }

    const startMin = timeToMinutes(startStr);
    const endMin = startMin + dur;

    if (startMin < dayStartMin || endMin > dayEndMin) {
      errors.push(
        `Routine block "${label}" (${startStr}–${minutesToTime(endMin)}) falls outside configured day window (${dayStartStr}–${dayEndStr}).`
      );
    }

    processedBlocks.push({
      ...block,
      label,
      startMin,
      endMin,
    });
  }

  // Check for overlaps between enabled routine blocks
  for (let i = 0; i < processedBlocks.length; i++) {
    for (let j = i + 1; j < processedBlocks.length; j++) {
      const b1 = processedBlocks[i];
      const b2 = processedBlocks[j];
      if (b1.startMin < b2.endMin && b2.startMin < b1.endMin) {
        errors.push(
          `Overlapping routine blocks: "${b1.label}" (${b1.startTime}–${minutesToTime(b1.endMin)}) overlaps with "${b2.label}" (${b2.startTime}–${minutesToTime(b2.endMin)}). Please adjust times.`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create a deterministic schedule across the selected planning horizon:
 * 'today' | 'tomorrow' | 'week' | 'month'.
 *
 * @param {Array} tasks - List of task objects
 * @param {Object} options - Scheduling preferences including horizon, currentDate, working hours
 * @returns {Object} Complete schedule result with timeline items, metrics, and overflow report
 */
export function createDailySchedule(tasks = [], options = {}) {
  const referenceDate = options.currentDate ? new Date(options.currentDate) : new Date();

  const todayStr = toLocalDateString(referenceDate);
  const horizon = options.horizon || 'today';

  // 1. Determine horizon calendar days (all dates local-time safe YYYY-MM-DD)
  let horizonDays = [];

  if (horizon === 'tomorrow') {
    const tom = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + 1);
    horizonDays = [toLocalDateString(tom)];
  } else if (horizon === 'week') {
    const dayOfWeek = referenceDate.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + diffToMonday);
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      weekDays.push(toLocalDateString(d));
    }
    // Full current week: Monday through Sunday
    horizonDays = weekDays;
  } else if (horizon === 'month') {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dObj = new Date(year, month, d);
      monthDays.push(toLocalDateString(dObj));
    }
    // Full month
    horizonDays = monthDays;
  } else {
    // Default 'today'
    horizonDays = [todayStr];
  }

  const firstHorizonDay = horizonDays[0];
  const lastHorizonDay = horizonDays[horizonDays.length - 1];

  // Routine settings resolution
  let routineSettings = null;
  if (options.routineSettings) {
    routineSettings = options.routineSettings;
  } else if (options.routineBlocks) {
    routineSettings = {
      dayStartTime: options.dayStartTime || (options.startHour !== undefined ? minutesToTime(options.startHour * 60) : '09:00'),
      dayEndTime: options.dayEndTime || (options.endHour !== undefined ? minutesToTime(options.endHour * 60) : '20:00'),
      blocks: options.routineBlocks,
    };
  } else if (!options.blockedCommitments) {
    const dayStartStr = options.dayStartTime || (options.startHour !== undefined ? minutesToTime(options.startHour * 60) : DEFAULT_ROUTINE_SETTINGS.dayStartTime);
    const dayEndStr = options.dayEndTime || (options.endHour !== undefined ? minutesToTime(options.endHour * 60) : DEFAULT_ROUTINE_SETTINGS.dayEndTime);
    const startMin = timeToMinutes(dayStartStr);
    const endMin = timeToMinutes(dayEndStr);

    routineSettings = {
      dayStartTime: dayStartStr,
      dayEndTime: dayEndStr,
      blocks: DEFAULT_ROUTINE_BLOCKS.map((b) => {
        const bStart = timeToMinutes(b.startTime);
        const bEnd = bStart + b.durationMinutes;
        return {
          ...b,
          enabled: b.enabled && bStart >= startMin && bEnd <= endMin,
        };
      }),
    };
  }

  // Validate routine settings if provided or defaulted
  if (routineSettings) {
    const val = validateRoutineSettings(routineSettings);
    if (!val.isValid) {
      return {
        success: false,
        error: `Routine block validation error: ${val.errors[0]}`,
        routineValidationErrors: val.errors,
        routineSettings,
        horizon,
        startDate: firstHorizonDay,
        endDate: lastHorizonDay,
        dayWindow: {
          start: routineSettings.dayStartTime || '09:00',
          end: routineSettings.dayEndTime || '20:00',
          totalAvailableMinutes: 0,
        },
        metrics: {
          totalTasks: tasks.length,
          scheduledTasksCount: 0,
          completedTasksCount: tasks.filter((t) => t.done).length,
          overflowTasksCount: tasks.filter((t) => !t.done).length,
          totalFocusMinutes: 0,
          totalBreakMinutes: 0,
          totalRoutineMinutes: 0,
        },
        schedule: [],
        overflowTasks: tasks.filter((t) => !t.done).map((t) => ({
          taskId: t.id,
          taskTitle: t.title,
          reason: `Planning paused due to routine settings conflict: ${val.errors[0]}`,
          requestedMinutes: t.duration || 30,
          remainingUnscheduledMinutes: t.duration || 30,
        })),
        completedTasks: tasks.filter((t) => t.done),
        enrichedTasks: tasks,
      };
    }
  }

  // Working window (in minutes from midnight)
  // Requirement 7: Respect the 09:00 start and 20:00 end boundaries by default.
  let dayStartMinutes = 9 * 60; // 09:00
  let dayEndMinutes = 20 * 60;  // 20:00

  if (options.dayStartTime) {
    dayStartMinutes = timeToMinutes(options.dayStartTime);
  } else if (routineSettings?.dayStartTime) {
    dayStartMinutes = timeToMinutes(routineSettings.dayStartTime);
  } else if (options.startHour !== undefined) {
    dayStartMinutes = Number(options.startHour) * 60;
  }

  if (options.dayEndTime) {
    dayEndMinutes = timeToMinutes(options.dayEndTime);
  } else if (routineSettings?.dayEndTime) {
    dayEndMinutes = timeToMinutes(routineSettings.dayEndTime);
  } else if (options.endHour !== undefined) {
    dayEndMinutes = Number(options.endHour) * 60;
  }

  const startHour = Math.floor(dayStartMinutes / 60);
  const endHour = Math.ceil(dayEndMinutes / 60);

  // Break behavior: 'optional' (default), 'automatic', or 'after_task'
  const breakBehavior = (options.breakBehavior && ['optional', 'automatic', 'after_task'].includes(options.breakBehavior))
    ? options.breakBehavior
    : 'optional';

  // Focus session configuration:
  const focusSessionMinMinutes = Number(options.focusSessionMinMinutes ?? 45);
  const maxSessionMinutes = Number(
    options.focusSessionMaxMinutes ?? options.maxSessionMinutes ?? 120
  );
  const minSessionMinutes = Math.min(focusSessionMinMinutes, maxSessionMinutes);

  // Break durations:
  const defaultBreakMinutes = Number(options.defaultBreakMinutes ?? options.shortBreakMinutes ?? 10);
  const shortBreakMinutes = defaultBreakMinutes;
  const longBreakMinutes = Number(options.longBreakMinutes ?? 20);

  // Blocked commitments (Routine blocks or legacy blocked commitments)
  let blockedIntervals = [];

  if (routineSettings) {
    const enabledBlocks = (routineSettings.blocks || []).filter((b) => b.enabled !== false);
    blockedIntervals = enabledBlocks
      .map((b) => {
        const start = timeToMinutes(b.startTime);
        const dur = Number(b.durationMinutes || 30);
        return {
          id: b.id,
          title: b.label || b.title,
          icon: b.icon || '☕',
          start,
          end: start + dur,
          durationMinutes: dur,
          type: 'routine',
        };
      })
      .filter((b) => b.end > b.start)
      .sort((a, b) => a.start - b.start);
  } else if (options.blockedCommitments) {
    blockedIntervals = options.blockedCommitments
      .map((b) => ({
        id: b.id,
        title: b.title,
        icon: b.icon || '☕',
        start: timeToMinutes(b.start),
        end: timeToMinutes(b.end),
        durationMinutes: timeToMinutes(b.end) - timeToMinutes(b.start),
        type: b.type || 'blocked',
      }))
      .filter((b) => b.end > b.start)
      .sort((a, b) => a.start - b.start);
  }

  function advanceThroughBlocked(currentCursor) {
    let nextCursor = currentCursor;
    let advanced = true;
    while (advanced) {
      advanced = false;
      for (const block of blockedIntervals) {
        if (nextCursor >= block.start && nextCursor < block.end) {
          nextCursor = block.end;
          advanced = true;
        }
      }
    }
    return nextCursor;
  }

  function findNextAvailableSlot(fromCursor, duration, dayEnd) {
    let searchCursor = fromCursor;

    while (searchCursor + duration <= dayEnd) {
      searchCursor = advanceThroughBlocked(searchCursor);

      if (searchCursor + duration > dayEnd) {
        return null;
      }

      let conflict = null;
      for (const block of blockedIntervals) {
        if (block.start < searchCursor + duration && block.end > searchCursor) {
          conflict = block;
          break;
        }
      }

      if (!conflict) {
        return searchCursor;
      }

      searchCursor = conflict.end;
    }

    return null;
  }

  // 2. Separate completed and pending tasks
  const completedTasks = tasks.filter((t) => t.done);
  const pendingTasks = tasks.filter((t) => !t.done);

  // 3. Classify pending tasks:
  // - Future tasks outside this horizon: leave un-scheduled for now, do not move or overflow
  // - Pinned tasks: task.scheduledDate is within horizonDays
  // - Flexible tasks: unscheduled or past-due tasks that can be placed on an available horizon day
  const pinnedByDay = {};
  for (const day of horizonDays) {
    pinnedByDay[day] = [];
  }

  const flexibleTasks = [];

  for (const task of pendingTasks) {
    const sDate = task.scheduledDate ? task.scheduledDate.trim() : null;
    if (sDate && sDate > lastHorizonDay) {
      // Future task outside this horizon. Never schedule before its selected scheduledDate!
      continue;
    }
    if (sDate && horizonDays.includes(sDate)) {
      pinnedByDay[sDate].push(task);
    } else {
      flexibleTasks.push(task);
    }
  }

  // Sort flexible tasks so urgent and tight-deadline tasks get assigned earlier in the horizon
  const flexibleQueue = sortTasksForScheduling(flexibleTasks, referenceDate);

  const allScheduleItems = [];
  const overflowTasks = [];
  const newlyScheduledTaskDates = new Map();

  // 3b. Setup session tracking per task to support cross-day session splitting
  const taskProgress = new Map();
  function getTaskState(task) {
    if (!taskProgress.has(task.id)) {
      const rawDuration = Number(task.duration || task.estimatedMinutes || 30);
      const totalDuration = Math.min(480, Math.max(5, rawDuration));
      const parts = calculateSessionParts(totalDuration, minSessionMinutes, maxSessionMinutes);
      taskProgress.set(task.id, {
        task,
        totalDuration,
        partsCount: parts.length,
        allParts: parts,
        scheduledParts: [],
        remainingParts: [...parts],
      });
    }
    return taskProgress.get(task.id);
  }

  // 4. Iterate through each day in the horizon
  for (const dayStr of horizonDays) {
    let dayStart = startHour * 60;
    const dayEnd = endHour * 60;

    // If scheduling today later in the day, start from current time rounded up to nearest 5 mins
    if (dayStr === todayStr && options.useCurrentTimeAsStart) {
      const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
      const roundedNow = Math.ceil(nowMinutes / 5) * 5;
      if (roundedNow > dayStart && roundedNow < dayEnd) {
        dayStart = roundedNow;
      }
    }

    // Blocked commitments / routine blocks for this day
    const dayTimelineEvents = [];
    for (const block of blockedIntervals) {
      if (block.end > dayStart && block.start < dayEnd) {
        const actualStart = Math.max(dayStart, block.start);
        const actualEnd = Math.min(dayEnd, block.end);
        dayTimelineEvents.push({
          id: `${block.type || 'routine'}-${dayStr}-${block.id || block.start}`,
          type: block.type || 'routine',
          routineBlockId: block.id,
          title: block.title,
          icon: block.icon,
          date: dayStr,
          scheduledDate: dayStr,
          start: minutesToTime(actualStart),
          end: minutesToTime(actualEnd),
          durationMinutes: actualEnd - actualStart,
          startMin: actualStart,
          endMin: actualEnd,
        });
      }
    }

    let cursor = dayStart;
    let consecutiveFocusMinutes = 0;
    const daySchedule = [];

    // Helper to attempt placing task sessions onto dayStr
    function tryScheduleTaskOnDay(task, isPinned) {
      const state = getTaskState(task);
      if (state.remainingParts.length === 0) {
        return { success: true, fullyScheduled: true };
      }

      const totalDuration = state.totalDuration;
      const deadlineInfo = evaluateDeadlineForDate(task.deadline, dayStr, dayEnd);
      if (deadlineInfo.isPastBeforeDay) {
        return {
          success: false,
          cannotFitEver: state.scheduledParts.length === 0,
          reason: `Deadline (${deadlineInfo.label}) passed before ${dayStr}`,
          requestedMinutes: totalDuration,
          remainingUnscheduledMinutes: state.remainingParts.reduce((a, b) => a + b.durationMinutes, 0),
        };
      }

      // If a deadline is on this date, all remaining parts must complete before deadline
      if (deadlineInfo.isDeadlineOnDate) {
        const remainingMinutesNeeded = state.remainingParts.reduce((a, b) => a + b.durationMinutes, 0);
        // Quick feasibility check
        if (cursor + remainingMinutesNeeded > deadlineInfo.deadlineMinute) {
          return {
            success: false,
            cannotFitEver: true,
            reason: `Session would finish at ${minutesToTime(cursor + remainingMinutesNeeded)}, which is past the deadline (${deadlineInfo.label})`,
            requestedMinutes: totalDuration,
            remainingUnscheduledMinutes: remainingMinutesNeeded,
          };
        }
      }

      // Max sessions allowed on this day:
      // Supports explicit options.maxSessionsPerDayPerTask or spreading long tasks across horizon days
      const maxSessionsAllowedToday = options.maxSessionsPerDayPerTask
        ? Math.max(1, Number(options.maxSessionsPerDayPerTask))
        : (options.spreadLongTasks && horizonDays.length > 1 && !deadlineInfo.isDeadlineOnDate
            ? Math.max(1, Math.min(2, Math.ceil(state.partsCount / horizonDays.length)))
            : state.remainingParts.length);

      let simCursor = cursor;
      let simConsecutive = consecutiveFocusMinutes;
      const plannedSessions = [];
      let failureReason = '';
      let cannotFitEver = false;

      let partsScheduledCount = 0;
      for (let i = 0; i < state.remainingParts.length; i++) {
        if (partsScheduledCount >= maxSessionsAllowedToday) {
          break;
        }

        const part = state.remainingParts[i];
        const sessionDuration = part.durationMinutes;

        const nextSlot = findNextAvailableSlot(simCursor, sessionDuration, dayEnd);
        if (nextSlot === null) {
          failureReason = `Not enough available time left in working hours on ${dayStr} (day ends at ${minutesToTime(dayEnd)})`;
          break;
        }

        if (nextSlot > simCursor) {
          simCursor = nextSlot;
          simConsecutive = 0;
        }

        const sessionEndMin = simCursor + sessionDuration;
        if (deadlineInfo.isViolated(sessionEndMin)) {
          failureReason = `Session would finish at ${minutesToTime(sessionEndMin)}, which is past the deadline (${deadlineInfo.label})`;
          if (deadlineInfo.isDeadlineOnDate) {
            cannotFitEver = true;
          }
          break;
        }

        const sessionStart = simCursor;
        const sessionEnd = sessionStart + sessionDuration;
        const sessionTitle = state.partsCount > 1
          ? `${task.title} (Part ${part.partIndex}/${state.partsCount})`
          : task.title;

        plannedSessions.push({
          id: `sched-${task.id}-${dayStr}-part-${part.partIndex}`,
          type: 'task',
          taskId: task.id,
          title: sessionTitle,
          parentTitle: task.title,
          category: task.category || 'personal',
          urgency: task.urgency || 'medium',
          partIndex: part.partIndex,
          totalParts: state.partsCount,
          date: dayStr,
          scheduledDate: dayStr,
          start: minutesToTime(sessionStart),
          end: minutesToTime(sessionEnd),
          startMin: sessionStart,
          endMin: sessionEnd,
          durationMinutes: sessionDuration,
          done: Boolean(task.done),
          subtasks: task.subtasks || task.suggestedSubtasks || [],
          schedulingTip: task.schedulingTip,
          aiGenerated: task.aiGenerated ?? false,
          deadline: task.deadline || null,
        });

        partsScheduledCount++;
        simCursor = sessionEnd;
        simConsecutive += sessionDuration;

        // In 'automatic' mode, insert restorative break after each focus session if before dayEnd
        if (breakBehavior === 'automatic' && simCursor < dayEnd) {
          simCursor = advanceThroughBlocked(simCursor);
          const isLongBreak = simConsecutive >= 90;
          const breakDuration = isLongBreak ? longBreakMinutes : shortBreakMinutes;
          const breakTitle = isLongBreak
            ? '🍃 Mindful Sloth Pause (Deep rest & stretch)'
            : '🍵 Gentle Break (Hydrate & rest your eyes)';

          const breakSlot = findNextAvailableSlot(simCursor, breakDuration, dayEnd);
          if (breakSlot === simCursor) {
            plannedSessions.push({
              id: `break-${dayStr}-${simCursor}`,
              type: 'break',
              title: breakTitle,
              date: dayStr,
              scheduledDate: dayStr,
              start: minutesToTime(simCursor),
              end: minutesToTime(simCursor + breakDuration),
              startMin: simCursor,
              endMin: simCursor + breakDuration,
              durationMinutes: breakDuration,
            });
            simCursor += breakDuration;
            if (isLongBreak) simConsecutive = 0;
          } else {
            simCursor = advanceThroughBlocked(simCursor);
            simConsecutive = 0;
          }
        }
      }

      // In 'after_task' mode, place a break only after all sessions of this task scheduled for today have completed,
      // NOT in the middle of a task's focus-session sequence
      if (breakBehavior === 'after_task' && partsScheduledCount > 0 && simCursor < dayEnd) {
        simCursor = advanceThroughBlocked(simCursor);
        const breakDuration = defaultBreakMinutes;
        const breakTitle = '🍵 Gentle Break (Hydrate & rest your eyes)';

        const breakSlot = findNextAvailableSlot(simCursor, breakDuration, dayEnd);
        if (breakSlot === simCursor) {
          plannedSessions.push({
            id: `break-${dayStr}-${simCursor}`,
            type: 'break',
            title: breakTitle,
            date: dayStr,
            scheduledDate: dayStr,
            start: minutesToTime(simCursor),
            end: minutesToTime(simCursor + breakDuration),
            startMin: simCursor,
            endMin: simCursor + breakDuration,
            durationMinutes: breakDuration,
          });
          simCursor += breakDuration;
          simConsecutive = 0;
        } else {
          simCursor = advanceThroughBlocked(simCursor);
          simConsecutive = 0;
        }
      }

      // If no sessions could be placed on this day
      if (plannedSessions.length === 0) {
        return {
          success: false,
          cannotFitEver,
          reason: failureReason || `Could not fit any sessions on ${dayStr}`,
          requestedMinutes: totalDuration,
          remainingUnscheduledMinutes: state.remainingParts.reduce((a, b) => a + b.durationMinutes, 0),
        };
      }

      // If we are on the only/last day or pinned date and deadline forbids future days,
      // verify whether all remaining parts must fit
      if (state.remainingParts.length > partsScheduledCount) {
        const hasFutureDays = horizonDays.indexOf(dayStr) < horizonDays.length - 1;
        if (!hasFutureDays && deadlineInfo.isDeadlineOnDate) {
          return {
            success: false,
            cannotFitEver: true,
            reason: failureReason || `Could not fit remaining sessions before deadline on ${dayStr}`,
            requestedMinutes: totalDuration,
            remainingUnscheduledMinutes: state.remainingParts.reduce((a, b) => a + b.durationMinutes, 0),
          };
        }
      }

      // Commit planned sessions to day timeline
      cursor = simCursor;
      consecutiveFocusMinutes = simConsecutive;
      daySchedule.push(...plannedSessions);

      const scheduledThisRun = state.remainingParts.splice(0, partsScheduledCount);
      state.scheduledParts.push(...scheduledThisRun);

      const fullyScheduled = state.remainingParts.length === 0;
      return {
        success: true,
        fullyScheduled,
        remainingMinutes: state.remainingParts.reduce((a, b) => a + b.durationMinutes, 0),
      };
    }

    // Step A: Schedule tasks pinned to this date
    const pinnedDayTasks = sortTasksForScheduling(pinnedByDay[dayStr] || [], new Date(dayStr + 'T00:00:00'));
    for (const task of pinnedDayTasks) {
      const res = tryScheduleTaskOnDay(task, true);
      if (!res.success) {
        overflowTasks.push({
          taskId: task.id,
          taskTitle: task.title,
          reason: res.reason || `Cannot fit on scheduled date ${dayStr}`,
          requestedMinutes: res.requestedMinutes,
          remainingUnscheduledMinutes: res.remainingUnscheduledMinutes,
        });
      } else {
        newlyScheduledTaskDates.set(task.id, dayStr);
        if (!res.fullyScheduled && horizonDays.indexOf(dayStr) < horizonDays.length - 1) {
          flexibleQueue.push(task);
        }
      }
    }

    // Step B: Fill remaining day capacity with flexible tasks (only for today or future dates)
    if (dayStr >= todayStr) {
      let i = 0;
      while (i < flexibleQueue.length) {
        const task = flexibleQueue[i];
        const res = tryScheduleTaskOnDay(task, false);
        if (res.success) {
          if (!newlyScheduledTaskDates.has(task.id)) {
            newlyScheduledTaskDates.set(task.id, dayStr);
          }
          if (res.fullyScheduled) {
            flexibleQueue.splice(i, 1);
          } else {
            // Task has remaining parts to place on future days in horizon
            i++;
          }
        } else {
          if (res.cannotFitEver) {
            overflowTasks.push({
              taskId: task.id,
              taskTitle: task.title,
              reason: res.reason || `Cannot fit before deadline`,
              requestedMinutes: res.requestedMinutes,
              remainingUnscheduledMinutes: res.remainingUnscheduledMinutes,
            });
            flexibleQueue.splice(i, 1);
          } else {
            // Leave in queue to attempt placing on next day
            i++;
          }
        }
      }
    }

    // Combine day items with routine blocks / blocked commitments, sort chronologically
    const allDayItems = [...daySchedule, ...dayTimelineEvents].sort((a, b) => a.startMin - b.startMin);
    allScheduleItems.push(...allDayItems);
  }

  // 5. Any tasks that could not fit across any day in the horizon
  const seenOverflowIds = new Set(overflowTasks.map((o) => o.taskId));
  for (const [taskId, state] of taskProgress.entries()) {
    if (state.remainingParts.length > 0 && !seenOverflowIds.has(taskId)) {
      const scheduledMins = state.scheduledParts.reduce((a, b) => a + b.durationMinutes, 0);
      const remainingMins = state.remainingParts.reduce((a, b) => a + b.durationMinutes, 0);
      const reason = scheduledMins > 0
        ? `Partially scheduled (${scheduledMins}/${state.totalDuration}m); remaining ${remainingMins}m could not fit within the selected horizon (${horizon})`
        : `Could not fit within available working hours across the selected horizon (${horizon})`;
      overflowTasks.push({
        taskId,
        taskTitle: state.task.title,
        reason,
        requestedMinutes: state.totalDuration,
        remainingUnscheduledMinutes: remainingMins,
      });
      seenOverflowIds.add(taskId);
    }
  }

  // Clean internal tracking fields (startMin, endMin)
  const cleanTimeline = allScheduleItems.map(({ startMin, endMin, ...item }) => item);

  // Update enrichedTasks so scheduled tasks carry their assigned calendar date
  const finalEnrichedTasks = tasks.map((t) => {
    if (newlyScheduledTaskDates.has(t.id)) {
      return {
        ...t,
        scheduledDate: newlyScheduledTaskDates.get(t.id),
      };
    }
    return t;
  });

  // Calculate metrics
  const totalFocusMinutes = cleanTimeline
    .filter((item) => item.type === 'task')
    .reduce((acc, curr) => acc + curr.durationMinutes, 0);

  const totalBreakMinutes = cleanTimeline
    .filter((item) => item.type === 'break')
    .reduce((acc, curr) => acc + curr.durationMinutes, 0);

  const totalRoutineMinutes = cleanTimeline
    .filter((item) => item.type === 'routine' || item.type === 'blocked')
    .reduce((acc, curr) => acc + curr.durationMinutes, 0);

  const scheduledTaskIds = new Set(
    cleanTimeline.filter((item) => item.type === 'task').map((item) => item.taskId)
  );

  return {
    success: true,
    horizon,
    startDate: firstHorizonDay,
    endDate: lastHorizonDay,
    dayWindow: {
      start: minutesToTime(startHour * 60),
      end: minutesToTime(endHour * 60),
      totalAvailableMinutes: (endHour - startHour) * 60,
    },
    settings: {
      focusSessionMinMinutes: minSessionMinutes,
      focusSessionMaxMinutes: maxSessionMinutes,
      breakBehavior,
      defaultBreakMinutes,
    },
    routineSettings,
    metrics: {
      totalTasks: tasks.length,
      scheduledTasksCount: scheduledTaskIds.size,
      completedTasksCount: completedTasks.length,
      overflowTasksCount: overflowTasks.length,
      totalFocusMinutes,
      totalBreakMinutes,
      totalRoutineMinutes,
    },
    schedule: cleanTimeline,
    overflowTasks,
    completedTasks,
    enrichedTasks: finalEnrichedTasks,
  };
}

export const createSchedule = createDailySchedule;
