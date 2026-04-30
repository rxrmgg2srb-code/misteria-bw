import { NextResponse } from 'next/server';
import { normalizeBiwengerStatus, normalizeLastFive, POS_MAP } from '@/lib/biwenger';
import { buildPlayerContextInfo, parseRoundNumber } from '@/lib/player-context';
import { buildTeamContextMap } from '@/lib/team-context';

const PUBLIC_API = 'https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es&score=5';

type RawTeam = {
  id: number;
  name: string;
  nextGames?: RawGame[];
};

type RawGame = {
  date?: number;
  status?: string;
  home?: RawTeam;
  away?: RawTeam;
};

type RawEvent = {
  name?: string;
  short?: string;
  games?: RawGame[];
};

type RawSeasonRound = {
  id?: number;
  name?: string;
  short?: string;
  status?: string;
};

type RawPlayer = {
  id: number;
  name: string;
  teamID: number;
  position: number;
  price?: number;
  points?: number;
  playedHome?: number;
  playedAway?: number;
  status?: string;
  fitness?: unknown[];
};

type FixtureSeed = {
  homeId: number;
  awayId: number;
  start: number | null;
};

const OFFICIAL_ROUND_FIXTURES: Record<string, FixtureSeed[]> = {
  J34: [
    { homeId: 289, awayId: 465, start: 1777662000 }, // Girona vs Mallorca
    { homeId: 19, awayId: 10, start: 1777723200 }, // Villarreal vs Levante
    { homeId: 18, awayId: 2, start: 1777731300 }, // Valencia vs Atletico
    { homeId: 91, awayId: 1, start: 1777739400 }, // Alaves vs Athletic
    { homeId: 93, awayId: 3, start: 1777748400 }, // Osasuna vs Barcelona
    { homeId: 5, awayId: 75, start: 1777809600 }, // Celta vs Elche
    { homeId: 8, awayId: 70, start: 1777817700 }, // Getafe vs Rayo
    { homeId: 87, awayId: 779, start: 1777825800 }, // Betis vs Oviedo
    { homeId: 7, awayId: 15, start: 1777834800 }, // Espanyol vs Real Madrid
    { homeId: 17, awayId: 13, start: 1777921200 }, // Sevilla vs Real Sociedad
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildTeamStrength(players: RawPlayer[]) {
  const perTeam = new Map<number, number[]>();

  for (const player of players) {
    const teamId = Number(player.teamID);
    const played = Number(player.playedHome || 0) + Number(player.playedAway || 0);
    const avgPts = played > 0 ? Number(player.points || 0) / played : 0;

    if (!teamId || avgPts <= 0) {
      continue;
    }

    const existing = perTeam.get(teamId) || [];
    existing.push(avgPts);
    perTeam.set(teamId, existing);
  }

  const strength = new Map<number, number>();

  for (const [teamId, values] of perTeam.entries()) {
    const topValues = [...values].sort((a, b) => b - a).slice(0, 8);
    strength.set(teamId, average(topValues));
  }

  return strength;
}

function difficultyFromStrength(teamId: number, teamStrength: Map<number, number>) {
  const values = [...teamStrength.values()];
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const fallback = average(values) || 0;
  const raw = teamStrength.get(teamId) ?? fallback;
  const normalized = max === min ? 0.5 : (raw - min) / (max - min);
  return clamp(Math.round(1 + normalized * 4), 1, 5);
}

function buildFixtureMapFromSeeds(
  round: string,
  seeds: FixtureSeed[],
  teamsObj: Record<number, { name: string }>,
  teamStrength: Map<number, number>
) {
  const fixtureByTeam = new Map<
    number,
    { round: string; opponent: string; isHome: boolean; difficulty: number; start: number | null }
  >();

  for (const seed of seeds) {
    const home = teamsObj[seed.homeId];
    const away = teamsObj[seed.awayId];

    if (!home?.name || !away?.name) {
      continue;
    }

    fixtureByTeam.set(seed.homeId, {
      round,
      opponent: away.name,
      isHome: true,
      difficulty: difficultyFromStrength(seed.awayId, teamStrength),
      start: seed.start,
    });

    fixtureByTeam.set(seed.awayId, {
      round,
      opponent: home.name,
      isHome: false,
      difficulty: difficultyFromStrength(seed.homeId, teamStrength),
      start: seed.start,
    });
  }

  return fixtureByTeam;
}

function buildFixtureMap(events: RawEvent[], teamStrength: Map<number, number>) {
  const fixtureByTeam = new Map<
    number,
    { round: string; opponent: string; isHome: boolean; difficulty: number; start: number | null }
  >();

  const games = events
    .flatMap((event) =>
      (Array.isArray(event.games) ? event.games : []).map((game) => ({
        game,
        round: event.short || event.name || 'Proxima jornada',
      }))
    )
    .filter(({ game }) => game.home?.id && game.away?.id)
    .sort((a, b) => Number(a.game.date || Number.MAX_SAFE_INTEGER) - Number(b.game.date || Number.MAX_SAFE_INTEGER));

  for (const { game, round } of games) {
    const home = game.home!;
    const away = game.away!;
    const start = typeof game.date === 'number' ? game.date : null;

    if (!fixtureByTeam.has(home.id)) {
      fixtureByTeam.set(home.id, {
        round,
        opponent: away.name,
        isHome: true,
        difficulty: difficultyFromStrength(away.id, teamStrength),
        start,
      });
    }

    if (!fixtureByTeam.has(away.id)) {
      fixtureByTeam.set(away.id, {
        round,
        opponent: home.name,
        isHome: false,
        difficulty: difficultyFromStrength(home.id, teamStrength),
        start,
      });
    }
  }

  return fixtureByTeam;
}

function deriveTargetRound(seasonRounds: RawSeasonRound[], activeEvents: RawEvent[]) {
  const activeRound = activeEvents[0]?.short || '';
  const activeGames = Array.isArray(activeEvents[0]?.games) ? activeEvents[0]?.games : [];
  const activeFinished = activeGames.length > 0 && activeGames.every((game) => game.status === 'finished');
  const nextPending = seasonRounds.find((round) => round.status === 'pending' && round.short)?.short || '';

  if (activeFinished && nextPending) {
    return nextPending;
  }

  if (activeRound) {
    return activeRound;
  }

  return nextPending || seasonRounds.find((round) => round.short)?.short || '';
}

export async function GET() {
  try {
    const res = await fetch(PUBLIC_API, {
      next: { revalidate: 3600 },
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error('Error fetching public data');
    }

    const data = await res.json();
    const playersObj = (data.data?.players || {}) as Record<number, RawPlayer>;
    const teamsObj = (data.data?.teams || {}) as Record<number, RawTeam>;
    const activeEvents = Array.isArray(data.data?.activeEvents) ? (data.data.activeEvents as RawEvent[]) : [];
    const seasonRounds = Array.isArray(data.data?.season?.rounds) ? (data.data.season.rounds as RawSeasonRound[]) : [];
    const rawPlayers = Object.values(playersObj) as RawPlayer[];
    const teamStrength = buildTeamStrength(rawPlayers);
    const feedRound = activeEvents[0]?.short || '';
    const targetRound = deriveTargetRound(seasonRounds, activeEvents);
    const seasonRound = parseRoundNumber(targetRound || feedRound);
    const roundOverride = targetRound ? OFFICIAL_ROUND_FIXTURES[targetRound] : undefined;
    const fixtureByTeam = roundOverride
      ? buildFixtureMapFromSeeds(targetRound, roundOverride, teamsObj, teamStrength)
      : buildFixtureMap(activeEvents, teamStrength);
    const teamContextMap = await buildTeamContextMap(
      Object.fromEntries(
        Object.entries(teamsObj).map(([rawId, team]) => [
          Number(rawId),
          {
            name: team?.name,
            nextGames: team?.nextGames || [],
            currentFixtureStart: fixtureByTeam.get(Number(rawId))?.start ?? null,
            currentFixtureRound: fixtureByTeam.get(Number(rawId))?.round || '',
          },
        ])
      )
    );
    const nowMs = Date.now();

    const playersList = rawPlayers.map((player) => {
      const played = Number(player.playedHome || 0) + Number(player.playedAway || 0);
      const fixture = fixtureByTeam.get(player.teamID) || null;
      const basePlayer = {
        id: player.id,
        name: player.name,
        pos: POS_MAP[player.position] || 'MC',
        price: Number(player.price || 0),
        totalPts: Number(player.points || 0),
        gamesPlayed: played,
        avgPts: played > 0 ? Math.round(((Number(player.points || 0) / played) * 10)) / 10 : 0,
        status: normalizeBiwengerStatus(player.status),
        team: teamsObj[player.teamID]?.name || 'Sin equipo',
        lastFive: normalizeLastFive(player.fitness),
        flag: 'normal' as const,
        fixture,
      };

        return {
        ...basePlayer,
        context: buildPlayerContextInfo(basePlayer, {
          seasonRound,
          nowMs,
          teamContext: teamContextMap.get(player.teamID),
        }),
      };
    });

    const fixtureRound = [...fixtureByTeam.values()][0]?.round || '';

    return NextResponse.json({
      players: playersList,
      meta: {
        round: targetRound || fixtureRound,
        feedRound,
        fixtureRound,
        fixtureSource: roundOverride ? 'official-schedule' : 'biwenger-active',
        fixturesReady: fixtureByTeam.size,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error conectando con Biwenger';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
