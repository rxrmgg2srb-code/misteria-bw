import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import type { Player } from '@/lib/biwenger';

type PositionGroup = { pt: Player[]; df: Player[]; mc: Player[]; dl: Player[] };

function groupByPosition(players: Player[]): PositionGroup {
  return {
    pt: players.filter((p) => p.pos === 'PT'),
    df: players.filter((p) => p.pos === 'DF'),
    mc: players.filter((p) => p.pos === 'MC'),
    dl: players.filter((p) => p.pos === 'DL'),
  };
}

// Returns formation string and selected 11 based on titularity rate
function selectEleven(available: Player[], maxGames: number): {
  eleven: Player[];
  formation: string;
  confidence: number;
} {
  // Sort each group by titularity rate (games played / team max games) then by avgPts as tiebreaker
  const sorted = [...available].sort((a, b) => {
    const tA = maxGames > 0 ? a.gamesPlayed / maxGames : 0;
    const tB = maxGames > 0 ? b.gamesPlayed / maxGames : 0;
    const diff = tB - tA;
    if (Math.abs(diff) > 0.05) return diff;
    return b.avgPts - a.avgPts;
  });

  const groups = groupByPosition(sorted);

  // Pick portero
  const pt = groups.pt.slice(0, 1);

  // We need exactly 10 outfield players. Try different formations:
  // Prioritise players with highest titularity rate.
  const dfCandidates = groups.df;
  const mcCandidates = groups.mc;
  const dlCandidates = groups.dl;

  // Try 4-3-3, 4-4-2, 4-5-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1 in order of preference
  const formations: [number, number, number, string][] = [
    [4, 3, 3, '4-3-3'],
    [4, 4, 2, '4-4-2'],
    [4, 5, 1, '4-5-1'],
    [3, 5, 2, '3-5-2'],
    [3, 4, 3, '3-4-3'],
    [5, 3, 2, '5-3-2'],
    [5, 4, 1, '5-4-1'],
    [4, 2, 4, '4-2-4'],
  ];

  let bestEleven: Player[] = [];
  let bestFormation = '4-3-3';
  let bestScore = -1;

  for (const [nDf, nMc, nDl, fStr] of formations) {
    if (
      dfCandidates.length < nDf ||
      mcCandidates.length < nMc ||
      dlCandidates.length < nDl
    ) continue;

    const df = dfCandidates.slice(0, nDf);
    const mc = mcCandidates.slice(0, nMc);
    const dl = dlCandidates.slice(0, nDl);
    const eleven = [...pt, ...df, ...mc, ...dl];

    if (eleven.length !== 11) continue;

    // Score = average titularity of the 11
    const score = eleven.reduce((sum, p) => sum + (maxGames > 0 ? p.gamesPlayed / maxGames : 0), 0) / 11;
    if (score > bestScore) {
      bestScore = score;
      bestEleven = eleven;
      bestFormation = fStr;
    }
  }

  // Calculate confidence: % of selected players with titularity >= 0.75
  const confident = bestEleven.filter((p) => maxGames > 0 && p.gamesPlayed / maxGames >= 0.75).length;
  const confidence = bestEleven.length > 0 ? Math.round((confident / bestEleven.length) * 100) : 0;

  return { eleven: bestEleven, formation: bestFormation, confidence };
}

export async function GET() {
  try {
    const playersRes = await getPlayers();
    if (!playersRes.ok) throw new Error('Error cargando jugadores');

    const data = await playersRes.json();
    const allPlayers: Player[] = data.players || [];
    const round = data.meta?.round || '';

    // Group by team, only available players
    const teams = [...new Set(allPlayers.map((p) => p.team))].filter(Boolean).sort();
    const result: Record<string, {
      fixture: Player['fixture'];
      eleven: Array<{
        id: number;
        name: string;
        pos: string;
        avgPts: number;
        price: number;
        gamesPlayed: number;
        titularity: number;
        status: string;
      }>;
      formation: string;
      confidence: number;
    }> = {};

    for (const team of teams) {
      const teamPlayers = allPlayers.filter((p) => p.team === team);

      // Max games played in team = proxy for number of rounds played
      const maxGames = Math.max(...teamPlayers.map((p) => p.gamesPlayed), 1);

      // Available = not injured or suspended
      const available = teamPlayers.filter(
        (p) => p.status !== 'injured' && p.status !== 'suspended'
      );

      if (available.length < 11) continue;

      const { eleven, formation, confidence } = selectEleven(available, maxGames);

      result[team] = {
        fixture: teamPlayers[0]?.fixture || null,
        eleven: eleven.map((p) => ({
          id: p.id,
          name: p.name,
          pos: p.pos,
          avgPts: p.avgPts,
          price: p.price,
          gamesPlayed: p.gamesPlayed,
          titularity: maxGames > 0 ? Math.round((p.gamesPlayed / maxGames) * 100) : 0,
          status: p.status,
        })),
        formation,
        confidence,
      };
    }

    return NextResponse.json({ teams: result, round });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error cargando datos de equipos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
