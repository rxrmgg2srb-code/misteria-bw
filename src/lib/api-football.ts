export type RealLineupPlayer = {
  name: string;
  pos: string;
  number: number;
  isStarter: boolean;
};

export type RealTeamLineup = {
  teamName: string;
  formation: string;
  coach: string;
  starters: RealLineupPlayer[];
  subs: RealLineupPlayer[];
};

export type TeamStats = {
  players: Map<string, number>;
  subs: Map<string, number>;
  formations: Map<string, number>;
  coach: string;
};

/** Injury info for a player in a specific fixture */
export type PlayerInjury = {
  playerName: string;
  teamName: string;
  type: 'Missing Fixture' | 'Questionable' | string;
  reason: string;
};

/** Individual player season stats from API-Football Pro */
export type PlayerSeasonStats = {
  apiId: number;
  name: string;
  teamName: string;
  position: string;
  lineups: number;       // times started
  minutes: number;       // total minutes played
  rating: number;        // avg rating (0-10)
  goals: number;
  assists: number;
};

/** Fixture with odds-based difficulty */
export type FixtureInfo = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  date: string;
  round: string;
  status: string;
  homeDifficulty: number; // 1 (easy) - 5 (hard) calculated from odds
  awayDifficulty: number;
};

// Maps this API's position codes to our system
function mapPos(pos: string): string {
  const p = (pos || '').toUpperCase();
  if (p === 'G' || p === 'GK' || p === 'P') return 'PT';
  if (p === 'D' || p === 'DF' || p === 'DEF' || p === 'CB' || p === 'LB' || p === 'RB') return 'DF';
  if (p === 'M' || p === 'MC' || p === 'MID' || p === 'CM' || p === 'DM' || p === 'AM') return 'MC';
  if (p === 'F' || p === 'DL' || p === 'FW' || p === 'ST' || p === 'LW' || p === 'RW' || p === 'ATT') return 'DL';
  return 'MC';
}

export const apiDebug = {
  lastStatus: 0,
  lastUrl: '',
  lastError: ''
};

async function apiGet(path: string, cacheSecs = 3600): Promise<Record<string, unknown>> {
  const KEY = process.env.APIFOOTBALL_KEY || '';
  const BASE = 'https://v3.football.api-sports.io';

  if (!KEY) return {};

  try {
    const url = `${BASE}/${path}`;
    apiDebug.lastUrl = url;

    const res = await fetch(url, {
      headers: { 'x-apisports-key': KEY },
      next: { revalidate: cacheSecs },
    });

    apiDebug.lastStatus = res.status;
    if (!res.ok) {
      apiDebug.lastError = await res.text();
      return {};
    }
    return res.json();
  } catch (e: unknown) {
    apiDebug.lastError = (e instanceof Error ? e.message : 'Fetch failed');
    return {};
  }
}

/** Current La Liga season (starts Aug, so Jan-Jul = previous year) */
function currentSeason(): number {
  const d = new Date();
  return d.getMonth() < 7 ? d.getFullYear() - 1 : d.getFullYear();
}

// ─── Round detection ────────────────────────────────────────────────────────

/**
 * Returns the most recent completed round number (e.g. "Regular Season - 35")
 * and the next upcoming round number.
 */
export async function getCurrentRound(): Promise<{ lastCompleted: string; nextRound: string; roundNumber: number }> {
  const LALIGA_ID = '140';
  const season = currentSeason();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await apiGet(`fixtures?league=${LALIGA_ID}&season=${season}`, 1800) as any;
  const events: any[] = data?.response || [];

  const completed = events.filter((e: any) =>
    ['FT', 'AET', 'PEN'].includes(e.fixture?.status?.short)
  );

  completed.sort((a: any, b: any) => (b.fixture?.timestamp || 0) - (a.fixture?.timestamp || 0));

  const lastRound: string = completed[0]?.league?.round || '';
  const roundMatch = lastRound.match(/(\d+)$/);
  const roundNumber = roundMatch ? Number(roundMatch[1]) : 0;
  const nextRound = roundNumber > 0 ? `Regular Season - ${roundNumber + 1}` : '';

  return { lastCompleted: lastRound, nextRound, roundNumber };
}

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

/** Returns the last N completed match IDs sorted newest first */
export async function getRecentMatchIds(limit = 50): Promise<string[]> {
  const LALIGA_ID = '140';
  const season = currentSeason();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await apiGet(`fixtures?league=${LALIGA_ID}&season=${season}`) as any;
  const events: any[] = data?.response || [];

  const completed = events.filter((e: any) =>
    ['FT', 'AET', 'PEN'].includes(e.fixture?.status?.short)
  );

  completed.sort((a: any, b: any) => (b.fixture?.timestamp || 0) - (a.fixture?.timestamp || 0));

  return completed.slice(0, limit).map((e: any) => String(e.fixture?.id));
}

/** Returns fixture IDs for a given round string */
export async function getFixtureIdsByRound(round: string): Promise<number[]> {
  const LALIGA_ID = '140';
  const season = currentSeason();
  const encoded = encodeURIComponent(round);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await apiGet(`fixtures?league=${LALIGA_ID}&season=${season}&round=${encoded}`, 900) as any;
  return ((data?.response || []) as any[]).map((e: any) => e.fixture?.id as number).filter(Boolean);
}

// ─── Injuries ────────────────────────────────────────────────────────────────

/**
 * Get injured/doubtful players for a set of upcoming fixture IDs.
 * Returns a map: playerName → PlayerInjury
 */
export async function getInjuriesForFixtures(fixtureIds: number[]): Promise<Map<string, PlayerInjury>> {
  const injuryMap = new Map<string, PlayerInjury>();

  // Fetch in small chunks to avoid rate limits
  const chunks = [];
  for (let i = 0; i < fixtureIds.length; i += 5) {
    chunks.push(fixtureIds.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (id) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await apiGet(`injuries?fixture=${id}`, 1800) as any;
      const injuries: any[] = data?.response || [];

      for (const inj of injuries) {
        const playerName: string = inj.player?.name || '';
        const teamName: string = inj.team?.name || '';
        const type: string = inj.player?.type || '';
        const reason: string = inj.player?.reason || '';

        if (playerName) {
          injuryMap.set(playerName, { playerName, teamName, type, reason });
        }
      }
    }));
    await new Promise(res => setTimeout(res, 300));
  }

  return injuryMap;
}

/**
 * Convenience: get injuries for the NEXT round automatically
 */
export async function getNextRoundInjuries(): Promise<Map<string, PlayerInjury>> {
  const { nextRound } = await getCurrentRound();
  if (!nextRound) return new Map();

  const fixtureIds = await getFixtureIdsByRound(nextRound);
  if (!fixtureIds.length) return new Map();

  return getInjuriesForFixtures(fixtureIds);
}

// ─── Odds → Difficulty ───────────────────────────────────────────────────────

/**
 * Convert bookmaker odds to a 1-5 difficulty scale.
 * winProbability ≥ 0.70 → difficulty 1 (very easy)
 * winProbability ≥ 0.55 → difficulty 2
 * winProbability ≥ 0.42 → difficulty 3
 * winProbability ≥ 0.30 → difficulty 4
 * else                   → difficulty 5 (very hard)
 */
function oddsToDifficulty(winProbability: number): number {
  if (winProbability >= 0.70) return 1;
  if (winProbability >= 0.55) return 2;
  if (winProbability >= 0.42) return 3;
  if (winProbability >= 0.30) return 4;
  return 5;
}

/**
 * Returns a map of fixtureId → { homeDifficulty, awayDifficulty }
 * using bookmaker odds from API-Football.
 */
export async function getOddsDifficulty(fixtureIds: number[]): Promise<Map<number, { homeDifficulty: number; awayDifficulty: number; homeTeam: string; awayTeam: string }>> {
  const result = new Map<number, { homeDifficulty: number; awayDifficulty: number; homeTeam: string; awayTeam: string }>();

  for (const id of fixtureIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await apiGet(`odds?fixture=${id}&bookmaker=6`, 7200) as any; // bookmaker 6 = Bet365
    const oddsData: any[] = data?.response || [];

    const match = oddsData[0];
    if (!match) continue;

    const homeTeam: string = match.fixture?.home?.name || '';
    const awayTeam: string = match.fixture?.away?.name || '';

    // Find "Match Winner" bet type
    const bets: any[] = match.bookmakers?.[0]?.bets || [];
    const matchWinner = bets.find((b: any) => b.name === 'Match Winner');
    if (!matchWinner) continue;

    const homeOdds = parseFloat(matchWinner.values?.find((v: any) => v.value === 'Home')?.odd || '0');
    const drawOdds = parseFloat(matchWinner.values?.find((v: any) => v.value === 'Draw')?.odd || '0');
    const awayOdds = parseFloat(matchWinner.values?.find((v: any) => v.value === 'Away')?.odd || '0');

    if (!homeOdds || !drawOdds || !awayOdds) continue;

    // Convert to probabilities (raw, no margin removal — good enough for difficulty)
    const total = 1 / homeOdds + 1 / drawOdds + 1 / awayOdds;
    const homeProb = (1 / homeOdds) / total;
    const awayProb = (1 / awayOdds) / total;

    result.set(id, {
      homeTeam,
      awayTeam,
      homeDifficulty: oddsToDifficulty(homeProb),
      awayDifficulty: oddsToDifficulty(awayProb),
    });

    await new Promise(res => setTimeout(res, 200));
  }

  return result;
}

// ─── Player stats ────────────────────────────────────────────────────────────

/**
 * Fetch ALL player stats for the season (Pro plan allows this).
 * Returns a map: normalized player name → PlayerSeasonStats
 * This is expensive (54 pages), so it should be called from a sync endpoint.
 */
export async function fetchAllPlayerStats(): Promise<Map<string, PlayerSeasonStats>> {
  const LALIGA_ID = '140';
  const season = currentSeason();
  const statsMap = new Map<string, PlayerSeasonStats>();

  // First, get page count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstPage = await apiGet(`players?league=${LALIGA_ID}&season=${season}&page=1`, 0) as any;
  const totalPages: number = firstPage?.paging?.total || 1;

  const allEntries: any[] = [...(firstPage?.response || [])];

  // Fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageData = await apiGet(`players?league=${LALIGA_ID}&season=${season}&page=${page}`, 0) as any;
    allEntries.push(...(pageData?.response || []));
    await new Promise(res => setTimeout(res, 200));
  }

  for (const entry of allEntries) {
    const p = entry?.player;
    const s = entry?.statistics?.[0];
    if (!p?.name || !s) continue;

    const normalized = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    statsMap.set(normalized, {
      apiId: p.id,
      name: p.name,
      teamName: s.team?.name || '',
      position: s.games?.position || '',
      lineups: s.games?.lineups ?? 0,
      minutes: s.games?.minutes ?? 0,
      rating: parseFloat(s.games?.rating || '0') || 0,
      goals: s.goals?.total ?? 0,
      assists: s.goals?.assists ?? 0,
    });
  }

  return statsMap;
}

// ─── Lineups ─────────────────────────────────────────────────────────────────

function extractStarters(teamData: unknown): RealLineupPlayer[] {
  const players: RealLineupPlayer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startXI = (teamData as any)?.startXI || [];

  for (const item of startXI) {
    const p = item.player;
    if (!p || !p.name) continue;
    players.push({ name: p.name, pos: mapPos(p.pos), number: p.number || 0, isStarter: true });
  }

  return players;
}

async function getMatchLineup(eventId: string): Promise<{ home: RealTeamLineup; away: RealTeamLineup } | null> {
  if (!eventId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await apiGet(`fixtures/lineups?fixture=${eventId}`) as any;
  const response: any[] = data?.response || [];

  if (response.length !== 2) return null;

  const homeData = response[0];
  const awayData = response[1];

  const homeStarters = extractStarters(homeData);
  const awayStarters = extractStarters(awayData);
  const homeSubs = extractStarters({ startXI: homeData?.substitutes || [] });
  const awaySubs = extractStarters({ startXI: awayData?.substitutes || [] });

  if (!homeStarters.length && !awayStarters.length) return null;

  return {
    home: {
      teamName: homeData.team?.name || 'Home',
      formation: homeData.formation || '4-3-3',
      coach: homeData.coach?.name || 'Desconocido',
      starters: homeStarters,
      subs: homeSubs,
    },
    away: {
      teamName: awayData.team?.name || 'Away',
      formation: awayData.formation || '4-3-3',
      coach: awayData.coach?.name || 'Desconocido',
      starters: awayStarters,
      subs: awaySubs,
    },
  };
}

export async function buildRealStarterMap(limit = 50): Promise<Map<string, TeamStats>> {
  const eventIds = await getRecentMatchIds(limit);
  const starterMap = new Map<string, TeamStats>();

  const results = [];
  for (let i = 0; i < eventIds.length; i += 10) {
    const chunk = eventIds.slice(i, i + 10);
    const chunkResults = await Promise.all(chunk.map((id) => getMatchLineup(id)));
    results.push(...chunkResults);
    if (i + 10 < eventIds.length) {
      await new Promise(res => setTimeout(res, 1100));
    }
  }

  for (const result of results) {
    if (!result) continue;
    for (const side of [result.home, result.away]) {
      if (!side.teamName) continue;
      if (!starterMap.has(side.teamName)) {
        starterMap.set(side.teamName, { players: new Map(), subs: new Map(), formations: new Map(), coach: side.coach });
      }
      const teamStats = starterMap.get(side.teamName)!;
      teamStats.coach = side.coach;
      for (const player of side.starters) {
        teamStats.players.set(player.name, (teamStats.players.get(player.name) || 0) + 1);
      }
      for (const player of side.subs) {
        teamStats.subs.set(player.name, (teamStats.subs.get(player.name) || 0) + 1);
      }
      if (side.formation) {
        teamStats.formations.set(side.formation, (teamStats.formations.get(side.formation) || 0) + 1);
      }
    }
  }

  return starterMap;
}
