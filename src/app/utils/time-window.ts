// Convert a wall-clock date/time in an IANA timezone to a UTC epoch (ms).
// Uses the formatToParts round-trip so it is correct across DST (EST vs EDT).
export function zonedWallTimeToUtcMs(
  year: number, month: number, day: number,
  hour: number, minute: number, timeZone: string,
): number {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(asIfUtc))) p[part.type] = part.value;
  const seenInZone = Date.UTC(
    +p['year'], +p['month'] - 1, +p['day'], +p['hour'], +p['minute'], +p['second'],
  );
  const offset = seenInZone - asIfUtc;       // how far the zone is ahead of UTC at that instant
  return asIfUtc - offset;
}

export const INTERVIEW_TZ = 'America/New_York';
export const WINDOW_OPEN_MIN = 15;  // earliest: 15 minutes before
export const WINDOW_CLOSE_MIN = 1;  // latest:    1 minute before

// mockDate = "YYYY-MM-DD", mockTime = "HH:MM" (24h). Returns scheduled UTC ms, or null if invalid.
export function scheduledUtcMs(mockDate: string, mockTime: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mockDate);
  const t = /^(\d{2}):(\d{2})$/.exec(mockTime);
  if (!d || !t) return null;
  return zonedWallTimeToUtcMs(+d[1], +d[2], +d[3], +t[1], +t[2], INTERVIEW_TZ);
}

export type WindowState = 'incomplete' | 'tooEarly' | 'open' | 'tooLate';

export function windowStateFor(scheduledMs: number | null, nowMs: number): WindowState {
  if (scheduledMs == null) return 'incomplete';
  const mins = (scheduledMs - nowMs) / 60000;
  if (mins > WINDOW_OPEN_MIN) return 'tooEarly';
  if (mins < WINDOW_CLOSE_MIN) return 'tooLate';
  return 'open';
}
