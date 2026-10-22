// server/test_suite.js
// Automated verification suite for Phase 6.

import { checkOllamaHealth, classifyTask, ruleBasedFallback } from './ollama.js';
import { createDailySchedule, timeToMinutes } from './scheduler.js';

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
  const splitPlan = createDailySchedule(longTask, { maxSessionMinutes: 45, shortBreakMinutes: 10 });
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

  console.log(`\n================================`);
  if (failures === 0) {
    console.log('🎉 ALL 8 TEST SUITES PASSED FLAWLESSLY!');
  } else {
    console.error(`💥 ${failures} TEST(S) FAILED.`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
