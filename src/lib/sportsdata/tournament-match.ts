/**
 * Normalize a tournament name for flexible matching across years.
 * SportsData often changes sponsor prefixes/suffixes (e.g. "The Genesis Invitational"
 * vs "Genesis Invitational" vs "Genesis Invitational presented by Rolex").
 */
function normalizeTournamentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")                          // strip leading "The "
    .replace(/\s+presented\s+by\s+.+$/, "")          // strip "presented by ..."
    .replace(/\s+sponsored\s+by\s+.+$/, "")          // strip "sponsored by ..."
    .replace(/\s+in\s+the\s+.+$/, "")                // strip "in the ..."
    .replace(/\s+at\s+.+$/, "")                      // strip "at ..."
    .replace(/[^a-z0-9\s]/g, "")                     // remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the SportsData API tournament name matches the name stored
 * in our DB, using fuzzy/flexible matching to tolerate sponsor name changes.
 */
export function matchesTournamentName(apiName: string, dbName: string): boolean {
  const a = normalizeTournamentName(apiName);
  const b = normalizeTournamentName(dbName);
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Parse a SportsData datetime string as Eastern Time.
 * SportsData documents that all tee times are in Eastern Time (ET), but the
 * strings have no timezone offset (e.g. "2026-02-19T10:15:00"). Without
 * correction, JS/Node on a UTC server treats them as UTC, making them appear
 * 5 hours early (EST) or 4 hours early (EDT) when shown to the user.
 */
export function parseEasternDateTime(dateStr: string): Date {
  // Parse naively as UTC to extract the approximate month/day
  const utc = new Date(dateStr + "Z");
  const month = utc.getUTCMonth() + 1; // 1–12
  const day = utc.getUTCDate();

  // DST: EDT (UTC−4) from ~second Sunday in March through ~first Sunday in November
  const isEDT =
    (month > 3 && month < 11) ||
    (month === 3 && day >= 8) ||   // on or after ~second Sunday of March
    (month === 11 && day < 8);     // before ~first Sunday of November

  return new Date(dateStr + (isEDT ? "-04:00" : "-05:00"));
}
