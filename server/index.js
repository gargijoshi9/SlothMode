// server/index.js
// Express backend for SlothMode productivity assistant.

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { checkOllamaHealth, classifyTask } from './ollama.js';
import { createDailySchedule } from './scheduler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

/**
 * GET /api/health
 * Reports backend server status, configured Ollama URL/model, and connectivity.
 */
app.get('/api/health', async (_req, res) => {
  const ollamaStatus = await checkOllamaHealth(OLLAMA_BASE_URL, OLLAMA_MODEL);

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    backendPort: PORT,
    ollama: {
      baseUrl: OLLAMA_BASE_URL,
      configuredModel: OLLAMA_MODEL,
      ...ollamaStatus,
    },
  });
});

/**
 * POST /api/classify
 * Classifies a single task using local Gemma 3 1B with deterministic rule-based fallback.
 * Body: { title: string, deadline?: string }
 */
app.post('/api/classify', async (req, res) => {
  try {
    const { title, deadline } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        error: 'Task title is required.',
      });
    }

    const classification = await classifyTask(title.trim(), deadline || null, {
      baseUrl: OLLAMA_BASE_URL,
      modelName: OLLAMA_MODEL,
    });

    return res.json({
      title: title.trim(),
      deadline: deadline || null,
      ...classification,
    });
  } catch (err) {
    console.error('Classification error:', err);
    return res.status(500).json({
      error: 'Failed to classify task',
      message: err.message,
    });
  }
});

/**
 * POST /api/plan
 * Processes an array of tasks, enriches unclassified tasks with AI/fallback,
 * and builds a deterministic conflict-free daily schedule with breaks.
 * Body: { tasks: Task[], options?: SchedulingOptions }
 */
app.post('/api/plan', async (req, res) => {
  try {
    const { tasks = [], options = {} } = req.body || {};

    if (!Array.isArray(tasks)) {
      return res.status(400).json({
        error: 'Tasks must be provided as an array.',
      });
    }

    // Check Ollama health once to inform the client
    const health = await checkOllamaHealth(OLLAMA_BASE_URL, OLLAMA_MODEL);

    // Process tasks: for tasks lacking subtasks or category, run classification
    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        // If task already has subtasks and category and duration, keep it unless forced
        const needsClassification =
          !task.category ||
          !task.subtasks ||
          task.subtasks.length === 0 ||
          options.forceReclassify;

        if (needsClassification) {
          const classified = await classifyTask(task.title, task.deadline, {
            baseUrl: OLLAMA_BASE_URL,
            modelName: OLLAMA_MODEL,
          });

          // Normalize subtasks to object array if string array
          const subtaskObjs = (classified.suggestedSubtasks || []).map((sub, idx) => ({
            id: `sub-${task.id || Date.now()}-${idx}`,
            title: typeof sub === 'string' ? sub : sub.title || 'Step',
            done: false,
          }));

          return {
            ...task,
            category: classified.category,
            duration: classified.estimatedMinutes,
            urgency: classified.urgency,
            subtasks: subtaskObjs,
            dependencyNote: classified.dependencyNote,
            schedulingTip: classified.schedulingTip,
            aiGenerated: classified.aiGenerated,
            fallbackReason: classified.fallbackReason,
          };
        }

        return task;
      })
    );

    // Run deterministic schedule builder
    const scheduleResult = createDailySchedule(enrichedTasks, options);

    return res.json({
      ...scheduleResult,
      enrichedTasks,
      aiStatus: {
        reachable: health.reachable,
        modelAvailable: health.modelAvailable,
        model: OLLAMA_MODEL,
        note: health.modelAvailable
          ? 'Scheduled using local Gemma 3 1B AI task breakdown.'
          : 'Scheduled using gentle deterministic rule-based planning (Ollama unavailable or model not pulled).',
      },
    });
  } catch (err) {
    console.error('Planning error:', err);
    return res.status(500).json({
      error: 'Failed to generate schedule',
      message: err.message,
    });
  }
});

// Start listening if run directly
const server = app.listen(PORT, () => {
  console.log(`🦥 SlothMode backend listening on http://127.0.0.1:${PORT}`);
  console.log(`   Ollama target: ${OLLAMA_BASE_URL} (${OLLAMA_MODEL})`);
});

export default app;
