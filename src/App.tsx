import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Plus,
  Check,
  Clock3,
  Coffee,
  Leaf,
  Brain,
  Trash2,
  Moon,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Calendar,
  Layers,
  Info,
} from "lucide-react";
import "./App.css";
import type { Task, PlanResponse, HealthStatus } from "./types";

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (target.getTime() === today.getTime()) {
      return "Today";
    }
    if (target.getTime() === tomorrow.getTime()) {
      return "Tomorrow";
    }
    return target.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDisplayDeadline(deadlineStr?: string | null): string {
  if (!deadlineStr) return "";
  const trimmed = deadlineStr.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return trimmed;

    const today = new Date();
    const isSameYear = d.getFullYear() === today.getFullYear();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      isSameYear;

    const timeStr = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (isToday) {
      return `Today, ${timeStr}`;
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();

    if (isTomorrow) {
      return `Tomorrow, ${timeStr}`;
    }

    const dateStr = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: isSameYear ? undefined : "numeric",
    });

    return `${dateStr} at ${timeStr}`;
  } catch {
    return deadlineStr;
  }
}

const initialTasks: Task[] = [
  {
    id: 1,
    title: "Revise operating systems practical",
    category: "college",
    duration: 60,
    priority: "High",
    urgency: "high",
    done: false,
    scheduledDate: getTodayDateString(),
    deadline: null,
    subtasks: [
      { id: "sub-1-1", title: "Review process scheduling algorithms (20m)", done: false },
      { id: "sub-1-2", title: "Practice deadlock detection problems (25m)", done: false },
      { id: "sub-1-3", title: "Check practical lab code examples (15m)", done: false },
    ],
    schedulingTip: "Review key algorithms in a focused 45-minute sprint with a short break.",
    aiGenerated: true,
  },
  {
    id: 2,
    title: "Complete AI assignment",
    category: "college",
    duration: 45,
    priority: "High",
    urgency: "high",
    done: false,
    scheduledDate: getTodayDateString(),
    deadline: null,
    subtasks: [
      { id: "sub-2-1", title: "Review problem statement and rubric", done: false },
      { id: "sub-2-2", title: "Implement heuristic search code", done: false },
      { id: "sub-2-3", title: "Format summary report for submission", done: false },
    ],
    schedulingTip: "Clear your desk and turn off tabs for an uninterrupted 45m block.",
    aiGenerated: true,
  },
  {
    id: 3,
    title: "Reply to project teammates",
    category: "personal",
    duration: 15,
    priority: "Medium",
    urgency: "medium",
    done: false,
    scheduledDate: getTodayDateString(),
    deadline: null,
    subtasks: [
      { id: "sub-3-1", title: "Read latest discussion thread", done: false },
      { id: "sub-3-2", title: "Send brief status update and availability", done: false },
    ],
    schedulingTip: "Quick communications are best handled right after a focus block.",
    aiGenerated: false,
  },
];

function App() {
  // Load tasks from localStorage or initial state, safely handling legacy data
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem("slothmode_tasks");
      if (saved) {
        const parsed: Task[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((t) => ({
            ...t,
            scheduledDate: t.scheduledDate || null,
            deadline: t.deadline || null,
          }));
        }
      }
    } catch {
      // ignore
    }
    return initialTasks;
  });

  // Load planned schedule from localStorage
  const [plan, setPlan] = useState<PlanResponse | null>(() => {
    try {
      const saved = localStorage.getItem("slothmode_plan");
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  const [draft, setDraft] = useState("");
  const [draftScheduledDate, setDraftScheduledDate] = useState(getTodayDateString);
  const [draftDeadline, setDraftDeadline] = useState("");
  const [showDeadlineInput, setShowDeadlineInput] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([1]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Persist tasks in localStorage
  useEffect(() => {
    try {
      localStorage.setItem("slothmode_tasks", JSON.stringify(tasks));
    } catch (e) {
      console.warn("Failed to persist tasks:", e);
    }
  }, [tasks]);


  // Persist plan in localStorage
  useEffect(() => {
    try {
      if (plan) {
        localStorage.setItem("slothmode_plan", JSON.stringify(plan));
      } else {
        localStorage.removeItem("slothmode_plan");
      }
    } catch (e) {
      console.warn("Failed to persist plan:", e);
    }
  }, [plan]);

  // Check Ollama and backend health on mount and every 30s
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data: HealthStatus = await res.json();
        setHealth(data);
      } else {
        setHealth({
          status: "offline",
          ollama: {
            reachable: false,
            modelAvailable: false,
            configuredModel: "gemma3:1b",
            availableModels: [],
            message: `Server returned HTTP ${res.status}`,
          },
        });
      }
    } catch {
      setHealth({
        status: "offline",
        ollama: {
          reachable: false,
          modelAvailable: false,
          configuredModel: "gemma3:1b",
          availableModels: [],
          message: "Cannot reach backend. Start backend with 'npm run server'.",
        },
      });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkHealth();
    }, 0);
    const interval = setInterval(checkHealth, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [checkHealth]);


  const completed = tasks.filter((task) => task.done).length;
  const totalMinutes = tasks
    .filter((task) => !task.done)
    .reduce((sum, task) => sum + (task.duration || 30), 0);

  function toggleExpandTask(id: number) {
    setExpandedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;

    const newTask: Task = {
      id: Date.now(),
      title: draft.trim(),
      category: "personal",
      duration: 30,
      priority: "Medium",
      urgency: "medium",
      done: false,
      scheduledDate: draftScheduledDate || getTodayDateString(),
      deadline: draftDeadline.trim() || null,
      subtasks: [
        {
          id: `sub-${Date.now()}-1`,
          title: `Start with initial step for: ${draft.trim().slice(0, 32)}`,
          done: false,
        },
        {
          id: `sub-${Date.now()}-2`,
          title: "Complete main focus session",
          done: false,
        },
      ],
      schedulingTip: "Take it slow and steady. Work in focused intervals.",
      aiGenerated: false,
    };

    setTasks((current) => [...current, newTask]);
    setDraft("");
    setDraftDeadline("");
    setShowDeadlineInput(false);

  }

  function toggleTask(id: number) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id === id) {
          const newDone = !task.done;
          return {
            ...task,
            done: newDone,
            subtasks: task.subtasks?.map((s) => ({ ...s, done: newDone })),
          };
        }
        return task;
      })
    );

    // Update in plan schedule if present
    setPlan((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        schedule: prev.schedule.map((item) =>
          item.taskId === id ? { ...item, done: !item.done } : item
        ),
      };
    });
  }

  function toggleSubtask(taskId: number, subtaskId: string) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id === taskId && task.subtasks) {
          const updatedSubtasks = task.subtasks.map((sub) =>
            sub.id === subtaskId ? { ...sub, done: !sub.done } : sub
          );
          const allDone = updatedSubtasks.every((s) => s.done);
          return {
            ...task,
            subtasks: updatedSubtasks,
            done: allDone ? true : task.done,
          };
        }
        return task;
      })
    );
  }

  function deleteTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id));
    setPlan((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        schedule: prev.schedule.filter((item) => item.taskId !== id),
      };
    });
  }

  async function generatePlan(isReplan = false) {
    if (tasks.length === 0) return;
    setIsPlanning(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          options: {
            startHour: 9,
            endHour: 18,
            useCurrentTimeAsStart: isReplan,
            maxSessionMinutes: 45,
            shortBreakMinutes: 10,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const planData: PlanResponse = await res.json();
      setPlan(planData);

      // Update tasks with AI enriched attributes
      if (Array.isArray(planData.enrichedTasks)) {
        setTasks(planData.enrichedTasks);
      }
    } catch (err: unknown) {
      console.error("Planning failed:", err);
      const msg = err instanceof Error ? err.message : "Failed to generate schedule";
      setErrorMessage(
        `${msg}. Using your offline task list while waiting for the server.`
      );
    } finally {
      setIsPlanning(false);
    }
  }

  const isAiOnline = health?.ollama.reachable && health?.ollama.modelAvailable;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          <span>
            sloth<span className="brand-light">mode</span>
          </span>
        </a>

        <p className="nav-label">YOUR SPACE</p>
        <a className="nav-item active" href="#today">
          <Clock3 size={18} /> My day
        </a>
        <a className="nav-item" href="#tasks">
          <Check size={18} /> My tasks
        </a>

        <div className="sidebar-bottom">
          <div className="sloth-card">
            <span className="sloth-emoji">🦥</span>
            <h3>Slow is a superpower.</h3>
            <p>You don't have to do everything at once. One thing at a time.</p>
          </div>
          <p className="local-note">
            <span /> Designed for a calmer day
          </p>
        </div>
      </aside>

      <section className="main-content" id="today">
        <header className="topbar">
          <span className="date-label">YOUR SPACE, YOUR PACE</span>

          {/* Local AI status pill */}
          <div
            className="ai-pill"
            title={
              health?.ollama.message ||
              "Checking local Ollama & Gemma 3 1B connectivity..."
            }
          >
            <span
              className={`ai-dot ${isAiOnline ? "online" : "fallback"}`}
            />
            <span>
              {isAiOnline
                ? `Local AI Ready (${health?.ollama.configuredModel})`
                : "Gentle Fallback Mode"}
            </span>
          </div>
        </header>

        {/* AI Info Banner if model not ready or server offline */}
        {health && !isAiOnline && (
          <div className="ai-banner" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Local AI is in fallback mode.</strong>
              <p>
                SlothMode will still estimate effort and schedule breaks using its
                deterministic scheduler. To activate local Gemma 3 1B, run:{" "}
                <code>ollama run gemma3:1b</code>
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="ai-banner" style={{ background: "#fae6e3", color: "#b94b39", borderColor: "#f6d8d0" }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Planning Notice</strong>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        <section className="welcome">
          <div>
            <p className="eyebrow">A LITTLE PROGRESS IS STILL PROGRESS</p>
            <h1>
              Let's take it <span>slow.</span>
            </h1>
            <p className="welcome-subtitle">
              Empty your mind. We'll help you figure out the rest.
            </p>
          </div>
          <div className="welcome-art" aria-label="Sloth illustration">
            🦥
            <span className="sparkle sparkle-one">✳</span>
            <span className="sparkle sparkle-two">✦</span>
          </div>
        </section>

        <section className="brain-dump panel">
          <div className="section-heading">
            <div className="heading-icon">
              <Brain size={20} />
            </div>
            <div>
              <h2>Get it off your mind</h2>
              <p>Big task, tiny task, random reminder — put it all here.</p>
            </div>
          </div>
          <form className="task-form" onSubmit={addTask}>
            <div className="task-form-main">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. Study OS, finish assignment, call a friend..."
                aria-label="Describe a task"
              />
              <button type="submit" className="add-button">
                <Plus size={18} /> Add task
              </button>
            </div>

            <div className="task-form-options">
              {/* Schedule Date field */}
              <div className="task-option-item">
                <label className="option-label" htmlFor="task-schedule-date">
                  <Calendar size={14} className="option-icon" />
                  <span>Schedule date:</span>
                </label>
                <input
                  id="task-schedule-date"
                  type="date"
                  className="date-picker-input"
                  value={draftScheduledDate}
                  onChange={(e) => setDraftScheduledDate(e.target.value)}
                  aria-label="Date you plan to work on this task"
                />
              </div>

              {/* Deadline field (optional) */}
              <div className="task-option-item">
                {!showDeadlineInput ? (
                  <button
                    type="button"
                    className="toggle-deadline-btn"
                    onClick={() => setShowDeadlineInput(true)}
                    title="Add an optional completion deadline"
                  >
                    <Clock3 size={14} />
                    <span>+ Add deadline</span>
                  </button>
                ) : (
                  <div className="deadline-input-group">
                    <label className="option-label" htmlFor="task-deadline-datetime">
                      <Clock3 size={14} className="option-icon" />
                      <span>Deadline:</span>
                    </label>
                    <input
                      id="task-deadline-datetime"
                      type="datetime-local"
                      className="datetime-picker-input"
                      value={draftDeadline}
                      onChange={(e) => setDraftDeadline(e.target.value)}
                      aria-label="Task deadline date and time"
                    />
                    <button
                      type="button"
                      className="clear-deadline-btn"
                      onClick={() => {
                        setDraftDeadline("");
                        setShowDeadlineInput(false);
                      }}
                      title="Remove deadline"
                      aria-label="Remove deadline"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          </form>

          <p className="hint">
            <Sparkles size={14} /> Local AI breaks down your tasks and schedules calm breaks.
          </p>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon green">
              <Check size={19} />
            </span>
            <span className="stat-label">DONE SO FAR</span>
            <strong>
              {completed}
              <small> / {tasks.length}</small>
            </strong>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon peach">
              <Clock3 size={19} />
            </span>
            <span className="stat-label">TIME LEFT TO PLAN</span>
            <strong>
              {Math.floor(totalMinutes / 60)}
              <small>h </small>
              {totalMinutes % 60}
              <small>m</small>
            </strong>
            <p className="stat-footnote">
              {plan?.metrics.totalFocusMinutes
                ? `${plan.metrics.totalFocusMinutes}m planned focus · ${plan.metrics.totalBreakMinutes}m breaks`
                : "Estimated from your tasks"}
            </p>
          </div>
          <div className="stat-card">
            <span className="stat-icon lavender">
              <Coffee size={19} />
            </span>
            <span className="stat-label">YOUR REMINDER</span>
            <strong className="gentle-text">Take a breath.</strong>
            <p className="stat-footnote">Rest is productive, too.</p>
          </div>
        </section>

        {/* Schedule Timeline Section (Shown once plan is created) */}
        {plan && (
          <section className="schedule-section">
            <div className="schedule-header">
              <div>
                <p className="eyebrow">YOUR GENTLE TIMELINE</p>
                <h2>Today's Pace & Flow</h2>
                <p>
                  Working window: {plan.dayWindow.start} – {plan.dayWindow.end} ·{" "}
                  {plan.aiStatus?.note}
                </p>
              </div>
              <div className="schedule-meta-chips">
                <span className="schedule-chip">
                  <Clock3 size={13} /> {plan.metrics.totalFocusMinutes}m Focus
                </span>
                <span className="schedule-chip">
                  <Coffee size={13} /> {plan.metrics.totalBreakMinutes}m Rest
                </span>
                <span className="schedule-chip">
                  <Layers size={13} /> {plan.schedule.length} Sessions
                </span>
              </div>
            </div>

            {/* Unscheduled / Overflow explanations if any */}
            {plan.overflowTasks && plan.overflowTasks.length > 0 && (
              <div className="overflow-box">
                <div className="overflow-title">
                  <AlertCircle size={15} />
                  <span>Tasks needing replanning or overflow:</span>
                </div>
                <ul className="overflow-list">
                  {plan.overflowTasks.map((ot) => (
                    <li key={ot.taskId}>
                      <strong>{ot.taskTitle}</strong>: {ot.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="schedule-timeline">
              {plan.schedule.map((item) => (
                <div
                  key={item.id}
                  className={`schedule-item schedule-item-${item.type}`}
                >
                  <div className="item-time-col">
                    <span className="item-time-range">
                      {item.start} – {item.end}
                    </span>
                    <span className="item-duration">{item.durationMinutes} min</span>
                  </div>

                  <div className="item-content">
                    <div className="item-header-row">
                      {item.type === "task" ? (
                        <h4 className="item-title">{item.title}</h4>
                      ) : item.type === "break" ? (
                        <h4 className="item-title" style={{ color: "#4d6b47" }}>
                          {item.title}
                        </h4>
                      ) : (
                        <h4 className="item-title" style={{ color: "#61685d" }}>
                          {item.title}
                        </h4>
                      )}

                      {item.partIndex && item.totalParts && item.totalParts > 1 && (
                        <span className="item-part-badge">
                          Part {item.partIndex} of {item.totalParts}
                        </span>
                      )}

                      {item.category && (
                        <span className="priority priority-low" style={{ textTransform: "capitalize" }}>
                          {item.category.replace("_", " ")}
                        </span>
                      )}

                      {item.aiGenerated && (
                        <span className="ai-tag ai-true" title="Categorized by local Gemma AI">
                          <Sparkles size={10} /> AI
                        </span>
                      )}

                      {item.deadline && (
                        <span className="schedule-deadline-tag" title="Target completion deadline">
                          Due: {formatDisplayDeadline(item.deadline)}
                        </span>
                      )}
                    </div>


                    <p className="item-desc">
                      {item.type === "break"
                        ? "Step away from the screen, stretch, and let your subconscious process what you just did."
                        : item.schedulingTip ||
                          "Focus with zero multitasking during this block."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="tasks-section" id="tasks">
          <div className="tasks-title-row">
            <div>
              <p className="eyebrow">SMALL STEPS COUNT</p>
              <h2>
                Today's intentions <span>({tasks.length})</span>
              </h2>
            </div>
            <div className="plan-actions-group">
              {plan && (
                <button
                  className="replan-button"
                  onClick={() => generatePlan(true)}
                  disabled={isPlanning || tasks.length === 0}
                  title="Replan remaining tasks without losing completed progress"
                >
                  <RefreshCw
                    size={15}
                    className={isPlanning ? "loading-spinner" : ""}
                  />
                  Replan my day
                </button>
              )}
              <button
                className="plan-button"
                onClick={() => generatePlan(false)}
                disabled={isPlanning || tasks.length === 0}
              >
                <Sparkles
                  size={17}
                  className={isPlanning ? "loading-spinner" : ""}
                />
                {isPlanning ? "Planning your day..." : "Make my plan"}
              </button>
            </div>
          </div>

          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty-state">
                <span>🌿</span>
                <h3>A little breathing room.</h3>
                <p>No tasks here. Add something whenever you're ready.</p>
              </div>
            ) : (
              tasks.map((task) => {
                const isExpanded = expandedTaskIds.includes(task.id);
                const subtasks = task.subtasks || [];
                const doneSubtasks = subtasks.filter((s) => s.done).length;

                return (
                  <div
                    key={task.id}
                    className={`task-row-container ${task.done ? "task-done" : ""}`}
                  >
                    <div className="task-row-main">
                      <button
                        className="task-expand-btn"
                        onClick={() => toggleExpandTask(task.id)}
                        aria-label={isExpanded ? "Collapse task" : "Expand task"}
                      >
                        {isExpanded ? (
                          <ChevronDown size={17} />
                        ) : (
                          <ChevronRight size={17} />
                        )}
                      </button>

                      <button
                        className={`task-check ${task.done ? "checked" : ""}`}
                        onClick={() => toggleTask(task.id)}
                        aria-label={
                          task.done ? "Mark task incomplete" : "Complete task"
                        }
                      >
                        {task.done && <Check size={15} />}
                      </button>

                      <div className="task-info">
                        <h3>{task.title}</h3>
                        <div className="task-meta">
                          <span style={{ textTransform: "capitalize" }}>
                            {task.category?.replace("_", " ")}
                          </span>
                          <span className="meta-dot">·</span>
                          <span>
                            <Clock3 size={13} /> {task.duration || 30} min
                          </span>
                          {task.scheduledDate && (
                            <>
                              <span className="meta-dot">·</span>
                              <span className="task-schedule-badge" title="Date you plan to work on this task">
                                <Calendar size={13} /> Plan: {formatDisplayDate(task.scheduledDate)}
                              </span>
                            </>
                          )}
                          {task.deadline && (
                            <>
                              <span className="meta-dot">·</span>
                              <span className="task-deadline-badge" title="Target completion deadline">
                                <Clock3 size={13} /> Due: {formatDisplayDeadline(task.deadline)}
                              </span>
                            </>
                          )}

                          {subtasks.length > 0 && (
                            <>
                              <span className="meta-dot">·</span>
                              <span>
                                {doneSubtasks}/{subtasks.length} steps
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {task.aiGenerated ? (
                        <span className="ai-tag ai-true" title="Enriched by local Gemma AI">
                          <Sparkles size={11} /> Gemma AI
                        </span>
                      ) : (
                        <span className="ai-tag ai-false" title="Generated by deterministic fallback rules">
                          Fallback
                        </span>
                      )}

                      <span
                        className={`priority priority-${(
                          task.urgency || task.priority || "medium"
                        ).toLowerCase()}`}
                      >
                        {task.urgency || task.priority}
                      </span>

                      <button
                        className="delete-button"
                        onClick={() => deleteTask(task.id)}
                        aria-label={`Delete ${task.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Expandable subtasks & AI tips */}
                    {isExpanded && subtasks.length > 0 && (
                      <div className="task-details">
                        <div className="subtasks-header">
                          <span className="subtasks-title">ACTIONABLE STEPS</span>
                          {task.dependencyNote && (
                            <span style={{ fontSize: "10px", color: "#b94b39" }}>
                              {task.dependencyNote}
                            </span>
                          )}
                        </div>

                        <ul className="subtask-list">
                          {subtasks.map((sub) => (
                            <li
                              key={sub.id}
                              className={`subtask-item ${
                                sub.done ? "subtask-done" : ""
                              }`}
                              onClick={() => toggleSubtask(task.id, sub.id)}
                            >
                              <button
                                type="button"
                                className={`subtask-check ${
                                  sub.done ? "checked" : ""
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSubtask(task.id, sub.id);
                                }}
                                aria-label="Toggle step completion"
                              >
                                {sub.done && <Check size={12} />}
                              </button>
                              <span>{sub.title}</span>
                            </li>
                          ))}
                        </ul>

                        {task.schedulingTip && (
                          <div className="task-tip">
                            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>{task.schedulingTip}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <footer className="footer">
          <Moon size={15} /> You are a human being, not a productivity machine.
        </footer>
      </section>
    </main>
  );
}

export default App;
