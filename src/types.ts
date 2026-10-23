// src/types.ts

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type TaskCategory = 'college' | 'exam_prep' | 'chore' | 'health' | 'personal' | 'work' | string;
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low' | 'High' | 'Medium' | 'Low';

export type DurationSource = 'provisional' | 'ai_estimated' | 'fallback_estimated' | 'manual' | 'explicit' | 'ai' | 'fallback';

export type Task = {
  id: number;
  title: string;
  category: TaskCategory;
  duration: number; // in minutes
  durationSource?: DurationSource;
  isEstimatingDuration?: boolean;
  durationConfidence?: 'high' | 'medium' | 'low' | string;
  estimationReasoning?: string;
  priority: 'High' | 'Medium' | 'Low';
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  done: boolean;
  subtasks?: Subtask[];
  scheduledDate?: string | null; // YYYY-MM-DD
  deadline?: string | null;      // ISO string or YYYY-MM-DDTHH:mm or HH:mm
  dependencyNote?: string | null;
  schedulingTip?: string;
  aiGenerated?: boolean;
  fallbackReason?: string;
};

export type PlanningHorizon = 'today' | 'tomorrow' | 'week' | 'month';

export interface ActiveFocusState {
  taskId: number;
  taskTitle: string;
  category?: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isBreakMode?: boolean;
  breakSecondsRemaining?: number;
  activeSubtaskId?: string | null;
  startedAt?: number;
}

export type ScheduleItem = {
  id: string;
  type: 'task' | 'break' | 'blocked' | 'routine';
  taskId?: number;
  date?: string; // YYYY-MM-DD
  title: string;
  parentTitle?: string;
  category?: string;
  urgency?: string;
  partIndex?: number;
  totalParts?: number;
  start: string; // HH:mm
  end: string;   // HH:mm
  durationMinutes: number;
  routineBlockId?: string;
  icon?: string;
  done?: boolean;
  subtasks?: Subtask[];
  schedulingTip?: string;
  aiGenerated?: boolean;
  scheduledDate?: string | null;
  deadline?: string | null;
};

export type OverflowTask = {
  taskId: number;
  taskTitle: string;
  reason: string;
  requestedMinutes: number;
  remainingUnscheduledMinutes: number;
};

export type BreakBehavior = 'optional' | 'automatic' | 'after_task';

export interface SchedulerSettings {
  focusSessionMinMinutes: number; // default: 45
  focusSessionMaxMinutes: number; // default: 120
  breakBehavior: BreakBehavior;   // default: 'optional'
  defaultBreakMinutes: number;    // default: 10
}

export type RoutineBlockId = 'lunch' | 'nap' | 'evening_snack' | 'dinner' | string;

export interface RoutineBlock {
  id: RoutineBlockId;
  label: string;
  icon?: string;
  enabled: boolean;
  startTime: string; // "HH:mm", e.g. "13:00"
  durationMinutes: number; // e.g. 60
}

export interface RoutineSettings {
  dayStartTime: string; // "09:00"
  dayEndTime: string;   // "20:00"
  blocks: RoutineBlock[];
}

export const DEFAULT_ROUTINE_BLOCKS: RoutineBlock[] = [
  {
    id: 'lunch',
    label: 'Lunch',
    icon: '🍱',
    enabled: true,
    startTime: '13:00',
    durationMinutes: 60, // 13:00–14:00
  },
  {
    id: 'nap',
    label: 'Nap',
    icon: '😴',
    enabled: true,
    startTime: '14:00',
    durationMinutes: 30, // 14:00–14:30
  },
  {
    id: 'evening_snack',
    label: 'Evening snack',
    icon: '🍵',
    enabled: true,
    startTime: '17:00',
    durationMinutes: 15, // 17:00–17:15
  },
  {
    id: 'dinner',
    label: 'Dinner',
    icon: '🍲',
    enabled: true,
    startTime: '19:00',
    durationMinutes: 30, // 19:00–19:30
  },
];

export const DEFAULT_ROUTINE_SETTINGS: RoutineSettings = {
  dayStartTime: '09:00',
  dayEndTime: '20:00',
  blocks: DEFAULT_ROUTINE_BLOCKS,
};

export interface SchedulingOptions {
  horizon?: PlanningHorizon;
  currentDate?: string;
  clientTimezone?: string;
  clientTimezoneOffset?: number;
  startHour?: number;
  endHour?: number;
  dayStartTime?: string;
  dayEndTime?: string;
  routineSettings?: RoutineSettings;
  useCurrentTimeAsStart?: boolean;
  focusSessionMinMinutes?: number;
  focusSessionMaxMinutes?: number;
  maxSessionMinutes?: number;
  breakBehavior?: BreakBehavior;
  defaultBreakMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
  spreadLongTasks?: boolean;
  maxSessionsPerDayPerTask?: number;
  blockedCommitments?: Array<{ title: string; start: string; end: string; id?: string; icon?: string; type?: string }>;
  forceReclassify?: boolean;
}

export type ScheduleMetrics = {
  totalTasks: number;
  scheduledTasksCount: number;
  completedTasksCount: number;
  overflowTasksCount: number;
  totalFocusMinutes: number;
  totalBreakMinutes: number;
  totalRoutineMinutes?: number;
};

export type PlanResponse = {
  success: boolean;
  error?: string;
  horizon?: PlanningHorizon;
  startDate?: string;
  endDate?: string;
  dayWindow: {
    start: string;
    end: string;
    totalAvailableMinutes: number;
  };
  settings?: {
    focusSessionMinMinutes: number;
    focusSessionMaxMinutes: number;
    breakBehavior: BreakBehavior;
    defaultBreakMinutes: number;
  };
  routineSettings?: RoutineSettings;
  routineValidationErrors?: string[];
  metrics: ScheduleMetrics;
  schedule: ScheduleItem[];
  overflowTasks: OverflowTask[];
  completedTasks: Task[];
  enrichedTasks: Task[];
  aiStatus: {
    reachable: boolean;
    modelAvailable: boolean;
    model: string;
    note: string;
  };
};

export type HealthStatus = {
  status: string;
  ollama: {
    reachable: boolean;
    modelAvailable: boolean;
    configuredModel: string;
    availableModels: string[];
    message: string;
  };
};


