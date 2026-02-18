const BASE_URL = "https://api.sportsdata.io/golf/v2/json";

function getApiKey(): string {
  const key = process.env.SPORTSDATA_API_KEY;
  if (!key) throw new Error("SPORTSDATA_API_KEY is not set");
  return key;
}

async function fetchApi<T>(endpoint: string): Promise<T> {
  const url = `${BASE_URL}/${endpoint}`;
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": getApiKey() },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(
      `SportsData API error: ${res.status} ${res.statusText} for ${endpoint}`
    );
  }
  return res.json() as Promise<T>;
}

export async function fetchTournamentsBySeason(
  season: number
): Promise<SportsDataTournament[]> {
  return fetchApi(`Tournaments/${season}`);
}

export async function fetchLeaderboard(
  tournamentId: number
): Promise<SportsDataLeaderboard> {
  return fetchApi(`Leaderboard/${tournamentId}`);
}

export async function fetchPlayers(): Promise<SportsDataPlayer[]> {
  return fetchApi("Players");
}

export async function fetchCurrentSeason(): Promise<SportsDataSeason> {
  return fetchApi("CurrentSeason");
}

// SportsData.io API response types
export interface SportsDataSeason {
  SeasonID: number;
  Season: number;
  Description: string;
  StartDate: string;
  EndDate: string;
}

export interface SportsDataTournament {
  TournamentID: number;
  Name: string;
  StartDate: string;
  EndDate: string;
  Location: string;
  Venue: string;
  Par: number;
  Purse: number;
  StartDateTime: string;
  IsOver: boolean;
  IsInProgress: boolean;
  Canceled: boolean;
  TimeZone: string;
}

export interface SportsDataPlayer {
  PlayerID: number;
  FirstName: string;
  LastName: string;
  Country: string;
  PhotoUrl: string;
  WorldGolfRank: number | null;
}

export interface SportsDataLeaderboard {
  Tournament: SportsDataTournament;
  Players: SportsDataLeaderboardPlayer[];
}

export interface SportsDataLeaderboardPlayer {
  PlayerID: number;
  PlayerTournamentID: number;
  FirstName: string;
  LastName: string;
  Country: string;
  TotalScore: number;
  TotalStrokes: number;
  TotalThrough: number;
  Earnings: number;
  Rank: number;
  IsWithdrawn: boolean;
  MadeCut: number; // 1 = made cut, 0 = missed
  TeeTime: string | null;
  Rounds: SportsDataRound[];
}

export interface SportsDataRound {
  Number: number;
  Day: string;
  TeeTime: string | null;
}
