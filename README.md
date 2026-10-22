# 🦥 SlothMode — Local AI & Smart Scheduling for Students

> **Hacktoberfest 2026 DEV Challenge Week 3 — Theme: “Slow and Steady”**  
> *"You are a human being, not a productivity machine. Slow is a superpower."*

SlothMode is a privacy-first, gentle productivity web application built for students who struggle with cognitive overload and the mental exhaustion of planning. Instead of forcing students into hyper-rigid, overwhelming time-blocking matrices, SlothMode takes a messy brain-dump of tasks, uses **local AI (Gemma 3 1B via Ollama)** to classify effort and break items into bite-sized steps, and applies a **deterministic scheduling algorithm** to generate a calm, conflict-free daily flow with built-in restorative breaks.

---

## 🎯 The Problem & Target Users

### The Problem
Traditional productivity software creates a paradox: **planning takes so much cognitive energy that students run out of momentum before actually starting.** When deadlines pile up, students often:
- Struggle to estimate task durations realistically.
- Skip breaks out of anxiety, leading to early burnout.
- Suffer from decision paralysis when facing vague, high-stakes tasks (e.g., *"Study for Operating Systems practical"*).
- Rely on paid cloud AI services that compromise academic privacy and require internet connectivity.

### Target Users
- **College students & exam takers** juggling practicals, projects, and assignments.
- **Neurodivergent learners (ADHD / executive dysfunction)** who benefit from concrete subtasks and enforced recovery pauses.
- **Privacy-conscious builders** who want local, offline-capable AI running directly on their hardware.

---

## ✨ Features & Capabilities

- **Gentle Brain-Dump**: Add tasks in seconds without worrying about categories, formats, or complicated tags. Optional deadline support is available right from the input bar.
- **Genuine Local-AI Classification**: Tasks are processed by Google's **Gemma 3 1B** through Ollama's local HTTP API to determine:
  - Standardized category (`college`, `exam_prep`, `chore`, `health`, `personal`, or `work`)
  - Realistic time estimates (5–480 minutes)
  - Urgency level (`critical`, `high`, `medium`, `low`)
  - Concrete, bite-sized subtasks (e.g., *"Review high-yield flashcards (25m)"*)
  - Proactive scheduling tips and dependency notes
- **Deterministic, Conflict-Free Daily Scheduler**:
  - LLMs are never allowed to hallucinate invalid or overlapping clock times. Time allocation is 100% deterministic and mathematical.
  - Automatically splits sessions longer than 45 minutes into manageable chunks (e.g., *Part 1 of 2*).
  - Intersperses restorative breaks (10m short pauses, 20m deep sloth breaks after 90m of focus).
  - Enforces deadlines, placing tasks before their target times and explaining overflow if a task cannot fit today.
  - Accommodates blocked commitments (e.g., lunch, recurring commitments).
- **Interactive Checklists & Progress**: Check off overall tasks or expand individual tasks to complete specific subtasks.
- **"Replan My Day" Action**: Dynamically recalculates remaining tasks from the current time forward without losing finished work or erasing completed history.
- **Robust Deterministic Rule-Based Fallback**: If Ollama is offline or the model is missing, SlothMode transitions to a rule-based engine. Fallback and AI-generated results are distinguished in the UI with badges (`✨ Gemma AI` vs `Fallback`).
- **Zero Cloud Leakage**: Tasks and schedule state persist in the browser's `localStorage` and local Ollama instance. No private data is transmitted to external servers.

---

## 🏗️ Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │             React Frontend             │
                      │   (Vite, TypeScript, Custom CSS)       │
                      └──────────────────┬─────────────────────┘
                                         │ Proxy: /api
                                         ▼
                      ┌────────────────────────────────────────┐
                      │          Express Node.js Server        │
                      │                 Port 3001              │
                      └──────────┬───────────────────┬─────────┘
                                 │                   │
         POST /api/chat (JSON)   │                   │ Deterministic
                                 ▼                   ▼ Algorithm
         ┌───────────────────────────────┐   ┌─────────────────────────┐
         │     Local Ollama Instance     │   │   SlothMode Scheduler   │
         │          (Port 11434)         │   │ (Session Splitting,     │
         │         gemma3:1b             │   │  Breaks, Deadlines)     │
         └───────────────────────────────┘   └─────────────────────────┘
```

### Key Modules
- `server/index.js`: Express server providing `GET /api/health`, `POST /api/classify`, and `POST /api/plan`.
- `server/ollama.js`: Local Ollama integration, chat API client with JSON schema enforcement, sanitization, and deterministic fallback.
- `server/scheduler.js`: Standalone deterministic scheduler with zero-overlap mathematical guarantees and deadline enforcement.
- `src/App.tsx`: React dashboard with timeline view, subtask expanders, live AI health status, and quick-add controls.
- `src/App.css`: Custom gentle styling adhering to DM Sans / Manrope and soft earth tones.

---

## 🖥️ Installation & Setup (macOS)

### 1. Prerequisites
- **Node.js** (v18 or higher; tested on Node v25 / macOS)
- **Ollama** installed on your machine:
  ```bash
  # Install via Homebrew
  brew install ollama
  ```

### 2. Pull the Gemma 3 1B Model
Download the compact, efficient Gemma 3 1B model locally:
```bash
ollama run gemma3:1b
```
*(Once downloaded, you can exit the chat prompt using `/bye` — Ollama will continue running in the background).*

### 3. Clone & Install SlothMode
```bash
git clone https://github.com/gargijoshi9/SlothMode.git
cd SlothMode
npm install
```

### 4. Configure Environment
Copy the example environment configuration:
```bash
cp .env.example .env
```
Default `.env` settings:
```env
PORT=3001
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:1b
```

### 5. Start the Application
Run both the backend Express server and Vite frontend concurrently:
```bash
npm run dev:all
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- Health check: `http://localhost:3001/api/health`

Alternatively, you can run the server and frontend in separate terminals:
```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend
npm run dev
```

---

## 🔒 Privacy, Local Inference & Cost Efficiency

| Dimension | Cloud AI APIs (OpenAI / Claude) | SlothMode (Local Gemma via Ollama) |
| :--- | :--- | :--- |
| **Data Privacy** | Prompts and student schedules sent across the internet | 100% on-device; requests never leave `localhost` |
| **API Costs** | Recurring monthly fees / pay-per-token charges | **$0.00 forever**; runs free on consumer hardware |
| **Offline Reliability** | Fails completely if campus Wi-Fi drops | Fully functional offline once model is pulled |
| **Latency** | Network round-trip variability | Local socket communication (`127.0.0.1`) |

---

## 🛡️ Limitations & Fallback Behavior

1. **First-Run Model Download**: Ollama requires downloading `gemma3:1b` (~1.2 GB) once before offline AI inference is possible.
2. **Deterministic Fallback Transparency**: If Ollama is not running, the backend automatically activates its rule-based keyword engine. SlothMode marks these tasks with a distinct `Fallback` tag in the UI so the user is never misled into thinking AI generated a result when it did not.
3. **Working Hours Default**: The scheduler defaults to a 09:00 to 18:00 window with a built-in lunch pause (13:00 to 13:45). If tasks exceed available time, the app highlights them in an **Overflow & Notice** banner rather than quietly dropping them.

---

## 🧪 Testing & Verification

Run the automated verification suite to test health checks, real Gemma inference, fallback modes, deadline checks, and zero-overlap guarantees:
```bash
node server/test_suite.js
```

Run ESLint and production build validation:
```bash
npm run lint
npm run build
```

---

## 📸 Demo Flow

1. **Brain Dump**: Type `Revise operating systems practical` and click **Add Task**.
2. **Make My Plan**: Click **Make my plan** (`Sparkles` icon).
3. **Local AI Enrichment**: Gemma 3 1B classifies the task as `college` / `high` urgency and automatically breaks it down into actionable steps.
4. **Paced Flow**: The app outputs a calm schedule (e.g. 09:00 - 09:45 focus, followed by a 10-minute restorative Sloth Pause).
5. **Replan**: Completed tasks stay marked done, and clicking **Replan my day** reschedules unfinished work seamlessly.

---

*“A little progress is still progress.”*
