// src/types.ts

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type TaskCategory = 'college' | 'exam_prep' | 'chore' | 'health' | 'personal' | 'work' | string;
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low' | 'High' | 'Medium' | 'Low';

export type Task = {
  id: number;
  title: string;
  category: TaskCategory;
  duration: number; // in minutes
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

export type ScheduleItem = {
  id: string;
  type: 'task' | 'break' | 'blocked';
  taskId?: number;
  title: string;
  parentTitle?: string;
  category?: string;
  urgency?: string;
  partIndex?: number;
  totalParts?: number;
  start: string; // HH:mm
  end: string;   // HH:mm
  durationMinutes: number;
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

export type ScheduleMetrics = {
  totalTasks: number;
  scheduledTasksCount: number;
  completedTasksCount: number;
  overflowTasksCount: number;
  totalFocusMinutes: number;
  totalBreakMinutes: number;
};

export type PlanResponse = {
  success: boolean;
  dayWindow: {
    start: string;
    end: string;
    totalAvailableMinutes: number;
  };
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
