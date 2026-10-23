// server/durationParser.js
// Deterministic parser for explicit duration expressions in task titles and descriptions.
// Examples:
// - "study for 2 hours" -> 120 minutes
// - "read 30 minutes" -> 30 minutes
// - "work for 1.5 hours" -> 90 minutes
// - "practice for 2 hrs 30 mins" -> 150 minutes
// - "study 45m" -> 45 minutes
// - "study for 90 minutes" -> 90 minutes
// Avoids matching non-duration numbers like "read chapter 2", "finish 3 exercises", "run 500m", or "meeting at 2pm".

/**
 * Parses an explicit duration from a text string (task title or description).
 * Returns an object with durationMinutes and metadata, or null if no valid explicit duration is found.
 */
export function parseExplicitDuration(text) {
  if (!text || typeof text !== 'string') return null;
  const str = text.trim();
  if (!str) return null;

  // Pattern 1: Combined hours and minutes (e.g. "2 hrs 30 mins", "1h 45m", "2 hours and 15 minutes", "1 hr 15 mins")
  const combinedMatch = str.match(
    /(?:for\s+|in\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|(?<![a-zA-Z])m)\b/i
  );
  if (combinedMatch) {
    const hours = parseFloat(combinedMatch[1]);
    const mins = parseFloat(combinedMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      const total = Math.round(hours * 60 + mins);
      if (total > 0 && total <= 720) {
        return {
          durationMinutes: total,
          matchedText: combinedMatch[0].trim(),
          source: 'explicit',
          confidence: 'high',
          reasoning: `Explicit duration parsed from "${combinedMatch[0].trim()}" (${total}m)`,
        };
      }
    }
  }

  // Pattern 2: Hours only (e.g. "study for 2 hours", "work for 1.5 hours", "3 hrs", "1h", "0.5 hours")
  // Ensures it is not followed by an "and <number>" which would belong to combined match
  const hoursMatch = str.match(
    /(?:for\s+|in\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)(?!\s*(?:and\s*)?\d)/i
  );
  if (hoursMatch) {
    const hours = parseFloat(hoursMatch[1]);
    if (Number.isFinite(hours)) {
      const total = Math.round(hours * 60);
      if (total > 0 && total <= 720) {
        return {
          durationMinutes: total,
          matchedText: hoursMatch[0].trim(),
          source: 'explicit',
          confidence: 'high',
          reasoning: `Explicit duration parsed from "${hoursMatch[0].trim()}" (${total}m)`,
        };
      }
    }
  }

  // Guard against running/swimming/walking distances with single letter "m" (e.g. "run 500m", "swim 100m")
  if (/(?:run|swim|sprint|dash|row|walk)\s+\d+\s*m\b/i.test(str)) {
    if (!/(?:for|in)\s+\d+\s*(?:minutes?|mins?|m\b)/i.test(str)) {
      return null;
    }
  }

  // Pattern 3: Minutes only (e.g. "read 30 minutes", "study 45m", "study for 90 minutes", "15 mins")
  // Uses (?<![apAPa-zA-Z]) to avoid matching time-of-day like "10am", "2pm", or words ending in m
  const minsMatch = str.match(
    /(?:for\s+|in\s+)?(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|(?<![apAPa-zA-Z])m\b)/i
  );
  if (minsMatch) {
    const mins = parseFloat(minsMatch[1]);
    if (Number.isFinite(mins)) {
      const total = Math.round(mins);
      // For single letter "m", only accept sensible durations up to 240m (4h)
      const isSingleM = /m\b/i.test(minsMatch[0]) && !/min/i.test(minsMatch[0]);
      if (isSingleM && (total <= 0 || total > 240)) return null;

      if (total > 0 && total <= 720) {
        return {
          durationMinutes: total,
          matchedText: minsMatch[0].trim(),
          source: 'explicit',
          confidence: 'high',
          reasoning: `Explicit duration parsed from "${minsMatch[0].trim()}" (${total}m)`,
        };
      }
    }
  }

  return null;
}
