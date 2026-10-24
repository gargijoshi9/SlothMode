import { useState, useId } from "react";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Moon,
  Sun,
  Coffee,
  GraduationCap,
  Briefcase,
  School,
  Smile,
  Calendar,
  Layers,
  Heart,
  Clock3,
} from "lucide-react";
import type {
  UserProfile,
  OccupationType,
  FreeTimePredictability,
  RoutineSettings,
} from "./types";
import { DEFAULT_USER_PROFILE } from "./types";
import {
  calcSuggestedBedtime,
  formatTimeDisplay,
  mapProfileToRoutineSettings,
  minutesToTime,
  timeToMinutes,
} from "./onboardingUtils";

interface PersonalizedOnboardingModalProps {
  isOpen: boolean;
  initialProfile?: Partial<UserProfile>;
  existingRoutine?: RoutineSettings;
  onSave: (profile: UserProfile, newRoutine: RoutineSettings) => void;
  onSkip: () => void;
  onClose?: () => void;
  isRevisiting?: boolean;
}

const TOTAL_STEPS = 10;

const OCCUPATION_OPTIONS: Array<{
  type: OccupationType;
  label: string;
  icon: typeof GraduationCap;
  desc: string;
}> = [
  {
    type: "college",
    label: "College / university student",
    icon: GraduationCap,
    desc: "Balancing lectures, coursework, exam prep, and personal life.",
  },
  {
    type: "school",
    label: "School student",
    icon: School,
    desc: "Fixed school hours with homework, projects, and activities.",
  },
  {
    type: "work_full",
    label: "Working full-time",
    icon: Briefcase,
    desc: "Standard 9-to-5 or shift-based career commitments.",
  },
  {
    type: "work_part",
    label: "Working part-time",
    icon: Coffee,
    desc: "Flexible or scheduled shifts with time for other pursuits.",
  },
  {
    type: "freelance",
    label: "Freelance / self-employed",
    icon: Layers,
    desc: "Independent client work and self-directed project milestones.",
  },
  {
    type: "mixed",
    label: "A mix of work and study",
    icon: Calendar,
    desc: "Juggling classes alongside part-time or freelance jobs.",
  },
  {
    type: "other",
    label: "Other pursuits",
    icon: Smile,
    desc: "Creative projects, caregiving, gap year, or personal growth.",
  },
  {
    type: "changing",
    label: "My schedule changes daily",
    icon: Sparkles,
    desc: "Every day looks completely different — maximum flexibility needed.",
  },
];

const PREDICTABILITY_OPTIONS: Array<{
  value: FreeTimePredictability;
  label: string;
  desc: string;
  icon: string;
}> = [
  {
    value: "mostly_same",
    label: "Mostly the same every day",
    desc: "I thrive with a predictable, consistent daily rhythm.",
    icon: "📅",
  },
  {
    value: "weekday_weekend",
    label: "Different on weekdays and weekends",
    desc: "Structured work/study days with open, relaxed weekends.",
    icon: "🗓️",
  },
  {
    value: "changes_daily",
    label: "Changes from day to day",
    desc: "My energy and hours shift often — keep planning gentle and low pressure.",
    icon: "🌊",
  },
  {
    value: "adapt",
    label: "I prefer SlothMode to adapt to my commitments",
    desc: "Fit focus intervals around whatever commitments arise.",
    icon: "🦥",
  },
];

const COMMON_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DINNER_PRESETS = [
  { label: "7:00 – 7:30 PM", start: "19:00", end: "19:30" },
  { label: "7:30 – 8:30 PM", start: "19:30", end: "20:30" },
  { label: "8:00 – 8:30 PM", start: "20:00", end: "20:30" },
  { label: "8:00 – 9:00 PM", start: "20:00", end: "21:00" },
  { label: "8:30 – 9:30 PM", start: "20:30", end: "21:30" },
  { label: "9:00 – 9:45 PM", start: "21:00", end: "21:45" },
];

const LUNCH_PRESETS = [
  { label: "12:00 – 1:00 PM", start: "12:00", end: "13:00" },
  { label: "12:30 – 1:30 PM", start: "12:30", end: "13:30" },
  { label: "1:00 – 1:45 PM", start: "13:00", end: "13:45" },
  { label: "1:00 – 2:00 PM", start: "13:00", end: "14:00" },
  { label: "1:30 – 2:15 PM", start: "13:30", end: "14:15" },
];

export function PersonalizedOnboardingModal({
  isOpen,
  initialProfile,
  existingRoutine,
  onSave,
  onSkip,
  isRevisiting = false,
}: PersonalizedOnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...DEFAULT_USER_PROFILE,
    ...initialProfile,
  }));

  const nameInputId = useId();

  if (!isOpen) return null;

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  };

  // Auto-duration handlers to prevent invalid time errors & snap-back bugs
  const handleDinnerStartChange = (newStart: string) => {
    if (!newStart) {
      updateProfile({ dinnerStartTime: "" });
      return;
    }
    const currentStart = profile.dinnerStartTime || "19:00";
    const currentEnd = profile.dinnerEndTime || "19:30";
    let curDur = timeToMinutes(currentEnd) - timeToMinutes(currentStart);
    if (curDur <= 0 || curDur > 240) curDur = 30;

    const newStartM = timeToMinutes(newStart);
    const newEndM = (newStartM + curDur) % 1440;
    updateProfile({
      dinnerStartTime: newStart,
      dinnerEndTime: minutesToTime(newEndM),
    });
  };

  const handleDinnerEndChange = (newEnd: string) => {
    updateProfile({ dinnerEndTime: newEnd });
  };

  const setDinnerDuration = (durationMinutes: number) => {
    const start = profile.dinnerStartTime || "19:00";
    const startM = timeToMinutes(start);
    const endM = (startM + durationMinutes) % 1440;
    updateProfile({
      dinnerStartTime: start,
      dinnerEndTime: minutesToTime(endM),
    });
  };

  const handleLunchStartChange = (newStart: string) => {
    if (!newStart) {
      updateProfile({ lunchStartTime: "" });
      return;
    }
    const currentStart = profile.lunchStartTime || "13:00";
    const currentEnd = profile.lunchEndTime || "14:00";
    let curDur = timeToMinutes(currentEnd) - timeToMinutes(currentStart);
    if (curDur <= 0 || curDur > 240) curDur = 60;

    const newStartM = timeToMinutes(newStart);
    const newEndM = (newStartM + curDur) % 1440;
    updateProfile({
      lunchStartTime: newStart,
      lunchEndTime: minutesToTime(newEndM),
    });
  };

  const handleLunchEndChange = (newEnd: string) => {
    updateProfile({ lunchEndTime: newEnd });
  };

  const setLunchDuration = (durationMinutes: number) => {
    const start = profile.lunchStartTime || "13:00";
    const startM = timeToMinutes(start);
    const endM = (startM + durationMinutes) % 1440;
    updateProfile({
      lunchStartTime: start,
      lunchEndTime: minutesToTime(endM),
    });
  };

  const handleCommitmentStartChange = (newStart: string) => {
    if (!newStart) {
      updateProfile({ commitmentStartTime: "" });
      return;
    }
    const currentStart = profile.commitmentStartTime || "10:00";
    const currentEnd = profile.commitmentEndTime || "16:00";
    let curDur = timeToMinutes(currentEnd) - timeToMinutes(currentStart);
    if (curDur <= 0 || curDur > 720) curDur = 360;

    const newStartM = timeToMinutes(newStart);
    const newEndM = (newStartM + curDur) % 1440;
    updateProfile({
      commitmentStartTime: newStart,
      commitmentEndTime: minutesToTime(newEndM),
    });
  };

  const handleCommitmentEndChange = (newEnd: string) => {
    updateProfile({ commitmentEndTime: newEnd });
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      handleFinalSave();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => s - 1);
    }
  };

  const handleFinalSave = () => {
    const routine = mapProfileToRoutineSettings(profile, existingRoutine);
    onSave(profile, routine);
  };

  // Calculations for display
  const suggestedBedtime = calcSuggestedBedtime(profile.wakeUpTime, profile.sleepHours);
  const mappedPreview = mapProfileToRoutineSettings(profile, existingRoutine);

  // Validation helpers per step
  const getStepValidation = (): { isValid: boolean; warning?: string } => {
    if (step === 4) {
      if (!profile.wakeUpTime) return { isValid: false, warning: "Please choose or enter a wake-up time." };
    }
    if (step === 5 && profile.hasCommitment) {
      if (!profile.commitmentStartTime || !profile.commitmentEndTime) {
        return { isValid: false, warning: "Please enter both start and end times for your commitment." };
      }
      if (timeToMinutes(profile.commitmentStartTime) >= timeToMinutes(profile.commitmentEndTime)) {
        return { isValid: false, warning: "Commitment start time must be earlier than end time." };
      }
    }
    if (step === 6 && profile.lunchOption === "fixed") {
      if (!profile.lunchStartTime || !profile.lunchEndTime) {
        return { isValid: false, warning: "Please enter both start and end times for lunch." };
      }
      if (timeToMinutes(profile.lunchStartTime) >= timeToMinutes(profile.lunchEndTime)) {
        return { isValid: false, warning: "Lunch start time must be earlier than end time." };
      }
    }
    if (step === 7 && profile.dinnerOption === "fixed") {
      if (!profile.dinnerStartTime || !profile.dinnerEndTime) {
        return { isValid: false, warning: "Please enter both start and end times for dinner." };
      }
      if (timeToMinutes(profile.dinnerStartTime) >= timeToMinutes(profile.dinnerEndTime)) {
        return { isValid: false, warning: "Dinner start time must be earlier than end time." };
      }
    }
    if (step === 8) {
      if (!profile.windDownTime) return { isValid: false, warning: "Please choose a wind-down time." };
      if (timeToMinutes(profile.wakeUpTime) >= timeToMinutes(profile.windDownTime)) {
        return {
          isValid: false,
          warning: `Wake-up time (${profile.wakeUpTime}) must be earlier than planning end time (${profile.windDownTime}).`,
        };
      }
    }
    return { isValid: true };
  };

  const { isValid: canProceed, warning: stepWarning } = getStepValidation();

  // Conditional occupation labels
  const getCommitmentTitle = () => {
    if (profile.occupation === "college") return "What are your usual college or class hours?";
    if (profile.occupation === "school") return "What are your usual school hours?";
    if (profile.occupation === "work_full" || profile.occupation === "work_part") {
      return "What are your usual work hours?";
    }
    return "Do you have regular daily commitments?";
  };

  const getCommitmentHelper = () => {
    if (profile.occupation === "college" || profile.occupation === "school") {
      return "We'll protect your lecture and class hours so assignments and revision are scheduled in your real free time.";
    }
    if (profile.occupation === "work_full" || profile.occupation === "work_part") {
      return "Your work hours will be protected from task scheduling so your off-hours stay organized and stress-free.";
    }
    return "Protecting regular commitments helps SlothMode schedule your tasks around them predictably.";
  };

  const isLunchDuringCommitment =
    profile.hasCommitment &&
    profile.lunchOption !== "none" &&
    profile.commitmentStartTime &&
    profile.commitmentEndTime &&
    profile.lunchStartTime &&
    profile.lunchEndTime &&
    timeToMinutes(profile.lunchStartTime) > timeToMinutes(profile.commitmentStartTime) &&
    timeToMinutes(profile.lunchEndTime) < timeToMinutes(profile.commitmentEndTime);

  return (
    <div
      className="onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="onboarding-card personalized-wizard">
        {/* Header Bar */}
        <div className="onboarding-header">
          <div className="wizard-progress-wrap">
            <div className="wizard-step-badge">
              <span className="wizard-sloth-icon">🦥</span>
              <span>
                Step {step} of {TOTAL_STEPS}
              </span>
            </div>
            <div
              className="wizard-progress-bar-bg"
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={TOTAL_STEPS}
              aria-label={`Onboarding progress: step ${step} of ${TOTAL_STEPS}`}
            >
              <div
                className="wizard-progress-bar-fill"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            className="onboarding-skip-btn"
            onClick={onSkip}
            title="Skip personalized setup and use standard gentle defaults"
            aria-label="Skip onboarding setup"
          >
            {isRevisiting ? "Close" : "Skip setup"}
          </button>
        </div>

        {/* Dynamic Wizard Screens */}
        <div className="wizard-body">
          {/* STEP 1: Name */}
          {step === 1 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap green">
                <Smile size={32} />
              </div>
              <h2 id="onboarding-title">What should we call you?</h2>
              <p className="onboarding-desc">
                Welcome to SlothMode! We believe in taking things slow and steady. There are no passwords,
                logins, or accounts here — just a gentle space for your mind.
              </p>

              <div className="wizard-input-group">
                <label htmlFor={nameInputId} className="wizard-label">
                  Your first name or preferred nickname (optional):
                </label>
                <input
                  id={nameInputId}
                  type="text"
                  className="wizard-text-input"
                  placeholder="e.g., Gargi"
                  value={profile.name || ""}
                  onChange={(e) => updateProfile({ name: e.target.value })}
                  autoFocus
                />
                <span className="wizard-helper-text">
                  You can leave this blank if you prefer. We only use this for a warm greeting.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Occupation */}
          {step === 2 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap lavender">
                <CompassIcon size={32} />
              </div>
              <h2 id="onboarding-title">What best describes your day?</h2>
              <p className="onboarding-desc">
                Choose the rhythm that feels closest to your life. This helps us tailor your scheduling
                commitments appropriately.
              </p>

              <div className="selection-card-grid" role="radiogroup" aria-label="Occupation selection">
                {OCCUPATION_OPTIONS.map((item) => {
                  const Icon = item.icon;
                  const isSelected = profile.occupation === item.type;
                  return (
                    <div
                      key={item.type}
                      className={`selection-card ${isSelected ? "selected" : ""}`}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => {
                        updateProfile({
                          occupation: item.type,
                          hasCommitment:
                            item.type === "college" ||
                            item.type === "school" ||
                            item.type === "work_full" ||
                            item.type === "work_part",
                          commitmentLabel:
                            item.type === "college"
                              ? "College / Classes"
                              : item.type === "school"
                              ? "School hours"
                              : item.type === "work_full" || item.type === "work_part"
                              ? "Work commitments"
                              : "Daily commitment",
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          updateProfile({ occupation: item.type });
                        }
                      }}
                    >
                      <div className="selection-card-icon">
                        <Icon size={22} />
                      </div>
                      <div className="selection-card-content">
                        <h4>{item.label}</h4>
                        <p>{item.desc}</p>
                      </div>
                      <div className="selection-card-indicator">
                        {isSelected && <Check size={16} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Sleep Duration */}
          {step === 3 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap peach">
                <Moon size={32} />
              </div>
              <h2 id="onboarding-title">How much sleep do you usually need?</h2>
              <p className="onboarding-desc">
                Rest isn't a reward you have to earn; it's the foundation of your well-being. Knowing your
                sleep needs helps SlothMode respect your recovery.
              </p>

              <div className="sleep-duration-grid" role="radiogroup" aria-label="Sleep duration in hours">
                {[6, 7, 8, 9, 10].map((hours) => {
                  const isSelected = profile.sleepHours === hours;
                  return (
                    <button
                      key={hours}
                      type="button"
                      className={`sleep-pill-btn ${isSelected ? "selected" : ""}`}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => updateProfile({ sleepHours: hours })}
                    >
                      <span className="sleep-pill-num">{hours}</span>
                      <span className="sleep-pill-label">hours</span>
                      {hours === 8 && <span className="sleep-recommended-tag">Gentle standard</span>}
                    </button>
                  );
                })}
              </div>

              <div className="onboarding-pill-callout">
                <span>🛌</span>
                <span>
                  SlothMode will never silently impose a bedtime. We use this to protect your winding-down hours.
                </span>
              </div>
            </div>
          )}

          {/* STEP 4: Wake-Up Time */}
          {step === 4 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap green">
                <Sun size={32} />
              </div>
              <h2 id="onboarding-title">When do you usually wake up?</h2>
              <p className="onboarding-desc">
                Pick your natural waking hour. We will set this as the earliest starting point for any
                scheduled focus sessions.
              </p>

              <div className="time-preset-row">
                {["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "10:00"].map((t) => {
                  const isSelected = profile.wakeUpTime === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`time-preset-pill ${isSelected ? "selected" : ""}`}
                      onClick={() => updateProfile({ wakeUpTime: t })}
                    >
                      {formatTimeDisplay(t)}
                    </button>
                  );
                })}
              </div>

              <div className="custom-time-picker-row">
                <span>Or custom time:</span>
                <input
                  type="time"
                  className="wizard-time-input"
                  value={profile.wakeUpTime}
                  onChange={(e) => updateProfile({ wakeUpTime: e.target.value })}
                  aria-label="Custom wake-up time"
                />
              </div>

              <div className="wizard-insight-box">
                <span className="insight-icon">✨</span>
                <div>
                  <strong>Gentle sleep suggestion:</strong>
                  <p>
                    With <strong>{profile.sleepHours} hours</strong> of sleep and waking at{" "}
                    <strong>{formatTimeDisplay(profile.wakeUpTime)}</strong>, heading to bed around{" "}
                    <strong>{formatTimeDisplay(suggestedBedtime)}</strong> gives your brain the restoration it
                    needs.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: College / School / Work Hours */}
          {step === 5 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap lavender">
                <GraduationCap size={32} />
              </div>
              <h2 id="onboarding-title">{getCommitmentTitle()}</h2>
              <p className="onboarding-desc">{getCommitmentHelper()}</p>

              <div className="commitment-toggle-cards">
                <div
                  className={`selection-card ${profile.hasCommitment ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={profile.hasCommitment}
                  onClick={() => updateProfile({ hasCommitment: true })}
                >
                  <div className="selection-card-icon">
                    <Clock3 size={20} />
                  </div>
                  <div className="selection-card-content">
                    <h4>I have regular fixed commitment hours</h4>
                    <p>Protect these hours so study and chores are scheduled outside them.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {profile.hasCommitment && <Check size={16} />}
                  </div>
                </div>

                <div
                  className={`selection-card ${!profile.hasCommitment ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={!profile.hasCommitment}
                  onClick={() => updateProfile({ hasCommitment: false })}
                >
                  <div className="selection-card-icon">
                    <Sparkles size={20} />
                  </div>
                  <div className="selection-card-content">
                    <h4>Flexible / changing schedule</h4>
                    <p>I don't have fixed commitment hours right now. Keep planning completely open.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {!profile.hasCommitment && <Check size={16} />}
                  </div>
                </div>
              </div>

              {profile.hasCommitment && (
                <div className="commitment-details-box">
                  <div className="wizard-field-row">
                    <label className="wizard-label">Label:</label>
                    <input
                      type="text"
                      className="wizard-text-input small"
                      value={profile.commitmentLabel || ""}
                      onChange={(e) => updateProfile({ commitmentLabel: e.target.value })}
                      placeholder="e.g., College / Classes"
                      aria-label="Commitment label"
                    />
                  </div>

                  <div className="time-range-row">
                    <div className="time-field">
                      <span>Starts:</span>
                      <input
                        type="time"
                        className="wizard-time-input"
                        value={profile.commitmentStartTime ?? ""}
                        onChange={(e) => handleCommitmentStartChange(e.target.value)}
                        aria-label="Commitment start time"
                      />
                      {profile.commitmentStartTime && (
                        <span className="time-ampm-hint">
                          {formatTimeDisplay(profile.commitmentStartTime)}
                        </span>
                      )}
                    </div>
                    <span className="time-separator">to</span>
                    <div className="time-field">
                      <span>Ends:</span>
                      <input
                        type="time"
                        className="wizard-time-input"
                        value={profile.commitmentEndTime ?? ""}
                        onChange={(e) => handleCommitmentEndChange(e.target.value)}
                        aria-label="Commitment end time"
                      />
                      {profile.commitmentEndTime && (
                        <span className="time-ampm-hint">
                          {formatTimeDisplay(profile.commitmentEndTime)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="common-presets-subbar">
                    <span>Common presets:</span>
                    <button
                      type="button"
                      className="sub-preset-pill"
                      onClick={() =>
                        updateProfile({ commitmentStartTime: "10:00", commitmentEndTime: "16:00" })
                      }
                    >
                      10:00 AM – 4:00 PM
                    </button>
                    <button
                      type="button"
                      className="sub-preset-pill"
                      onClick={() =>
                        updateProfile({ commitmentStartTime: "09:00", commitmentEndTime: "17:00" })
                      }
                    >
                      9:00 AM – 5:00 PM
                    </button>
                    <button
                      type="button"
                      className="sub-preset-pill"
                      onClick={() =>
                        updateProfile({ commitmentStartTime: "08:30", commitmentEndTime: "14:30" })
                      }
                    >
                      8:30 AM – 2:30 PM
                    </button>
                  </div>

                  <div className="days-selector-wrap">
                    <span className="days-label">Applies on:</span>
                    <div className="days-pill-row">
                      {COMMON_DAYS.map((day) => {
                        const isDaySelected = (profile.commitmentDays || []).includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            className={`day-toggle-pill ${isDaySelected ? "active" : ""}`}
                            onClick={() => {
                              const currentDays = profile.commitmentDays || [];
                              const nextDays = isDaySelected
                                ? currentDays.filter((d) => d !== day)
                                : [...currentDays, day];
                              updateProfile({ commitmentDays: nextDays });
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: Lunch */}
          {step === 6 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap peach">
                <Coffee size={32} />
              </div>
              <h2 id="onboarding-title">When do you usually have lunch?</h2>
              <p className="onboarding-desc">
                Nourishing your body keeps your cognitive focus clear and your mood steady. We protect this
                block so no focus tasks are scheduled over your meal.
              </p>

              <div className="meal-option-cards">
                <div
                  className={`selection-card ${profile.lunchOption === "fixed" ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={profile.lunchOption === "fixed"}
                  onClick={() => updateProfile({ lunchOption: "fixed" })}
                >
                  <div className="selection-card-icon">🍱</div>
                  <div className="selection-card-content">
                    <h4>Protected lunch time (Recommended)</h4>
                    <p>Reserve a specific peaceful hour to recharge.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {profile.lunchOption === "fixed" && <Check size={16} />}
                  </div>
                </div>

                <div
                  className={`selection-card ${profile.lunchOption === "changing" ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={profile.lunchOption === "changing"}
                  onClick={() => updateProfile({ lunchOption: "changing" })}
                >
                  <div className="selection-card-icon">🌊</div>
                  <div className="selection-card-content">
                    <h4>It changes daily</h4>
                    <p>Keep a flexible 45-minute meal pause around midday.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {profile.lunchOption === "changing" && <Check size={16} />}
                  </div>
                </div>

                <div
                  className={`selection-card ${profile.lunchOption === "none" ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={profile.lunchOption === "none"}
                  onClick={() => updateProfile({ lunchOption: "none" })}
                >
                  <div className="selection-card-icon">⏸️</div>
                  <div className="selection-card-content">
                    <h4>I don't have a fixed lunch time</h4>
                    <p>Don't reserve a blocked slot for lunch.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {profile.lunchOption === "none" && <Check size={16} />}
                  </div>
                </div>
              </div>

              {profile.lunchOption === "fixed" && (
                <div className="meal-custom-box">
                  <div className="meal-presets-bar">
                    <span className="subbar-label">Popular lunch times:</span>
                    <div className="subbar-pills">
                      {LUNCH_PRESETS.map((p) => {
                        const isSelected =
                          profile.lunchStartTime === p.start &&
                          profile.lunchEndTime === p.end;
                        return (
                          <button
                            key={p.label}
                            type="button"
                            className={`sub-preset-pill ${isSelected ? "selected" : ""}`}
                            onClick={() =>
                              updateProfile({
                                lunchStartTime: p.start,
                                lunchEndTime: p.end,
                              })
                            }
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="time-range-row standalone">
                    <div className="time-field">
                      <span>Lunch starts:</span>
                      <input
                        type="time"
                        className="wizard-time-input"
                        value={profile.lunchStartTime ?? ""}
                        onChange={(e) => handleLunchStartChange(e.target.value)}
                        aria-label="Lunch start time"
                      />
                      {profile.lunchStartTime && (
                        <span className="time-ampm-hint">
                          {formatTimeDisplay(profile.lunchStartTime)}
                        </span>
                      )}
                    </div>
                    <span className="time-separator">to</span>
                    <div className="time-field">
                      <span>Lunch ends:</span>
                      <input
                        type="time"
                        className="wizard-time-input"
                        value={profile.lunchEndTime ?? ""}
                        onChange={(e) => handleLunchEndChange(e.target.value)}
                        aria-label="Lunch end time"
                      />
                      {profile.lunchEndTime && (
                        <span className="time-ampm-hint">
                          {formatTimeDisplay(profile.lunchEndTime)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="duration-shortcut-bar">
                    <span className="duration-label">Quick duration:</span>
                    <div className="duration-pills">
                      {[30, 45, 60].map((mins) => {
                        const curDur =
                          profile.lunchStartTime && profile.lunchEndTime
                            ? timeToMinutes(profile.lunchEndTime) -
                              timeToMinutes(profile.lunchStartTime)
                            : 0;
                        const isDurActive = curDur === mins;
                        return (
                          <button
                            key={mins}
                            type="button"
                            className={`duration-pill-btn ${isDurActive ? "active" : ""}`}
                            onClick={() => setLunchDuration(mins)}
                          >
                            {mins} min
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {profile.lunchStartTime && profile.lunchEndTime && (
                    <div className="meal-live-summary">
                      {timeToMinutes(profile.lunchStartTime) <
                      timeToMinutes(profile.lunchEndTime) ? (
                        <span>
                          🍱 Lunch scheduled:{" "}
                          <strong>
                            {formatTimeDisplay(profile.lunchStartTime)} –{" "}
                            {formatTimeDisplay(profile.lunchEndTime)}
                          </strong>{" "}
                          (
                          {timeToMinutes(profile.lunchEndTime) -
                            timeToMinutes(profile.lunchStartTime)}{" "}
                          min)
                        </span>
                      ) : (
                        <span className="meal-error-hint">
                          ⚠️ Lunch start time must be earlier than end time.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 7: Dinner */}
          {step === 7 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap lavender">
                <Heart size={32} />
              </div>
              <h2 id="onboarding-title">When do you usually have dinner?</h2>
              <p className="onboarding-desc">
                An evening meal marks a natural transition towards winding down. We will make sure tasks
                don't encroach on your evening nourishment.
              </p>

              <div className="meal-option-cards">
                <div
                  className={`selection-card ${profile.dinnerOption === "fixed" ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={profile.dinnerOption === "fixed"}
                  onClick={() => updateProfile({ dinnerOption: "fixed" })}
                >
                  <div className="selection-card-icon">🍲</div>
                  <div className="selection-card-content">
                    <h4>Protected dinner time (Recommended)</h4>
                    <p>Reserve a dedicated pause for dinner in the evening.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {profile.dinnerOption === "fixed" && <Check size={16} />}
                  </div>
                </div>

                <div
                  className={`selection-card ${profile.dinnerOption === "changing" ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={profile.dinnerOption === "changing"}
                  onClick={() => updateProfile({ dinnerOption: "changing" })}
                >
                  <div className="selection-card-icon">🌊</div>
                  <div className="selection-card-content">
                    <h4>It changes daily</h4>
                    <p>Keep a flexible 30-minute pause in the evening.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {profile.dinnerOption === "changing" && <Check size={16} />}
                  </div>
                </div>

                <div
                  className={`selection-card ${profile.dinnerOption === "none" ? "selected" : ""}`}
                  tabIndex={0}
                  role="radio"
                  aria-checked={profile.dinnerOption === "none"}
                  onClick={() => updateProfile({ dinnerOption: "none" })}
                >
                  <div className="selection-card-icon">⏸️</div>
                  <div className="selection-card-content">
                    <h4>I don't have a fixed dinner time</h4>
                    <p>Don't reserve a blocked slot for dinner.</p>
                  </div>
                  <div className="selection-card-indicator">
                    {profile.dinnerOption === "none" && <Check size={16} />}
                  </div>
                </div>
              </div>

              {profile.dinnerOption === "fixed" && (
                <div className="meal-custom-box">
                  <div className="meal-presets-bar">
                    <span className="subbar-label">Popular dinner times:</span>
                    <div className="subbar-pills">
                      {DINNER_PRESETS.map((p) => {
                        const isSelected =
                          profile.dinnerStartTime === p.start &&
                          profile.dinnerEndTime === p.end;
                        return (
                          <button
                            key={p.label}
                            type="button"
                            className={`sub-preset-pill ${isSelected ? "selected" : ""}`}
                            onClick={() =>
                              updateProfile({
                                dinnerStartTime: p.start,
                                dinnerEndTime: p.end,
                              })
                            }
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="time-range-row standalone">
                    <div className="time-field">
                      <span>Dinner starts:</span>
                      <input
                        type="time"
                        className="wizard-time-input"
                        value={profile.dinnerStartTime ?? ""}
                        onChange={(e) => handleDinnerStartChange(e.target.value)}
                        aria-label="Dinner start time"
                      />
                      {profile.dinnerStartTime && (
                        <span className="time-ampm-hint">
                          {formatTimeDisplay(profile.dinnerStartTime)}
                        </span>
                      )}
                    </div>
                    <span className="time-separator">to</span>
                    <div className="time-field">
                      <span>Dinner ends:</span>
                      <input
                        type="time"
                        className="wizard-time-input"
                        value={profile.dinnerEndTime ?? ""}
                        onChange={(e) => handleDinnerEndChange(e.target.value)}
                        aria-label="Dinner end time"
                      />
                      {profile.dinnerEndTime && (
                        <span className="time-ampm-hint">
                          {formatTimeDisplay(profile.dinnerEndTime)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="duration-shortcut-bar">
                    <span className="duration-label">Quick duration:</span>
                    <div className="duration-pills">
                      {[30, 45, 60, 90].map((mins) => {
                        const curDur =
                          profile.dinnerStartTime && profile.dinnerEndTime
                            ? timeToMinutes(profile.dinnerEndTime) -
                              timeToMinutes(profile.dinnerStartTime)
                            : 0;
                        const isDurActive = curDur === mins;
                        return (
                          <button
                            key={mins}
                            type="button"
                            className={`duration-pill-btn ${isDurActive ? "active" : ""}`}
                            onClick={() => setDinnerDuration(mins)}
                          >
                            {mins} min
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {profile.dinnerStartTime && profile.dinnerEndTime && (
                    <div className="meal-live-summary">
                      {timeToMinutes(profile.dinnerStartTime) <
                      timeToMinutes(profile.dinnerEndTime) ? (
                        <span>
                          🍲 Dinner scheduled:{" "}
                          <strong>
                            {formatTimeDisplay(profile.dinnerStartTime)} –{" "}
                            {formatTimeDisplay(profile.dinnerEndTime)}
                          </strong>{" "}
                          (
                          {timeToMinutes(profile.dinnerEndTime) -
                            timeToMinutes(profile.dinnerStartTime)}{" "}
                          min)
                        </span>
                      ) : (
                        <span className="meal-error-hint">
                          ⚠️ Dinner start time must be earlier than end time.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 8: Wind-Down Time */}
          {step === 8 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap green">
                <Moon size={32} />
              </div>
              <h2 id="onboarding-title">When does your day usually wind down?</h2>
              <p className="onboarding-desc">
                Choose the preferred end time for your planned activities. SlothMode will never schedule
                tasks past this time so your evenings remain calm.
              </p>

              <div className="time-preset-row">
                {["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"].map((t) => {
                  const isSelected = profile.windDownTime === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`time-preset-pill ${isSelected ? "selected" : ""}`}
                      onClick={() => updateProfile({ windDownTime: t })}
                    >
                      {formatTimeDisplay(t)}
                    </button>
                  );
                })}
              </div>

              <div className="custom-time-picker-row">
                <span>Or custom wind-down time:</span>
                <input
                  type="time"
                  className="wizard-time-input"
                  value={profile.windDownTime}
                  onChange={(e) => updateProfile({ windDownTime: e.target.value })}
                  aria-label="Custom wind-down time"
                />
              </div>

              <div className="onboarding-pill-callout">
                <span>🌱</span>
                <span>
                  This is a planning window cutoff, not a bedtime mandate. If you finish earlier, you can
                  rest guilt-free!
                </span>
              </div>
            </div>
          )}

          {/* STEP 9: Predictability of Free Time */}
          {step === 9 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap lavender">
                <Layers size={32} />
              </div>
              <h2 id="onboarding-title">How predictable is your free time?</h2>
              <p className="onboarding-desc">
                Tell us how structured your typical days feel so we can adapt focus session suggestions to
                your rhythm.
              </p>

              <div className="selection-card-grid" role="radiogroup" aria-label="Free time predictability">
                {PREDICTABILITY_OPTIONS.map((opt) => {
                  const isSelected = profile.predictability === opt.value;
                  return (
                    <div
                      key={opt.value}
                      className={`selection-card ${isSelected ? "selected" : ""}`}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onClick={() => updateProfile({ predictability: opt.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          updateProfile({ predictability: opt.value });
                        }
                      }}
                    >
                      <div className="selection-card-icon" style={{ fontSize: "20px" }}>
                        {opt.icon}
                      </div>
                      <div className="selection-card-content">
                        <h4>{opt.label}</h4>
                        <p>{opt.desc}</p>
                      </div>
                      <div className="selection-card-indicator">
                        {isSelected && <Check size={16} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 10: Review & Confirm */}
          {step === 10 && (
            <div className="wizard-screen">
              <div className="onboarding-icon-wrap green">
                <Sparkles size={32} />
              </div>
              <h2 id="onboarding-title">Review your gentle routine</h2>
              <p className="onboarding-desc">
                Here is how your day will be set up. SlothMode uses these exact preferences to configure the
                deterministic scheduler.
              </p>

              <div className="wizard-review-summary-card">
                <div className="review-section-header">
                  <span>🦥</span>
                  <div>
                    <h4>{profile.name ? `${profile.name}'s Daily Pace & Flow` : "Your Daily Pace & Flow"}</h4>
                    <p>Protected intervals where no study or work tasks will ever be scheduled.</p>
                  </div>
                </div>

                <div className="review-details-grid">
                  <div className="review-detail-item">
                    <span className="review-detail-label">Active Planning Window</span>
                    <strong className="review-detail-value">
                      {formatTimeDisplay(profile.wakeUpTime)} – {formatTimeDisplay(profile.windDownTime)}
                    </strong>
                    <small>Wake-up to evening wind-down</small>
                  </div>

                  <div className="review-detail-item">
                    <span className="review-detail-label">Protected Commitment</span>
                    <strong className="review-detail-value">
                      {profile.hasCommitment && profile.commitmentStartTime && profile.commitmentEndTime
                        ? `${profile.commitmentLabel || "Commitment"}: ${formatTimeDisplay(
                            profile.commitmentStartTime
                          )} – ${formatTimeDisplay(profile.commitmentEndTime)}`
                        : "Flexible / No fixed hours"}
                    </strong>
                    <small>
                      {profile.hasCommitment
                        ? `${(profile.commitmentDays || []).join(", ") || "Weekdays"}`
                        : "Open schedule"}
                    </small>
                  </div>

                  <div className="review-detail-item">
                    <span className="review-detail-label">Protected Meals</span>
                    <strong className="review-detail-value">
                      {profile.lunchOption === "fixed" && profile.lunchStartTime
                        ? `Lunch: ${formatTimeDisplay(profile.lunchStartTime)} – ${formatTimeDisplay(
                            profile.lunchEndTime || "13:00"
                          )}`
                        : "Lunch: Flexible"}
                    </strong>
                    <small>
                      {profile.dinnerOption === "fixed" && profile.dinnerStartTime
                        ? `Dinner: ${formatTimeDisplay(profile.dinnerStartTime)} – ${formatTimeDisplay(
                            profile.dinnerEndTime || "20:00"
                          )}`
                        : "Dinner: Flexible"}
                    </small>
                  </div>

                  <div className="review-detail-item">
                    <span className="review-detail-label">Recovery & Sleep</span>
                    <strong className="review-detail-value">
                      {profile.sleepHours} hours needed
                    </strong>
                    <small>Suggested bedtime ~{formatTimeDisplay(suggestedBedtime)}</small>
                  </div>
                </div>

                {isLunchDuringCommitment && (
                  <div className="review-smart-notice">
                    <span className="notice-icon">✨</span>
                    <p>
                      <strong>Smart conflict resolution:</strong> Your lunch break (
                      {formatTimeDisplay(profile.lunchStartTime || "")}–
                      {formatTimeDisplay(profile.lunchEndTime || "")}) falls inside your college/work hours.
                      SlothMode protects your lunch and schedules your commitment in morning and afternoon
                      halves with zero scheduling conflicts!
                    </p>
                  </div>
                )}

                <div className="review-routine-preview-blocks">
                  <span className="preview-blocks-title">Configured scheduler blocks:</span>
                  <div className="preview-chip-row">
                    {mappedPreview.blocks.map((b) => (
                      <span key={b.id} className="preview-routine-chip">
                        <span>{b.icon || "📌"}</span>
                        <span>{b.label}</span>
                        <span className="chip-time">{b.startTime}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="onboarding-pill-callout">
                <span>💡</span>
                <span>You can always adjust these times anytime from the Routine Settings card!</span>
              </div>
            </div>
          )}
        </div>

        {/* Validation Warning Notice */}
        {stepWarning && (
          <div className="wizard-warning-banner" role="alert">
            <span>⚠️</span>
            <span>{stepWarning}</span>
          </div>
        )}

        {/* Actions Footer */}
        <div className="onboarding-actions wizard-actions">
          {step > 1 ? (
            <button type="button" className="onboarding-back-btn" onClick={handleBack}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              className="onboarding-next-btn"
              onClick={handleNext}
              disabled={!canProceed}
            >
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="onboarding-start-btn save-routine"
              onClick={handleFinalSave}
              disabled={!canProceed}
            >
              Confirm & save routine 🦥
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Internal fallback icon
function CompassIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
