import { NextRequest, NextResponse } from 'next/server';
import { analyzeSquad } from '@/lib/claude';
import { GET as getPlayers } from '../players/route';
import { normalizeStoredPlayer } from '@/lib/biwenger';
import type { Player } from '@/lib/biwenger';
import { hydratePlayerContext, parseRoundNumber } from '@/lib/player-context';
import { applySignalsToSquad, buildPlayerSignals, scrapeInjuryNews } from '@/lib/scraper';
import { getNextRoundInjuries, getCurrentRound, getFixtureIdsByRound, getOddsDifficulty } from '@/lib/api-football';
import type { PlayerInjury } from '@/lib/api-football';
import { getClientIp, normalizePlayerNames, takeRateLimit } from '@/lib/server-guard';
import { buildTeamContextMap } from '@/lib/team-context';

type AnalysisStrategy = 'conservador' | 'equilibrado' | 'agresivo';

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanStrategy(value: unknown): AnalysisStrategy {
  return value === 'conservador' || value === 'agresivo' || value === 'equilibrado' ? value : 'equilibrado';
}

function deriveRoundFromSquad(squad: Player[]) {
  const rounds = squad
    .map((player) => player.fixture?.round)
    .filter((round): round is string => Boolean(round));

  if (!rounds.length) {
    return '';
  }

  const counts = new Map<string, number>();
  for (const round of rounds) {
    counts.set(round, (counts.get(round) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function buildLiveAlerts(signals: ReturnType<typeof buildPlayerSignals>) {
  return Object.values(signals)
    .filter((signal) => signal.freshnessMinutes <= 24 * 60 || signal.sourceCount > 1)
    .sort((a, b) => {
      if (b.confidence === a.confidence) {
        return a.freshnessMinutes - b.freshnessMinutes;
      }
      return b.confidence - a.confidence;
    })
    .slice(0, 4)
    .map((signal) => {
      const age = signal.freshnessMinutes <= 0 ? 'ahora' : `hace ${signal.freshnessMinutes} min`;
      const label =
        signal.flag === 'injured'
          ? 'Baja'
          : signal.flag === 'doubtful'
            ? 'Duda'
            : signal.flag === 'risk'
              ? 'Rotacion'
              : signal.flag === 'fit'
                ? 'Disponible'
                : 'Impulso';

      return `${label}: ${signal.player} (${signal.confidence}% · ${age} · ${signal.sourceCount} fuente${signal.sourceCount === 1 ? '' : 's'})`;
    });
}

export async function POST(req: NextRequest) {
  function normName(n: string) {
    return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

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

  try {
    const ip = getClientIp(req);
    const limit = takeRateLimit(`analyze:${ip}`, 8, 3600_000);

    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Limite de 8 analisis por hora alcanzado. Vuelve mas tarde.' },
        { status: 429 }
      );
    }

    const { squad, context } = await req.json();

    if (!Array.isArray(squad) || squad.length < 11 || squad.length > 25) {
      return NextResponse.json({ error: 'La plantilla debe tener entre 11 y 25 jugadores.' }, { status: 400 });
    }

    const cleanSquad = squad.map(normalizeStoredPlayer);
    if (cleanSquad.some((player) => player === null)) {
      return NextResponse.json({ error: 'Hay jugadores con un formato invalido en la plantilla.' }, { status: 400 });
    }

    const sanitizedSquad = cleanSquad.filter((player): player is Player => player !== null);
    const playerNames = normalizePlayerNames(sanitizedSquad);
    const news = playerNames ? await scrapeInjuryNews(playerNames) : [];
    const signals = playerNames ? buildPlayerSignals(news, playerNames) : {};
    let enrichedSquad = applySignalsToSquad(sanitizedSquad, signals);
    
    // Fetch API-Football data
    const trueRound = await getCurrentRound();
    const fixtureIds = await getFixtureIdsByRound(trueRound.nextRound);
    const [injuryMap, oddsMap] = await Promise.all([
      getNextRoundInjuries(),
      getOddsDifficulty(fixtureIds)
    ]);

    const autoRound = trueRound ? trueRound.nextRound : deriveRoundFromSquad(enrichedSquad);
    const seasonRound = parseRoundNumber(autoRound);
    const nowMs = Date.now();
    const uniqueTeams = [...new Set(enrichedSquad.map((player) => player.team).filter(Boolean))];
    const teamsObj = Object.fromEntries(
      uniqueTeams.map((teamName, index) => {
        const referencePlayer = enrichedSquad.find((player) => player.team === teamName);
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
    ) as Record<
      number,
      { name?: string; nextGames?: []; currentFixtureStart?: number | null; currentFixtureRound?: string }
    >;
    const teamContextByName = new Map<string, Awaited<ReturnType<typeof buildTeamContextMap>> extends Map<number, infer T> ? T : never>();
    const remoteTeamContext = await buildTeamContextMap(teamsObj);

    for (const [rawId, team] of Object.entries(teamsObj)) {
      const snapshot = remoteTeamContext.get(Number(rawId));
      if (snapshot && team.name) {
        teamContextByName.set(team.name, snapshot);
      }
    }
    const hydratedSquad = enrichedSquad.map((player) => {
      // 1. Inyectar lesiones reales de API-Football
      const apiInjury = checkInjury(player, injuryMap);
      let updatedStatus = player.status;
      if (apiInjury) {
        if (apiInjury.type === 'Missing Fixture') updatedStatus = 'injured';
        else if (apiInjury.type === 'Questionable' && player.status === 'fit') updatedStatus = 'doubtful';
      }

      // 2. Inyectar Dificultad Real de Cuotas (Bet365)
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
        seasonRound,
        nowMs,
        teamContext:
          teamContextByName.get(player.team) || {
            position: player.context?.teamPosition ?? null,
            points: player.context?.teamPoints ?? null,
            motivation: player.context?.teamMotivation || 'media',
            motivationNote: player.context?.teamMotivationNote || '',
            nextMatchGapDays: player.context?.nextMatchGapDays ?? null,
            nextMatchCompetition: player.context?.nextMatchCompetition || '',
            schedulePressure: player.context?.schedulePressure || 'baja',
            schedulePressureNote: player.context?.schedulePressureNote || '',
          },
        signal: signals[player.name],
      });

      if (hydrated.fixture && finalDifficulty !== undefined) {
        hydrated.fixture.difficulty = finalDifficulty;
      }
      return hydrated;
    });
    const safeContext = {
      jornada: cleanText(context?.jornada, 20) || autoRound,
      autoRound,
      strategy: cleanStrategy(context?.strategy),
    };

    // Obtener todos los jugadores de LaLiga para calcular el "Radar de Gangas" y Depth Chart
    let allPlayersList: Player[] | undefined = undefined;
    try {
      const playersRes = await getPlayers();
      if (playersRes.ok) {
        const data = await playersRes.json();
        allPlayersList = data.players as Player[];
      }
    } catch (e) {
      console.error('Error cargando global players para el radar:', e);
    }

    const result = await analyzeSquad(hydratedSquad, safeContext, allPlayersList);
    const liveAlerts = buildLiveAlerts(signals);
    const existingAlerts = Array.isArray(result.alertas) ? result.alertas : [];
    const mergedAlerts = [...new Set([...liveAlerts, ...existingAlerts])].slice(0, 8);
    const liveCheck = {
      checkedAt: new Date().toISOString(),
      sourceCount: new Set(news.map((item) => item.source)).size,
      sources: [...new Set(news.map((item) => item.source))],
      newsCount: news.length,
      signals: Object.values(signals).sort((a, b) => b.confidence - a.confidence).slice(0, 8),
    };

    return NextResponse.json({
      ...result,
      alertas: mergedAlerts,
      liveCheck,
      adjustedSquad: hydratedSquad,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en analisis IA';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
