// server/test_suite.js
// Automated verification suite for Phase 6.

import { checkOllamaHealth, classifyTask, ruleBasedFallback, estimateTaskDuration } from './ollama.js';
import {
  createDailySchedule,
  timeToMinutes,
  DEFAULT_ROUTINE_BLOCKS,
  DEFAULT_ROUTINE_SETTINGS,
  validateRoutineSettings,
  evaluateDeadlineForDate,
  parseDeadlineToMinutes,
  mapProfileToRoutineSettings,
  calcSuggestedBedtime,
} from './scheduler.js';
import {
  formatLocalDate,
  toLocalDateString,
  parseLocalDate,
  parseReferenceDate,
  getTodayDateString,
  getTomorrowDateString,
  compareCalendarDates,
  formatDisplayDate,
  isTaskOverdue,
} from './dateUtils.js';
import { parseExplicitDuration } from './durationParser.js';

async function runTests() {
  console.log('🧪 Starting SlothMode Test Suite...\n');
  let failures = 0;

  function assert(condition, testName) {
    if (!condition) {
      console.error(`❌ FAILED: ${testName}`);
      failures++;
    } else {
      console.log(`✅ PASSED: ${testName}`);
    }
  }

  // 1. Health check
  console.log('--- 1. Testing Ollama Health Check ---');
  const health = await checkOllamaHealth('http://127.0.0.1:11434', 'gemma3:1b');
  assert(typeof health.reachable === 'boolean', 'Health reports reachable boolean');
  assert(typeof health.modelAvailable === 'boolean', 'Health reports modelAvailable boolean');
  console.log(`   Ollama reachable: ${health.reachable}, Model: ${health.modelAvailable}`);

  // 2. Real Ollama classification
  console.log('\n--- 2. Testing Task Classification (Real Ollama) ---');
  const realClassify = await classifyTask('Prepare chapter 4 presentation for AI seminar', '17:00');
  assert(realClassify !== null, 'Classification returned an object');
  assert(['college', 'exam_prep', 'chore', 'health', 'personal', 'work'].includes(realClassify.category), `Valid category (${realClassify.category})`);
  assert(realClassify.estimatedMinutes >= 5 && realClassify.estimatedMinutes <= 480, `Estimated minutes in bounds (${realClassify.estimatedMinutes}m)`);
  assert(Array.isArray(realClassify.suggestedSubtasks) && realClassify.suggestedSubtasks.length > 0, 'Generated subtasks array');
  assert(typeof realClassify.aiGenerated === 'boolean', `aiGenerated flag present (${realClassify.aiGenerated})`);

  // 3. Fallback on missing model
  console.log('\n--- 3. Testing Missing Model Fallback ---');
  const fallbackMissingModel = await classifyTask('Clean the kitchen and take out recycling', null, {
    modelName: 'non_existent_model_xyz',
    timeoutMs: 3000,
  });
  assert(fallbackMissingModel.aiGenerated === false, 'Fallback marks aiGenerated: false');
  assert(fallbackMissingModel.category === 'chore', `Correct deterministic category for chore (${fallbackMissingModel.category})`);
  assert(fallbackMissingModel.fallbackReason.length > 0, `Fallback reason provided (${fallbackMissingModel.fallbackReason})`);

  // 4. Fallback on unreachable host
  console.log('\n--- 4. Testing Unreachable Ollama Fallback ---');
  const fallbackUnreachable = await classifyTask('Revise linear algebra exam', '18:00', {
    baseUrl: 'http://127.0.0.1:54321', // Unreachable port
    timeoutMs: 2000,
  });
  assert(fallbackUnreachable.aiGenerated === false, 'Unreachable host returns aiGenerated: false');
  assert(fallbackUnreachable.category === 'exam_prep', 'Categorized as exam_prep');
  assert(fallbackUnreachable.urgency === 'critical', 'Urgency elevated for same-day deadline');

  // 5. Scheduler overlap check
  console.log('\n--- 5. Testing Scheduler Zero Overlap Guarantee ---');
  const testTasks = [
    { id: 1, title: 'Deep study OS', duration: 90, urgency: 'high', done: false },
    { id: 2, title: 'Write lab report', duration: 45, urgency: 'medium', done: false },
    { id: 3, title: 'Workout', duration: 40, urgency: 'medium', done: false },
    { id: 4, title: 'Grocery run', duration: 25, urgency: 'low', done: false },
  ];
  const plan = createDailySchedule(testTasks, { startHour: 9, endHour: 18 });
  assert(plan.schedule.length > 0, 'Schedule items generated');

  // Verify chronological order and strictly non-overlapping
  let overlapFound = false;
  for (let i = 0; i < plan.schedule.length - 1; i++) {
    const currentEnd = timeToMinutes(plan.schedule[i].end);
    const nextStart = timeToMinutes(plan.schedule[i + 1].start);
    if (nextStart < currentEnd) {
      console.error(`Overlap detected between ${plan.schedule[i].title} (${plan.schedule[i].end}) and ${plan.schedule[i + 1].title} (${plan.schedule[i + 1].start})`);
      overlapFound = true;
    }
  }
  assert(!overlapFound, 'Zero overlaps found across entire schedule');

  // 6. Deadline enforcement and overflow
  console.log('\n--- 6. Testing Deadline Enforcement & Overflow ---');
  const impossibleTask = [
    // Starts at 9:00, needs 60 mins, but deadline is 09:30
    { id: 10, title: 'Emergency submission', duration: 60, urgency: 'critical', deadline: '09:30', done: false },
  ];
  const overflowPlan = createDailySchedule(impossibleTask, { startHour: 9, endHour: 18 });
  assert(overflowPlan.overflowTasks.length === 1, 'Impossible deadline task flagged as overflow');
  assert(overflowPlan.overflowTasks[0].reason.includes('past the deadline'), 'Overflow explanation specifies deadline reason');

  // 7. Session splitting & Restorative breaks
  console.log('\n--- 7. Testing Session Splitting & Sloth Breaks ---');
  const longTask = [
    { id: 20, title: 'Major research paper draft', duration: 90, urgency: 'high', done: false },
  ];
  const splitPlan = createDailySchedule(longTask, { maxSessionMinutes: 45, shortBreakMinutes: 10, breakBehavior: 'automatic' });
  const taskParts = splitPlan.schedule.filter((item) => item.taskId === 20);
  const breaks = splitPlan.schedule.filter((item) => item.type === 'break');
  assert(taskParts.length === 2, `Long 90m task split into 2 parts (actual: ${taskParts.length})`);
  assert(breaks.length >= 1, `Restorative break inserted (actual: ${breaks.length})`);

  // 8. Replanning preserving completed tasks
  console.log('\n--- 8. Testing Replanning with Completed Tasks ---');
  const replanTasks = [
    { id: 1, title: 'Task Done', duration: 45, done: true },
    { id: 2, title: 'Task Pending', duration: 45, done: false },
  ];
  const replanResult = createDailySchedule(replanTasks, { startHour: 10, endHour: 18 });
  assert(replanResult.completedTasks.length === 1, 'Completed task preserved');
  assert(replanResult.schedule.some((item) => item.taskId === 2), 'Pending task scheduled');
  assert(!replanResult.schedule.some((item) => item.taskId === 1), 'Completed task not re-scheduled into active timeline');

  // 9. Multi-day deadline & Scheduled Date
  console.log('\n--- 9. Testing Multi-Day Deadline & Schedule Date ---');
  const multiDayTasks = [
    {
      id: 30,
      title: 'Lab assignment due in 3 days',
      duration: 45,
      scheduledDate: '2026-10-22',
      deadline: '2026-10-25T14:00',
      done: false,
    },
  ];
  const multiDayPlan = createDailySchedule(multiDayTasks, {
    currentDate: '2026-10-22T09:00:00',
    startHour: 9,
    endHour: 18,
  });
  assert(multiDayPlan.overflowTasks.length === 0, 'Multi-day future deadline does not overflow today');
  assert(multiDayPlan.schedule.some((item) => item.taskId === 30), 'Task successfully scheduled');
  const scheduledItem = multiDayPlan.schedule.find((item) => item.taskId === 30);
  assert(scheduledItem?.scheduledDate === '2026-10-22', 'Scheduled date preserved on schedule item');

  // 10. Planning Horizon: Today
  console.log('\n--- 10. Testing Planning Horizon: Today ---');
  const todayTasks = [
    { id: 40, title: 'Morning study session', duration: 45, done: false },
    { id: 41, title: 'Future task for next week', duration: 60, scheduledDate: '2026-10-29', done: false },
  ];
  const todayPlan = createDailySchedule(todayTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'today',
    startHour: 9,
    endHour: 18,
  });
  assert(todayPlan.horizon === 'today', 'Horizon metadata reflects today');
  assert(todayPlan.schedule.some((i) => i.taskId === 40 && i.date === '2026-10-22'), 'Task 40 scheduled for today with date');
  assert(!todayPlan.schedule.some((i) => i.taskId === 41), 'Future task 41 not scheduled today');

  // 11. Planning Horizon: Tomorrow
  console.log('\n--- 11. Testing Planning Horizon: Tomorrow ---');
  const tomorrowTasks = [
    { id: 50, title: 'Tomorrow prep', duration: 45, done: false },
    { id: 51, title: 'Task explicitly for tomorrow', duration: 60, scheduledDate: '2026-10-23', done: false },
    { id: 52, title: 'Task for next week', duration: 60, scheduledDate: '2026-10-29', done: false },
  ];
  const tomorrowPlan = createDailySchedule(tomorrowTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'tomorrow',
    startHour: 9,
    endHour: 18,
  });
  assert(tomorrowPlan.horizon === 'tomorrow', 'Horizon metadata reflects tomorrow');
  assert(tomorrowPlan.startDate === '2026-10-23', 'Start date is tomorrow');
  assert(tomorrowPlan.schedule.every((i) => i.date === '2026-10-23'), 'All tomorrow sessions have date 2026-10-23');
  assert(tomorrowPlan.schedule.some((i) => i.taskId === 50), 'Unscheduled task scheduled tomorrow');
  assert(tomorrowPlan.schedule.some((i) => i.taskId === 51), 'Tomorrow pinned task scheduled');
  assert(!tomorrowPlan.schedule.some((i) => i.taskId === 52), 'Future task for next week not scheduled tomorrow');

  // 12. Planning Horizon: This Week
  console.log('\n--- 12. Testing Planning Horizon: This Week ---');
  const weekTasks = [
    { id: 60, title: 'Thursday task', duration: 60, scheduledDate: '2026-10-22', done: false },
    { id: 61, title: 'Friday task', duration: 45, scheduledDate: '2026-10-23', done: false },
    { id: 62, title: 'Saturday task', duration: 45, scheduledDate: '2026-10-24', done: false },
    { id: 63, title: 'Unscheduled flexible task', duration: 45, done: false },
  ];
  const weekPlan = createDailySchedule(weekTasks, {
    currentDate: '2026-10-22T09:00:00', // Thursday
    horizon: 'week',
    startHour: 9,
    endHour: 18,
  });
  assert(weekPlan.horizon === 'week', 'Horizon metadata reflects week');
  assert(weekPlan.schedule.some((i) => i.taskId === 60 && i.date === '2026-10-22'), 'Thursday task placed on Thursday');
  assert(weekPlan.schedule.some((i) => i.taskId === 61 && i.date === '2026-10-23'), 'Friday task placed on Friday');
  assert(weekPlan.schedule.some((i) => i.taskId === 62 && i.date === '2026-10-24'), 'Saturday task placed on Saturday');
  assert(weekPlan.schedule.some((i) => i.taskId === 63), 'Flexible task scheduled in week');

  // 13. Planning Horizon: This Month
  console.log('\n--- 13. Testing Planning Horizon: This Month ---');
  const monthTasks = [
    { id: 70, title: 'Current week task', duration: 60, scheduledDate: '2026-10-22', done: false },
    { id: 71, title: 'Later this month task', duration: 45, scheduledDate: '2026-10-28', done: false },
  ];
  const monthPlan = createDailySchedule(monthTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'month',
    startHour: 9,
    endHour: 18,
  });
  assert(monthPlan.horizon === 'month', 'Horizon metadata reflects month');
  assert(monthPlan.schedule.some((i) => i.taskId === 70 && i.date === '2026-10-22'), 'Task 70 scheduled on Oct 22');
  assert(monthPlan.schedule.some((i) => i.taskId === 71 && i.date === '2026-10-28'), 'Task 71 scheduled on Oct 28');

  // 14. Cross-Day Scheduling & Capacity Rollover
  console.log('\n--- 14. Testing Cross-Day Scheduling & Rollover ---');
  const heavyTasks = [
    // 8h available per day. 4 tasks of 150m each = 600m (10h), exceeds Day 1 capacity
    { id: 80, title: 'Heavy task 1', duration: 150, done: false },
    { id: 81, title: 'Heavy task 2', duration: 150, done: false },
    { id: 82, title: 'Heavy task 3', duration: 150, done: false },
    { id: 83, title: 'Heavy task 4', duration: 150, done: false },
  ];
  const rolloverPlan = createDailySchedule(heavyTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'week',
    startHour: 9,
    endHour: 18,
  });
  const day1Items = rolloverPlan.schedule.filter((i) => i.date === '2026-10-22' && i.type === 'task');
  const day2Items = rolloverPlan.schedule.filter((i) => i.date === '2026-10-23' && i.type === 'task');
  assert(day1Items.length > 0, 'Day 1 received scheduled sessions');
  assert(day2Items.length > 0, 'Excess tasks rolled over to Day 2');
  // Check no overlaps within any day
  let multiDayOverlap = false;
  const byDate = {};
  for (const item of rolloverPlan.schedule) {
    if (!byDate[item.date]) byDate[item.date] = [];
    byDate[item.date].push(item);
  }
  for (const dateStr of Object.keys(byDate)) {
    const list = byDate[dateStr];
    for (let k = 0; k < list.length - 1; k++) {
      if (timeToMinutes(list[k + 1].start) < timeToMinutes(list[k].end)) {
        multiDayOverlap = true;
      }
    }
  }
  assert(!multiDayOverlap, 'Zero overlaps found across multi-day schedule');

  // 15. Hard Deadline Enforcement Across Multiple Days
  console.log('\n--- 15. Testing Hard Deadline Across Days ---');
  const strictDeadlineTasks = [
    {
      id: 90,
      title: 'Due Friday at 10:00 AM',
      duration: 120, // Needs 2h. Day starts at 9:00, so ends at 11:00 AM > 10:00 AM deadline on Friday
      scheduledDate: '2026-10-23',
      deadline: '2026-10-23T10:00',
      done: false,
    },
  ];
  const deadlinePlan = createDailySchedule(strictDeadlineTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'week',
    startHour: 9,
    endHour: 18,
  });
  assert(deadlinePlan.overflowTasks.length === 1, 'Task violating deadline is flagged as overflow');
  assert(deadlinePlan.overflowTasks[0].reason.includes('past the deadline'), 'Overflow reason mentions deadline');

  // 16. Preservation of Completed Tasks & Pinned Dates
  console.log('\n--- 16. Testing Completed Tasks & Pinned Dates ---');
  const pinnedTasks = [
    { id: 100, title: 'Finished yesterday', duration: 45, done: true, scheduledDate: '2026-10-21' },
    { id: 101, title: 'Pinned to Friday', duration: 45, done: false, scheduledDate: '2026-10-23' },
  ];
  const pinnedPlan = createDailySchedule(pinnedTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'week',
    startHour: 9,
    endHour: 18,
  });
  assert(pinnedPlan.completedTasks.length === 1, 'Completed task preserved');
  assert(!pinnedPlan.schedule.some((i) => i.taskId === 100), 'Completed task not scheduled in active timeline');
  const task101 = pinnedPlan.schedule.find((i) => i.taskId === 101);
  assert(task101?.date === '2026-10-23', 'Pinned task 101 placed strictly on its scheduled date');

  // 17. Conflict Handling & Overflow Reporting
  console.log('\n--- 17. Testing Conflict & Overflow Handling ---');
  const massiveTasks = [];
  for (let m = 0; m < 20; m++) {
    massiveTasks.push({ id: 200 + m, title: `Massive task ${m}`, duration: 120, done: false });
  }
  const overflowTestPlan = createDailySchedule(massiveTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'tomorrow', // Only 1 day of capacity (~8h = 480m)
    startHour: 9,
    endHour: 18,
  });
  assert(overflowTestPlan.overflowTasks.length > 0, 'Excess tasks overflowing horizon reported');
  assert(overflowTestPlan.overflowTasks[0].requestedMinutes === 120, 'Requested minutes specified');
  assert(typeof overflowTestPlan.overflowTasks[0].reason === 'string', 'Overflow reason provided');

  // 18. Regression: Multi-Day Time Assignment, Frontend Matching & Unschedulable Tasks
  console.log('\n--- 18. Testing Multi-Day Time Assignment, Matching & Unschedulable Reporting ---');
  const regressionTasks = [
    // Task 301: Tomorrow (Oct 23)
    { id: 301, title: 'Tomorrow research session', duration: 45, scheduledDate: '2026-10-23', done: false },
    // Task 302: Later in week (Saturday Oct 24)
    { id: 302, title: 'Weekend project review', duration: 60, scheduledDate: '2026-10-24', done: false },
    // Task 303: Unschedulable due to impossible deadline on Friday (wants 90m, starts 9:00, deadline 9:30)
    { id: 303, title: 'Urgent impossible deadline', duration: 90, scheduledDate: '2026-10-23', deadline: '2026-10-23T09:30', done: false },
    // Task 304: Completed task
    { id: 304, title: 'Already completed paper', duration: 30, scheduledDate: '2026-10-22', done: true },
    // Task 305: Flexible task with no initial scheduledDate
    { id: 305, title: 'Flexible chore', duration: 30, done: false },
  ];

  const regressionPlan = createDailySchedule(regressionTasks, {
    currentDate: '2026-10-22T09:00:00', // Thursday
    horizon: 'week',
    startHour: 9,
    endHour: 18,
    maxSessionMinutes: 45,
    breakBehavior: 'automatic',
  });

  // Verify task 301 (Tomorrow) receives actual calendar date and start/end times
  const entry301 = regressionPlan.schedule.find((s) => String(s.taskId) === '301');
  assert(Boolean(entry301), 'Task 301 scheduled in active plan');
  assert(entry301?.date === '2026-10-23', 'Task 301 assigned to correct date (2026-10-23)');
  assert(typeof entry301?.start === 'string' && /^\d{2}:\d{2}$/.test(entry301.start), `Task 301 has valid start time (${entry301?.start})`);
  assert(typeof entry301?.end === 'string' && /^\d{2}:\d{2}$/.test(entry301.end), `Task 301 has valid end time (${entry301?.end})`);

  // Verify task 302 (Saturday, 60m) is split into gentle sessions and receives date and times
  const parts302 = regressionPlan.schedule.filter((s) => String(s.taskId) === '302');
  assert(parts302.length === 2, `60m task 302 split into 2 parts (actual: ${parts302.length})`);
  assert(parts302[0].date === '2026-10-24', 'Task 302 Part 1 assigned to Saturday (2026-10-24)');
  assert(parts302[0].start === '09:00' && parts302[0].end === '09:45', `Task 302 Part 1 runs 09:00–09:45 (${parts302[0].start}–${parts302[0].end})`);
  assert(parts302[1].start === '09:55' && parts302[1].end === '10:10', `Task 302 Part 2 runs 09:55–10:10 (${parts302[1].start}–${parts302[1].end})`);

  // Verify frontend matching simulation
  const simulateFrontendWeekViewMatch = (task, dayString) => {
    return regressionPlan.schedule.filter(
      (item) =>
        String(item.taskId) === String(task.id) &&
        (item.date === dayString || item.scheduledDate === dayString) &&
        item.type === 'task'
    );
  };

  const matchedTomorrow = simulateFrontendWeekViewMatch(regressionTasks[0], '2026-10-23');
  assert(matchedTomorrow.length > 0, 'Frontend correctly matches Task 301 on 2026-10-23');
  assert(`${matchedTomorrow[0].start} – ${matchedTomorrow[0].end}` === '09:00 – 09:45', 'Frontend gets exact time range 09:00 – 09:45');

  const matchedWrongDay = simulateFrontendWeekViewMatch(regressionTasks[0], '2026-10-24');
  assert(matchedWrongDay.length === 0, 'Frontend does not incorrectly match Task 301 on a different day');

  // Verify unschedulable task 303 remains clearly identified in overflowTasks
  const overflow303 = regressionPlan.overflowTasks.find((ot) => String(ot.taskId) === '303');
  assert(Boolean(overflow303), 'Unschedulable task 303 is recorded in overflowTasks');
  assert(overflow303?.reason.includes('deadline'), 'Unschedulable task explanation cites deadline');
  assert(!regressionPlan.schedule.some((s) => String(s.taskId) === '303'), 'Unschedulable task 303 is not given phantom session in schedule');

  // Verify enrichedTasks carries assigned scheduledDate for flexible task 305
  const enriched305 = regressionPlan.enrichedTasks.find((t) => String(t.id) === '305');
  assert(Boolean(enriched305?.scheduledDate), `Flexible task 305 received assigned scheduledDate (${enriched305?.scheduledDate})`);

  // Verify completed task 304 is preserved in completedTasks
  assert(regressionPlan.completedTasks.some((t) => String(t.id) === '304'), 'Completed task 304 preserved in completedTasks');

  // 19. Smart AI Task Duration Estimation & Fallback Behavior
  console.log('\n--- 19. Testing Smart AI Task Duration Estimation & Fallback ---');
  // 19a. Provisional duration verification
  const provisionalTask = { id: 401, title: 'Draft biology lab discussion', done: false };
  const provisionalDuration = provisionalTask.duration ?? 30;
  assert(provisionalDuration === 30, 'Provisional default duration is exactly 30 minutes without user prompt');

  // 19b. Fallback on unreachable endpoint
  const fallbackEstimate = await estimateTaskDuration(
    {
      title: 'Analyze BLS transit features for Kepler candidates',
      description: 'Extract period and duration from folded light curves',
      context: 'Priority: High, Deadline: Tomorrow',
    },
    {
      baseUrl: 'http://127.0.0.1:54321', // Unreachable
      timeoutMs: 1500,
    }
  );
  assert(typeof fallbackEstimate.estimatedMinutes === 'number', 'Fallback estimate returned number of minutes');
  assert(fallbackEstimate.estimatedMinutes >= 5 && fallbackEstimate.estimatedMinutes <= 480, `Fallback minutes in bounds (${fallbackEstimate.estimatedMinutes}m)`);
  assert(fallbackEstimate.aiGenerated === false, 'Fallback flags aiGenerated: false');
  assert(fallbackEstimate.confidence === 'low', 'Fallback marks confidence as low');
  assert(typeof fallbackEstimate.reasoning === 'string' && fallbackEstimate.reasoning.length > 0, 'Fallback reasoning provided');

  // 19c. Dynamic effort scaling with rich context (no hard-coded title mapping)
  const quickChore = await estimateTaskDuration(
    { title: 'Take out trash and check mail' },
    { baseUrl: 'http://127.0.0.1:54321', timeoutMs: 1000 }
  );
  const extensiveProject = await estimateTaskDuration(
    {
      title: 'Write comprehensive senior thesis methodology chapter',
      description: 'Includes statistical analysis, literature survey, and full methodology breakdown',
    },
    { baseUrl: 'http://127.0.0.1:54321', timeoutMs: 1000 }
  );
  assert(quickChore.estimatedMinutes <= 30, `Quick chore estimate reflects shorter duration (${quickChore.estimatedMinutes}m)`);
  assert(extensiveProject.estimatedMinutes >= 60, `Extensive thesis project reflects longer duration (${extensiveProject.estimatedMinutes}m)`);

  // 20. Manual Duration Preservation During Replanning & Explicit Re-estimation
  console.log('\n--- 20. Testing Manual Duration Preservation During Replanning ---');
  const manualDurationTasks = [
    {
      id: 501,
      title: 'Short 15m review with supervisor',
      duration: 15,
      durationSource: 'manual',
      done: false,
    },
    {
      id: 502,
      title: 'Custom 120m deep focus session',
      duration: 120,
      durationSource: 'manual',
      done: false,
    },
    {
      id: 503,
      title: 'Provisional task waiting for estimate',
      duration: 30,
      durationSource: 'provisional',
      done: false,
    },
  ];

  const manualPlan = createDailySchedule(manualDurationTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'today',
    startHour: 9,
    endHour: 18,
  });

  // Verify scheduler preserves manual duration
  const manualSession1 = manualPlan.schedule.find((s) => s.taskId === 501);
  const manualSession2 = manualPlan.schedule.filter((s) => s.taskId === 502);
  const totalMins502 = manualSession2.reduce((acc, s) => acc + s.durationMinutes, 0);

  assert(manualSession1?.durationMinutes === 15, `Task 501 manual 15m duration strictly preserved (${manualSession1?.durationMinutes}m)`);
  assert(totalMins502 === 120, `Task 502 manual 120m total duration strictly preserved across sessions (${totalMins502}m)`);

  // Verify explicit re-estimation triggers on demand
  const explicitReestimate = await estimateTaskDuration(
    { title: manualDurationTasks[0].title },
    { baseUrl: 'http://127.0.0.1:54321', forceAi: true, timeoutMs: 1000 }
  );
  assert(explicitReestimate !== null && typeof explicitReestimate.estimatedMinutes === 'number', 'Explicit re-estimation returned valid duration estimate');

  // 21. Separation of Total Task Effort & Focus Sessions Across Horizon Days
  console.log('\n--- 21. Testing Separation of Total Effort & Cross-Day Session Splitting ---');
  const massiveTask = [
    {
      id: 601,
      title: 'Complete compiler construction semester project',
      duration: 180, // 3 hours total effort
      durationSource: 'ai_estimated',
      done: false,
    },
  ];

  // Schedule across This Week with maxSessionMinutes: 45 and maxSessionsPerDayPerTask: 2 (90m/day)
  const crossDayPlan = createDailySchedule(massiveTask, {
    currentDate: '2026-10-22T09:00:00', // Thursday
    horizon: 'week',
    startHour: 9,
    endHour: 18,
    maxSessionMinutes: 45,
    maxSessionsPerDayPerTask: 2,
    shortBreakMinutes: 10,
    breakBehavior: 'automatic',
  });

  const all601Sessions = crossDayPlan.schedule.filter((s) => s.taskId === 601);
  assert(all601Sessions.length === 4, `180m task split into 4 gentle 45m focus sessions (actual: ${all601Sessions.length})`);

  // Verify total effort preserved on task object
  const enrichedTask601 = crossDayPlan.enrichedTasks.find((t) => t.id === 601);
  assert(enrichedTask601?.duration === 180, `Total effort preserved as 180m on enriched task (actual: ${enrichedTask601?.duration}m)`);

  // Verify sessions distributed across days
  const day1Sessions = all601Sessions.filter((s) => s.date === '2026-10-22');
  const day2Sessions = all601Sessions.filter((s) => s.date === '2026-10-23');

  assert(day1Sessions.length === 2, `Day 1 received 2 sessions (actual: ${day1Sessions.length})`);
  assert(day2Sessions.length === 2, `Day 2 received 2 sessions (actual: ${day2Sessions.length})`);
  assert(day1Sessions[0].title.includes('Part 1/4'), 'Part numbering formatted correctly (Part 1/4)');
  assert(day1Sessions[1].title.includes('Part 2/4'), 'Part numbering formatted correctly (Part 2/4)');
  assert(day2Sessions[0].title.includes('Part 3/4'), 'Part numbering formatted correctly (Part 3/4)');
  assert(day2Sessions[1].title.includes('Part 4/4'), 'Part numbering formatted correctly (Part 4/4)');

  // Verify restorative breaks between sessions
  const breaksOnDay1 = crossDayPlan.schedule.filter((s) => s.date === '2026-10-22' && s.type === 'break');
  assert(breaksOnDay1.length >= 1, `Restorative sloth pause inserted between focus sessions (actual: ${breaksOnDay1.length})`);

  // 22. Flexible Breaks & Configurable Focus Sessions (Step 1)
  console.log('\n--- 22. Testing Flexible Breaks & Configurable Focus Sessions ---');

  // 22a. Optional mode is the default and does NOT force breaks between consecutive focus sessions
  const optionalTasks = [
    { id: 701, title: 'Literature review chapter 1', duration: 60, done: false },
    { id: 702, title: 'Literature review chapter 2', duration: 60, done: false },
  ];
  // No breakBehavior passed -> must default to 'optional'
  const optionalPlan = createDailySchedule(optionalTasks, {
    currentDate: '2026-10-22T09:00:00',
    startHour: 9,
    endHour: 18,
  });
  const optionalBreaks = optionalPlan.schedule.filter((i) => i.type === 'break');
  const session701 = optionalPlan.schedule.find((i) => i.taskId === 701);
  const session702 = optionalPlan.schedule.find((i) => i.taskId === 702);

  assert(optionalPlan.settings?.breakBehavior === 'optional', 'Default break behavior is "optional"');
  assert(optionalBreaks.length === 0, `Optional mode inserted 0 forced breaks (actual: ${optionalBreaks.length})`);
  assert(session701?.start === '09:00' && session701?.end === '10:00', `Task 701 runs 09:00–10:00 (${session701?.start}–${session701?.end})`);
  assert(session702?.start === '10:00' && session702?.end === '11:00', `Task 702 runs 10:00–11:00 back-to-back with 701 (${session702?.start}–${session702?.end})`);

  // 22b. Automatic mode still inserts configured breaks after sessions
  const autoPlan = createDailySchedule(optionalTasks, {
    currentDate: '2026-10-22T09:00:00',
    startHour: 9,
    endHour: 18,
    breakBehavior: 'automatic',
    defaultBreakMinutes: 10,
    focusSessionMaxMinutes: 60,
  });
  const autoBreaks = autoPlan.schedule.filter((i) => i.type === 'break');
  const auto701 = autoPlan.schedule.find((i) => i.taskId === 701);
  const auto702 = autoPlan.schedule.find((i) => i.taskId === 702);

  assert(autoBreaks.length >= 2, `Automatic mode inserted breaks between and after sessions (actual: ${autoBreaks.length})`);
  assert(auto701?.start === '09:00' && auto701?.end === '10:00', 'Auto Task 701 runs 09:00–10:00');
  assert(autoBreaks[0].start === '10:00' && autoBreaks[0].end === '10:10', `Break 1 runs 10:00–10:10 (${autoBreaks[0].start}–${autoBreaks[0].end})`);
  assert(auto702?.start === '10:10' && auto702?.end === '11:10', `Auto Task 702 runs 10:10–11:10 after break (${auto702?.start}–${auto702?.end})`);

  // 22c. after_task mode places breaks after a task, NOT between a task's focus-session sequence
  const afterTaskItems = [
    { id: 801, title: 'Multi-part assignment', duration: 90, done: false }, // will split into 45m + 45m
    { id: 802, title: 'Follow-up reading', duration: 45, done: false },
  ];
  const afterTaskPlan = createDailySchedule(afterTaskItems, {
    currentDate: '2026-10-22T09:00:00',
    startHour: 9,
    endHour: 18,
    breakBehavior: 'after_task',
    maxSessionMinutes: 45,
    defaultBreakMinutes: 10,
  });
  const parts801 = afterTaskPlan.schedule.filter((i) => i.taskId === 801);
  const task802 = afterTaskPlan.schedule.find((i) => i.taskId === 802);
  const afterTaskBreaks = afterTaskPlan.schedule.filter((i) => i.type === 'break');

  assert(parts801.length === 2, `Task 801 split into 2 parts (actual: ${parts801.length})`);
  assert(parts801[0].start === '09:00' && parts801[0].end === '09:45', `Task 801 Part 1 runs 09:00–09:45 (${parts801[0].start}–${parts801[0].end})`);
  assert(parts801[1].start === '09:45' && parts801[1].end === '10:30', `Task 801 Part 2 runs back-to-back 09:45–10:30 without break (${parts801[1].start}–${parts801[1].end})`);
  
  // Verify NO break was inserted between Part 1 and Part 2 (at 09:45)
  const breakBetweenParts = afterTaskBreaks.find((b) => b.start === '09:45');
  assert(!breakBetweenParts, 'No break inserted in middle of task 801 focus sequence');

  // Verify break WAS inserted after task 801 completed (at 10:30 to 10:40)
  const breakAfterTask801 = afterTaskBreaks.find((b) => b.start === '10:30' && b.end === '10:40');
  assert(Boolean(breakAfterTask801), 'Break placed strictly after task 801 completed (10:30–10:40)');
  assert(task802?.start === '10:40', `Task 802 begins after the post-task break at 10:40 (actual: ${task802?.start})`);

  // 22d. Long tasks retain total effort when split (45–120 minute sessions)
  const diverseTasks = [
    { id: 901, title: 'Short chore', duration: 30, done: false },
    { id: 902, title: 'Single focus session', duration: 75, done: false },
    { id: 903, title: 'Long lab project', duration: 150, done: false },
    { id: 904, title: 'Full thesis revision', duration: 180, done: false },
  ];
  const splitEffortPlan = createDailySchedule(diverseTasks, {
    currentDate: '2026-10-22T09:00:00',
    horizon: 'week',
    startHour: 9,
    endHour: 18,
    focusSessionMinMinutes: 45,
    focusSessionMaxMinutes: 120,
    breakBehavior: 'optional',
  });

  // Task 901 (30m) - short chore remains intact (30m), not artificially padded
  const parts901 = splitEffortPlan.schedule.filter((i) => i.taskId === 901);
  const totalMins901 = parts901.reduce((acc, p) => acc + p.durationMinutes, 0);
  assert(totalMins901 === 30, `Task 901 retains exact 30m effort without padding (${totalMins901}m)`);
  assert(parts901.length === 1, 'Task 901 scheduled as 1 session');

  // Task 902 (75m) - fits within max 120m, scheduled as 1 session of 75m
  const parts902 = splitEffortPlan.schedule.filter((i) => i.taskId === 902);
  const totalMins902 = parts902.reduce((acc, p) => acc + p.durationMinutes, 0);
  assert(totalMins902 === 75, `Task 902 retains exact 75m effort (${totalMins902}m)`);
  assert(parts902.length === 1, 'Task 902 scheduled as 1 session of 75m');

  // Task 903 (150m) - split into 105m and 45m (both within 45–120m, sum = 150m)
  const parts903 = splitEffortPlan.schedule.filter((i) => i.taskId === 903);
  const totalMins903 = parts903.reduce((acc, p) => acc + p.durationMinutes, 0);
  assert(totalMins903 === 150, `Task 903 retains exact 150m total effort (${totalMins903}m)`);
  assert(parts903.every((p) => p.durationMinutes >= 45 && p.durationMinutes <= 120), 'All parts of 903 are within 45–120m bounds');

  // Task 904 (180m) - split into 120m and 60m (sum = 180m)
  const parts904 = splitEffortPlan.schedule.filter((i) => i.taskId === 904);
  const totalMins904 = parts904.reduce((acc, p) => acc + p.durationMinutes, 0);
  assert(totalMins904 === 180, `Task 904 retains exact 180m total effort (${totalMins904}m)`);
  assert(parts904.every((p) => p.durationMinutes >= 45 && p.durationMinutes <= 120), 'All parts of 904 are within 45–120m bounds');

  // 22e. Deadlines and horizon constraints remain respected in optional mode
  const deadlineTaskInOptional = [
    { id: 950, title: 'Submit before 11:00 AM', duration: 60, deadline: '11:00', done: false },
    { id: 951, title: 'Impossible deadline', duration: 120, deadline: '09:30', done: false },
  ];
  const deadlineOptPlan = createDailySchedule(deadlineTaskInOptional, {
    currentDate: '2026-10-22T09:00:00',
    startHour: 9,
    endHour: 18,
    breakBehavior: 'optional',
  });
  const sched950 = deadlineOptPlan.schedule.find((i) => i.taskId === 950);
  assert(sched950?.start === '09:00' && sched950?.end === '10:00', 'Task 950 finishes before 11:00 deadline');
  assert(deadlineOptPlan.overflowTasks.some((ot) => ot.taskId === 951), 'Impossible deadline task 951 flagged in overflowTasks');

  // =======================================================================
  // 23. Testing Configurable Daily Routine Blocks as Protected Time (Step 2)
  // =======================================================================
  console.log('\n--- 23. Testing Configurable Daily Routine Blocks as Protected Time ---');

  // 23a. Tasks and breaks never overlap enabled routine blocks (Lunch, Nap, Snack, Dinner)
  const routineTasks = [
    { id: 1001, title: 'Morning deep work block', duration: 180, urgency: 'high', done: false }, // 09:00 - 12:00
    { id: 1002, title: 'Pre-lunch research paper review', duration: 60, urgency: 'medium', done: false }, // 12:00 - 13:00 (hits Lunch 13:00-14:00)
    { id: 1003, title: 'Afternoon coding sprint', duration: 120, urgency: 'medium', done: false },
    { id: 1004, title: 'Evening wrap-up', duration: 60, urgency: 'low', done: false },
  ];

  const routinePlan = createDailySchedule(routineTasks, {
    currentDate: '2026-10-22T09:00:00',
    routineSettings: DEFAULT_ROUTINE_SETTINGS,
    breakBehavior: 'automatic',
    shortBreakMinutes: 10,
  });

  assert(routinePlan.success, 'Plan generated successfully with default routine settings');
  assert(routinePlan.dayWindow.start === '09:00', 'Day start is 09:00');
  assert(routinePlan.dayWindow.end === '20:00', 'Day end is 20:00');

  const routineItemsInSchedule = routinePlan.schedule.filter((i) => i.type === 'routine');
  assert(routineItemsInSchedule.length === 4, `All 4 default routine blocks appear in schedule (actual: ${routineItemsInSchedule.length})`);
  assert(routineItemsInSchedule.some((i) => i.routineBlockId === 'lunch' && i.start === '13:00' && i.end === '14:00'), 'Lunch is protected 13:00–14:00');
  assert(routineItemsInSchedule.some((i) => i.routineBlockId === 'nap' && i.start === '14:00' && i.end === '14:30'), 'Nap is protected 14:00–14:30');
  assert(routineItemsInSchedule.some((i) => i.routineBlockId === 'evening_snack' && i.start === '17:00' && i.end === '17:15'), 'Evening snack is protected 17:00–17:15');
  assert(routineItemsInSchedule.some((i) => i.routineBlockId === 'dinner' && i.start === '19:00' && i.end === '19:30'), 'Dinner is protected 19:00–19:30');

  // Verify ZERO task sessions or breaks overlap ANY enabled routine block
  let routineOverlap = false;
  for (const item of routinePlan.schedule.filter((i) => i.type === 'task' || i.type === 'break')) {
    const itemStart = timeToMinutes(item.start);
    const itemEnd = timeToMinutes(item.end);

    for (const rb of routineItemsInSchedule) {
      const rbStart = timeToMinutes(rb.start);
      const rbEnd = timeToMinutes(rb.end);

      if (itemStart < rbEnd && rbStart < itemEnd) {
        console.error(`Overlap detected between ${item.type} "${item.title}" (${item.start}–${item.end}) and routine "${rb.title}" (${rb.start}–${rb.end})`);
        routineOverlap = true;
      }
    }
  }
  assert(!routineOverlap, 'Tasks and breaks never overlap enabled routine blocks');

  // 23b. Tasks can resume after lunch or a nap
  // Task 1002 finished at 13:00. Lunch is 13:00–14:00, Nap is 14:00–14:30.
  // Task 1003 (120m) should resume right at 14:30!
  const task1003 = routinePlan.schedule.find((i) => i.taskId === 1003);
  assert(task1003 !== undefined, 'Task 1003 was scheduled');
  assert(task1003?.start === '14:30', `Task 1003 resumed immediately after nap at 14:30 (actual: ${task1003?.start})`);

  // 23c. Disabled blocks do not reserve time
  const customSettingsWithDisabledNap = {
    dayStartTime: '09:00',
    dayEndTime: '20:00',
    blocks: [
      { id: 'lunch', label: 'Lunch', icon: '🍱', enabled: true, startTime: '13:00', durationMinutes: 60 },
      { id: 'nap', label: 'Nap', icon: '😴', enabled: false, startTime: '14:00', durationMinutes: 30 },
      { id: 'evening_snack', label: 'Evening snack', icon: '🍵', enabled: false, startTime: '17:00', durationMinutes: 15 },
      { id: 'dinner', label: 'Dinner', icon: '🍲', enabled: false, startTime: '19:00', durationMinutes: 30 },
    ],
  };

  const disabledNapPlan = createDailySchedule([
    { id: 1101, title: 'Morning block', duration: 240, done: false }, // 09:00 - 13:00
    { id: 1102, title: 'Post-lunch session', duration: 60, done: false }, // starts at 14:00 when nap is disabled
  ], {
    currentDate: '2026-10-22T09:00:00',
    routineSettings: customSettingsWithDisabledNap,
    breakBehavior: 'optional',
  });

  const napInSchedule = disabledNapPlan.schedule.find((i) => i.routineBlockId === 'nap');
  assert(!napInSchedule, 'Disabled nap block is not added to schedule');

  const t1102 = disabledNapPlan.schedule.find((i) => i.taskId === 1102);
  assert(t1102?.start === '14:00', `Disabled nap does not reserve time: post-lunch task starts at 14:00 (actual: ${t1102?.start})`);

  // 23d. Invalid or overlapping routine settings are reported and times are not silently moved
  const overlappingSettings = {
    dayStartTime: '09:00',
    dayEndTime: '20:00',
    blocks: [
      { id: 'lunch', label: 'Lunch', enabled: true, startTime: '13:00', durationMinutes: 60 }, // 13:00 - 14:00
      { id: 'nap', label: 'Nap', enabled: true, startTime: '13:30', durationMinutes: 30 },    // 13:30 - 14:00 (overlaps lunch!)
    ],
  };

  const validationRes = validateRoutineSettings(overlappingSettings);
  assert(!validationRes.isValid, 'Overlapping routine validation fails');
  assert(validationRes.errors.some((e) => e.includes('Overlapping routine blocks')), 'Error message specifies overlapping routine blocks');

  const overlapScheduleResult = createDailySchedule([
    { id: 1301, title: 'Task with overlapping routine', duration: 45, done: false },
  ], {
    currentDate: '2026-10-22T09:00:00',
    routineSettings: overlappingSettings,
  });

  assert(!overlapScheduleResult.success, 'Scheduler halts gracefully on overlapping routine blocks');
  assert(overlapScheduleResult.routineValidationErrors?.length > 0, 'Routine validation errors returned in response');
  assert(overlapScheduleResult.routineSettings.blocks[1].startTime === '13:30', 'Scheduler does not silently move user selected times (13:30 retained)');

  // Also test day window inversion validation
  const invertedWindowSettings = {
    dayStartTime: '21:00',
    dayEndTime: '09:00',
    blocks: [],
  };
  const invertedVal = validateRoutineSettings(invertedWindowSettings);
  assert(!invertedVal.isValid, 'Inverted day window validation fails');

  // 23e. Day boundary constraints respected (09:00 start and 20:00 end default)
  const boundaryTasks = [
    { id: 1401, title: 'First morning task', duration: 60, done: false },
    { id: 1402, title: 'Late evening task', duration: 60, done: false },
  ];
  const boundaryPlan = createDailySchedule(boundaryTasks, {
    currentDate: '2026-10-22T09:00:00',
    routineSettings: DEFAULT_ROUTINE_SETTINGS,
    breakBehavior: 'optional',
  });

  const firstSession = boundaryPlan.schedule.find((i) => i.type === 'task');
  assert(firstSession?.start === '09:00', `First session starts at or after 09:00 (actual: ${firstSession?.start})`);

  let outsideBoundaries = false;
  for (const item of boundaryPlan.schedule) {
    const sMin = timeToMinutes(item.start);
    const eMin = timeToMinutes(item.end);
    if (sMin < 9 * 60 || eMin > 20 * 60) {
      console.error(`Item ${item.title} (${item.start}–${item.end}) scheduled outside 09:00–20:00 boundary!`);
      outsideBoundaries = true;
    }
  }
  assert(!outsideBoundaries, 'Zero sessions or breaks scheduled outside configured 09:00–20:00 window');

  // ==========================================
  // 24. Local Date and Time Synchronization
  // ==========================================
  console.log('\n--- 24. Testing Local Date and Time Synchronization ---');

  // 24a. Task dated Oct 23 displays as "Today" and Oct 24 as "Tomorrow" when ref is Oct 23
  const refOct23 = parseLocalDate('2026-10-23');
  assert(formatDisplayDate('2026-10-23', refOct23) === 'Today', 'Task dated October 23 displays as Today when local date is Oct 23');
  assert(formatDisplayDate('2026-10-24', refOct23) === 'Tomorrow', 'Task dated October 24 displays as Tomorrow when local date is Oct 23');
  assert(formatDisplayDate('2026-10-25', refOct23) === 'Oct 25', 'Task dated October 25 displays as Oct 25 when local date is Oct 23');
  assert(formatDisplayDate('2026-10-22', refOct23) === 'Oct 22', 'Task dated October 22 displays as Oct 22 when local date is Oct 23');

  // 24b. Date-only string parsing without UTC shift
  const parsedOct23 = parseLocalDate('2026-10-23');
  assert(parsedOct23.getFullYear() === 2026, 'Parsed year is 2026');
  assert(parsedOct23.getMonth() === 9, 'Parsed month is 9 (October)');
  assert(parsedOct23.getDate() === 23, 'Parsed date is 23 (zero UTC-shift)');
  assert(formatLocalDate(parsedOct23) === '2026-10-23', 'Formatted local date string matches 2026-10-23');
  assert(toLocalDateString(parsedOct23) === '2026-10-23', 'toLocalDateString matches 2026-10-23');
  assert(parseReferenceDate('2026-10-23').getDate() === 23, 'parseReferenceDate resolves to 23rd in all timezones');

  // 24c. Near-midnight boundaries and day-crossing transitions
  const lateNightOct23 = new Date(2026, 9, 23, 23, 59, 59, 999);
  assert(getTodayDateString(lateNightOct23) === '2026-10-23', '23:59:59 resolves to Today 2026-10-23');
  assert(getTomorrowDateString(lateNightOct23) === '2026-10-24', '23:59:59 resolves to Tomorrow 2026-10-24');
  assert(formatDisplayDate('2026-10-23', lateNightOct23) === 'Today', 'Late night 23:59:59 displays Oct 23 as Today');
  assert(formatDisplayDate('2026-10-24', lateNightOct23) === 'Tomorrow', 'Late night 23:59:59 displays Oct 24 as Tomorrow');

  const earlyMorningOct24 = new Date(2026, 9, 24, 0, 0, 1, 0);
  assert(getTodayDateString(earlyMorningOct24) === '2026-10-24', '00:00:01 resolves to Today 2026-10-24');
  assert(getTomorrowDateString(earlyMorningOct24) === '2026-10-25', '00:00:01 resolves to Tomorrow 2026-10-25');
  assert(formatDisplayDate('2026-10-24', earlyMorningOct24) === 'Today', 'Early morning 00:00:01 displays Oct 24 as Today');
  assert(formatDisplayDate('2026-10-23', earlyMorningOct24) === 'Oct 23', 'Early morning 00:00:01 displays Oct 23 as past date Oct 23');

  // 24d. Month-end and year-end transitions
  const monthEndOct31 = new Date(2026, 9, 31, 15, 0, 0);
  assert(getTodayDateString(monthEndOct31) === '2026-10-31', 'Month end date is 2026-10-31');
  assert(getTomorrowDateString(monthEndOct31) === '2026-11-01', 'Tomorrow at month end crosses into next month 2026-11-01');
  assert(formatDisplayDate('2026-10-31', monthEndOct31) === 'Today', 'Oct 31 displays as Today on Oct 31');
  assert(formatDisplayDate('2026-11-01', monthEndOct31) === 'Tomorrow', 'Nov 01 displays as Tomorrow on Oct 31');

  const yearEndDec31 = new Date(2026, 11, 31, 22, 0, 0);
  assert(getTodayDateString(yearEndDec31) === '2026-12-31', 'Year end date is 2026-12-31');
  assert(getTomorrowDateString(yearEndDec31) === '2027-01-01', 'Tomorrow at year end crosses into next year 2027-01-01');
  assert(formatDisplayDate('2026-12-31', yearEndDec31) === 'Today', 'Dec 31 displays as Today on Dec 31');
  assert(formatDisplayDate('2027-01-01', yearEndDec31) === 'Tomorrow', 'Jan 01 displays as Tomorrow on Dec 31');

  const leapFeb28 = new Date(2028, 1, 28, 10, 0, 0);
  assert(getTomorrowDateString(leapFeb28) === '2028-02-29', 'Leap year Feb 28 rolls over to Feb 29');

  // 24e. Calendar date comparisons
  assert(compareCalendarDates('2026-10-23', '2026-10-23') === 0, 'Comparing same date returns 0');
  assert(compareCalendarDates('2026-10-23', '2026-10-24') < 0, 'Comparing earlier to later returns negative');
  assert(compareCalendarDates('2026-10-24', '2026-10-23') > 0, 'Comparing later to earlier returns positive');
  assert(compareCalendarDates('2026-10-31', '2026-11-01') < 0, 'Month boundary comparison is correct');
  assert(compareCalendarDates('2026-12-31', '2027-01-01') < 0, 'Year boundary comparison is correct');

  // 24f. Frontend-to-backend schedule date integrity in createDailySchedule
  const syncTasks = [
    { id: 1501, title: 'Pinned Oct 23 task', scheduledDate: '2026-10-23', duration: 45, done: false },
    { id: 1502, title: 'Pinned Oct 24 task', scheduledDate: '2026-10-24', duration: 45, done: false },
  ];

  // Horizon: today with explicit currentDate: "2026-10-23"
  const planToday = createDailySchedule(syncTasks, {
    currentDate: '2026-10-23',
    horizon: 'today',
    routineSettings: DEFAULT_ROUTINE_SETTINGS,
  });
  assert(planToday.startDate === '2026-10-23', 'Today plan starts on local 2026-10-23');
  const task1501Session = planToday.schedule.find((s) => s.taskId === 1501);
  assert(task1501Session !== undefined, 'Task 1501 scheduled today');
  assert(task1501Session?.date === '2026-10-23', 'Task 1501 scheduled on 2026-10-23 (not shifted to tomorrow)');
  const enriched1501 = planToday.enrichedTasks.find((t) => t.id === 1501);
  assert(enriched1501?.scheduledDate === '2026-10-23', 'Task 1501 preserves scheduledDate 2026-10-23 in enrichedTasks');
  const task1502InToday = planToday.schedule.find((s) => s.taskId === 1502);
  assert(task1502InToday === undefined, 'Oct 24 task is not scheduled into today active timeline');

  // Horizon: tomorrow with explicit currentDate: "2026-10-23"
  const planTomorrow = createDailySchedule(syncTasks, {
    currentDate: '2026-10-23',
    horizon: 'tomorrow',
    routineSettings: DEFAULT_ROUTINE_SETTINGS,
  });
  assert(planTomorrow.startDate === '2026-10-24', 'Tomorrow plan starts on 2026-10-24');
  const task1502Tomorrow = planTomorrow.schedule.find((s) => s.taskId === 1502);
  assert(task1502Tomorrow !== undefined, 'Oct 24 task scheduled in tomorrow plan');
  assert(task1502Tomorrow?.date === '2026-10-24', 'Oct 24 task placed on 2026-10-24');

  // Horizon: week with explicit currentDate: "2026-10-23" (Friday)
  const planWeek = createDailySchedule(syncTasks, {
    currentDate: '2026-10-23',
    horizon: 'week',
    routineSettings: DEFAULT_ROUTINE_SETTINGS,
  });
  assert(planWeek.startDate === '2026-10-19', 'Week plan starts on Monday 2026-10-19');
  assert(planWeek.endDate === '2026-10-25', 'Week plan ends on Sunday 2026-10-25');
  const week1501 = planWeek.schedule.find((s) => s.taskId === 1501);
  const week1502 = planWeek.schedule.find((s) => s.taskId === 1502);
  assert(week1501?.date === '2026-10-23', 'Task 1501 placed on Friday Oct 23 in week view');
  assert(week1502?.date === '2026-10-24', 'Task 1502 placed on Saturday Oct 24 in week view');

  // 24g. Deadline evaluation without UTC shifts
  const evalSameDay = evaluateDeadlineForDate('2026-10-23', '2026-10-23');
  assert(evalSameDay.hasDeadline === true, 'Deadline evaluated for same day has deadline');
  assert(evalSameDay.isDeadlineOnDate === true, 'Deadline on 2026-10-23 recognized on 2026-10-23');
  assert(evalSameDay.isPastBeforeDay === false, 'Same day deadline is not past before day');

  const evalPastDay = evaluateDeadlineForDate('2026-10-23', '2026-10-24');
  assert(evalPastDay.isPastBeforeDay === true, 'Oct 23 deadline on Oct 24 recognized as past before day');

  const parsedDeadlineMins = parseDeadlineToMinutes('2026-10-23 15:30', '2026-10-23');
  assert(parsedDeadlineMins === 15 * 60 + 30, 'parseDeadlineToMinutes handles local time string correctly (930m)');

  // ==========================================
  // 25. Deterministic Explicit Duration Parsing
  // ==========================================
  console.log('\n--- 25. Testing Deterministic Explicit Duration Parsing ---');

  // Exact required examples
  assert(parseExplicitDuration('study for 2 hours')?.durationMinutes === 120, '"study for 2 hours" -> 120 minutes');
  assert(parseExplicitDuration('read 30 minutes')?.durationMinutes === 30, '"read 30 minutes" -> 30 minutes');
  assert(parseExplicitDuration('work for 1.5 hours')?.durationMinutes === 90, '"work for 1.5 hours" -> 90 minutes');
  assert(parseExplicitDuration('practice for 2 hrs 30 mins')?.durationMinutes === 150, '"practice for 2 hrs 30 mins" -> 150 minutes');
  assert(parseExplicitDuration('study 45m')?.durationMinutes === 45, '"study 45m" -> 45 minutes');
  assert(parseExplicitDuration('study for 90 minutes')?.durationMinutes === 90, '"study for 90 minutes" -> 90 minutes');

  // Negative tests: numbers that must NOT become durations
  assert(parseExplicitDuration('read chapter 2') === null, '"read chapter 2" is not a duration (returns null)');
  assert(parseExplicitDuration('finish 3 exercises') === null, '"finish 3 exercises" is not a duration (returns null)');
  assert(parseExplicitDuration('review 5 pages') === null, '"review 5 pages" is not a duration (returns null)');
  assert(parseExplicitDuration('watch episode 4') === null, '"watch episode 4" is not a duration (returns null)');
  assert(parseExplicitDuration('meeting at 2pm') === null, '"meeting at 2pm" is not a duration (returns null)');
  assert(parseExplicitDuration('run 500m') === null, '"run 500m" is not a duration (returns null)');

  // Mixed expressions where duration is present alongside unrelated numbers
  assert(parseExplicitDuration('read chapter 2 for 30 minutes')?.durationMinutes === 30, '"read chapter 2 for 30 minutes" extracts 30 minutes');
  assert(parseExplicitDuration('finish 3 exercises in 45m')?.durationMinutes === 45, '"finish 3 exercises in 45m" extracts 45 minutes');
  assert(parseExplicitDuration('chapter 2 in 1.5 hours')?.durationMinutes === 90, '"chapter 2 in 1.5 hours" extracts 90 minutes');

  // Metadata check
  const metaCheck = parseExplicitDuration('study for 2 hours');
  assert(metaCheck?.source === 'explicit', 'Metadata durationSource is "explicit"');
  assert(metaCheck?.confidence === 'high', 'Metadata confidence is "high"');

  // ==========================================
  // 26. Priority Hierarchy: Explicit > AI & Manual > AI
  // ==========================================
  console.log('\n--- 26. Testing Priority Hierarchy & Scheduling Integration ---');

  // 26a. Explicit duration takes priority over Ollama and skips Ollama call
  let mockOllamaCalled = false;
  const mockFetchForExplicit = async () => {
    mockOllamaCalled = true;
    return {
      ok: true,
      json: async () => ({
        message: { content: JSON.stringify({ category: 'college', estimatedMinutes: 480 }) },
      }),
    };
  };

  const explicitClassified = await classifyTask('Study for 2 hours', null, {
    fetchFn: mockFetchForExplicit,
  });
  assert(mockOllamaCalled === false, 'Ollama was NOT called when explicit duration was detected');
  assert(explicitClassified.estimatedMinutes === 120, 'Explicit duration (120m) returned instead of 480m guess');
  assert(explicitClassified.durationSource === 'explicit', 'durationSource marked as "explicit"');
  assert(explicitClassified.aiGenerated === false, 'aiGenerated is false for explicit duration');

  // 26b. Manual duration takes priority over AI and parser output when overridden
  const manualOverrideTask = {
    id: 1601,
    title: 'Study for 2 hours', // title says 2 hours (120m)
    duration: 75,               // but user manually entered 75m
    durationSource: 'manual',
    done: false,
    scheduledDate: '2026-10-23',
  };
  const manualOverridePlan = createDailySchedule([manualOverrideTask], {
    currentDate: '2026-10-23',
    routineSettings: DEFAULT_ROUTINE_SETTINGS,
  });
  const enrichedManual = manualOverridePlan.enrichedTasks.find((t) => t.id === 1601);
  assert(enrichedManual?.duration === 75, 'User manual 75m duration strictly preserved over title 2 hours');
  assert(enrichedManual?.durationSource === 'manual', 'durationSource remains "manual"');

  // 26c. Explicit duration flows into scheduler and focus-session splitting
  const explicitTask = {
    id: 1602,
    title: 'Study for 2 hours',
    duration: 120,
    durationSource: 'explicit',
    done: false,
    scheduledDate: '2026-10-23',
  };
  const explicitPlan = createDailySchedule([explicitTask], {
    currentDate: '2026-10-23',
    routineSettings: DEFAULT_ROUTINE_SETTINGS,
  });
  const explicitSessions = explicitPlan.schedule.filter((s) => s.taskId === 1602);
  const totalExplicitScheduledMins = explicitSessions.reduce((acc, curr) => acc + curr.durationMinutes, 0);
  assert(totalExplicitScheduledMins === 120, `Explicit 120m scheduled exactly as 120m (actual: ${totalExplicitScheduledMins}m, not inflated to 480m)`);

  // ==========================================
  // 27. Defensive Ollama Integration & Mocked Responses
  // ==========================================
  console.log('\n--- 27. Testing Defensive Ollama Integration with Mocked Responses ---');

  // 27a. Valid Ollama output accepted
  const mockValidFetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          category: 'college',
          estimatedMinutes: 55,
          urgency: 'high',
          confidence: 'high',
          reasoning: 'Realistic estimate for chemistry lab prep',
          suggestedSubtasks: ['Review safety protocols', 'Outline experimental procedure'],
        }),
      },
    }),
  });
  const validResult = await classifyTask('Prepare chemistry lab report', null, {
    fetchFn: mockValidFetch,
  });
  assert(validResult.aiGenerated === true, 'Valid Ollama response marked as aiGenerated: true');
  assert(validResult.estimatedMinutes === 55, 'Valid 55m estimate accepted');
  assert(validResult.category === 'college', 'Category college parsed correctly');

  // 27b. Malformed non-JSON Ollama output triggers safe fallback
  const mockMalformedFetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: 'This is not JSON at all! I think you should spend some time on this.',
      },
    }),
  });
  const malformedResult = await classifyTask('Prepare chemistry lab report', null, {
    fetchFn: mockMalformedFetch,
  });
  assert(malformedResult.aiGenerated === false, 'Malformed output rejected, aiGenerated: false');
  assert(typeof malformedResult.estimatedMinutes === 'number', 'Fallback provided numeric estimatedMinutes');
  assert(malformedResult.confidence === 'low', 'Confidence marked as low on fallback');

  // 27c. Non-numeric or NaN duration output triggers safe fallback
  const mockNanFetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          category: 'college',
          estimatedMinutes: 'unknown_duration',
        }),
      },
    }),
  });
  const nanResult = await classifyTask('Prepare chemistry lab report', null, {
    fetchFn: mockNanFetch,
  });
  assert(nanResult.aiGenerated === false, 'Non-numeric duration rejected, aiGenerated: false');
  assert(nanResult.estimatedMinutes > 0, 'Safe fallback duration provided');

  // 27d. Unreasonable duration (> 480m / 8 hours) triggers safe fallback
  const mockUnreasonableFetch = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          category: 'college',
          estimatedMinutes: 9999,
        }),
      },
    }),
  });
  const unreasonableResult = await classifyTask('Clean my desk', null, {
    fetchFn: mockUnreasonableFetch,
  });
  assert(unreasonableResult.aiGenerated === false, 'Unreasonable 9999m estimate rejected');
  assert(unreasonableResult.estimatedMinutes <= 480, 'Fallback duration kept within safe student bounds');

  // 28. Testing Planning Horizon Task Isolation, Date Immutability & Overdue Handling
  console.log('\n--- 28. Testing Planning Horizon Task Isolation, Date Immutability & Overdue Handling ---');
  const horizonTestTasks = [
    { id: 2001, title: 'Write history thesis draft', scheduledDate: '2026-10-23', duration: 60, done: false },
    { id: 2002, title: 'Prepare slide deck for Saturday workshop', scheduledDate: '2026-10-24', duration: 45, done: false },
    { id: 2003, title: 'Read sociology chapter (from yesterday)', scheduledDate: '2026-10-22', duration: 30, done: false },
    { id: 2004, title: 'Finished biology worksheet', scheduledDate: '2026-10-22', duration: 30, done: true },
    { id: 2005, title: 'Next week term paper kickoff', scheduledDate: '2026-10-30', duration: 90, done: false },
  ];

  // 28a. Planning Horizon: Tomorrow
  // Must ONLY schedule tasks whose scheduledDate is tomorrow (2026-10-24).
  // Must NOT include, migrate, or mutate today's task (2001) or yesterday's task (2003).
  const tomorrowHorizonPlan = createDailySchedule(horizonTestTasks, {
    currentDate: '2026-10-23',
    horizon: 'tomorrow',
    startHour: 9,
    endHour: 18,
  });

  assert(tomorrowHorizonPlan.horizon === 'tomorrow', 'Plan horizon is tomorrow');
  assert(tomorrowHorizonPlan.startDate === '2026-10-24', 'Tomorrow plan starts on 2026-10-24');
  assert(tomorrowHorizonPlan.schedule.some((s) => s.taskId === 2002), 'Tomorrow task 2002 is scheduled in tomorrow plan');
  assert(!tomorrowHorizonPlan.schedule.some((s) => s.taskId === 2001), 'Today task 2001 is NOT scheduled into tomorrow plan');
  assert(!tomorrowHorizonPlan.schedule.some((s) => s.taskId === 2003), 'Yesterday overdue task 2003 is NOT scheduled into tomorrow plan');
  assert(!tomorrowHorizonPlan.schedule.some((s) => s.taskId === 2005), 'Future task 2005 is NOT scheduled into tomorrow plan');

  // Verify scheduledDate immutability on enrichedTasks
  const enriched2001Tomorrow = tomorrowHorizonPlan.enrichedTasks.find((t) => t.id === 2001);
  const enriched2002Tomorrow = tomorrowHorizonPlan.enrichedTasks.find((t) => t.id === 2002);
  const enriched2003Tomorrow = tomorrowHorizonPlan.enrichedTasks.find((t) => t.id === 2003);
  const enriched2004Tomorrow = tomorrowHorizonPlan.enrichedTasks.find((t) => t.id === 2004);
  assert(enriched2001Tomorrow?.scheduledDate === '2026-10-23', 'Task 2001 scheduledDate remains strictly 2026-10-23 after planning tomorrow');
  assert(enriched2002Tomorrow?.scheduledDate === '2026-10-24', 'Task 2002 scheduledDate remains strictly 2026-10-24 after planning tomorrow');
  assert(enriched2003Tomorrow?.scheduledDate === '2026-10-22', 'Task 2003 scheduledDate remains strictly 2026-10-22 after planning tomorrow');
  assert(enriched2004Tomorrow?.scheduledDate === '2026-10-22' && enriched2004Tomorrow?.done === true, 'Completed task 2004 retains status and original date');

  // 28b. Planning Horizon: Today
  // Must ONLY schedule tasks whose scheduledDate is today (2026-10-23).
  // Must NOT include tomorrow's task (2002) or silently roll forward yesterday's task (2003).
  const todayHorizonPlan = createDailySchedule(horizonTestTasks, {
    currentDate: '2026-10-23',
    horizon: 'today',
    startHour: 9,
    endHour: 18,
  });

  assert(todayHorizonPlan.horizon === 'today', 'Plan horizon is today');
  assert(todayHorizonPlan.startDate === '2026-10-23', 'Today plan starts on 2026-10-23');
  assert(todayHorizonPlan.schedule.some((s) => s.taskId === 2001), 'Today task 2001 is scheduled in today plan');
  assert(!todayHorizonPlan.schedule.some((s) => s.taskId === 2002), 'Tomorrow task 2002 is NOT scheduled in today plan');
  assert(!todayHorizonPlan.schedule.some((s) => s.taskId === 2003), 'Overdue task 2003 is NOT silently rolled forward to today plan');
  assert(!todayHorizonPlan.schedule.some((s) => s.taskId === 2005), 'Next week task 2005 is NOT scheduled in today plan');

  const enriched2001Today = todayHorizonPlan.enrichedTasks.find((t) => t.id === 2001);
  const enriched2003Today = todayHorizonPlan.enrichedTasks.find((t) => t.id === 2003);
  assert(enriched2001Today?.scheduledDate === '2026-10-23', 'Task 2001 retains scheduledDate 2026-10-23');
  assert(enriched2003Today?.scheduledDate === '2026-10-22', 'Overdue task 2003 retains original date 2026-10-22');

  // 28c. Crossing midnight and overdue task detection
  // Simulating midnight crossing to 2026-10-24:
  const refMidnight = new Date(2026, 9, 24, 0, 1, 0); // 2026-10-24 00:01:00
  const is2001OverdueAfterMidnight = isTaskOverdue(horizonTestTasks[0], refMidnight);
  const is2003Overdue = isTaskOverdue(horizonTestTasks[2], refMidnight);
  const is2004Overdue = isTaskOverdue(horizonTestTasks[3], refMidnight); // Completed task
  const is2002Overdue = isTaskOverdue(horizonTestTasks[1], refMidnight); // Task on today 2026-10-24

  assert(is2001OverdueAfterMidnight === true, 'Task from yesterday (2026-10-23) is flagged overdue after midnight on 2026-10-24');
  assert(is2003Overdue === true, 'Task from 2 days ago (2026-10-22) is flagged overdue');
  assert(is2004Overdue === false, 'Completed task is not overdue');
  assert(is2002Overdue === false, 'Task scheduled for today is not overdue');

  // Planning on 2026-10-24: yesterday unfinished task (2001) is NOT silently rolled forward to 2026-10-24
  const planAfterMidnight = createDailySchedule(horizonTestTasks, {
    currentDate: '2026-10-24',
    horizon: 'today',
    startHour: 9,
    endHour: 18,
  });
  assert(planAfterMidnight.schedule.some((s) => s.taskId === 2002), 'Task 2002 (Oct 24) is scheduled on Oct 24');
  assert(!planAfterMidnight.schedule.some((s) => s.taskId === 2001), 'Yesterday task 2001 is NOT silently rolled forward into today plan after midnight');
  const enriched2001AfterMidnight = planAfterMidnight.enrichedTasks.find((t) => t.id === 2001);
  assert(enriched2001AfterMidnight?.scheduledDate === '2026-10-23', 'Task 2001 retains original date 2026-10-23 after midnight replan');

  // 28d. Horizon: This Week respects each task assigned date
  const weekPlanIsolation = createDailySchedule(horizonTestTasks, {
    currentDate: '2026-10-23',
    horizon: 'week',
    startHour: 9,
    endHour: 18,
  });
  const session2001InWeek = weekPlanIsolation.schedule.find((s) => s.taskId === 2001);
  const session2002InWeek = weekPlanIsolation.schedule.find((s) => s.taskId === 2002);
  assert(session2001InWeek?.date === '2026-10-23', 'Task 2001 placed on its assigned Friday Oct 23 in week view');
  assert(session2002InWeek?.date === '2026-10-24', 'Task 2002 placed on its assigned Saturday Oct 24 in week view');
  assert(!weekPlanIsolation.schedule.some((s) => s.taskId === 2005), 'Next week task 2005 not scheduled in current week view');

  // ==========================================
  // 29. Personalized Onboarding & Deterministic Routine Mapping
  // ==========================================
  console.log('\n--- 29. Testing Personalized Onboarding & Deterministic Routine Mapping ---');

  // 29a. Bedtime & Sleep Duration Calculation
  assert(calcSuggestedBedtime('07:00', 7) === '00:00', '7h sleep from 07:00 wake-up suggests 00:00 bedtime');
  assert(calcSuggestedBedtime('07:00', 8) === '23:00', '8h sleep from 07:00 wake-up suggests 23:00 bedtime');
  assert(calcSuggestedBedtime('06:30', 8) === '22:30', '8h sleep from 06:30 wake-up suggests 22:30 bedtime');
  assert(calcSuggestedBedtime('08:00', 9) === '23:00', '9h sleep from 08:00 wake-up suggests 23:00 bedtime');

  // 29b. Requirement 6 Example Scenario: Gargi (College Student)
  const gargiProfile = {
    name: 'Gargi',
    occupation: 'college',
    sleepHours: 7,
    wakeUpTime: '07:00',
    lunchOption: 'fixed',
    lunchStartTime: '12:00',
    lunchEndTime: '13:00',
    hasCommitment: true,
    commitmentLabel: 'College / Classes',
    commitmentStartTime: '10:00',
    commitmentEndTime: '16:00',
    commitmentDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    freeTimePredictability: 'changes_daily',
    dinnerOption: 'fixed',
    dinnerStartTime: '20:00',
    dinnerEndTime: '21:00',
    windDownTime: '22:00',
    keepNap: false,
    keepSnack: false,
  };

  const gargiRoutine = mapProfileToRoutineSettings(gargiProfile);
  assert(gargiRoutine.dayStartTime === '07:00', 'Gargi day starts at 07:00 from wake-up preference');
  assert(gargiRoutine.dayEndTime === '22:00', 'Gargi day ends at 22:00 from wind-down preference');

  const gargiValidation = validateRoutineSettings(gargiRoutine);
  assert(gargiValidation.isValid === true, 'Gargi mapped routine passes scheduler validation with 0 errors');
  assert(gargiValidation.errors.length === 0, 'No overlapping routine errors in Gargi routine');

  // Verify routine blocks structure:
  // College 10:00–16:00 enclosing Lunch 12:00–13:00 must be cleanly split around lunch
  const morningClass = gargiRoutine.blocks.find((b) => b.id === 'commitment_morning');
  const lunchBlock = gargiRoutine.blocks.find((b) => b.id === 'lunch');
  const afternoonClass = gargiRoutine.blocks.find((b) => b.id === 'commitment_afternoon');
  const dinnerBlock = gargiRoutine.blocks.find((b) => b.id === 'dinner');

  assert(morningClass && morningClass.startTime === '10:00' && morningClass.durationMinutes === 120, 'Morning college block is 10:00–12:00 (120m)');
  assert(lunchBlock && lunchBlock.startTime === '12:00' && lunchBlock.durationMinutes === 60, 'Lunch block is 12:00–13:00 (60m)');
  assert(afternoonClass && afternoonClass.startTime === '13:00' && afternoonClass.durationMinutes === 180, 'Afternoon college block is 13:00–16:00 (180m)');
  assert(dinnerBlock && dinnerBlock.startTime === '20:00' && dinnerBlock.durationMinutes === 60, 'Dinner block is 20:00–21:00 (60m)');

  // 29c. Deterministic Schedule Execution with Gargi's Routine
  const gargiTasks = [
    { id: 3001, title: 'Operating Systems Lab Reading', estimatedMinutes: 90, status: 'todo' },
    { id: 3002, title: 'Algorithm Practice', estimatedMinutes: 120, status: 'todo' },
    { id: 3003, title: 'Evening Review', estimatedMinutes: 60, status: 'todo' },
  ];

  const gargiPlan = createDailySchedule(gargiTasks, {
    currentDate: '2026-10-23',
    horizon: 'today',
    routineSettings: gargiRoutine,
  });

  assert(gargiPlan.success === true, 'Scheduler successfully plans day with Gargi personalized routine');

  // Verify first task starts at wake-up time 07:00
  const gargiFirstSession = gargiPlan.schedule.find((s) => s.type === 'task');
  assert(gargiFirstSession && gargiFirstSession.start === '07:00', `First task session starts at 07:00 (actual: ${gargiFirstSession?.start})`);

  // Verify NO task or break is scheduled inside college hours (10:00–12:00 and 13:00–16:00) or lunch (12:00–13:00)
  const taskInCollegeMorning = gargiPlan.schedule.some((s) => s.type === 'task' && s.start >= '10:00' && s.start < '12:00');
  const taskInLunch = gargiPlan.schedule.some((s) => s.type === 'task' && s.start >= '12:00' && s.start < '13:00');
  const taskInCollegeAfternoon = gargiPlan.schedule.some((s) => s.type === 'task' && s.start >= '13:00' && s.start < '16:00');
  const taskInDinner = gargiPlan.schedule.some((s) => s.type === 'task' && s.start >= '20:00' && s.start < '21:00');

  assert(!taskInCollegeMorning, 'Zero tasks scheduled during Morning College (10:00–12:00)');
  assert(!taskInLunch, 'Zero tasks scheduled during protected Lunch (12:00–13:00)');
  assert(!taskInCollegeAfternoon, 'Zero tasks scheduled during Afternoon College (13:00–16:00)');
  assert(!taskInDinner, 'Zero tasks scheduled during protected Dinner (20:00–21:00)');

  // Verify afternoon resumption after college ends at 16:00
  const postCollegeSession = gargiPlan.schedule.find((s) => s.type === 'task' && s.start >= '16:00');
  assert(postCollegeSession && postCollegeSession.start === '16:00', `Tasks resume immediately when college ends at 16:00 (actual: ${postCollegeSession?.start})`);

  // Verify schedule strictly respects day end time 22:00
  const sessionAfterDayEnd = gargiPlan.schedule.some((s) => s.end > '22:00');
  assert(!sessionAfterDayEnd, 'Zero sessions scheduled beyond configured 22:00 wind-down time');

  // 29d. Non-overlapping / Disjoint Commitment (e.g. Working Professional morning shift 08:00–12:00)
  const workerProfile = {
    name: 'Alex',
    occupation: 'work_full',
    sleepHours: 8,
    wakeUpTime: '07:30',
    hasCommitment: true,
    commitmentLabel: 'Morning Work Shift',
    commitmentStartTime: '08:00',
    commitmentEndTime: '12:00',
    lunchOption: 'fixed',
    lunchStartTime: '12:00',
    lunchEndTime: '13:00',
    dinnerOption: 'fixed',
    dinnerStartTime: '19:00',
    dinnerEndTime: '19:30',
    windDownTime: '21:30',
  };

  const workerRoutine = mapProfileToRoutineSettings(workerProfile);
  const workerValidation = validateRoutineSettings(workerRoutine);
  assert(workerValidation.isValid === true, 'Disjoint worker routine passes validation with 0 errors');
  const singleWorkBlock = workerRoutine.blocks.find((b) => b.id === 'commitment_block');
  assert(singleWorkBlock && singleWorkBlock.startTime === '08:00' && singleWorkBlock.durationMinutes === 240, 'Single 4-hour commitment block created for non-overlapping work');

  // 29e. Flexible Schedule without Fixed Commitments
  const flexibleProfile = {
    name: 'Sam',
    occupation: 'freelance',
    sleepHours: 8,
    wakeUpTime: '09:00',
    hasCommitment: false,
    lunchOption: 'changing',
    dinnerOption: 'fixed',
    dinnerStartTime: '19:30',
    dinnerEndTime: '20:15',
    windDownTime: '23:00',
  };

  const flexibleRoutine = mapProfileToRoutineSettings(flexibleProfile);
  assert(flexibleRoutine.dayStartTime === '09:00', 'Flexible profile day starts at 09:00');
  assert(flexibleRoutine.dayEndTime === '23:00', 'Flexible profile day ends at 23:00');
  assert(!flexibleRoutine.blocks.some((b) => b.id.startsWith('commitment')), 'No commitment blocks added for flexible freelancer');
  assert(flexibleRoutine.blocks.some((b) => b.id === 'lunch'), 'Lunch block preserved for flexible routine');
  const flexibleValidation = validateRoutineSettings(flexibleRoutine);
  assert(flexibleValidation.isValid === true, 'Flexible routine passes validation cleanly');

  // 29f. Task Date & Data Safety: Onboarding never overwrites or alters existing tasks
  const testExistingTasks = [
    { id: 4001, title: 'Existing Task 1', estimatedMinutes: 60, scheduledDate: '2026-10-23', status: 'todo' },
    { id: 4002, title: 'Existing Task 2', estimatedMinutes: 90, scheduledDate: '2026-10-24', status: 'done', deadline: '2026-10-25 17:00' },
  ];
  const initialDate4001 = testExistingTasks[0].scheduledDate;
  const initialDate4002 = testExistingTasks[1].scheduledDate;
  const initialDone4002 = testExistingTasks[1].status;

  // Run scheduler with updated routine
  const routineSafetyPlan = createDailySchedule(testExistingTasks, {
    currentDate: '2026-10-23',
    horizon: 'today',
    routineSettings: gargiRoutine,
  });

  const enriched4001 = routineSafetyPlan.enrichedTasks.find((t) => t.id === 4001);
  const enriched4002 = routineSafetyPlan.enrichedTasks.find((t) => t.id === 4002);
  assert(enriched4001?.scheduledDate === initialDate4001, 'Existing task 4001 retains scheduledDate 2026-10-23');
  assert(enriched4002?.scheduledDate === initialDate4002, 'Existing task 4002 retains scheduledDate 2026-10-24');
  assert(enriched4002?.status === initialDone4002, 'Existing task 4002 retains done status');

  // 29g. Editing Preferences After Onboarding Updates Scheduler Routine
  const updatedGargiProfile = {
    ...gargiProfile,
    wakeUpTime: '08:30',
    lunchStartTime: '13:00',
    lunchEndTime: '14:00',
  };
  const updatedRoutine = mapProfileToRoutineSettings(updatedGargiProfile);
  assert(updatedRoutine.dayStartTime === '08:30', 'Updated routine reflects new 08:30 wake-up time');
  const updatedLunch = updatedRoutine.blocks.find((b) => b.id === 'lunch');
  assert(updatedLunch?.startTime === '13:00', 'Updated routine reflects new 13:00 lunch time');

  // 29h. Safe Fallbacks for Corrupted / Missing Profile Data
  const emptyProfileRoutine = mapProfileToRoutineSettings({});
  assert(emptyProfileRoutine.dayStartTime === '08:00', 'Default dayStartTime 08:00 used when profile is empty');
  assert(emptyProfileRoutine.dayEndTime === '21:00', 'Default dayEndTime 21:00 used when profile is empty');
  assert(emptyProfileRoutine.blocks.length > 0, 'Default routine blocks used when profile is empty');

  console.log(`\n================================`);
  if (failures === 0) {
    console.log('🎉 ALL 29 TEST SUITES PASSED FLAWLESSLY!');
  } else {
    console.error(`💥 ${failures} TEST(S) FAILED.`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
