const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_DAYS = 29.53058867;
const DAY_MS = 86_400_000;
const FULL_MOON_WINDOW = 0.034;

// Noon UTC gives one phase value to an ISO date in every time zone.
function phase(isoDate: string): number {
  const noon = Date.parse(`${isoDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ||
    !Number.isFinite(noon) ||
    new Date(noon).toISOString().slice(0, 10) !== isoDate
  )
    throw new TypeError("date must be a valid YYYY-MM-DD day");
  const lunations = (noon - KNOWN_NEW_MOON) / DAY_MS / SYNODIC_DAYS;
  return lunations - Math.floor(lunations);
}

export function fullMoon(isoDate: string): number {
  const offset = Math.abs(phase(isoDate) - 0.5);
  return Math.max(0, 1 - offset / FULL_MOON_WINDOW);
}
