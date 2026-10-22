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
  ChevronLeft,
  RefreshCw,
  AlertCircle,
  Calendar,
  Layers,
  Info,
  X,
  Edit3,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import "./App.css";
import type { Task, PlanResponse, HealthStatus, TaskCategory, PlanningHorizon } from "./types";

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDaysOfWeek(mondayDate: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      new Date(
        mondayDate.getFullYear(),
        mondayDate.getMonth(),
        mondayDate.getDate() + i
      )
    );
  }
  return days;
}

function formatWeekHeading(mondayDate: Date): string {
  const sundayDate = new Date(
    mondayDate.getFullYear(),
    mondayDate.getMonth(),
    mondayDate.getDate() + 6
  );

  const sameMonth = mondayDate.getMonth() === sundayDate.getMonth();
  const sameYear = mondayDate.getFullYear() === sundayDate.getFullYear();

  const monMonth = mondayDate.toLocaleDateString(undefined, { month: "short" });
  const sunMonth = sundayDate.toLocaleDateString(undefined, { month: "short" });

  if (sameMonth && sameYear) {
    return `${monMonth} ${mondayDate.getDate()} – ${sundayDate.getDate()}, ${mondayDate.getFullYear()}`;
  }
  if (sameYear) {
    return `${monMonth} ${mondayDate.getDate()} – ${sunMonth} ${sundayDate.getDate()}, ${mondayDate.getFullYear()}`;
  }
  return `${monMonth} ${mondayDate.getDate()}, ${mondayDate.getFullYear()} – ${sunMonth} ${sundayDate.getDate()}, ${sundayDate.getFullYear()}`;
}

function formatMonthHeading(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

interface MonthGridCell {
  date: Date;
  dateString: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

function getMonthGrid(displayedMonthDate: Date): MonthGridCell[] {
  const year = displayedMonthDate.getFullYear();
  const month = displayedMonthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat
  // We want Monday as first column (0), Sunday as last column (6)
  const dayOfWeek = firstDay.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const todayStr = getTodayDateString();
  const cells: MonthGridCell[] = [];

  // Previous month filler days
  const prevMonthDaysCount = new Date(year, month, 0).getDate();
  for (let i = mondayOffset - 1; i >= 0; i--) {
    const dayNum = prevMonthDaysCount - i;
    const cellDate = new Date(year, month - 1, dayNum);
    const dateString = toLocalDateString(cellDate);
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: dateString === todayStr,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    const dateString = toLocalDateString(cellDate);
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: dateString === todayStr,
    });
  }

  // Next month filler days to complete 7-day rows
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const cellDate = new Date(year, month + 1, i);
    const dateString = toLocalDateString(cellDate);
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: i,
      isCurrentMonth: false,
      isToday: dateString === todayStr,
    });
  }

  return cells;
}

function formatDayDetailHeading(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function isTaskOverdue(task: Task, now = new Date()): boolean {
  if (task.done || !task.deadline) return false;
  const trimmed = task.deadline.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(":").map(Number);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    return d < now;
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return false;
  return d < now;
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
  // Navigation tab: 'day' | 'week' | 'month'
  const [activeTab, setActiveTab] = useState<"day" | "week" | "month">("day");

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

  // Task adding form state
  const [draft, setDraft] = useState("");
  const [draftScheduledDate, setDraftScheduledDate] = useState(getTodayDateString);
  const [draftDeadline, setDraftDeadline] = useState("");
  const [showDeadlineInput, setShowDeadlineInput] = useState(false);

  // Week navigation state
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getMondayOfWeek(new Date())
  );

  // Month navigation state
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Selected date for day detail panel in month view
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);

  // Selected unscheduled task ID in Day Detail dropdown
  const [selectedUnscheduledTaskId, setSelectedUnscheduledTaskId] = useState<number | "">("");

  // Task editing modal state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<{
    id: number;
    title: string;
    scheduledDate: string;
    duration: number;
    deadline: string;
    done: boolean;
    category: TaskCategory;
    urgency: "critical" | "high" | "medium" | "low";
  }>({
    id: 0,
    title: "",
    scheduledDate: "",
    duration: 30,
    deadline: "",
    done: false,
    category: "personal",
    urgency: "medium",
  });

  const [isPlanning, setIsPlanning] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([1]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Planning horizon state: 'today' | 'tomorrow' | 'week' | 'month'
  const [planningHorizon, setPlanningHorizon] = useState<PlanningHorizon>(() => {
    try {
      const saved = localStorage.getItem("slothmode_horizon");
      if (saved === "today" || saved === "tomorrow" || saved === "week" || saved === "month") {
        return saved;
      }
    } catch {
      // ignore
    }
    return "today";
  });

  // Selected date for viewing timeline in Day view
  const [selectedTimelineDate, setSelectedTimelineDate] = useState<string>(() => {
    return getTodayDateString();
  });

  // Persist tasks in localStorage
  useEffect(() => {
    try {
      localStorage.setItem("slothmode_tasks", JSON.stringify(tasks));
    } catch (e) {
      console.warn("Failed to persist tasks:", e);
    }
  }, [tasks]);

  // Persist horizon in localStorage
  useEffect(() => {
    try {
      localStorage.setItem("slothmode_horizon", planningHorizon);
    } catch (e) {
      console.warn("Failed to persist horizon:", e);
    }
  }, [planningHorizon]);

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

  // Week navigation functions
  function prevWeek() {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToToday() {
    setCurrentWeekStart(getMondayOfWeek(new Date()));
  }

  // Month navigation functions
  function prevMonth() {
    setCurrentMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCurrentMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function goToCurrentMonth() {
    const now = new Date();
    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  function scheduleTaskToDate(taskId: number, dateStr: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, scheduledDate: dateStr } : t))
    );
    setPlan((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        schedule: prev.schedule.map((item) =>
          item.taskId === taskId ? { ...item, scheduledDate: dateStr } : item
        ),
      };
    });
  }

  // Task edit modal handlers
  function openEditTask(task: Task) {
    setEditingTask(task);
    setEditForm({
      id: task.id,
      title: task.title,
      scheduledDate: task.scheduledDate || "",
      duration: task.duration || 30,
      deadline: task.deadline || "",
      done: Boolean(task.done),
      category: task.category || "personal",
      urgency: (task.urgency || task.priority || "medium").toLowerCase() as
        | "critical"
        | "high"
        | "medium"
        | "low",
    });
  }

  function handleSaveEditedTask(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTask || !editForm.title.trim()) return;

    const updated: Task = {
      ...editingTask,
      title: editForm.title.trim(),
      scheduledDate: editForm.scheduledDate.trim() || null,
      duration: Math.max(5, Math.min(480, Number(editForm.duration) || 30)),
      deadline: editForm.deadline.trim() || null,
      done: editForm.done,
      category: editForm.category,
      urgency: editForm.urgency,
      priority:
        editForm.urgency === "critical" || editForm.urgency === "high"
          ? "High"
          : editForm.urgency === "low"
          ? "Low"
          : "Medium",
    };

    setTasks((current) =>
      current.map((t) => (t.id === editingTask.id ? updated : t))
    );

    // Update in generated plan schedule if present
    setPlan((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        schedule: prev.schedule.map((item) =>
          item.taskId === editingTask.id
            ? {
                ...item,
                title: updated.title,
                durationMinutes: updated.duration,
                done: updated.done,
                deadline: updated.deadline,
                scheduledDate: updated.scheduledDate,
                category: updated.category,
                urgency: updated.urgency,
              }
            : item
        ),
      };
    });

    setEditingTask(null);
  }

  function handleDeleteFromEdit(id: number) {
    deleteTask(id);
    setEditingTask(null);
  }

  function quickAddForDate(dateStr: string) {
    setDraftScheduledDate(dateStr);
    setActiveTab("day");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
            horizon: planningHorizon,
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

      // Focus timeline on the relevant date
      if (planningHorizon === "tomorrow") {
        setSelectedTimelineDate(getTomorrowDateString());
      } else if (planningHorizon === "today") {
        setSelectedTimelineDate(getTodayDateString());
      } else if (planData.schedule && planData.schedule.length > 0) {
        const firstTaskSession = planData.schedule.find((s) => s.type === "task");
        const targetDate = firstTaskSession?.date || planData.startDate || getTodayDateString();
        setSelectedTimelineDate(targetDate);
      }

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

  // Weekly calculations for the selected week
  const weekDays = getDaysOfWeek(currentWeekStart);
  const weekDateStrings = new Set(weekDays.map(toLocalDateString));
  const weekTasks = tasks.filter(
    (t) => t.scheduledDate && weekDateStrings.has(t.scheduledDate)
  );
  const weekTotalMinutes = weekTasks.reduce(
    (sum, t) => sum + (t.duration || 30),
    0
  );
  const weekCompletedCount = weekTasks.filter((t) => t.done).length;
  const weekRemainingCount = weekTasks.filter((t) => !t.done).length;
  const weekOverdueCount = weekTasks.filter((t) => isTaskOverdue(t)).length;
  const unscheduledTasks = tasks.filter(
    (t) => !t.scheduledDate || t.scheduledDate.trim() === ""
  );

  // Monthly calculations for the displayed month
  const monthYear = currentMonthDate.getFullYear();
  const monthMonthNum = String(currentMonthDate.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${monthYear}-${monthMonthNum}`;

  const monthTasks = tasks.filter(
    (t) => t.scheduledDate && t.scheduledDate.startsWith(monthPrefix)
  );
  const monthTotalMinutes = monthTasks.reduce(
    (sum, t) => sum + (t.duration || 30),
    0
  );
  const monthCompletedCount = monthTasks.filter((t) => t.done).length;
  const monthRemainingCount = monthTasks.filter((t) => !t.done).length;
  const monthOverdueCount = monthTasks.filter((t) => isTaskOverdue(t)).length;

  const monthGridCells = getMonthGrid(currentMonthDate);

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
        <button
          type="button"
          className={`nav-item ${activeTab === "day" ? "active" : ""}`}
          onClick={() => setActiveTab("day")}
        >
          <Clock3 size={18} /> My day
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "week" ? "active" : ""}`}
          onClick={() => setActiveTab("week")}
        >
          <Calendar size={18} /> Week view
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "month" ? "active" : ""}`}
          onClick={() => setActiveTab("month")}
        >
          <Calendar size={18} /> Month view
        </button>
        <button
          type="button"
          className="nav-item"
          onClick={() => {
            setActiveTab("day");
            setTimeout(() => {
              document.getElementById("tasks")?.scrollIntoView({ behavior: "smooth" });
            }, 50);
          }}
        >
          <Check size={18} /> My tasks
        </button>

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

          {/* View switcher in topbar */}
          <div className="view-switch-pills">
            <button
              type="button"
              className={`pill-btn ${activeTab === "day" ? "active" : ""}`}
              onClick={() => setActiveTab("day")}
            >
              Day view
            </button>
            <button
              type="button"
              className={`pill-btn ${activeTab === "week" ? "active" : ""}`}
              onClick={() => setActiveTab("week")}
            >
              Week view
            </button>
            <button
              type="button"
              className={`pill-btn ${activeTab === "month" ? "active" : ""}`}
              onClick={() => setActiveTab("month")}
            >
              Month view
            </button>
          </div>

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
          <div
            className="ai-banner"
            style={{
              background: "#fae6e3",
              color: "#b94b39",
              borderColor: "#f6d8d0",
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Planning Notice</strong>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 1: MY DAY VIEW (Original Dashboard Experience)       */}
        {/* ========================================================= */}
        {activeTab === "day" && (
          <>
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
                        <label
                          className="option-label"
                          htmlFor="task-deadline-datetime"
                        >
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
                      width: `${
                        tasks.length ? (completed / tasks.length) * 100 : 0
                      }%`,
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
            {plan && (() => {
              const planDates = Array.from(
                new Set(
                  plan.schedule.map(
                    (i) => i.date || i.scheduledDate || getTodayDateString()
                  )
                )
              ).sort();

              const activeTimelineDate =
                planDates.includes(selectedTimelineDate)
                  ? selectedTimelineDate
                  : planDates[0] || getTodayDateString();

              const displayedScheduleItems = plan.schedule.filter(
                (item) =>
                  (item.date || item.scheduledDate || getTodayDateString()) ===
                  activeTimelineDate
              );

              const dayFocusMins = displayedScheduleItems
                .filter((item) => item.type === "task")
                .reduce((acc, curr) => acc + curr.durationMinutes, 0);

              const dayBreakMins = displayedScheduleItems
                .filter((item) => item.type === "break")
                .reduce((acc, curr) => acc + curr.durationMinutes, 0);

              return (
                <section className="schedule-section">
                  <div className="schedule-header">
                    <div>
                      <p className="eyebrow">YOUR GENTLE TIMELINE</p>
                      <h2>
                        {activeTimelineDate === getTodayDateString()
                          ? "Today"
                          : activeTimelineDate === getTomorrowDateString()
                          ? "Tomorrow"
                          : formatDisplayDate(activeTimelineDate)}
                        's Pace & Flow
                      </h2>
                      <p>
                        Working window: {plan.dayWindow.start} – {plan.dayWindow.end} ·{" "}
                        {plan.aiStatus?.note}
                      </p>
                    </div>
                    <div className="schedule-meta-chips">
                      <span className="schedule-chip">
                        <Clock3 size={13} /> {dayFocusMins}m Focus
                      </span>
                      <span className="schedule-chip">
                        <Coffee size={13} /> {dayBreakMins}m Rest
                      </span>
                      <span className="schedule-chip">
                        <Layers size={13} /> {displayedScheduleItems.length} Sessions
                      </span>
                    </div>
                  </div>

                  {/* Multi-date switch chips when plan covers multiple dates */}
                  {planDates.length > 1 && (
                    <div className="timeline-date-selector">
                      <span className="timeline-date-label">TIMELINE DATE:</span>
                      <div className="timeline-date-chips">
                        {planDates.map((dStr) => (
                          <button
                            key={dStr}
                            type="button"
                            className={`timeline-date-chip ${
                              dStr === activeTimelineDate ? "active" : ""
                            }`}
                            onClick={() => setSelectedTimelineDate(dStr)}
                          >
                            {formatDisplayDate(dStr)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
                    {displayedScheduleItems.length === 0 ? (
                      <div className="cal-empty-state" style={{ padding: "24px 16px" }}>
                        <p>No focus sessions scheduled for {formatDisplayDate(activeTimelineDate)}.</p>
                        <span>Rest easy, or pick another date above to view your timeline.</span>
                      </div>
                    ) : (
                      displayedScheduleItems.map((item) => (
                        <div
                          key={item.id}
                          className={`schedule-item schedule-item-${item.type}`}
                        >
                          <div className="item-time-col">
                            <span className="item-time-range">
                              {item.start} – {item.end}
                            </span>
                            <span className="item-duration">
                              {item.durationMinutes} min
                            </span>
                          </div>

                          <div className="item-content">
                            <div className="item-header-row">
                              {item.type === "task" ? (
                                <h4 className="item-title">{item.title}</h4>
                              ) : item.type === "break" ? (
                                <h4
                                  className="item-title"
                                  style={{ color: "#4d6b47" }}
                                >
                                  {item.title}
                                </h4>
                              ) : (
                                <h4
                                  className="item-title"
                                  style={{ color: "#61685d" }}
                                >
                                  {item.title}
                                </h4>
                              )}

                              {item.partIndex &&
                                item.totalParts &&
                                item.totalParts > 1 && (
                                  <span className="item-part-badge">
                                    Part {item.partIndex} of {item.totalParts}
                                  </span>
                                )}

                              {item.category && (
                                <span
                                  className="priority priority-low"
                                  style={{ textTransform: "capitalize" }}
                                >
                                  {item.category.replace("_", " ")}
                                </span>
                              )}

                              {item.aiGenerated && (
                                <span
                                  className="ai-tag ai-true"
                                  title="Categorized by local Gemma AI"
                                >
                                  <Sparkles size={10} /> AI
                                </span>
                              )}

                              {item.deadline && (
                                <span
                                  className="schedule-deadline-tag"
                                  title="Target completion deadline"
                                >
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
                      ))
                    )}
                  </div>

                  {plan.horizon === "week" && (
                    <button
                      type="button"
                      className="view-switch-link-btn"
                      onClick={() => setActiveTab("week")}
                    >
                      <Calendar size={13} /> View full week calendar
                    </button>
                  )}
                  {plan.horizon === "month" && (
                    <button
                      type="button"
                      className="view-switch-link-btn"
                      onClick={() => setActiveTab("month")}
                    >
                      <Calendar size={13} /> View full month calendar
                    </button>
                  )}
                </section>
              );
            })()}

            <section className="tasks-section" id="tasks">
              <div className="tasks-title-row">
                <div>
                  <p className="eyebrow">SMALL STEPS COUNT</p>
                  <h2>
                    {planningHorizon === "today"
                      ? "Today's intentions"
                      : planningHorizon === "tomorrow"
                      ? "Tomorrow's intentions"
                      : planningHorizon === "week"
                      ? "This week's intentions"
                      : "This month's intentions"}{" "}
                    <span>({tasks.length})</span>
                  </h2>
                </div>
                <div className="plan-actions-group">
                  {/* Planning Horizon Selector */}
                  <div
                    className="horizon-pills-container"
                    role="radiogroup"
                    aria-label="Planning Horizon"
                  >
                    {(
                      [
                        { key: "today", label: "Today" },
                        { key: "tomorrow", label: "Tomorrow" },
                        { key: "week", label: "This Week" },
                        { key: "month", label: "This Month" },
                      ] as const
                    ).map((h) => (
                      <button
                        key={h.key}
                        type="button"
                        className={`horizon-pill ${
                          planningHorizon === h.key ? "active" : ""
                        }`}
                        onClick={() => setPlanningHorizon(h.key)}
                        aria-checked={planningHorizon === h.key}
                        role="radio"
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>

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
                      Replan
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
                    {isPlanning ? "Planning..." : "Make my plan"}
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
                        className={`task-row-container ${
                          task.done ? "task-done" : ""
                        }`}
                      >
                        <div className="task-row-main">
                          <button
                            className="task-expand-btn"
                            onClick={() => toggleExpandTask(task.id)}
                            aria-label={
                              isExpanded ? "Collapse task" : "Expand task"
                            }
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
                              task.done
                                ? "Mark task incomplete"
                                : "Complete task"
                            }
                          >
                            {task.done && <Check size={15} />}
                          </button>

                          <div
                            className="task-info"
                            style={{ cursor: "pointer" }}
                            onClick={() => openEditTask(task)}
                            title="Click to edit task details"
                          >
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
                                  <span
                                    className="task-schedule-badge"
                                    title="Date you plan to work on this task"
                                  >
                                    <Calendar size={13} /> Plan:{" "}
                                    {formatDisplayDate(task.scheduledDate)}
                                  </span>
                                </>
                              )}
                              {task.deadline && (
                                <>
                                  <span className="meta-dot">·</span>
                                  <span
                                    className="task-deadline-badge"
                                    title="Target completion deadline"
                                  >
                                    <Clock3 size={13} /> Due:{" "}
                                    {formatDisplayDeadline(task.deadline)}
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
                            <span
                              className="ai-tag ai-true"
                              title="Enriched by local Gemma AI"
                            >
                              <Sparkles size={11} /> Gemma AI
                            </span>
                          ) : (
                            <span
                              className="ai-tag ai-false"
                              title="Generated by deterministic fallback rules"
                            >
                              Fallback
                            </span>
                          )}

                          <span
                            className={`priority priority-${(
                              task.urgency ||
                              task.priority ||
                              "medium"
                            ).toLowerCase()}`}
                          >
                            {task.urgency || task.priority}
                          </span>

                          <button
                            className="delete-button"
                            onClick={() => openEditTask(task)}
                            title="Edit task"
                            aria-label={`Edit ${task.title}`}
                            style={{ marginRight: 2 }}
                          >
                            <Edit3 size={15} />
                          </button>

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
                              <span className="subtasks-title">
                                ACTIONABLE STEPS
                              </span>
                              {task.dependencyNote && (
                                <span
                                  style={{ fontSize: "10px", color: "#b94b39" }}
                                >
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
                                <Info
                                  size={14}
                                  style={{ flexShrink: 0, marginTop: 1 }}
                                />
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
          </>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: WEEKLY CALENDAR VIEW                              */}
        {/* ========================================================= */}
        {activeTab === "week" && (
          <section className="week-view-container">
            {/* Week navigation bar */}
            <div className="week-nav-bar">
              <div className="week-heading-group">
                <p className="eyebrow">YOUR WEEK AT A GLANCE</p>
                <h2>{formatWeekHeading(currentWeekStart)}</h2>
                <p>Monday through Sunday · Focus calmly one day at a time</p>
              </div>

              <div className="week-controls">
                <button
                  type="button"
                  className="week-nav-btn"
                  onClick={prevWeek}
                  title="Go to previous week"
                >
                  <ChevronLeft size={16} /> Prev week
                </button>
                <button
                  type="button"
                  className="week-nav-btn today-btn"
                  onClick={goToToday}
                  title="Jump to current week"
                >
                  Today
                </button>
                <button
                  type="button"
                  className="week-nav-btn"
                  onClick={nextWeek}
                  title="Go to next week"
                >
                  Next week <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Weekly Summary Stats */}
            <div className="week-summary-grid">
              <div className="week-stat-card">
                <div className="week-stat-header">
                  <span className="week-stat-label">PLANNED EFFORT</span>
                  <span className="week-stat-icon green">
                    <Clock3 size={15} />
                  </span>
                </div>
                <strong>
                  {Math.floor(weekTotalMinutes / 60)}h{" "}
                  {weekTotalMinutes % 60}m
                </strong>
                <span className="week-stat-sub">
                  Across {weekTasks.length} tasks scheduled this week
                </span>
              </div>

              <div className="week-stat-card">
                <div className="week-stat-header">
                  <span className="week-stat-label">COMPLETED</span>
                  <span className="week-stat-icon green">
                    <CheckCircle2 size={15} />
                  </span>
                </div>
                <strong>
                  {weekCompletedCount} / {weekTasks.length}
                </strong>
                <div className="progress-track" style={{ marginTop: 8 }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${
                        weekTasks.length
                          ? (weekCompletedCount / weekTasks.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div className="week-stat-card">
                <div className="week-stat-header">
                  <span className="week-stat-label">REMAINING</span>
                  <span className="week-stat-icon peach">
                    <Coffee size={15} />
                  </span>
                </div>
                <strong>{weekRemainingCount} tasks</strong>
                <span className="week-stat-sub">Paced steadily across the week</span>
              </div>

              <div
                className={`week-stat-card ${
                  weekOverdueCount > 0 ? "alert-card" : ""
                }`}
              >
                <div className="week-stat-header">
                  <span className="week-stat-label">OVERDUE</span>
                  <span className="week-stat-icon lavender">
                    <AlertTriangle size={15} />
                  </span>
                </div>
                <strong className={weekOverdueCount > 0 ? "overdue-count" : ""}>
                  {weekOverdueCount}
                </strong>
                <span className="week-stat-sub">
                  {weekOverdueCount > 0
                    ? "Review deadlines and adjust gently"
                    : "All deadlines on track"}
                </span>
              </div>
            </div>

            {/* 7-Day Calendar Grid (Monday to Sunday) */}
            <div className="calendar-grid-wrapper">
              <div className="calendar-grid">
                {weekDays.map((dayDate) => {
                  const dayString = toLocalDateString(dayDate);
                  const isToday = dayString === getTodayDateString();
                  const dayTasks = tasks.filter(
                    (t) => t.scheduledDate === dayString
                  );
                  const dayName = dayDate.toLocaleDateString(undefined, {
                    weekday: "short",
                  });
                  const dayNumber = dayDate.getDate();

                  return (
                    <div
                      key={dayString}
                      className={`calendar-col ${isToday ? "is-today" : ""}`}
                    >
                      <div className="col-header">
                        <div>
                          <span className="col-header-day">{dayName}</span>
                          {isToday && (
                            <span
                              className="col-header-today-tag"
                              style={{ marginLeft: 5 }}
                            >
                              Today
                            </span>
                          )}
                        </div>
                        <span className="col-header-date">{dayNumber}</span>
                      </div>

                      <div className="col-tasks-list">
                        {dayTasks.length === 0 ? (
                          <div className="col-empty-msg">No tasks</div>
                        ) : (
                          dayTasks.map((task) => {
                            const overdue = isTaskOverdue(task);
                            return (
                              <div
                                key={task.id}
                                className={`cal-task-card ${
                                  task.done ? "task-done" : ""
                                }`}
                                onClick={() => openEditTask(task)}
                                title="Click to edit task schedule or details"
                              >
                                <div className="cal-task-top">
                                  <button
                                    type="button"
                                    className={`cal-task-check ${
                                      task.done ? "checked" : ""
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTask(task.id);
                                    }}
                                    aria-label={
                                      task.done
                                        ? "Mark incomplete"
                                        : "Mark complete"
                                    }
                                  >
                                    {task.done && <Check size={12} />}
                                  </button>
                                  <h4 className="cal-task-title">
                                    {task.title}
                                  </h4>
                                </div>

                                <div className="cal-task-meta">
                                  {(() => {
                                    const plannedSession = plan?.schedule?.find(
                                      (item) =>
                                        item.taskId === task.id &&
                                        (item.date === dayString ||
                                          item.scheduledDate === dayString) &&
                                        item.type === "task"
                                    );
                                    if (plannedSession) {
                                      return (
                                        <span
                                          className="cal-time-chip"
                                          title="Scheduled session time"
                                        >
                                          <Clock3 size={10} /> {plannedSession.start} – {plannedSession.end}
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="cal-duration-chip">
                                        <Clock3 size={10} /> {task.duration || 30}m
                                      </span>
                                    );
                                  })()}

                                  <span className="cal-category-tag">
                                    {task.category?.replace("_", " ")}
                                  </span>

                                  {task.deadline && (
                                    <span
                                      className={`cal-deadline-tag ${
                                        overdue ? "is-overdue" : ""
                                      }`}
                                      title={
                                        overdue
                                          ? "Task deadline is overdue!"
                                          : `Deadline: ${task.deadline}`
                                      }
                                    >
                                      {overdue && <AlertTriangle size={9} />}
                                      Due {formatDisplayDeadline(task.deadline)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <button
                        type="button"
                        className="col-quick-add-btn"
                        onClick={() => quickAddForDate(dayString)}
                        title={`Plan a task for ${dayName}, ${dayString}`}
                      >
                        <Plus size={13} /> Add task
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unscheduled Tasks Section */}
            {unscheduledTasks.length > 0 && (
              <section className="unscheduled-shelf">
                <div className="unscheduled-header">
                  <div>
                    <h3>
                      <span>🌿</span>
                      <span>
                        Unscheduled Intentions ({unscheduledTasks.length})
                      </span>
                    </h3>
                    <p>
                      These tasks don't have a scheduled date yet. Click any
                      task to choose when you want to work on it.
                    </p>
                  </div>
                </div>

                <div className="unscheduled-grid">
                  {unscheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`cal-task-card ${
                        task.done ? "task-done" : ""
                      }`}
                      onClick={() => openEditTask(task)}
                      title="Click to schedule or edit this task"
                    >
                      <div className="cal-task-top">
                        <button
                          type="button"
                          className={`cal-task-check ${
                            task.done ? "checked" : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTask(task.id);
                          }}
                          aria-label={
                            task.done ? "Mark incomplete" : "Mark complete"
                          }
                        >
                          {task.done && <Check size={12} />}
                        </button>
                        <h4 className="cal-task-title">{task.title}</h4>
                      </div>

                      <div className="cal-task-meta">
                        <span className="cal-duration-chip">
                          <Clock3 size={10} /> {task.duration || 30}m
                        </span>

                        <span className="cal-category-tag">
                          {task.category?.replace("_", " ")}
                        </span>

                        {task.deadline && (
                          <span className="cal-deadline-tag">
                            Due {formatDisplayDeadline(task.deadline)}
                          </span>
                        )}

                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: "9px",
                            color: "#5b7d53",
                            fontWeight: 600,
                          }}
                        >
                          + Set date
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {/* ========================================================= */}
        {/* MONTH VIEW                                                */}
        {/* ========================================================= */}
        {activeTab === "month" && (
          <section className="month-view-container">
            {/* Month Navigation & Heading */}
            <div className="week-nav-bar">
              <div className="week-heading-group">
                <h2>{formatMonthHeading(currentMonthDate)}</h2>
                <p>
                  Plan ahead at a relaxed pace. Click any day to see or schedule tasks.
                </p>
              </div>

              <div className="week-controls">
                <button
                  type="button"
                  className="week-nav-btn"
                  onClick={prevMonth}
                  title="Previous month"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  type="button"
                  className="week-nav-btn today-btn"
                  onClick={goToCurrentMonth}
                  title="Go to current month"
                >
                  Today
                </button>
                <button
                  type="button"
                  className="week-nav-btn"
                  onClick={nextMonth}
                  title="Next month"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Monthly Summary Statistics */}
            <div className="week-summary-grid">
              <div className="week-stat-card">
                <div className="week-stat-header">
                  <span className="week-stat-label">PLANNED EFFORT</span>
                  <span
                    className="week-stat-icon"
                    style={{ background: "#edf5eb", color: "#446c3d" }}
                  >
                    <Clock3 size={15} />
                  </span>
                </div>
                <strong>
                  {Math.floor(monthTotalMinutes / 60)}h{" "}
                  {monthTotalMinutes % 60 > 0 ? `${monthTotalMinutes % 60}m` : ""}
                </strong>
                <span className="week-stat-sub">
                  {monthTasks.length} {monthTasks.length === 1 ? "task" : "tasks"} planned this month
                </span>
              </div>

              <div className="week-stat-card">
                <div className="week-stat-header">
                  <span className="week-stat-label">COMPLETED</span>
                  <span
                    className="week-stat-icon"
                    style={{ background: "#e8f4ed", color: "#367a55" }}
                  >
                    <CheckCircle2 size={15} />
                  </span>
                </div>
                <strong>{monthCompletedCount}</strong>
                <span className="week-stat-sub">
                  {monthTasks.length > 0
                    ? `${Math.round((monthCompletedCount / monthTasks.length) * 100)}% completed`
                    : "No tasks scheduled"}
                </span>
              </div>

              <div className="week-stat-card">
                <div className="week-stat-header">
                  <span className="week-stat-label">REMAINING</span>
                  <span
                    className="week-stat-icon"
                    style={{ background: "#fbf3e6", color: "#9c6b24" }}
                  >
                    <Coffee size={15} />
                  </span>
                </div>
                <strong>{monthRemainingCount}</strong>
                <span className="week-stat-sub">Gentle progress ahead</span>
              </div>

              <div
                className={`week-stat-card ${
                  monthOverdueCount > 0 ? "alert-card" : ""
                }`}
              >
                <div className="week-stat-header">
                  <span className="week-stat-label">OVERDUE</span>
                  <span
                    className="week-stat-icon"
                    style={{
                      background: monthOverdueCount > 0 ? "#fdeee9" : "#f5f6f3",
                      color: monthOverdueCount > 0 ? "#ba4c3a" : "#8f9689",
                    }}
                  >
                    <AlertTriangle size={15} />
                  </span>
                </div>
                <strong
                  className={monthOverdueCount > 0 ? "overdue-count" : ""}
                >
                  {monthOverdueCount}
                </strong>
                <span className="week-stat-sub">
                  {monthOverdueCount > 0
                    ? "Requires gentle attention"
                    : "All deadlines on track"}
                </span>
              </div>
            </div>

            {/* Calendar Grid: Mon to Sun */}
            <div className="month-calendar-grid-wrapper">
              <div className="month-calendar-header-row">
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(
                  (dayName) => (
                    <div key={dayName} className="month-day-heading">
                      {dayName}
                    </div>
                  )
                )}
              </div>

              <div className="month-calendar-grid">
                {monthGridCells.map((cell) => {
                  const dayTasks = tasks.filter(
                    (t) => t.scheduledDate === cell.dateString
                  );
                  const previewTasks = dayTasks.slice(0, 2);
                  const overflowCount = dayTasks.length - 2;

                  return (
                    <div
                      key={cell.dateString}
                      className={`month-date-cell ${
                        !cell.isCurrentMonth ? "not-current-month" : ""
                      } ${cell.isToday ? "is-today" : ""}`}
                      onClick={() => setSelectedDayDate(cell.dateString)}
                      title={`Click to view and schedule tasks for ${cell.dateString}`}
                    >
                      <div className="month-cell-header">
                        <span className="month-cell-num">{cell.dayNumber}</span>
                        {cell.isToday && (
                          <span className="month-cell-today-pill">Today</span>
                        )}
                      </div>

                      <div className="month-cell-tasks">
                        {previewTasks.map((t) => (
                          <div
                            key={t.id}
                            className={`month-task-pill ${
                              t.done ? "task-done" : ""
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditTask(t);
                            }}
                            title={`Edit: ${t.title} (${t.duration || 30}m)`}
                          >
                            <span className="month-task-dot" />
                            <span>{t.title}</span>
                          </div>
                        ))}

                        {overflowCount > 0 && (
                          <span className="month-more-badge">
                            +{overflowCount} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unscheduled Tasks Section */}
            {unscheduledTasks.length > 0 && (
              <section className="unscheduled-shelf">
                <div className="unscheduled-header">
                  <div>
                    <h3>
                      <span>🌿</span>
                      <span>
                        Unscheduled Intentions ({unscheduledTasks.length})
                      </span>
                    </h3>
                    <p>
                      These tasks don't have a scheduled date yet. Pick a date or click to schedule.
                    </p>
                  </div>
                </div>

                <div className="unscheduled-grid">
                  {unscheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`cal-task-card ${
                        task.done ? "task-done" : ""
                      }`}
                      onClick={() => openEditTask(task)}
                      title="Click to schedule or edit this task"
                    >
                      <div className="cal-task-top">
                        <button
                          type="button"
                          className={`cal-task-check ${
                            task.done ? "checked" : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTask(task.id);
                          }}
                          aria-label={
                            task.done ? "Mark incomplete" : "Mark complete"
                          }
                        >
                          {task.done && <Check size={12} />}
                        </button>
                        <h4 className="cal-task-title">{task.title}</h4>
                      </div>

                      <div className="cal-task-meta">
                        <span className="cal-duration-chip">
                          <Clock3 size={10} /> {task.duration || 30}m
                        </span>

                        <span className="cal-category-tag">
                          {task.category?.replace("_", " ")}
                        </span>

                        {task.deadline && (
                          <span className="cal-deadline-tag">
                            Due {formatDisplayDeadline(task.deadline)}
                          </span>
                        )}

                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: "9px",
                            color: "#5b7d53",
                            fontWeight: 600,
                          }}
                        >
                          + Set date
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: "8px",
                          paddingTop: "6px",
                          borderTop: "1px dashed #e7ebe1",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span style={{ fontSize: "10px", color: "#7a8575" }}>
                          Quick schedule:
                        </span>
                        <input
                          type="date"
                          style={{
                            fontSize: "11px",
                            padding: "2px 6px",
                            borderRadius: "6px",
                            border: "1px solid #d7ded2",
                            background: "#fff",
                            color: "#29382e",
                          }}
                          value={task.scheduledDate || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              scheduleTaskToDate(task.id, e.target.value);
                            }
                          }}
                          title="Schedule this task to a date"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {/* ========================================================= */}
        {/* DAY DETAIL PANEL MODAL                                    */}
        {/* ========================================================= */}
        {selectedDayDate && (
          <div
            className="modal-backdrop"
            onClick={() => setSelectedDayDate(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-detail-title"
          >
            <div
              className="day-detail-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="day-detail-header">
                <div>
                  <h3 id="day-detail-title">
                    {formatDayDetailHeading(selectedDayDate)}
                  </h3>
                  <p className="day-detail-sub">
                    {(() => {
                      const dayTasks = tasks.filter(
                        (t) => t.scheduledDate === selectedDayDate
                      );
                      const totalMins = dayTasks.reduce(
                        (s, t) => s + (t.duration || 30),
                        0
                      );
                      const doneCount = dayTasks.filter((t) => t.done).length;
                      return `${dayTasks.length} ${
                        dayTasks.length === 1 ? "task" : "tasks"
                      } • ${Math.floor(totalMins / 60)}h ${
                        totalMins % 60
                      }m planned • ${doneCount} completed`;
                    })()}
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setSelectedDayDate(null)}
                  aria-label="Close day detail"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Day Tasks List */}
              <div className="day-detail-task-list">
                {(() => {
                  const dayTasks = tasks.filter(
                    (t) => t.scheduledDate === selectedDayDate
                  );
                  if (dayTasks.length === 0) {
                    return (
                      <div className="cal-empty-state">
                        <p>No tasks scheduled for this day yet.</p>
                        <span>Take it slow, or schedule an unscheduled task below.</span>
                      </div>
                    );
                  }
                  return dayTasks.map((task) => {
                    const overdue = isTaskOverdue(task);
                    return (
                      <div
                        key={task.id}
                        className={`cal-task-card ${
                          task.done ? "task-done" : ""
                        }`}
                        onClick={() => openEditTask(task)}
                        title="Click to edit task details"
                      >
                        <div className="cal-task-top">
                          <button
                            type="button"
                            className={`cal-task-check ${
                              task.done ? "checked" : ""
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTask(task.id);
                            }}
                            aria-label={
                              task.done
                                ? "Mark incomplete"
                                : "Mark complete"
                            }
                          >
                            {task.done && <Check size={12} />}
                          </button>
                          <h4 className="cal-task-title">{task.title}</h4>
                          <button
                            type="button"
                            style={{
                              marginLeft: "auto",
                              background: "none",
                              border: "none",
                              color: "#84907e",
                              cursor: "pointer",
                              padding: "2px",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditTask(task);
                            }}
                            title="Edit task"
                          >
                            <Edit3 size={13} />
                          </button>
                        </div>

                        <div className="cal-task-meta">
                          {(() => {
                            const plannedSession = plan?.schedule?.find(
                              (item) =>
                                item.taskId === task.id &&
                                (item.date === selectedDayDate ||
                                  item.scheduledDate === selectedDayDate) &&
                                item.type === "task"
                            );
                            if (plannedSession) {
                              return (
                                <span
                                  className="cal-time-chip"
                                  title="Scheduled session time"
                                >
                                  <Clock3 size={10} /> {plannedSession.start} – {plannedSession.end}
                                </span>
                              );
                            }
                            return (
                              <span className="cal-duration-chip">
                                <Clock3 size={10} /> {task.duration || 30}m
                              </span>
                            );
                          })()}

                          <span className="cal-category-tag">
                            {task.category?.replace("_", " ")}
                          </span>

                          {task.deadline && (
                            <span
                              className={`cal-deadline-tag ${
                                overdue ? "is-overdue" : ""
                              }`}
                            >
                              {overdue && <AlertTriangle size={9} />}
                              Due {formatDisplayDeadline(task.deadline)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Day Detail Actions */}
              <div className="day-detail-actions">
                {/* Schedule an unscheduled task to this day */}
                {unscheduledTasks.length > 0 && (
                  <div className="day-schedule-select-row">
                    <select
                      value={selectedUnscheduledTaskId}
                      onChange={(e) =>
                        setSelectedUnscheduledTaskId(
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      aria-label="Select an unscheduled task"
                    >
                      <option value="">
                        -- Schedule an unscheduled task here --
                      </option>
                      {unscheduledTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.duration || 30}m)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="day-schedule-btn"
                      disabled={!selectedUnscheduledTaskId}
                      onClick={() => {
                        if (selectedUnscheduledTaskId) {
                          scheduleTaskToDate(
                            Number(selectedUnscheduledTaskId),
                            selectedDayDate
                          );
                          setSelectedUnscheduledTaskId("");
                        }
                      }}
                    >
                      Schedule here
                    </button>
                  </div>
                )}

                {/* Add a new task for this day */}
                <button
                  type="button"
                  className="col-quick-add-btn"
                  onClick={() => {
                    quickAddForDate(selectedDayDate);
                    setSelectedDayDate(null);
                  }}
                  title="Plan a task for this date in Day view"
                >
                  <Plus size={14} /> Add new task for this day
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TASK EDIT MODAL DIALOG                                    */}
        {/* ========================================================= */}
        {editingTask && (
          <div
            className="modal-backdrop"
            onClick={() => setEditingTask(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-task-modal-title"
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 id="edit-task-modal-title">Edit Task Details</h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setEditingTask(null)}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <form className="modal-form" onSubmit={handleSaveEditedTask}>
                {/* Title */}
                <div className="form-group">
                  <label htmlFor="edit-task-title">TASK TITLE</label>
                  <input
                    id="edit-task-title"
                    type="text"
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Task title"
                    required
                  />
                </div>

                {/* Scheduled Date */}
                <div className="form-group">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <label htmlFor="edit-task-schedule-date">
                      SCHEDULE DATE (INTENDED WORK DAY)
                    </label>
                    {editForm.scheduledDate && (
                      <button
                        type="button"
                        style={{
                          border: "none",
                          background: "transparent",
                          fontSize: "10px",
                          color: "#96614b",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                        onClick={() =>
                          setEditForm((f) => ({ ...f, scheduledDate: "" }))
                        }
                      >
                        Make unscheduled
                      </button>
                    )}
                  </div>
                  <input
                    id="edit-task-schedule-date"
                    type="date"
                    value={editForm.scheduledDate}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        scheduledDate: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Duration */}
                <div className="form-group">
                  <label htmlFor="edit-task-duration">
                    ESTIMATED DURATION (MINUTES)
                  </label>
                  <input
                    id="edit-task-duration"
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={editForm.duration}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        duration: Number(e.target.value),
                      }))
                    }
                  />
                  <div className="duration-preset-row">
                    {[15, 25, 30, 45, 60, 90].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        className="preset-chip"
                        onClick={() =>
                          setEditForm((f) => ({ ...f, duration: mins }))
                        }
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Deadline (optional) */}
                <div className="form-group">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <label htmlFor="edit-task-deadline">
                      DEADLINE (MUST FINISH BY)
                    </label>
                    {editForm.deadline && (
                      <button
                        type="button"
                        style={{
                          border: "none",
                          background: "transparent",
                          fontSize: "10px",
                          color: "#96614b",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                        onClick={() =>
                          setEditForm((f) => ({ ...f, deadline: "" }))
                        }
                      >
                        Remove deadline
                      </button>
                    )}
                  </div>
                  <input
                    id="edit-task-deadline"
                    type="datetime-local"
                    value={editForm.deadline}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, deadline: e.target.value }))
                    }
                  />
                </div>

                {/* Category & Urgency */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <div className="form-group">
                    <label htmlFor="edit-task-category">CATEGORY</label>
                    <select
                      id="edit-task-category"
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          category: e.target.value as TaskCategory,
                        }))
                      }
                    >
                      <option value="college">College</option>
                      <option value="exam_prep">Exam Prep</option>
                      <option value="chore">Chore</option>
                      <option value="health">Health</option>
                      <option value="personal">Personal</option>
                      <option value="work">Work</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-task-urgency">URGENCY</label>
                    <select
                      id="edit-task-urgency"
                      value={editForm.urgency}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          urgency: e.target.value as
                            | "critical"
                            | "high"
                            | "medium"
                            | "low",
                        }))
                      }
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                {/* Completion Checkbox */}
                <label className="modal-checkbox-row">
                  <input
                    type="checkbox"
                    checked={editForm.done}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, done: e.target.checked }))
                    }
                  />
                  <span>Mark task as completed</span>
                </label>

                {/* Modal Actions */}
                <div className="modal-actions-row">
                  <button
                    type="button"
                    className="modal-delete-btn"
                    onClick={() => handleDeleteFromEdit(editingTask.id)}
                  >
                    <Trash2 size={15} /> Delete task
                  </button>

                  <div className="modal-right-actions">
                    <button
                      type="button"
                      className="modal-cancel-btn"
                      onClick={() => setEditingTask(null)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="modal-save-btn">
                      Save changes
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        <footer className="footer">
          <Moon size={15} /> You are a human being, not a productivity machine.
        </footer>
      </section>
    </main>
  );
}

export default App;
