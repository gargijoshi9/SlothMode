// server/scheduler.js
// Deterministic daily scheduler adhering to the Hacktoberfest "Slow and Steady" theme.
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
 * Parse a deadline string (ISO timestamp, date string, or HH:mm) into minutes from start of day,
 * or null if no valid deadline is provided.
 */
export function parseDeadlineToMinutes(deadlineStr, referenceDate = new Date()) {
  if (!deadlineStr) return null;

  // Direct HH:mm match
  if (/^\d{1,2}:\d{2}$/.test(deadlineStr.trim())) {
    return timeToMinutes(deadlineStr.trim());
  }

  const d = new Date(deadlineStr);
  if (isNaN(d.getTime())) return null;

  // If deadline is on the same day as referenceDate, return deadline time in minutes
  const isSameDay =
    d.getFullYear() === referenceDate.getFullYear() &&
    d.getMonth() === referenceDate.getMonth() &&
    d.getDate() === referenceDate.getDate();

  if (isSameDay) {
    return d.getHours() * 60 + d.getMinutes();
  }

  // If deadline is in the past
  if (d < referenceDate) {
    return 0; // Already past
  }

  // If deadline is on a future day, deadline is after today's working window
  return 24 * 60;
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
 * Create a deterministic daily schedule.
 *
 * @param {Array} tasks - List of task objects
 * @param {Object} options - Scheduling preferences
 * @returns {Object} Complete schedule result with timeline items, metrics, and overflow report
 */
export function createDailySchedule(tasks = [], options = {}) {
  const referenceDate = options.currentDate ? new Date(options.currentDate) : new Date();

  // Working window (in minutes from midnight)
  const startHour = Number(options.startHour ?? 9); // default 9:00 AM
  const endHour = Number(options.endHour ?? 18); // default 6:00 PM
  let dayStart = startHour * 60;
  const dayEnd = endHour * 60;

  // If scheduling later in the day, start from current time rounded up to nearest 5 mins
  if (options.useCurrentTimeAsStart) {
    const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
    const roundedNow = Math.ceil(nowMinutes / 5) * 5;
    if (roundedNow > dayStart && roundedNow < dayEnd) {
      dayStart = roundedNow;
    }
  }

  // Max session length before splitting (default 45 mins - gentle productivity)
  const maxSessionMinutes = Number(options.maxSessionMinutes ?? 45);
  const shortBreakMinutes = Number(options.shortBreakMinutes ?? 10);
  const longBreakMinutes = Number(options.longBreakMinutes ?? 20);

  // Blocked commitments (e.g. Lunch 13:00 - 13:45)
  const rawBlocked = options.blockedCommitments || [
    { title: 'Lunch & mindful recharge', start: '13:00', end: '13:45' },
  ];

  const blockedIntervals = rawBlocked
    .map((b) => ({
      title: b.title,
      start: timeToMinutes(b.start),
      end: timeToMinutes(b.end),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  // Separate completed and pending tasks
  const completedTasks = tasks.filter((t) => t.done);
  const pendingTasks = tasks.filter((t) => !t.done);

  // Sort pending tasks
  const sortedPending = sortTasksForScheduling(pendingTasks, referenceDate);

  const schedule = [];
  const overflowTasks = [];

  // Track cursor in minutes from midnight
  let cursor = dayStart;
  let consecutiveFocusMinutes = 0;

  // Insert any blocked intervals that occur before dayStart or record them
  // We'll advance cursor through time, honoring blocked commitments
  function advanceThroughBlocked(currentCursor) {
    let nextCursor = currentCursor;
    for (const block of blockedIntervals) {
      if (nextCursor >= block.start && nextCursor < block.end) {
        // We collided with a blocked interval
        nextCursor = block.end;
      }
    }
    return nextCursor;
  }

  // First pass: add blocked commitments to the schedule timeline if within working day
  const timelineEvents = [];
  for (const block of blockedIntervals) {
    if (block.end > dayStart && block.start < dayEnd) {
      const actualStart = Math.max(dayStart, block.start);
      const actualEnd = Math.min(dayEnd, block.end);
      timelineEvents.push({
        id: `blocked-${block.start}`,
        type: 'blocked',
        title: block.title,
        start: minutesToTime(actualStart),
        end: minutesToTime(actualEnd),
        durationMinutes: actualEnd - actualStart,
        startMin: actualStart,
        endMin: actualEnd,
      });
    }
  }

  // Iterate over sorted pending tasks
  for (const task of sortedPending) {
    const rawDuration = Number(task.duration || task.estimatedMinutes || 30);
    const totalDuration = Math.min(480, Math.max(5, rawDuration));
    const deadlineMin = parseDeadlineToMinutes(task.deadline, referenceDate);

    // Split into sessions if exceeds maxSessionMinutes
    const partsCount = Math.ceil(totalDuration / maxSessionMinutes);
    const sessionDurations = [];
    let remaining = totalDuration;
    for (let i = 0; i < partsCount; i++) {
      const dur = Math.min(remaining, maxSessionMinutes);
      sessionDurations.push(dur);
      remaining -= dur;
    }

    let taskFullyScheduled = true;
    const taskSessions = [];

    for (let partIdx = 0; partIdx < sessionDurations.length; partIdx++) {
      const sessionDuration = sessionDurations[partIdx];

      // Jump over any blocked interval
      cursor = advanceThroughBlocked(cursor);

      // Check if session can fit before next blocked interval or end of day
      let nextBlockedStart = dayEnd;
      for (const block of blockedIntervals) {
        if (block.start > cursor && block.start < nextBlockedStart) {
          nextBlockedStart = block.start;
        }
      }

      const availableSpan = nextBlockedStart - cursor;

      if (availableSpan < sessionDuration || cursor + sessionDuration > dayEnd) {
        // Cannot fit in current slot; try jumping past the next blocked interval if before dayEnd
        if (nextBlockedStart < dayEnd) {
          cursor = advanceThroughBlocked(nextBlockedStart);
          const postBlockedSpan = dayEnd - cursor;
          if (postBlockedSpan < sessionDuration || cursor + sessionDuration > dayEnd) {
            taskFullyScheduled = false;
            overflowTasks.push({
              taskId: task.id,
              taskTitle: task.title,
              reason: `Not enough time left in today's working hours (day ends at ${minutesToTime(dayEnd)})`,
              requestedMinutes: totalDuration,
              remainingUnscheduledMinutes: sessionDurations
                .slice(partIdx)
                .reduce((a, b) => a + b, 0),
            });
            break;
          }
        } else {
          // Exceeds dayEnd
          taskFullyScheduled = false;
          overflowTasks.push({
            taskId: task.id,
            taskTitle: task.title,
            reason: `Exceeds available working hours (ends at ${minutesToTime(dayEnd)})`,
            requestedMinutes: totalDuration,
            remainingUnscheduledMinutes: sessionDurations
              .slice(partIdx)
              .reduce((a, b) => a + b, 0),
          });
          break;
        }
      }

      // Check deadline constraint
      const sessionEndMin = cursor + sessionDuration;
      if (deadlineMin !== null && sessionEndMin > deadlineMin) {
        taskFullyScheduled = false;
        overflowTasks.push({
          taskId: task.id,
          taskTitle: task.title,
          reason: `Session would finish at ${minutesToTime(sessionEndMin)}, which is past the deadline (${minutesToTime(deadlineMin)})`,
          requestedMinutes: totalDuration,
          remainingUnscheduledMinutes: sessionDurations
            .slice(partIdx)
            .reduce((a, b) => a + b, 0),
        });
        break;
      }

      // Schedule this focus session
      const sessionStart = cursor;
      const sessionEnd = sessionStart + sessionDuration;

      const sessionTitle =
        partsCount > 1
          ? `${task.title} (Part ${partIdx + 1}/${partsCount})`
          : task.title;

      taskSessions.push({
        id: `sched-${task.id}-part-${partIdx + 1}`,
        type: 'task',
        taskId: task.id,
        title: sessionTitle,
        parentTitle: task.title,
        category: task.category || 'personal',
        urgency: task.urgency || 'medium',
        partIndex: partIdx + 1,
        totalParts: partsCount,
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

      cursor = sessionEnd;
      consecutiveFocusMinutes += sessionDuration;

      // Add gentle break between sessions if before dayEnd
      if (cursor < dayEnd) {
        cursor = advanceThroughBlocked(cursor);

        // Decide break length: longer break if worked >= 90 mins, else short break
        const isLongBreak = consecutiveFocusMinutes >= 90;
        const breakDuration = isLongBreak ? longBreakMinutes : shortBreakMinutes;
        const breakTitle = isLongBreak
          ? '🍃 Mindful Sloth Pause (Deep rest & stretch)'
          : '🍵 Gentle Break (Hydrate & rest your eyes)';

        if (cursor + breakDuration <= dayEnd) {
          taskSessions.push({
            id: `break-${cursor}`,
            type: 'break',
            title: breakTitle,
            start: minutesToTime(cursor),
            end: minutesToTime(cursor + breakDuration),
            startMin: cursor,
            endMin: cursor + breakDuration,
            durationMinutes: breakDuration,
          });
          cursor += breakDuration;
          if (isLongBreak) consecutiveFocusMinutes = 0;
        }
      }
    }

    if (taskFullyScheduled) {
      schedule.push(...taskSessions);
    }
  }

  // Combine task/break sessions and blocked commitments, then sort chronologically
  const allTimelineItems = [...schedule, ...timelineEvents].sort(
    (a, b) => a.startMin - b.startMin
  );

  // Clean internal tracking fields (startMin, endMin)
  const cleanTimeline = allTimelineItems.map(({ startMin, endMin, ...item }) => item);

  // Calculate statistics
  const totalFocusMinutes = cleanTimeline
    .filter((item) => item.type === 'task')
    .reduce((acc, curr) => acc + curr.durationMinutes, 0);

  const totalBreakMinutes = cleanTimeline
    .filter((item) => item.type === 'break')
    .reduce((acc, curr) => acc + curr.durationMinutes, 0);

  const scheduledTaskIds = new Set(
    cleanTimeline.filter((item) => item.type === 'task').map((item) => item.taskId)
  );

  return {
    success: true,
    dayWindow: {
      start: minutesToTime(dayStart),
      end: minutesToTime(dayEnd),
      totalAvailableMinutes: dayEnd - dayStart,
    },
    metrics: {
      totalTasks: tasks.length,
      scheduledTasksCount: scheduledTaskIds.size,
      completedTasksCount: completedTasks.length,
      overflowTasksCount: overflowTasks.length,
      totalFocusMinutes,
      totalBreakMinutes,
    },
    schedule: cleanTimeline,
    overflowTasks,
    completedTasks,
  };
}
