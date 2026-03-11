const BASE_URL =
  "https://site.web.api.espn.com/apis/site/v2/sports/golf";

async function fetchEspn<T>(path: string): Promise<T> {
  const url = `${BASE_URL}/${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(
      `ESPN API error: ${res.status} ${res.statusText} for ${path}`
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch the full season schedule + current leaderboard.
 * Includes all tournaments for the year, with full competitor data for
 * in-progress and recently completed events.
 */
export async function fetchLeaderboard(
  season: number
): Promise<EspnLeaderboardResponse> {
  return fetchEspn<EspnLeaderboardResponse>(`leaderboard?season=${season}`);
}

/**
 * Fetch leaderboard for a specific event by ESPN event ID.
 * Returns full competitor data regardless of tournament status.
 */
export async function fetchEventLeaderboard(
  eventId: number
): Promise<EspnLeaderboardResponse> {
  return fetchEspn<EspnLeaderboardResponse>(`leaderboard?event=${eventId}`);
}

/** Returns the current PGA season year (the year the season ends). */
export function getCurrentSeasonYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1–12
  // PGA Tour season runs roughly Oct–Aug; season is named by the year it ends.
  // Oct, Nov, Dec → next calendar year's season is beginning.
  return month >= 10 ? now.getFullYear() + 1 : now.getFullYear();
}

// ─── ESPN Response Types ──────────────────────────────────────────────────────

export interface EspnLeaderboardResponse {
  /** Present on older /golf/pga endpoint responses (now unused). */
  season?: EspnSeason;
  /** New /golf endpoint returns top-level "events" array. */
  events?: EspnTournament[];
  /** Old /golf/pga endpoint returned top-level "tournaments" array. */
  tournaments?: EspnTournament[];
}

export interface EspnSeason {
  year: number;
  displayName?: string;
}

export interface EspnTournament {
  id: string;
  uid?: string;
  name: string;
  shortName?: string;
  status: EspnTournamentStatus;
  /** Flat ISO date string (new /golf endpoint). */
  date: string;
  /** Flat ISO end-date string (new /golf endpoint). */
  endDate?: string;
  purse?: string | number | null;
  displayPurse?: string;
  venue?: EspnVenue;
  courses?: EspnCourse[];
  competitors?: EspnCompetitor[];
}

export interface EspnTournamentStatus {
  type: {
    id: string;
    name: string;
    /** "pre" = scheduled, "in" = in-progress, "post" = final */
    state: "pre" | "in" | "post";
    completed: boolean;
    description?: string;
    detail?: string;
  };
}

export interface EspnDateRange {
  start: string;
  end?: string;
}

export interface EspnVenue {
  id?: string;
  fullName: string;
  address?: {
    city?: string;
    state?: string;
    country?: string;
  };
}

export interface EspnCourse {
  id?: string;
  name?: string;
  par?: number;
}

export interface EspnCompetitor {
  id: string;
  uid?: string;
  athlete: EspnAthlete;
  score?: {
    value: number;
    displayValue: string;
    winner?: boolean;
  };
  status?: {
    period?: number;
    thru?: number | string;
    type?: {
      state?: string;
      completed?: boolean;
    };
    position?: {
      id?: string;
      displayName?: string;
      /** "1", "T5", "CUT", "MC", "WD", "DQ", "MDF" etc. */
      shortDisplayName?: string;
    };
  };
  statistics?: Array<{
    name: string;
    displayValue: string;
    value?: number | string;
  }>;
  linescores?: Array<{
    period: { number: number };
    value: number;
    displayValue: string;
  }>;
}

export interface EspnAthlete {
  id: string;
  uid?: string;
  displayName: string;
  shortName?: string;
  headshot?: { href: string; alt?: string };
  flag?: { href?: string; alt?: string; countryCode?: string };
}

// ─── Helper Utilities ─────────────────────────────────────────────────────────

/**
 * Split ESPN displayName (e.g. "Scottie Scheffler") into first + last.
 * Splits at the last space so "Byeong Hun An" → { first: "Byeong Hun", last: "An" }.
 */
export function splitDisplayName(displayName: string): {
  firstName: string;
  lastName: string;
} {
  const lastSpace = displayName.lastIndexOf(" ");
  if (lastSpace === -1) return { firstName: "", lastName: displayName };
  return {
    firstName: displayName.slice(0, lastSpace).trim(),
    lastName: displayName.slice(lastSpace + 1).trim(),
  };
}

/**
 * Parse a competitor's position to a numeric rank.
 * Returns null for non-numeric positions (CUT, WD, DQ, MDF).
 */
export function parsePosition(
  shortDisplayName: string | undefined
): number | null {
  if (!shortDisplayName) return null;
  const clean = shortDisplayName.replace(/^T/, ""); // strip tie prefix
  const n = parseInt(clean, 10);
  return isNaN(n) ? null : n;
}

/**
 * Determine if a competitor withdrew (WD, DQ).
 */
export function isWithdrawn(
  shortDisplayName: string | undefined
): boolean {
  if (!shortDisplayName) return false;
  const upper = shortDisplayName.toUpperCase();
  return upper === "WD" || upper === "DQ";
}

/**
 * Determine if a competitor missed the cut (CUT, MC, MDF).
 * Returns null if the tournament is not yet over (cut not determined).
 */
export function madeCut(
  shortDisplayName: string | undefined,
  tournamentOver: boolean
): boolean | null {
  if (!tournamentOver) return null;
  if (!shortDisplayName) return null;
  const upper = shortDisplayName.toUpperCase();
  if (upper === "CUT" || upper === "MC" || upper === "MDF") return false;
  if (upper === "WD" || upper === "DQ") return null; // withdrawn, not a cut result
  return true; // has a numeric position = made the cut
}

/**
 * Extract earnings from a competitor's statistics array.
 * Returns null if not present.
 */
export function extractEarnings(
  statistics: EspnCompetitor["statistics"]
): number | null {
  if (!statistics) return null;
  const stat = statistics.find((s) => s.name === "earnings");
  if (!stat) return null;
  // value may be a number already, or a string like "$1,728,000"
  if (typeof stat.value === "number") return stat.value;
  if (typeof stat.value === "string") {
    const n = parseFloat(stat.value.replace(/[$,]/g, ""));
    return isNaN(n) ? null : n;
  }
  // Fall back to parsing displayValue
  const n = parseFloat(stat.displayValue.replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * Parse purse from ESPN tournament data (may be a string, number, or null).
 */
export function parsePurse(purse: string | number | null | undefined): string | null {
  if (purse == null) return null;
  const n = typeof purse === "number" ? purse : parseFloat(String(purse).replace(/[$,]/g, ""));
  return isNaN(n) || n === 0 ? null : n.toString();
}

/**
 * Get the venue/location string from an ESPN tournament.
 */
export function getTournamentLocation(tournament: EspnTournament): string | null {
  const addr = tournament.venue?.address;
  if (!addr) return null;
  const parts = [addr.city, addr.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
