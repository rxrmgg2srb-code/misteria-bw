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
  const HOST = process.env.APIFOOTBALL_HOST || 'free-api-live-football-data.p.rapidapi.com';
  const BASE = 'https://free-api-live-football-data.p.rapidapi.com';

  if (!KEY) return {};

  try {
    const res = await fetch(`${BASE}/${path}`, {
      headers: {
        'x-rapidapi-key': KEY,
        'x-rapidapi-host': HOST,
        'Content-Type': 'application/json',
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
  const LALIGA_ID = process.env.APIFOOTBALL_LALIGA_ID || '87';
  const data = await apiGet(`football-get-all-matches-events-by-league-id?leagueid=${LALIGA_ID}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = (data as any)?.response || (data as any)?.events || [];

  const completed = events.filter((e) => {
    const status = (e.status || e.eventStatus || '').toLowerCase();
    return status === 'finished' || status === 'ft' || status === 'aet' || status === 'pen';
  });

  completed.sort((a, b) => {
    const dA = new Date(a.startTimestamp || a.date || 0).getTime();
    const dB = new Date(b.startTimestamp || b.date || 0).getTime();
    return dB - dA;
  });

  return completed.slice(0, 50).map((e) => String(e.id || e.eventId || e.event_id || ''));
}

/** Extracts starters from a lineup response */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStarters(lineupData: any): RealLineupPlayer[] {
  const players: RealLineupPlayer[] = [];
  const lineup =
    lineupData?.response?.lineup ||
    lineupData?.lineup ||
    lineupData?.response ||
    lineupData?.players ||
    [];

  const arr = Array.isArray(lineup) ? lineup : [];

  for (const p of arr) {
    const name = p.name || p.playerName || p.player?.name || '';
    const pos  = p.position || p.pos || p.player?.position || '';
    const num  = Number(p.number || p.shirtNumber || p.player?.number || 0);
    const isStarter = p.starter !== false && p.isStarter !== false && p.startXI !== false;

    if (name) {
      players.push({ name, pos: mapPos(pos), number: num, isStarter });
    }
  }

  return players.filter((p) => p.isStarter);
}

/** Fetch lineup for one match (home + away) */
async function getMatchLineup(eventId: string): Promise<{
  home: { teamName: string; formation: string; starters: RealLineupPlayer[] };
  away: { teamName: string; formation: string; starters: RealLineupPlayer[] };
} | null> {
  if (!eventId) return null;

  const [homeData, awayData] = await Promise.all([
    apiGet(`football-get-lineup-home-team-by-event-id?eventid=${eventId}`),
    apiGet(`football-get-lineup-away-team-by-event-id?eventid=${eventId}`),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeTeam = (homeData as any)?.response?.teamName || (homeData as any)?.teamName || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awayTeam = (awayData as any)?.response?.teamName || (awayData as any)?.teamName || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeFormation = (homeData as any)?.response?.formation || (homeData as any)?.formation || '4-3-3';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awayFormation = (awayData as any)?.response?.formation || (awayData as any)?.formation || '4-3-3';

  const homeStarters = extractStarters(homeData);
  const awayStarters = extractStarters(awayData);

  if (!homeStarters.length && !awayStarters.length) return null;

  return {
    home: { teamName: homeTeam, formation: homeFormation, starters: homeStarters },
    away: { teamName: awayTeam, formation: awayFormation, starters: awayStarters },
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
