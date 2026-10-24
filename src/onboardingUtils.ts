import type { RoutineBlock, RoutineSettings, UserProfile } from "./types";
import { DEFAULT_ROUTINE_SETTINGS } from "./types";

export function timeToMinutes(t: string): number {
  if (!t || typeof t !== "string") return 0;
  const [h, m] = t.trim().split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(m: number): string {
  const normalized = ((Math.floor(m) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function calcDurationMinutes(start: string, end: string): number {
  const s = timeToMinutes(start);
  let e = timeToMinutes(end);
  if (e <= s) {
    e += 24 * 60;
  }
  return e - s;
}

/**
 * Calculates a suggested bedtime string (HH:mm) given wake-up time and sleep hours.
 */
export function calcSuggestedBedtime(wakeUpTime: string, sleepHours: number): string {
  const wakeMin = timeToMinutes(wakeUpTime || "08:00");
  const sleepMins = Math.round(Number(sleepHours || 8) * 60);
  let bedtimeMin = (wakeMin - sleepMins) % 1440;
  if (bedtimeMin < 0) bedtimeMin += 1440;
  return minutesToTime(bedtimeMin);
}

export function formatTimeDisplay(timeStr: string): string {
  if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr)) return timeStr || "--:--";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr.padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Maps UserProfile onboarding answers into deterministic RoutineSettings consumed by scheduler.
 */
export function mapProfileToRoutineSettings(
  profile: Partial<UserProfile>,
  existingRoutine?: RoutineSettings
): RoutineSettings {
  const dayStartTime = profile.wakeUpTime || existingRoutine?.dayStartTime || "08:00";
  let dayEndTime = profile.windDownTime || existingRoutine?.dayEndTime || "21:00";

  const dayStartMin = timeToMinutes(dayStartTime);
  let dayEndMin = timeToMinutes(dayEndTime);

  const blocks: RoutineBlock[] = [];

  // 1. Lunch
  const lunchEnabled = profile.lunchOption !== "none";
  const lunchStart = profile.lunchStartTime || "13:00";
  const lunchEnd = profile.lunchEndTime || "14:00";
  let lunchDur = 60;
  if (profile.lunchOption === "fixed" && profile.lunchStartTime && profile.lunchEndTime) {
    lunchDur = Math.max(15, calcDurationMinutes(lunchStart, lunchEnd));
  } else if (profile.lunchOption === "changing") {
    lunchDur = 45;
  }

  const lunchStartMin = timeToMinutes(lunchStart);
  const lunchEndMin = lunchStartMin + lunchDur;

  if (lunchEnabled && lunchStartMin >= dayStartMin && lunchEndMin <= dayEndMin) {
    blocks.push({
      id: "lunch",
      label: "Lunch",
      icon: "🍱",
      enabled: true,
      startTime: lunchStart,
      durationMinutes: lunchDur,
    });
  }

  // 2. Dinner
  const dinnerEnabled = profile.dinnerOption !== "none";
  const dinnerStart = profile.dinnerStartTime || "19:00";
  const dinnerEnd = profile.dinnerEndTime || "19:30";
  let dinnerDur = 30;
  if (profile.dinnerOption === "fixed" && profile.dinnerStartTime && profile.dinnerEndTime) {
    dinnerDur = Math.max(15, calcDurationMinutes(dinnerStart, dinnerEnd));
  } else if (profile.dinnerOption === "changing") {
    dinnerDur = 30;
  }

  const dinnerStartMin = timeToMinutes(dinnerStart);
  const dinnerEndMin = dinnerStartMin + dinnerDur;

  if (dinnerEnabled && dinnerStartMin >= dayStartMin) {
    if (dinnerEndMin > dayEndMin) {
      dayEndMin = Math.min(23 * 60 + 59, dinnerEndMin);
      dayEndTime = minutesToTime(dayEndMin);
    }
    blocks.push({
      id: "dinner",
      label: "Dinner",
      icon: "🍲",
      enabled: true,
      startTime: dinnerStart,
      durationMinutes: dinnerDur,
    });
  }

  // 3. College / School / Work commitment
  if (profile.hasCommitment && profile.commitmentStartTime && profile.commitmentEndTime) {
    const comStart = profile.commitmentStartTime;
    const comEnd = profile.commitmentEndTime;
    const comStartMin = timeToMinutes(comStart);
    const comEndMin = timeToMinutes(comEnd);

    let defaultIcon = "🎓";
    if (profile.occupation === "work_full" || profile.occupation === "work_part") {
      defaultIcon = "💼";
    } else if (profile.occupation === "school") {
      defaultIcon = "🏫";
    }

    const label = profile.commitmentLabel || (defaultIcon === "💼" ? "Work commitments" : "College / Classes");

    if (comEndMin > comStartMin && comStartMin >= dayStartMin && comEndMin <= dayEndMin) {
      // Check if lunch is inside the commitment window
      if (lunchEnabled && lunchStartMin > comStartMin && lunchEndMin < comEndMin) {
        // Enclosed lunch: cleanly split commitment into morning & afternoon parts around lunch
        blocks.push({
          id: "commitment_morning",
          label: `${label} (Morning)`,
          icon: defaultIcon,
          enabled: true,
          startTime: comStart,
          durationMinutes: lunchStartMin - comStartMin,
        });
        blocks.push({
          id: "commitment_afternoon",
          label: `${label} (Afternoon)`,
          icon: defaultIcon,
          enabled: true,
          startTime: minutesToTime(lunchEndMin),
          durationMinutes: comEndMin - lunchEndMin,
        });
      } else {
        // Non-enclosed or disjoint commitment
        blocks.push({
          id: "commitment_block",
          label,
          icon: defaultIcon,
          enabled: true,
          startTime: comStart,
          durationMinutes: comEndMin - comStartMin,
        });
      }
    }
  }

  // 4. Nap (Preserve existing or keep if enabled and within day window without overlap)
  const existingNap = existingRoutine?.blocks?.find((b) => b.id === "nap");
  const napEnabled = profile.keepNap !== undefined ? profile.keepNap : (existingNap ? existingNap.enabled : true);
  const napStart = existingNap?.startTime || "14:00";
  const napDur = existingNap?.durationMinutes || 30;
  const napStartMin = timeToMinutes(napStart);
  const napEndMin = napStartMin + napDur;

  const hasOverlap = (startM: number, endM: number) => {
    return blocks.some((b) => {
      const bStart = timeToMinutes(b.startTime);
      const bEnd = bStart + b.durationMinutes;
      return startM < bEnd && bStart < endM;
    });
  };

  if (napEnabled && napStartMin >= dayStartMin && napEndMin <= dayEndMin && !hasOverlap(napStartMin, napEndMin)) {
    blocks.push({
      id: "nap",
      label: "Nap",
      icon: "😴",
      enabled: true,
      startTime: napStart,
      durationMinutes: napDur,
    });
  }

  // 5. Evening Snack (Preserve existing or keep if enabled and within day window without overlap)
  const existingSnack = existingRoutine?.blocks?.find((b) => b.id === "evening_snack");
  const snackEnabled = profile.keepSnack !== undefined ? profile.keepSnack : (existingSnack ? existingSnack.enabled : true);
  const snackStart = existingSnack?.startTime || "17:00";
  const snackDur = existingSnack?.durationMinutes || 15;
  const snackStartMin = timeToMinutes(snackStart);
  const snackEndMin = snackStartMin + snackDur;

  if (snackEnabled && snackStartMin >= dayStartMin && snackEndMin <= dayEndMin && !hasOverlap(snackStartMin, snackEndMin)) {
    blocks.push({
      id: "evening_snack",
      label: "Evening snack",
      icon: "🍵",
      enabled: true,
      startTime: snackStart,
      durationMinutes: snackDur,
    });
  }

  // Sort chronologically
  blocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  return {
    dayStartTime,
    dayEndTime,
    blocks: blocks.length > 0 ? blocks : DEFAULT_ROUTINE_SETTINGS.blocks,
  };
}

export function validateProfileInputs(profile: Partial<UserProfile>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const startMin = timeToMinutes(profile.wakeUpTime || "08:00");
  const endMin = timeToMinutes(profile.windDownTime || "21:00");

  if (startMin >= endMin) {
    errors.push(`Wake-up time (${profile.wakeUpTime}) must be earlier than day wind-down time (${profile.windDownTime}).`);
  }

  if (profile.hasCommitment && profile.commitmentStartTime && profile.commitmentEndTime) {
    const comStart = timeToMinutes(profile.commitmentStartTime);
    const comEnd = timeToMinutes(profile.commitmentEndTime);
    if (comStart >= comEnd) {
      errors.push(`Commitment start time (${profile.commitmentStartTime}) must be earlier than end time (${profile.commitmentEndTime}).`);
    }
  }

  if (profile.lunchOption === "fixed" && profile.lunchStartTime && profile.lunchEndTime) {
    const lStart = timeToMinutes(profile.lunchStartTime);
    const lEnd = timeToMinutes(profile.lunchEndTime);
    if (lStart >= lEnd) {
      errors.push(`Lunch start time (${profile.lunchStartTime}) must be earlier than lunch end time (${profile.lunchEndTime}).`);
    }
  }

  if (profile.dinnerOption === "fixed" && profile.dinnerStartTime && profile.dinnerEndTime) {
    const dStart = timeToMinutes(profile.dinnerStartTime);
    const dEnd = timeToMinutes(profile.dinnerEndTime);
    if (dStart >= dEnd) {
      errors.push(`Dinner start time (${profile.dinnerStartTime}) must be earlier than dinner end time (${profile.dinnerEndTime}).`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
