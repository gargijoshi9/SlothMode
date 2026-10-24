# SlothMode

> **A gentle, privacy-first productivity assistant for students and professionals.**  
> *"Plan gently, work at a sustainable pace, and make progress without the overwhelm."*

---

## Overview

Traditional productivity apps often create an exhausting paradox: **planning takes so much cognitive energy that you run out of momentum before you even start.** Facing a chaotic backlog of vague tasks, high-stakes deadlines, and rigid time-blocking tools frequently triggers decision paralysis, planning anxiety, and burnout.

**SlothMode** replaces rigid scheduling with a calm, sustainable workflow inspired by Hacktoberfest's *"Slow and Steady"* philosophy:
- **Gentle Brain Dump**: Capture messy tasks, classes, and study goals in natural language without worrying about formatting or strict metadata.
- **Local AI Understanding**: Uses a local **Gemma 3 1B** model via **Ollama** to analyze task scope, categorize effort, provide realistic time estimates, and break daunting assignments into concrete, bite-sized steps.
- **Deterministic Mathematical Scheduling**: The AI never hallucinates clock times or dates. A deterministic scheduling engine fits tasks, breaks, and focus sessions around your actual sleep schedule, meal times, and protected commitments without overlapping.
- **Privacy by Design**: Tasks and schedule state remain stored in your browser's `localStorage` and processed through your local machine's Ollama instance. Nothing is sent to external cloud AI providers.

---

## Screenshots

<!--
  Working note on screenshot assets:
  The repository contains raw timestamped captures in `docs/screenshots/`.
  The canonical filenames below are reserved for curated documentation captures.
  Placeholders are retained below where specific standardized captures are not yet mapped.
-->

### Dashboard & Focus Flow
<!-- Canonical: docs/screenshots/dashboard.png -->
*(Screenshot pending: `docs/screenshots/dashboard.png`)*

### Personalized Onboarding
<!-- Canonical: docs/screenshots/onboarding.png -->
*(Screenshot pending: `docs/screenshots/onboarding.png`)*

### Daily Schedule & Routine Blocks
<!-- Canonical: docs/screenshots/personalized-schedule.png -->
*(Screenshot pending: `docs/screenshots/personalized-schedule.png`)*

### Actionable Subtask Breakdown
<!-- Canonical: docs/screenshots/task-breakdown.png -->
*(Screenshot pending: `docs/screenshots/task-breakdown.png`)*

### Multi-Horizon Planning Views
<!-- Canonical: docs/screenshots/planning-views.png -->
*(Screenshot pending: `docs/screenshots/planning-views.png`)*

---

## Features

- **Rapid Brain Dump**: Capture tasks instantly with optional due dates, categories, and durations without complex form requirements.
- **Natural-Language Explicit Duration Parsing**: Detects durations directly from task titles (e.g., *"Study OS for 2 hours"*, *"Read paper for 45 mins"*), skipping redundant AI roundtrips and honoring your explicit intent.
- **AI-Assisted Task Analysis**: When connected to local Ollama (`gemma3:1b`), SlothMode infers:
  - **Category**: `college`, `exam_prep`, `chore`, `health`, `personal`, or `work`.
  - **Duration Estimate**: Realistic student-paced duration bounded between 5 and 480 minutes.
  - **Urgency**: `critical`, `high`, `medium`, or `low`.
  - **Actionable Subtasks**: Up to 6 bite-sized steps to overcome task inertia.
  - **Scheduling Tips & Notes**: Gentle recommendations for pacing and deadline awareness.
- **Personalized Onboarding & Routine Setup**: An optional, low-pressure 9-step wizard configures wake-up times, target bedtime/sleep needs, class/work hours, meal times (lunch and dinner), and schedule flexibility.
- **Deterministic Zero-Overlap Scheduling**:
  - LLMs never assign clock times. The scheduler mathematically guarantees zero overlapping intervals.
  - Respects protected daily routine blocks (sleep, class/work, lunch, and dinner).
  - Automatically splits lengthy tasks into manageable 45–120 minute focus sessions (e.g., *Part 1 of 2*).
  - Automatically inserts 10-minute gentle breaks and 20-minute restorative pauses after extended deep focus.
  - Enforces deadlines, placing tasks before cutoff times and reporting unscheduled overflow if a task cannot fit today.
- **Calm Focus Mode**: Dedicated distraction-reduced timer for active sessions with pause/resume, early finish without guilt, and an *"I'm stuck"* helper offering smaller next steps or short breaks.
- **Multi-Horizon Planning**: Seamlessly switch between **Today**, **Tomorrow**, and **This Week** (Monday–Sunday) calendar views.
- **Task Management & Rescheduling**: Edit tasks, check off individual subtasks, track progress, and easily re-estimate or reschedule overdue items.
- **Transparent Provenance Badges**: UI badges clarify how each duration was determined (`🎯 Explicit`, `✨ AI`, `🌱 Rule-based`, `✏️ Manual`, or `⏱ Provisional`).
- **Resilient Offline Fallback**: If Ollama is offline or the model is missing, the backend seamlessly switches to deterministic rule-based heuristics without disrupting your workflow.
- **Local Persistence**: All tasks, routine settings, and onboarding preferences persist entirely in browser `localStorage`.

---

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), [Lucide React](https://lucide.dev/) (icons), and custom Vanilla CSS.
  - *Purpose*: Renders the calm user interface, timeline visualization, focus timer, and onboarding wizard.
- **Backend**: [Express 5](https://expressjs.com/) on [Node.js](https://nodejs.org/) (ES modules), `cors`, `dotenv`.
  - *Purpose*: Provides API endpoints for health monitoring, Ollama communication, duration parsing, and schedule calculation.
- **Local AI Inference**: [Ollama](https://ollama.ai/) running **Gemma 3 1B** (`gemma3:1b`).
  - *Purpose*: Performs semantic task classification, effort estimation, and actionable subtask breakdowns locally via JSON mode.
- **Scheduling Logic**: Standalone deterministic TypeScript/JavaScript scheduling engine (`server/scheduler.js`).
  - *Purpose*: Implements mathematical timeline placement, focus-session splitting, break insertion, and routine block protection.

---

## Architecture

```
                    ┌────────────────────────────────────────┐
                    │             React Frontend             │
                    │   Vite (Port 5173) · LocalStorage      │
                    └──────────────────┬─────────────────────┘
                                       │ HTTP Proxy (/api)
                                       ▼
                    ┌────────────────────────────────────────┐
                    │         Express Backend Server         │
                    │         Node.js (Port 3001)            │
                    └──────────┬───────────────────┬─────────┘
                               │                   │
      POST /api/chat (JSON)    │                   │ Task Metadata
      Timeout: 15s             ▼                   ▼
      ┌────────────────────────────────┐   ┌─────────────────────────┐
      │     Local Ollama Instance      │   │   Deterministic         │
      │          (Port 11434)          │   │   Scheduler Engine      │
      │         gemma3:1b              │   │   (server/scheduler.js) │
      └────────────────────────────────┘   └─────────────┬───────────┘
                                                         │
                                                         ▼
                                           ┌─────────────────────────┐
                                           │ Zero-Overlap Daily Plan │
                                           │ Focus Blocks & Pauses   │
                                           └─────────────────────────┘
```

### Data Flow
1. **Task Input**: User creates or edits tasks in the frontend.
2. **Explicit Duration Check**: If a task title contains an explicit duration (e.g., *"45m"*, *"2 hours"*), Ollama is bypassed to minimize latency and honor user intent.
3. **AI Task Analysis**: If unestimated, the Express backend sends a structured JSON prompt to Ollama (`/api/chat`) requesting classification, estimated duration, urgency, and subtasks.
4. **Defensive Validation & Fallback**: Backend validates the JSON response. If Ollama is offline, times out (15s), or returns invalid values (e.g. non-numeric or > 480m), `ruleBasedFallback()` safely computes heuristic estimates with `aiGenerated: false`.
5. **Deterministic Scheduling**: The scheduler consumes verified task metadata, sorts by urgency and deadline proximity, splits oversized sessions, respects protected routine blocks, inserts restorative breaks, and builds an conflict-free timeline.
6. **Display & Focus**: Frontend receives the enriched plan, displays timeline cards, and supports launching distraction-reduced focus sessions.

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended).
- **npm**: v9.0.0 or higher.
- **Ollama** *(Optional, recommended for AI features)*: Installed and running on your machine.
- **Gemma 3 1B Model**: Pulled in Ollama (`gemma3:1b`).

> [!NOTE]
> Installing SlothMode's npm dependencies does **not** automatically install or launch Ollama. Ollama must be installed and started separately if you want AI-assisted task breakdown. If Ollama is not installed or running, SlothMode still functions fully using its built-in rule-based fallback engine.

---

## Installation & Local Setup

### 1. Clone the Repository
```bash
git clone https://github.com/gargijoshi9/SlothMode.git
cd SlothMode
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. (Optional) Set Up Ollama & Pull Gemma 3 1B
If you want local AI task breakdown:

1. Download and install Ollama from [ollama.ai](https://ollama.ai/) or install via Homebrew on macOS:
   ```bash
   brew install ollama
   ```
2. Start the Ollama background service:
   ```bash
   ollama serve
   ```
3. In another terminal window, pull the compact Gemma 3 1B model:
   ```bash
   ollama pull gemma3:1b
   ```

### 4. Configure Environment Variables
Copy the sample environment configuration file:
```bash
cp .env.example .env
```
The default `.env` is configured for local development:
```env
PORT=3001
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:1b
```

### 5. Start the Application

You can start both backend and frontend concurrently with one command:
```bash
npm run dev:all
```

Alternatively, you can run the backend and frontend in two separate terminal windows:

**Terminal 1 (Backend Express Server):**
```bash
npm run server
```

**Terminal 2 (Frontend Vite Dev Server):**
```bash
npm run dev
```

### 6. Open SlothMode
Open your web browser and navigate to:
```
http://localhost:5173
```
- Frontend UI: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- Health check status: `http://localhost:3001/api/health`

---

## Configuration

Supported environment variables (defined in `.env` and read by `server/index.js` and `server/ollama.js`):

| Variable | Default Value | Service | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | `3001` | Backend Express Server | HTTP port for the backend API. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama Client (`server/ollama.js`) | Base URL where the local Ollama instance is reachable. |
| `OLLAMA_MODEL` | `gemma3:1b` | Ollama Client (`server/ollama.js`) | Name of the local LLM model used for classification and estimation. |

---

## How to Use SlothMode

1. **Personalized Onboarding**: On first launch, step through the gentle wizard to configure your wake-up time, sleep needs, daily commitments (college, school, or work), meal times, and planning style. You can also click **Skip setup** to start with sensible gentle defaults.
2. **Review Routine Preferences**: Open **Daily Routine & Preferences** in the header at any time to adjust your planning window, routine blocks, or focus session duration preferences.
3. **Brain Dump Tasks**: Type any task into the input bar (e.g., *"Study operating systems lab for 2 hours"* or *"Clean desk"*). You can optionally assign a category, deadline, or manual duration.
4. **Observe AI Analysis**: Tasks without manual durations will display an `Estimating...` badge while Gemma 3 1B analyzes the task. Once completed, you will see category coloring, estimated focus time, urgency, and suggested subtasks.
5. **Generate Your Gentle Plan**: Click **Make my plan** (or **Replan my day**). The scheduler builds a balanced timeline starting from your active start time, fitting focus sessions and breaks around your protected routine blocks.
6. **Start Focus Sessions**: Click the **Start Focus** button beside any task or scheduled block to launch the calming, fullscreen Focus Mode. If you run into friction, use the **I'm stuck** button for gentle relief.
7. **Complete & Expand Subtasks**: Check off individual subtasks as you make progress, or mark the entire task completed.
8. **Switch Horizons**: Use the horizon tabs to review plans for **Today**, **Tomorrow**, or browse the **This Week** calendar.

---

## AI & Fallback Behavior

- **What the Local Model Does**: The local Gemma 3 1B model acts as a semantic interpreter. It suggests categories, reasonable durations for student tasks, urgency weights, and broken-down subtask steps.
- **Explicit Duration Bypass**: Whenever a duration is explicitly provided in the title (e.g. *"90 mins"*, *"1.5 hrs"*) or entered manually, SlothMode skips Ollama calls. This eliminates needless inference delay and preserves user intent.
- **Graceful Fallback Engine**: If Ollama is offline, unreachable, times out after 15 seconds, or returns malformed JSON, the backend invokes `ruleBasedFallback()`. This deterministic engine uses keyword matching and deadline math to assign safe categories, durations, and subtasks.
- **Transparent Attribution**: The UI explicitly flags provenance:
  - `🎯 Explicit`: Directly parsed from your text.
  - `✨ AI`: Generated by local Gemma 3 1B.
  - `🌱 Rule-based`: Computed via heuristic fallback.
  - `✏️ Manual`: Set directly by you.
  - `⏱ Provisional`: Default placeholder awaiting estimation.
- **Scheduling is 100% Deterministic**: The LLM never computes or outputs start/end times. All schedule timing is computed by deterministic algorithms in `server/scheduler.js`.

---

## Testing & Quality Checks

SlothMode includes a standalone test suite covering AI health checks, explicit duration parsing, fallback mechanics, deadline evaluation, and deterministic zero-overlap guarantees:

```bash
# Run the 29-suite backend and scheduler verification
node server/test_suite.js
```

Linting and build validation:
```bash
# Check code style with ESLint
npm run lint

# Validate TypeScript compilation and production build
npm run build
```

---

## Troubleshooting

### 1. "Ollama offline or not reachable"
- Check if Ollama is running by opening a terminal and running:
  ```bash
  curl http://127.0.0.1:11434/api/tags
  ```
- If it is not running, start Ollama with `ollama serve`.
- Verify that `OLLAMA_BASE_URL` in your `.env` matches the running port (`http://127.0.0.1:11434`).

### 2. "Model gemma3:1b is not installed yet"
- Verify your local models with:
  ```bash
  ollama list
  ```
- If `gemma3:1b` is missing, pull it:
  ```bash
  ollama pull gemma3:1b
  ```

### 3. Frontend Displays "Cannot reach backend"
- Make sure the backend server is running on port 3001 (`npm run server` or `npm run dev:all`).
- Check `http://localhost:3001/api/health` directly in your browser.

### 4. Tasks Fall Back to "Rule-based" Even When Ollama is Running
- If the model takes longer than 15 seconds to respond (e.g. during cold-start on low-resource machines), the request will time out and safely trigger fallback. Subsequent requests are typically faster once the model is loaded in memory.
- Check backend console logs for specific fallback reasons.

---

## Project Structure

```
SlothMode/
├── docs/                     # Project documentation and screenshot assets
│   └── screenshots/          # Application screenshot images
├── server/                   # Express backend & deterministic scheduling engine
│   ├── dateUtils.js          # Calendar and timezone date calculation utilities
│   ├── durationParser.js     # Natural-language explicit duration parser
│   ├── index.js              # Express API server entry point & route handlers
│   ├── ollama.js             # Ollama client, JSON schema validation & fallback engine
│   ├── scheduler.js          # Deterministic zero-overlap daily & multi-horizon scheduler
│   └── test_suite.js         # Comprehensive 29-suite automated verification suite
├── src/                      # React frontend application
│   ├── App.tsx               # Primary application component, dashboard & state management
│   ├── App.css               # Core design system tokens, typography & component styles
│   ├── PersonalizedOnboardingModal.tsx # Multi-step onboarding and routine configuration wizard
│   ├── dateUtils.ts          # Frontend date formatting and week calculation helpers
│   ├── durationParser.ts     # Client-side explicit duration parser mirror
│   ├── onboardingUtils.ts    # Routine mapping and profile default utilities
│   └── types.ts              # TypeScript interfaces for tasks, schedules, and profiles
├── .env.example              # Sample environment configuration
├── package.json              # Project scripts and dependency declarations
├── tsconfig.json             # TypeScript project configuration
└── vite.config.ts            # Vite bundler configuration and API proxy
```

---

## Privacy & Data Handling

- **No Remote AI Cloud APIs**: Prompts are sent exclusively to your local loopback address (`http://127.0.0.1:11434`). No task titles, deadlines, or personal context are transmitted over the internet.
- **Client-Side Persistence**: Tasks, focus history, routine preferences, and completed items are stored strictly in your browser's `localStorage` (`slothmode_tasks_v1`, `slothmode_user_profile_v1`, etc.).
- **No Analytics or Trackers**: SlothMode contains no telemetry, external tracking scripts, or user fingerprinting.

---

## Contributing

Contributions, bug reports, and suggestions are welcome! SlothMode was created for Hacktoberfest 2026 under the *"Slow and Steady"* theme.

1. **Fork the repository** on GitHub.
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Verify tests and linting**:
   ```bash
   npm run lint
   npm run build
   node server/test_suite.js
   ```
4. **Commit your changes** with clear, descriptive commit messages.
5. **Open a Pull Request** describing the motivation and testing done.

---

## License

This project currently does not contain an explicit open-source license file in the repository root. A license (such as MIT or Apache 2.0) may need to be added by the repository maintainer.
