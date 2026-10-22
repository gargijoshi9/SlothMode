// server/ollama.js
// Handles communication with local Ollama Gemma 3 1B model, with deterministic rule-based fallback.

const VALID_CATEGORIES = ['college', 'exam_prep', 'chore', 'health', 'personal', 'work'];
const VALID_URGENCIES = ['critical', 'high', 'medium', 'low'];

/**
 * Check if local Ollama service is reachable and if the required model is installed.
 */
export async function checkOllamaHealth(baseUrl = 'http://127.0.0.1:11434', modelName = 'gemma3:1b') {
  const url = `${baseUrl.replace(/\/$/, '')}/api/tags`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        reachable: false,
        modelAvailable: false,
        configuredModel: modelName,
        availableModels: [],
        message: `Ollama responded with HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => m.name || m.model) : [];
    // Model match may be exact or match before tag (e.g. 'gemma3:1b' or 'gemma3:1b-instruct-q4_K_M')
    const modelFound = models.some(
      (m) => m === modelName || m.startsWith(`${modelName}:`) || m.includes(modelName)
    );

    return {
      reachable: true,
      modelAvailable: modelFound,
      configuredModel: modelName,
      availableModels: models,
      message: modelFound
        ? `Local AI connected (${modelName})`
        : `Ollama reachable, but model "${modelName}" is not installed yet (run 'ollama pull ${modelName}')`,
    };
  } catch (err) {
    return {
      reachable: false,
      modelAvailable: false,
      configuredModel: modelName,
      availableModels: [],
      message: `Local Ollama is offline or not reachable at ${baseUrl} (${err.message})`,
    };
  }
}

/**
 * Deterministic rule-based fallback when Ollama is unavailable or returns invalid data.
 * Always marks aiGenerated: false so the UI remains transparent and honest.
 */
export function ruleBasedFallback(taskTitle, deadline = null, fallbackReason = 'Ollama unavailable') {
  const title = (taskTitle || '').trim();
  const lower = title.toLowerCase();

  let category = 'personal';
  let estimatedMinutes = 30;
  let urgency = 'medium';
  let suggestedSubtasks = [];
  let schedulingTip = 'Take it one step at a time. A calm, steady pace wins the day.';

  // Determine category and baseline effort from keywords
  if (/(exam|quiz|midterm|test|finals?|revision|mock)/i.test(lower)) {
    category = 'exam_prep';
    estimatedMinutes = 60;
    urgency = 'high';
    suggestedSubtasks = [
      'Review core notes and high-yield flashcards (25m)',
      'Attempt 2-3 practice problems or past exam questions (25m)',
      'List concepts needing clarification before test day (10m)',
    ];
    schedulingTip = 'Schedule during your peak alertness window with a 10m break.';
  } else if (/(study|os|lab|assignment|essay|thesis|homework|read\s+chapter|paper|lecture|class|presentation)/i.test(lower)) {
    category = 'college';
    estimatedMinutes = 45;
    urgency = 'high';
    suggestedSubtasks = [
      'Read prompt requirements and gather reference materials (10m)',
      'Draft primary outline or solve initial section (25m)',
      'Review work against rubric and finalize notes (10m)',
    ];
    schedulingTip = 'Break complex study modules into bite-sized 45m sessions.';
  } else if (/(clean|dish|laundry|grocer|cook|meal|trash|tidy|vacuum|room|fold)/i.test(lower)) {
    category = 'chore';
    estimatedMinutes = 25;
    urgency = 'low';
    suggestedSubtasks = [
      'Prepare supplies and clear the work surface',
      'Execute the main chore mindfully',
      'Put items back and wipe down area',
    ];
    schedulingTip = 'Great to tackle as a gentle mental break between deep study blocks.';
  } else if (/(gym|workout|run|walk|yoga|meditat|stretch|doctor|dentist|water|pill|medicine|sleep)/i.test(lower)) {
    category = 'health';
    estimatedMinutes = 40;
    urgency = 'medium';
    suggestedSubtasks = [
      'Put on comfortable gear and fill water bottle',
      'Complete routine at an intentional, mindful pace',
      'Hydrate and cool down',
    ];
    schedulingTip = 'Prioritize physical movement to re-energize your brain for studying.';
  } else if (/(meeting|email|client|pr|bug|deploy|code|sprint|standup|work|invoice)/i.test(lower)) {
    category = 'work';
    estimatedMinutes = 50;
    urgency = 'medium';
    suggestedSubtasks = [
      'Clarify scope and list prerequisites (10m)',
      'Focus uninterrupted on implementation (30m)',
      'Document status and communicate wrap-up (10m)',
    ];
    schedulingTip = 'Protect focus time by turning off non-urgent notifications.';
  } else {
    // Default personal
    category = 'personal';
    estimatedMinutes = 30;
    urgency = 'medium';
    suggestedSubtasks = [
      `Get setup to begin: ${title.slice(0, 30)}`,
      'Focus for 20 minutes without distractions',
      'Wrap up and note next steps',
    ];
    schedulingTip = 'Small progress is still progress. Start with just 5 minutes.';
  }

  // Check deadline hints if provided
  let dependencyNote = null;
  if (deadline) {
    let d;
    if (typeof deadline === 'string' && /^\d{1,2}:\d{2}$/.test(deadline.trim())) {
      const [h, m] = deadline.trim().split(':').map(Number);
      d = new Date();
      d.setHours(h, m, 0, 0);
    } else {
      d = new Date(deadline);
    }
    if (!isNaN(d.getTime())) {
      const now = new Date();
      const diffHours = (d.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (diffHours < 0) {
        dependencyNote = 'Deadline has passed';
      } else if (diffHours <= 24) {
        urgency = 'critical';
        dependencyNote = 'Deadline is today or within 24 hours';
      } else if (diffHours < 48) {
        urgency = urgency === 'low' ? 'medium' : 'high';
        dependencyNote = 'Deadline is approaching within 48 hours';
      } else {
        const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dependencyNote = `Target deadline: ${dateFormatted}`;
      }
    }
  }



  return {
    aiGenerated: false,
    fallbackReason,
    category,
    estimatedMinutes: Math.min(480, Math.max(5, estimatedMinutes)),
    urgency,
    suggestedSubtasks,
    dependencyNote,
    schedulingTip,
  };
}

/**
 * Clean and safely parse JSON string from LLM responses, stripping codeblocks or text wrappers.
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Look for markdown code fence ```json ... ``` or ``` ... ```
    const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeFenceMatch && codeFenceMatch[1]) {
      try {
        return JSON.parse(codeFenceMatch[1].trim());
      } catch {
        // continue
      }
    }

    // Try finding the first '{' and last '}'
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        // failed
      }
    }
  }

  return null;
}

/**
 * Validate and sanitize structured classification output.
 */
function sanitizeClassification(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const rawCat = String(parsed.category || '').toLowerCase().replace(/[\s-]/g, '_');
  const category = VALID_CATEGORIES.includes(rawCat) ? rawCat : 'personal';

  let rawMin = Number(parsed.estimatedMinutes);
  if (isNaN(rawMin) || rawMin <= 0) rawMin = 30;
  const estimatedMinutes = Math.min(480, Math.max(5, Math.round(rawMin)));

  const rawUrg = String(parsed.urgency || '').toLowerCase();
  const urgency = VALID_URGENCIES.includes(rawUrg) ? rawUrg : 'medium';

  let suggestedSubtasks = [];
  if (Array.isArray(parsed.suggestedSubtasks)) {
    suggestedSubtasks = parsed.suggestedSubtasks
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0)
      .slice(0, 6);
  }
  if (suggestedSubtasks.length === 0) {
    suggestedSubtasks = ['Get started with initial prep', 'Work on core task', 'Review and wrap up'];
  }

  const dependencyNote =
    typeof parsed.dependencyNote === 'string' && parsed.dependencyNote.trim().length > 0
      ? parsed.dependencyNote.trim()
      : null;

  const schedulingTip =
    typeof parsed.schedulingTip === 'string' && parsed.schedulingTip.trim().length > 0
      ? parsed.schedulingTip.trim()
      : 'Work steadily in focused intervals and take restful breaks.';

  return {
    category,
    estimatedMinutes,
    urgency,
    suggestedSubtasks,
    dependencyNote,
    schedulingTip,
  };
}

/**
 * Classify a single task using local Gemma 3 1B via Ollama chat API.
 * Gracefully falls back to rule-based classification if Ollama is unreachable or model fails.
 */
export async function classifyTask(taskTitle, deadline = null, options = {}) {
  const baseUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const modelName = options.modelName || process.env.OLLAMA_MODEL || 'gemma3:1b';
  const timeoutMs = options.timeoutMs || 15000;

  if (!taskTitle || typeof taskTitle !== 'string' || !taskTitle.trim()) {
    return ruleBasedFallback('Untitled task', deadline, 'Empty task title provided');
  }

  const cleanTitle = taskTitle.trim();

  const systemPrompt = `You are SlothMode's calm, intelligent productivity assistant for students.
Classify the task provided as JSON data and return actionable subtasks and realistic time estimates.
You MUST output valid, pure JSON with no markdown formatting or commentary.

JSON Schema:
{
  "category": "college" | "exam_prep" | "chore" | "health" | "personal" | "work",
  "estimatedMinutes": integer between 5 and 480,
  "urgency": "critical" | "high" | "medium" | "low",
  "suggestedSubtasks": ["step 1", "step 2", ...],
  "dependencyNote": string | null,
  "schedulingTip": "short gentle recommendation"
}

Guidance:
- Categories must be one of: "college", "exam_prep", "chore", "health", "personal", "work".
- Keep subtasks concise, concrete, and achievable (2 to 4 steps).
- Realistic durations: reading/writing (30-60m), revision (45-90m), chores (15-30m), quick admin (10-20m).
- Urgencies: "critical" (due today or immediate risk), "high" (due soon / heavy weight), "medium" (normal), "low" (flexible).
- Output strictly JSON.`;

  // Provide task and deadline strictly as structured JSON data
  const userPayload = JSON.stringify({
    taskTitle: cleanTitle,
    deadline: deadline || null,
  });

  const chatUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPayload },
        ],
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return ruleBasedFallback(
        cleanTitle,
        deadline,
        `Ollama returned HTTP ${res.status}: ${res.statusText}`
      );
    }

    const data = await res.json();
    const rawContent = data.message?.content || data.response || '';
    const parsed = extractJson(rawContent);

    if (!parsed) {
      return ruleBasedFallback(
        cleanTitle,
        deadline,
        'AI response was not valid JSON; used deterministic fallback'
      );
    }

    const sanitized = sanitizeClassification(parsed);
    if (!sanitized) {
      return ruleBasedFallback(
        cleanTitle,
        deadline,
        'AI JSON schema validation failed; used deterministic fallback'
      );
    }

    return {
      aiGenerated: true,
      modelUsed: modelName,
      ...sanitized,
    };
  } catch (err) {
    const reason =
      err.name === 'AbortError'
        ? `Model request timed out after ${timeoutMs / 1000}s`
        : `Ollama unavailable (${err.message})`;
    return ruleBasedFallback(cleanTitle, deadline, reason);
  }
}
