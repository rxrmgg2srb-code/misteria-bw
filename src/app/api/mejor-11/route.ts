import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import { analyzeGlobalPlayers } from '@/lib/claude';
import type { Player } from '@/lib/biwenger';
import { buildTeamContextMap } from '@/lib/team-context';
import { hydratePlayerContext } from '@/lib/player-context';
import { getNextRoundInjuries, getCurrentRound, getFixtureIdsByRound, getOddsDifficulty } from '@/lib/api-football';
import type { PlayerInjury } from '@/lib/api-football';

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

export async function GET() {
  try {
    // 1. Obtener la lista completa de jugadores (Biwenger) + Lesiones (API-Football) + Cuotas (Bet365)
    const currentRound = await getCurrentRound();
    const fixtureIds = await getFixtureIdsByRound(currentRound.nextRound);
    
    const [playersRes, injuryMap, oddsMap] = await Promise.all([
      getPlayers(),
      getNextRoundInjuries(),
      getOddsDifficulty(fixtureIds)
    ]);
    
    if (!playersRes.ok) {
      return NextResponse.json({ error: 'Error obteniendo jugadores de Biwenger' }, { status: 500 });
    }
    
    const data = await playersRes.json();
    let playersList = data.players as Player[];

    // 2. Fetch Team Context (Motivación, Atasco de calendario, Clasificación)
    const uniqueTeams = [...new Set(playersList.map((player) => player.team).filter(Boolean))];
    const teamsObj = Object.fromEntries(
      uniqueTeams.map((teamName, index) => {
        const referencePlayer = playersList.find((player) => player.team === teamName);
        return [
          index + 1,
          {
            name: teamName,
            nextGames: [],
            currentFixtureStart: referencePlayer?.fixture?.start ?? null,
            currentFixtureRound: referencePlayer?.fixture?.round || '',
          },
        ];
      })
    );
    const remoteTeamContext = await buildTeamContextMap(teamsObj);
    const teamContextByName = new Map<string, any>();
    for (const [rawId, team] of Object.entries(teamsObj)) {
      const snapshot = remoteTeamContext.get(Number(rawId));
      if (snapshot && (team as any).name) {
        teamContextByName.set((team as any).name, snapshot);
      }
    }

    // 3. Hidratar jugadores con motivación y descartar lesionados API-Football
    const nowMs = Date.now();
    const hydratedPlayers = playersList.map((player) => {
      // Si la API médica lo descarta o es duda seria, actualizamos su status para que Claude no lo ponga
      const apiInjury = checkInjury(player, injuryMap);
      let updatedStatus = player.status;
      if (apiInjury) {
        if (apiInjury.type === 'Missing Fixture') updatedStatus = 'injured';
        else if (apiInjury.type === 'Questionable' && player.status === 'fit') updatedStatus = 'doubtful';
      }

      // Update difficulty from Bet365 odds
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
      
      const hydrated = hydratePlayerContext({ ...player, status: updatedStatus }, {
        seasonRound: 35, // o derivar del fixture
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

      if (hydrated.fixture && finalDifficulty !== undefined) {
        hydrated.fixture.difficulty = finalDifficulty;
      }

      return hydrated;
    });
    
    // 4. Ejecutar el análisis global usando las 32 dimensiones (Claude Score)
    const result = await analyzeGlobalPlayers(hydratedPlayers as any, { strategy: 'equilibrado' });
    
    return NextResponse.json({ result, meta: data.meta });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error calculando el mejor 11';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
