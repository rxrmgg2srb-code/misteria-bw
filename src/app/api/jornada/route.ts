import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import type { Player } from '@/lib/biwenger';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Score simplificado basado en las dimensiones clave de la IA
function quickScore(player: Player): number {
  if (player.status === 'injured' || player.status === 'suspended') return -999;

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

  // Fixture
  const diff = player.fixture?.difficulty ?? 3;
  score += (3 - diff) * 1.1;
  if (player.fixture?.isHome) score += diff <= 2 ? 0.8 : 0.4;
  else score -= diff >= 4 ? 1.2 : 0.4;

  // Bonus porteros/defensas en fixture fácil en casa
  if ((player.pos === 'PT' || player.pos === 'DF') && diff <= 2 && player.fixture?.isHome) {
    score += 1.5;
  }

  // Estado
  if (player.status === 'doubtful') score -= 2.5;
  if (player.flag === 'boost') score += 2.2;
  if (player.flag === 'risk') score -= 1.8;
  if (player.flag === 'avoid') score -= 3.0;

  // Relación calidad/precio (el corazón de la ganga)
  if (priceM <= 3 && player.avgPts >= 5) score += 2.5;
  else if (priceM <= 4 && player.avgPts >= 5) score += 1.8;
  else if (priceM <= 4 && player.avgPts >= 4) score += 1.0;
  else if (priceM <= 6 && player.avgPts >= 4.5) score += 0.6;
  else if (priceM >= 12 && player.avgPts < 4) score -= 2.0;
  else if (priceM >= 8 && player.avgPts < 3) score -= 1.8;

  // Momentum: dos últimas jornadas buenas
  if (player.lastFive.length >= 2 && player.lastFive[0] >= 6 && player.lastFive[1] >= 5) {
    score += 1.2;
  }

  // Rebote: Premium que hizo rosco la última jornada
  const isPremium = player.avgPts >= 5 || player.price >= 8000000;
  if (isPremium && player.lastFive[0] <= 0 && player.lastFive[1] > 0 && player.status === 'fit') {
    score += 1.8;
  }

  return score;
}

function gangaReason(player: Player): string {
  const priceM = (player.price / 1e6).toFixed(1);
  const diff = player.fixture?.difficulty ?? 3;
  const venue = player.fixture?.isHome ? 'en casa' : 'fuera';
  const rival = player.fixture?.opponent || '';

  const reasons: string[] = [];

  if (player.price <= 4000000 && player.avgPts >= 4.5) {
    reasons.push(`solo ${priceM}M con ${player.avgPts} pts de media`);
  }
  if (diff <= 2) reasons.push(`rival fácil ${venue}${rival ? ` ante ${rival}` : ''}`);
  if (player.lastFive[0] >= 7) reasons.push(`viene de ${player.lastFive[0]} pts`);
  if (player.flag === 'boost') reasons.push(`señal de boost detectada`);
  if (player.status === 'fit' && player.lastFive[0] <= 0 && player.lastFive[1] >= 6) {
    reasons.push(`rebote esperado tras rosco puntual`);
  }

  return reasons.length > 0 ? reasons.join(' · ') : `buena relación precio/rendimiento`;
}

export async function GET() {
  try {
    const playersRes = await getPlayers();
    if (!playersRes.ok) throw new Error('Error cargando jugadores');

    const data = await playersRes.json();
    const allPlayers: Player[] = data.players || [];
    const round = data.meta?.round || '';

    // Puntuar a todos
    const scored = allPlayers
      .filter((p) => p.status !== 'injured' && p.status !== 'suspended')
      .map((p) => ({ ...p, _score: quickScore(p) }))
      .sort((a, b) => b._score - a._score);

    // TOP 5 GANGAS: jugadores con mejor score pero precio <= 8M
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
        razon: gangaReason(p),
      }));

    // TOP 3-4 POR EQUIPO
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
          razon: gangaReason(p),
        }));

      if (teamPlayers.length > 0) {
        byTeam[team] = teamPlayers;
      }
    }

    return NextResponse.json({ gangas, byTeam, round, totalPlayers: allPlayers.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error cargando datos de jornada';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
