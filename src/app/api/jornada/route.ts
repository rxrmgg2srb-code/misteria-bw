import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import type { Player } from '@/lib/biwenger';
import {
  getCurrentRound,
  getFixtureIdsByRound,
  getInjuriesForFixtures,
  getOddsDifficulty,
} from '@/lib/api-football';
import type { PlayerInjury } from '@/lib/api-football';

export const dynamic = 'force-dynamic';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function normName(n: string) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Check if a player matches an injury record (fuzzy last name match) */
function matchesInjury(player: Player, injuryMap: Map<string, PlayerInjury>): PlayerInjury | null {
  const target = normName(player.name);
  const targetParts = target.split(' ');

  for (const [injName, inj] of injuryMap) {
    const real = normName(injName);
    if (real === target || real.includes(target) || target.includes(real)) return inj;
    // Match on last name (last part of API name)
    const realParts = real.split(' ');
    const realLast = realParts[realParts.length - 1];
    if (realLast.length >= 4 && targetParts.some(p => p === realLast)) return inj;
    // Match on any significant part
    for (const part of targetParts) {
      if (part.length >= 5 && realParts.some(rp => rp === part)) return inj;
    }
  }
  return null;
}

/** Main scoring function with injury awareness */
function quickScore(
  player: Player,
  injuryMap: Map<string, PlayerInjury>,
  difficultyMap: Map<string, { homeDiff: number; awayDiff: number }>,
): number {
  if (player.status === 'injured' || player.status === 'suspended') return -999;

  const injury = matchesInjury(player, injuryMap);
  if (injury?.type === 'Missing Fixture') return -999; // Confirmed out

  const priceM = player.price / 1e6;
  let score = 0;

  // Base: media de puntos ajustada por partidos jugados
  const trust = clamp((player.gamesPlayed + 2) / 10, 0.35, 1);
  score += player.avgPts * trust * 1.2;

  // Forma reciente (últimas 3 jornadas)
  if (player.lastFive.length >= 3) {
    const recent = average(player.lastFive.slice(0, 3));
    score += recent * 0.4;
  }

  // Fixture difficulty: use odds-based difficulty if available, else Biwenger's
  const teamDiff = difficultyMap.get(player.team);
  let diff: number;
  if (teamDiff) {
    diff = player.fixture?.isHome ? teamDiff.homeDiff : teamDiff.awayDiff;
  } else {
    diff = player.fixture?.difficulty ?? 3;
  }
  score += (3 - diff) * 1.1;
  if (player.fixture?.isHome) score += diff <= 2 ? 0.8 : 0.4;
  else score -= diff >= 4 ? 1.2 : 0.4;

  // Bonus porteros/defensas en fixture fácil en casa
  if ((player.pos === 'PT' || player.pos === 'DF') && diff <= 2 && player.fixture?.isHome) {
    score += 1.5;
  }

  // Estado
  if (player.status === 'doubtful') score -= 2.5;
  if (injury?.type === 'Questionable') score -= 1.5; // API says doubtful

  // Flags manuales
  if (player.flag === 'boost') score += 2.2;
  if (player.flag === 'risk') score -= 1.8;
  if (player.flag === 'avoid') score -= 3.0;

  // Relación calidad/precio
  if (priceM <= 3 && player.avgPts >= 5) score += 2.5;
  else if (priceM <= 4 && player.avgPts >= 5) score += 1.8;
  else if (priceM <= 4 && player.avgPts >= 4) score += 1.0;
  else if (priceM <= 6 && player.avgPts >= 4.5) score += 0.6;
  else if (priceM >= 12 && player.avgPts < 4) score -= 2.0;
  else if (priceM >= 8 && player.avgPts < 3) score -= 1.8;

  // Momentum
  if (player.lastFive.length >= 2 && player.lastFive[0] >= 6 && player.lastFive[1] >= 5) {
    score += 1.2;
  }

  // Rebote premium
  const isPremium = player.avgPts >= 5 || player.price >= 8000000;
  if (isPremium && player.lastFive[0] <= 0 && player.lastFive[1] > 0 && player.status === 'fit') {
    score += 1.8;
  }

  return score;
}

function gangaReason(player: Player, injuryMap: Map<string, PlayerInjury>, difficultyMap: Map<string, { homeDiff: number; awayDiff: number }>): string {
  const priceM = (player.price / 1e6).toFixed(1);
  const venue = player.fixture?.isHome ? 'en casa' : 'fuera';
  const rival = player.fixture?.opponent || '';

  const teamDiff = difficultyMap.get(player.team);
  const diff = teamDiff
    ? (player.fixture?.isHome ? teamDiff.homeDiff : teamDiff.awayDiff)
    : (player.fixture?.difficulty ?? 3);

  const injury = matchesInjury(player, injuryMap);

  const reasons: string[] = [];
  if (injury?.type === 'Questionable') reasons.push(`⚠ Duda médica (${injury.reason})`);
  if (player.price <= 4000000 && player.avgPts >= 4.5) reasons.push(`solo ${priceM}M con ${player.avgPts} pts de media`);
  if (diff <= 2) reasons.push(`rival fácil ${venue}${rival ? ` ante ${rival}` : ''}`);
  if (player.lastFive[0] >= 7) reasons.push(`viene de ${player.lastFive[0]} pts`);
  if (player.flag === 'boost') reasons.push('señal de boost detectada');
  if (player.status === 'fit' && player.lastFive[0] <= 0 && player.lastFive[1] >= 6) {
    reasons.push('rebote esperado tras rosco puntual');
  }
  if (teamDiff) reasons.push(`dificultad real D${diff} (odds)`);

  return reasons.length > 0 ? reasons.join(' · ') : 'buena relación precio/rendimiento';
}

export async function GET() {
  try {
    const [playersRes, roundInfo] = await Promise.all([
      getPlayers(),
      getCurrentRound(),
    ]);

    if (!playersRes.ok) throw new Error('Error cargando jugadores');

    const data = await playersRes.json();
    const allPlayers: Player[] = data.players || [];

    // Use API-Football round as source of truth
    const round = roundInfo.lastCompleted
      ? `J${roundInfo.roundNumber}`
      : (data.meta?.round || '');

    // Get next round fixture IDs for injuries + odds
    const nextFixtureIds = await getFixtureIdsByRound(roundInfo.nextRound || '');

    // Parallel: injuries + odds
    const [injuryMap, oddsMap] = await Promise.all([
      nextFixtureIds.length > 0 ? getInjuriesForFixtures(nextFixtureIds) : Promise.resolve(new Map()),
      nextFixtureIds.length > 0 ? getOddsDifficulty(nextFixtureIds) : Promise.resolve(new Map()),
    ]);

    // Build team → difficulty map from odds
    const difficultyMap = new Map<string, { homeDiff: number; awayDiff: number }>();
    for (const [, odds] of oddsMap) {
      if (odds.homeTeam) difficultyMap.set(odds.homeTeam, { homeDiff: odds.homeDifficulty, awayDiff: 6 - odds.homeDifficulty });
      if (odds.awayTeam) difficultyMap.set(odds.awayTeam, { homeDiff: 6 - odds.awayDifficulty, awayDiff: odds.awayDifficulty });
    }

    // Score all players
    const scored = allPlayers
      .filter((p) => p.status !== 'injured' && p.status !== 'suspended')
      .map((p) => {
        const injury = matchesInjury(p, injuryMap);
        if (injury?.type === 'Missing Fixture') return null;
        return { ...p, _score: quickScore(p, injuryMap, difficultyMap) };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b._score - a._score);

    // TOP 5 GANGAS
    const gangas = scored
      .filter((p) => p.price <= 8000000 && p.avgPts >= 3 && p.gamesPlayed >= 5)
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        pos: p.pos,
        team: p.team,
        price: p.price,
        avgPts: p.avgPts,
        status: p.status,
        flag: p.flag,
        lastFive: p.lastFive.slice(0, 3),
        fixture: p.fixture,
        score: Math.round(p._score * 10) / 10,
        razon: gangaReason(p, injuryMap, difficultyMap),
        injuryAlert: matchesInjury(p, injuryMap) ?? undefined,
      }));

    // TOP 4 POR EQUIPO
    const byTeam: Record<string, typeof gangas> = {};
    const teams = [...new Set(scored.map((p) => p.team))].filter(Boolean).sort();

    for (const team of teams) {
      const teamPlayers = scored
        .filter((p) => p.team === team && p.gamesPlayed >= 3)
        .slice(0, 4)
        .map((p) => ({
          name: p.name,
          pos: p.pos,
          team: p.team,
          price: p.price,
          avgPts: p.avgPts,
          status: p.status,
          flag: p.flag,
          lastFive: p.lastFive.slice(0, 3),
          fixture: p.fixture,
          score: Math.round(p._score * 10) / 10,
          razon: gangaReason(p, injuryMap, difficultyMap),
          injuryAlert: matchesInjury(p, injuryMap) ?? undefined,
        }));

      if (teamPlayers.length > 0) byTeam[team] = teamPlayers;
    }

    return NextResponse.json({
      gangas,
      byTeam,
      round,
      nextRound: roundInfo.nextRound,
      roundNumber: roundInfo.roundNumber,
      totalPlayers: allPlayers.length,
      injuryCount: injuryMap.size,
      oddsFixtures: oddsMap.size,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error cargando datos de jornada';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
