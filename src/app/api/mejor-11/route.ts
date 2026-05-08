import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import { analyzeGlobalPlayers } from '@/lib/claude';
import type { Player } from '@/lib/biwenger';
import { buildTeamContextMap } from '@/lib/team-context';
import { hydratePlayerContext } from '@/lib/player-context';
import {
  getNextRoundInjuries,
  getCurrentRound,
  getFixtureIdsByRound,
  getOddsDifficulty,
  buildRealStarterMap,
} from '@/lib/api-football';
import type { PlayerInjury, TeamStats } from '@/lib/api-football';

export const dynamic = 'force-dynamic';

function normName(n: string) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Check if a player matches an injury record (fuzzy match) */
function checkInjury(player: Player, injuryMap: Map<string, PlayerInjury>): PlayerInjury | null {
  const target = normName(player.name);
  const targetParts = target.split(' ');
  for (const [injName, inj] of injuryMap) {
    const real = normName(injName);
    if (real === target || real.includes(target) || target.includes(real)) return inj;
    const realParts = real.split(' ');
    const realLast = realParts[realParts.length - 1];
    if (realLast.length >= 4 && targetParts.some(p => p === realLast)) return inj;
    for (const part of targetParts) {
      if (part.length >= 5 && realParts.some(rp => rp === part)) return inj;
    }
  }
  return null;
}

/** Find the starter rate for a player from API-Football real lineup data */
function getStarterRate(player: Player, starterMap: Map<string, TeamStats>): number | null {
  const playerTeamNorm = normName(player.team);
  let foundStats: TeamStats | undefined;
  for (const [teamName, ts] of starterMap) {
    const tn = normName(teamName);
    if (tn.includes(playerTeamNorm) || playerTeamNorm.includes(tn)) {
      foundStats = ts;
      break;
    }
  }
  if (!foundStats) return null;

  const target = normName(player.name);
  const targetParts = target.split(' ');

  // Find max starts to know total games
  let maxStarts = 0;
  for (const count of foundStats.players.values()) {
    if (count > maxStarts) maxStarts = count;
  }
  const totalGames = maxStarts || 1;

  // Check starters
  for (const [realName, count] of foundStats.players) {
    const real = normName(realName);
    if (real === target || real.includes(target) || target.includes(real)) {
      return Math.round((count / totalGames) * 100);
    }
    const realParts = real.split(' ');
    for (const part of targetParts) {
      if (part.length >= 4 && realParts.some(rp => rp === part)) {
        return Math.round((count / totalGames) * 100);
      }
    }
  }

  // Check subs
  for (const [realName] of foundStats.subs) {
    const real = normName(realName);
    if (real === target || real.includes(target) || target.includes(real)) {
      return 10; // sub = low starter rate
    }
    const realParts = real.split(' ');
    for (const part of targetParts) {
      if (part.length >= 4 && realParts.some(rp => rp === part)) {
        return 10;
      }
    }
  }

  // Not found at all = likely not starting
  return 0;
}

export async function GET() {
  try {
    // 1. Fetch all data sources in parallel
    const roundInfo = await getCurrentRound();
    const nextFixtureIds = await getFixtureIdsByRound(roundInfo.nextRound);

    const [playersRes, injuryMap, oddsMap, starterMap] = await Promise.all([
      getPlayers(),
      getNextRoundInjuries(),
      nextFixtureIds.length > 0 ? getOddsDifficulty(nextFixtureIds) : Promise.resolve(new Map()),
      buildRealStarterMap(50),
    ]);

    if (!playersRes.ok) {
      return NextResponse.json({ error: 'Error obteniendo jugadores de Biwenger' }, { status: 500 });
    }

    const data = await playersRes.json();
    const playersList = data.players as Player[];
    const seasonRound = roundInfo.roundNumber + 1; // Next round number

    // 2. Build team context (motivation + schedule pressure)
    const uniqueTeams = [...new Set(playersList.map((p) => p.team).filter(Boolean))];
    const teamsObj = Object.fromEntries(
      uniqueTeams.map((teamName, index) => {
        const ref = playersList.find((p) => p.team === teamName);
        return [
          index + 1,
          {
            name: teamName,
            nextGames: [],
            currentFixtureStart: ref?.fixture?.start ?? null,
            currentFixtureRound: ref?.fixture?.round || '',
          },
        ];
      })
    );

    let teamContextByName = new Map<string, any>();
    try {
      const remoteCtx = await buildTeamContextMap(teamsObj);
      for (const [rawId, team] of Object.entries(teamsObj)) {
        const snapshot = remoteCtx.get(Number(rawId));
        if (snapshot && (team as any).name) {
          teamContextByName.set((team as any).name, snapshot);
        }
      }
    } catch { /* context optional */ }

    // 3. Build team odds lookup
    const teamOddsLookup = new Map<string, number>();
    for (const [, odds] of oddsMap) {
      const homeNorm = normName(odds.homeTeam);
      const awayNorm = normName(odds.awayTeam);
      teamOddsLookup.set(homeNorm, odds.homeDifficulty);
      teamOddsLookup.set(awayNorm, odds.awayDifficulty);
    }

    // 4. Hydrate all players with full context
    const nowMs = Date.now();
    let injuredCount = 0;
    let doubtfulCount = 0;

    const hydratedPlayers = playersList.map((player) => {
      // ── Injuries from API-Football ──
      const apiInjury = checkInjury(player, injuryMap);
      let updatedStatus = player.status;
      if (apiInjury) {
        if (apiInjury.type === 'Missing Fixture') { updatedStatus = 'injured'; injuredCount++; }
        else if (apiInjury.type === 'Questionable' && player.status === 'fit') { updatedStatus = 'doubtful'; doubtfulCount++; }
      }

      // ── Odds-based difficulty ──
      let finalDifficulty = player.fixture?.difficulty;
      if (player.fixture && oddsMap.size > 0) {
        const normPlayerTeam = normName(player.team);
        const normOpponent = normName(player.fixture.opponent || '');
        for (const [, difficultyStats] of oddsMap) {
          const homeNorm = normName(difficultyStats.homeTeam || '');
          const awayNorm = normName(difficultyStats.awayTeam || '');
          const teamIsHome = homeNorm.includes(normPlayerTeam) || normPlayerTeam.includes(homeNorm);
          const teamIsAway = awayNorm.includes(normPlayerTeam) || normPlayerTeam.includes(awayNorm);
          const opponentMatch = homeNorm.includes(normOpponent) || awayNorm.includes(normOpponent) || normOpponent.includes(homeNorm) || normOpponent.includes(awayNorm);
          if ((teamIsHome || teamIsAway) && opponentMatch) {
            finalDifficulty = teamIsHome ? difficultyStats.homeDifficulty : difficultyStats.awayDifficulty;
            break;
          }
        }
      }

      // ── Starter rate from real lineups ──
      const starterRate = getStarterRate(player, starterMap);

      // ── Hydrate with full context ──
      const hydrated = hydratePlayerContext({ ...player, status: updatedStatus }, {
        seasonRound,
        nowMs,
        teamContext: teamContextByName.get(player.team) || {
          position: null,
          points: null,
          motivation: 'media',
          motivationNote: '',
          nextMatchGapDays: null,
          nextMatchCompetition: '',
          schedulePressure: 'baja',
          schedulePressureNote: '',
        },
        signal: undefined,
      });

      // Override difficulty with odds
      if (hydrated.fixture && finalDifficulty !== undefined) {
        hydrated.fixture.difficulty = finalDifficulty;
      }

      // Store starter rate in context for the scoring engine to use
      if (hydrated.context && starterRate !== null) {
        hydrated.context.estimatedStartConfidence = Math.max(
          hydrated.context.estimatedStartConfidence,
          starterRate
        );
      }

      return hydrated;
    });

    // 5. Run the 32-dimension analysis
    const result = await analyzeGlobalPlayers(hydratedPlayers as any, { strategy: 'equilibrado' });

    // 6. Enrich response with metadata
    return NextResponse.json({
      result,
      meta: {
        ...(data.meta || {}),
        round: roundInfo.nextRound || data.meta?.round,
        roundNumber: seasonRound,
        injuryCount: injuryMap.size,
        injuredOut: injuredCount,
        doubtfulDetected: doubtfulCount,
        oddsFixtures: oddsMap.size,
        starterDataTeams: starterMap.size,
        totalPlayersAnalyzed: playersList.length,
        dataSources: [
          'Biwenger (500+ jugadores)',
          'API-Football Pro (alineaciones reales)',
          'API-Football Pro (partes médicos)',
          'Bet365 (cuotas de apuestas)',
          'LaLiga Standings (motivación)',
          'UEFA Calendar (presión de calendario)',
        ],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error calculando el mejor 11';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
