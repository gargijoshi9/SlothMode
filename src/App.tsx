
import { useState } from "react";
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
} from "lucide-react";
import "./App.css";

type Task = {
  id: number;
  title: string;
  category: string;
  duration: number;
  priority: "High" | "Medium" | "Low";
  done: boolean;
};

const initialTasks: Task[] = [
  {
    id: 1,
    title: "Revise operating systems practical",
    category: "College",
    duration: 60,
    priority: "High",
    done: false,
  },
  {
    id: 2,
    title: "Complete AI assignment",
    category: "Assignment",
    duration: 45,
    priority: "High",
    done: false,
  },
  {
    id: 3,
    title: "Reply to project teammates",
    category: "Personal",
    duration: 15,
    priority: "Medium",
    done: false,
  },
];

function App() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [draft, setDraft] = useState("");
  const [planned, setPlanned] = useState(false);

  const completed = tasks.filter((task) => task.done).length;
  const totalMinutes = tasks
    .filter((task) => !task.done)
    .reduce((sum, task) => sum + task.duration, 0);

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;

    setTasks((current) => [
      ...current,
      {
        id: Date.now(),
        title: draft.trim(),
        category: "Personal",
        duration: 30,
        priority: "Medium",
        done: false,
      },
    ]);
    setDraft("");
    setPlanned(false);
  }

  function toggleTask(id: number) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }

  function deleteTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id));
    setPlanned(false);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-icon"><Leaf size={23} /></span>
          <span>sloth<span className="brand-light">mode</span></span>
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
          <p className="local-note"><span /> Designed for a calmer day</p>
        </div>
      </aside>

      <section className="main-content" id="today">
        <header className="topbar">
          <span className="date-label">
            YOUR SPACE, YOUR PACE
          </span>
          <span className="offline-pill"><span /> Gentle productivity</span>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">A LITTLE PROGRESS IS STILL PROGRESS</p>
            <h1>Let's take it <span>slow.</span></h1>
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
            <div className="heading-icon"><Brain size={20} /></div>
            <div>
              <h2>Get it off your mind</h2>
              <p>Big task, tiny task, random reminder — put it all here.</p>
            </div>
          </div>
          <form className="task-form" onSubmit={addTask}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="e.g. Study OS, finish assignment, call a friend..."
              aria-label="Describe a task"
            />
            <button type="submit" className="add-button">
              <Plus size={18} /> Add task
            </button>
          </form>
          <p className="hint">
            <Sparkles size={14} /> AI task planning is coming next.
          </p>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon green"><Check size={19} /></span>
            <span className="stat-label">DONE SO FAR</span>
            <strong>{completed}<small> / {tasks.length}</small></strong>
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
            <span className="stat-icon peach"><Clock3 size={19} /></span>
            <span className="stat-label">TIME LEFT TO PLAN</span>
            <strong>{Math.floor(totalMinutes / 60)}<small>h </small>{totalMinutes % 60}<small>m</small></strong>
            <p className="stat-footnote">Estimated from your tasks</p>
          </div>
          <div className="stat-card">
            <span className="stat-icon lavender"><Coffee size={19} /></span>
            <span className="stat-label">YOUR REMINDER</span>
            <strong className="gentle-text">Take a breath.</strong>
            <p className="stat-footnote">Rest is productive, too.</p>
          </div>
        </section>

        <section className="tasks-section" id="tasks">
          <div className="tasks-title-row">
            <div>
              <p className="eyebrow">SMALL STEPS COUNT</p>
              <h2>Today's intentions <span>({tasks.length})</span></h2>
            </div>
            <button
              className="plan-button"
              onClick={() => setPlanned(true)}
              disabled={tasks.length === 0}
            >
              <Sparkles size={17} /> Make my plan
            </button>
          </div>

          {planned && (
            <div className="plan-notice">
              <Sparkles size={18} />
              <div>
                <strong>Your planning session is ready to begin.</strong>
                <p>This is a preview. We'll connect local AI to estimate and schedule your tasks next.</p>
              </div>
            </div>
          )}

          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty-state">
                <span>🌿</span>
                <h3>A little breathing room.</h3>
                <p>No tasks here. Add something whenever you're ready.</p>
              </div>
            ) : (
              tasks.map((task) => (
                <article
                  className={`task-row ${task.done ? "task-done" : ""}`}
                  key={task.id}
                >
                  <button
                    className={`task-check ${task.done ? "checked" : ""}`}
                    onClick={() => toggleTask(task.id)}
                    aria-label={task.done ? "Mark task incomplete" : "Complete task"}
                  >
                    {task.done && <Check size={15} />}
                  </button>
                  <div className="task-info">
                    <h3>{task.title}</h3>
                    <div className="task-meta">
                      <span>{task.category}</span>
                      <span className="meta-dot">·</span>
                      <span><Clock3 size={13} /> {task.duration} min</span>
                    </div>
                  </div>
                  <span className={`priority priority-${task.priority.toLowerCase()}`}>
                    {task.priority}
                  </span>
                  <button
                    className="delete-button"
                    onClick={() => deleteTask(task.id)}
                    aria-label={`Delete ${task.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))
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
