// server/index.js
// Express backend for SlothMode productivity assistant.

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { checkOllamaHealth, classifyTask, estimateTaskDuration, ruleBasedFallback } from './ollama.js';
import { parseExplicitDuration } from './durationParser.js';
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
 * POST /api/estimate
 * Dynamically estimates task duration using local Gemma 3 1B with deterministic fallback.
 * Body: { title: string, description?: string, context?: string, deadline?: string, forceAi?: boolean }
 */
app.post('/api/estimate', async (req, res) => {
  try {
    const { title, description, context, deadline, forceAi } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        error: 'Task title is required.',
      });
    }

    // Explicit duration takes priority over Ollama estimation
    const explicit = parseExplicitDuration(title) || (description ? parseExplicitDuration(description) : null);
    if (explicit && !forceAi) {
      console.log(`[API /estimate] Detected explicit duration: ${explicit.durationMinutes}m for "${title}"`);
      const fallback = ruleBasedFallback(title, deadline);
      return res.json({
        title: title.trim(),
        category: fallback.category,
        estimatedMinutes: explicit.durationMinutes,
        duration: explicit.durationMinutes,
        durationSource: 'explicit',
        confidence: 'high',
        urgency: fallback.urgency,
        suggestedSubtasks: fallback.suggestedSubtasks,
        dependencyNote: fallback.dependencyNote,
        schedulingTip: `Paced for your explicit ${explicit.durationMinutes}m session.`,
        reasoning: explicit.reasoning,
        aiGenerated: false,
      });
    }

    const estimate = await estimateTaskDuration(
      {
        title: title.trim(),
        description: description || '',
        context: context || '',
        deadline: deadline || null,
      },
      {
        baseUrl: OLLAMA_BASE_URL,
        modelName: OLLAMA_MODEL,
        forceAi: Boolean(forceAi),
      }
    );

    return res.json({
      title: title.trim(),
      ...estimate,
    });
  } catch (err) {
    console.error('Estimation error:', err);
    return res.status(500).json({
      error: 'Failed to estimate task duration',
      message: err.message,
    });
  }
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
        // If task already has subtasks and category, keep it unless forced
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

          const isManualDuration = task.durationSource === 'manual';
          const explicit = parseExplicitDuration(task.title) || (task.description ? parseExplicitDuration(task.description) : null);
          const isExplicitDuration = task.durationSource === 'explicit' || Boolean(explicit);

          let finalDuration;
          let finalDurationSource;
          if (isManualDuration) {
            finalDuration = task.duration;
            finalDurationSource = 'manual';
          } else if (isExplicitDuration) {
            finalDuration = task.durationSource === 'explicit' && task.duration ? task.duration : explicit.durationMinutes;
            finalDurationSource = 'explicit';
          } else if (task.durationSource === 'provisional') {
            finalDuration = classified.estimatedMinutes;
            finalDurationSource = classified.aiGenerated ? 'ai_estimated' : 'fallback_estimated';
          } else {
            finalDuration = task.duration || classified.estimatedMinutes;
            finalDurationSource = classified.aiGenerated ? 'ai_estimated' : 'fallback_estimated';
          }

          return {
            ...task,
            category: classified.category,
            duration: finalDuration,
            durationSource: finalDurationSource,
            durationConfidence: isExplicitDuration ? 'high' : (classified.confidence || task.durationConfidence),
            estimationReasoning: isExplicitDuration ? (explicit ? explicit.reasoning : task.estimationReasoning) : (classified.reasoning || task.estimationReasoning),
            urgency: classified.urgency,
            subtasks: subtaskObjs,
            dependencyNote: classified.dependencyNote,
            schedulingTip: classified.schedulingTip,
            aiGenerated: isExplicitDuration ? false : classified.aiGenerated,
            fallbackReason: isExplicitDuration ? undefined : classified.fallbackReason,
          };
        }

        const isManual = task.durationSource === 'manual';
        const explicit = parseExplicitDuration(task.title) || (task.description ? parseExplicitDuration(task.description) : null);
        let finalDur = task.duration;
        let finalSrc = task.durationSource;
        if (!isManual) {
          if (finalSrc === 'explicit' || explicit) {
            finalSrc = 'explicit';
            finalDur = finalSrc === 'explicit' && task.duration ? task.duration : explicit.durationMinutes;
          } else if (!finalDur) {
            finalSrc = 'provisional';
            finalDur = 30;
          }
        }

        return {
          ...task,
          duration: finalDur,
          durationSource: finalSrc || (finalDur ? 'manual' : 'provisional'),
        };
      })
    );

    // Run deterministic schedule builder
    const scheduleResult = createDailySchedule(enrichedTasks, options);

    return res.json({
      ...scheduleResult,
      enrichedTasks: scheduleResult.enrichedTasks || enrichedTasks,
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
