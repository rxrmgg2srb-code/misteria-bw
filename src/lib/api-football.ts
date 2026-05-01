export type RealLineupPlayer = {
  name: string;
  pos: string; // "G" | "D" | "M" | "F"
  number: number;
  isStarter: boolean;
};

export type RealTeamLineup = {
  teamName: string;
  formation: string;
  starters: RealLineupPlayer[];
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

async function apiGet(path: string): Promise<Record<string, unknown>> {
  const KEY  = process.env.APIFOOTBALL_KEY || '';
  // Use the direct api-sports URL to bypass RapidAPI completely
  const BASE = 'https://v3.football.api-sports.io';

  if (!KEY) return {};

  try {
    const res = await fetch(`${BASE}/${path}`, {
      headers: {
        'x-apisports-key': KEY,
      },
      next: { revalidate: 604800 }, // Cache 7 days
    });
    if (!res.ok) return {};
    return res.json();
  } catch {
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

  return completed.slice(0, 50).map((e) => String(e.fixture?.id));
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
  home: { teamName: string; formation: string; starters: RealLineupPlayer[] };
  away: { teamName: string; formation: string; starters: RealLineupPlayer[] };
} | null> {
  if (!eventId) return null;

  const data = await apiGet(`fixtures/lineups?fixture=${eventId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any[] = data?.response || [];

  if (response.length !== 2) return null; // Needs both teams

  const homeData = response[0];
  const awayData = response[1];

  const homeStarters = extractStarters(homeData);
  const awayStarters = extractStarters(awayData);

  if (!homeStarters.length && !awayStarters.length) return null;

  return {
    home: {
      teamName: homeData.team?.name || 'Home',
      formation: homeData.formation || '4-3-3',
      starters: homeStarters,
    },
    away: {
      teamName: awayData.team?.name || 'Away',
      formation: awayData.formation || '4-3-3',
      starters: awayStarters,
    },
  };
}

export async function buildRealStarterMap(): Promise<Map<string, Map<string, number>>> {
  const eventIds = await getRecentMatchIds();
  const starterMap = new Map<string, Map<string, number>>();

  const results = await Promise.all(eventIds.map((id) => getMatchLineup(id)));

  for (const result of results) {
    if (!result) continue;

    for (const side of [result.home, result.away]) {
      if (!side.teamName) continue;

      if (!starterMap.has(side.teamName)) {
        starterMap.set(side.teamName, new Map());
      }
      const playerMap = starterMap.get(side.teamName)!;

      for (const player of side.starters) {
        const current = playerMap.get(player.name) || 0;
        playerMap.set(player.name, current + 1);
      }
    }
  }

  return starterMap;
}
