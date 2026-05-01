export type RealLineupPlayer = {
  name: string;
  pos: string; // "G" | "D" | "M" | "F"
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

// Maps this API's position codes to our system
function mapPos(pos: string): string {
  const p = (pos || '').toUpperCase();
  if (p === 'G' || p === 'GK' || p === 'P') return 'PT';
  if (p === 'D' || p === 'DF' || p === 'DEF' || p === 'CB' || p === 'LB' || p === 'RB') return 'DF';
  if (p === 'M' || p === 'MC' || p === 'MID' || p === 'CM' || p === 'DM' || p === 'AM') return 'MC';
  if (p === 'F' || p === 'DL' || p === 'FW' || p === 'ST' || p === 'LW' || p === 'RW' || p === 'ATT') return 'DL';
  return 'MC'; // default
}

export const apiDebug = {
  lastStatus: 0,
  lastUrl: '',
  lastError: ''
};

async function apiGet(path: string): Promise<Record<string, unknown>> {
  const KEY  = process.env.APIFOOTBALL_KEY || '';
  // Use the direct api-sports URL to bypass RapidAPI completely
  const BASE = 'https://v3.football.api-sports.io';

  if (!KEY) return {};

  try {
    const url = `${BASE}/${path}`;
    apiDebug.lastUrl = url;
    
    const res = await fetch(url, {
      headers: {
        'x-apisports-key': KEY,
        'x-vercel-cache-bust': 'v5'
      },
      next: { revalidate: 3600 }, // Cache 1 hour
    });
    
    apiDebug.lastStatus = res.status;
    if (!res.ok) {
        apiDebug.lastError = await res.text();
        return {};
    }
    return res.json();
  } catch (e: any) {
    apiDebug.lastError = e.message || 'Fetch failed';
    return {};
  }
}

/** Get all matches for La Liga — returns the completed recent ones */
async function getRecentMatchIds(): Promise<string[]> {
  // Official La Liga ID is 140
  const LALIGA_ID = '140';
  
  // Determine current season (starts around August, so if month is < 7, it's last year)
  const date = new Date();
  const season = date.getMonth() < 7 ? date.getFullYear() - 1 : date.getFullYear();

  const data = await apiGet(`fixtures?league=${LALIGA_ID}&season=${season}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = (data as any)?.response || [];

  const completed = events.filter((e) => {
    const status = e.fixture?.status?.short;
    return ['FT', 'AET', 'PEN'].includes(status);
  });

  completed.sort((a, b) => {
    const dA = a.fixture?.timestamp || 0;
    const dB = b.fixture?.timestamp || 0;
    return dB - dA;
  });

  // Take last 100 matches = ~5 jornadas per team (20 teams)
  return completed.slice(0, 100).map((e) => String(e.fixture?.id));
}

/** Extracts starters from a lineup response */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStarters(teamData: any): RealLineupPlayer[] {
  const players: RealLineupPlayer[] = [];
  const startXI = teamData?.startXI || [];

  for (const item of startXI) {
    const p = item.player;
    if (!p || !p.name) continue;

    players.push({
      name: p.name,
      pos: mapPos(p.pos),
      number: p.number || 0,
      isStarter: true // startXI array only contains starters
    });
  }

  return players;
}

/** Fetch lineup for one match (home + away) */
async function getMatchLineup(eventId: string): Promise<{
  home: RealTeamLineup;
  away: RealTeamLineup;
} | null> {
  if (!eventId) return null;

  const data = await apiGet(`fixtures/lineups?fixture=${eventId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any[] = (data as any)?.response || [];

  if (response.length !== 2) return null; // Needs both teams

  const homeData = response[0];
  const awayData = response[1];

  const homeStarters = extractStarters(homeData);
  const awayStarters = extractStarters(awayData);
  
  // Extract subs (the array is called "substitutes")
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

export type TeamStats = {
  players: Map<string, number>;
  subs: Map<string, number>;
  formations: Map<string, number>;
  coach: string;
};

export async function buildRealStarterMap(): Promise<Map<string, TeamStats>> {
  const eventIds = await getRecentMatchIds();
  const starterMap = new Map<string, TeamStats>();

  // Fetch in chunks of 10 to stay within API-Football 10 req/s rate limit
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
      // Update coach to the most recent one (since we process newest first if sorted)
      teamStats.coach = side.coach;

      for (const player of side.starters) {
        const current = teamStats.players.get(player.name) || 0;
        teamStats.players.set(player.name, current + 1);
      }
      
      for (const player of side.subs) {
        const current = teamStats.subs.get(player.name) || 0;
        teamStats.subs.set(player.name, current + 1);
      }
      
      if (side.formation) {
        const currentForm = teamStats.formations.get(side.formation) || 0;
        teamStats.formations.set(side.formation, currentForm + 1);
      }
    }
  }

  return starterMap;
}
