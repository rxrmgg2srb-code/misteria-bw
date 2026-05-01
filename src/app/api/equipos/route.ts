import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import type { Player } from '@/lib/biwenger';

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * ADVANCED TITULARITY SCORE (0–100)
 *
 * Combines 5 reliability signals:
 *  1. Historical titularity  (gamesPlayed / maxGames)
 *  2. Recent titularity      (lastFive presence in last 5 matches)
 *  3. Recent blank streak    (-30 pts per consecutive 0 in last 3)
 *  4. Doubtful penalty       (-20 pts if status === 'doubtful')
 *  5. Rotation team discount (light penalty when team has extra competition load)
 */
function advancedTitularity(
  player: Player,
  maxGames: number,
  teamIsRotating: boolean
): number {
  // ── 1. Historical titularity (0–100)
  const historical = maxGames > 0 ? (player.gamesPlayed / maxGames) * 100 : 0;

  // ── 2. Recent titularity: how many of the last 5 did the player appear?
  //    Biwenger returns 0 for "didn't play" and >0 for "played"
  const last5 = player.lastFive.slice(0, 5);
  const recentAppearances = last5.filter((v) => v > 0).length;
  const recentTitularity = last5.length > 0 ? (recentAppearances / last5.length) * 100 : historical;

  // ── 3. Consecutive blank (rosco) streak in last 3
  let recentBlankStreak = 0;
  for (let i = 0; i < Math.min(3, player.lastFive.length); i++) {
    if (player.lastFive[i] <= 0) recentBlankStreak++;
    else break;
  }
  const blankPenalty = recentBlankStreak * 22; // −22 pts per consecutive 0

  // ── 4. Doubtful penalty
  const doubtfulPenalty = player.status === 'doubtful' ? 22 : 0;

  // ── 5. Rotation team discount (mild −10 for non-key players)
  const rotationPenalty = teamIsRotating && historical < 80 ? 10 : 0;

  // ── Weighted blend: recent form (60%) + historical (40%)
  const blended = recentTitularity * 0.6 + historical * 0.4;

  // ── Context from player.context if available
  const contextBoost = (player.context?.estimatedStartConfidence ?? 0) * 10;

  const raw = blended + contextBoost - blankPenalty - doubtfulPenalty - rotationPenalty;
  return clamp(raw, 0, 100);
}

/** Returns true if this team likely rotates due to extra competition load */
function detectRotationTeam(teamPlayers: Player[], maxGames: number): boolean {
  // If many players have played significantly more matches than league rounds,
  // they're competing in cups / Europe
  const playedAvg =
    teamPlayers.reduce((s, p) => s + p.gamesPlayed, 0) / (teamPlayers.length || 1);
  return playedAvg > maxGames * 1.15;
}

/** Position-scarcity guarantee: if only 1 fit player in a position, they're 100% */
function applyScarcityBonus(
  candidates: Player[],
  scores: Map<number, number>
): void {
  if (candidates.length === 1) {
    scores.set(candidates[0].id, 100);
  }
}

// ─── Eleven selector ────────────────────────────────────────────────────────

function selectEleven(
  available: Player[],
  maxGames: number,
  teamIsRotating: boolean
): { eleven: Player[]; formation: string; confidence: number } {
  // Compute advanced titularity for every available player
  const scores = new Map<number, number>();
  for (const p of available) {
    scores.set(p.id, advancedTitularity(p, maxGames, teamIsRotating));
  }

  // Apply position-scarcity guarantee per position
  const byPos: Record<string, Player[]> = { PT: [], DF: [], MC: [], DL: [] };
  for (const p of available) {
    if (byPos[p.pos]) byPos[p.pos].push(p);
  }
  for (const pos of ['PT', 'DF', 'MC', 'DL']) {
    applyScarcityBonus(byPos[pos], scores);
  }

  // Sort each position group by advanced titularity score descending
  const sortedByPos: Record<string, Player[]> = {};
  for (const pos of ['PT', 'DF', 'MC', 'DL']) {
    sortedByPos[pos] = [...byPos[pos]].sort(
      (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
    );
  }

  const pt = sortedByPos['PT'].slice(0, 1);

  // Try formations, pick the one maximising the average advanced titularity of the 11
  const formations: [number, number, number, string][] = [
    [4, 3, 3, '4-3-3'],
    [4, 4, 2, '4-4-2'],
    [4, 5, 1, '4-5-1'],
    [3, 5, 2, '3-5-2'],
    [3, 4, 3, '3-4-3'],
    [5, 3, 2, '5-3-2'],
    [5, 4, 1, '5-4-1'],
    [5, 2, 3, '5-2-3'],
  ];

  let bestEleven: Player[] = [];
  let bestFormation = '4-3-3';
  let bestScore = -1;

  for (const [nDf, nMc, nDl, fStr] of formations) {
    const df = sortedByPos['DF'].slice(0, nDf);
    const mc = sortedByPos['MC'].slice(0, nMc);
    const dl = sortedByPos['DL'].slice(0, nDl);

    if (df.length < nDf || mc.length < nMc || dl.length < nDl) continue;

    const eleven = [...pt, ...df, ...mc, ...dl];
    if (eleven.length !== 11) continue;

    const avgScore =
      eleven.reduce((s, p) => s + (scores.get(p.id) ?? 0), 0) / 11;

    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestEleven = eleven;
      bestFormation = fStr;
    }
  }

  // Confidence = % of selected players with advanced titularity ≥ 75
  const confidentCount = bestEleven.filter(
    (p) => (scores.get(p.id) ?? 0) >= 75
  ).length;
  const confidence =
    bestEleven.length > 0
      ? Math.round((confidentCount / bestEleven.length) * 100)
      : 0;

  return { eleven: bestEleven, formation: bestFormation, confidence };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET() {
  try {
    const playersRes = await getPlayers();
    if (!playersRes.ok) throw new Error('Error cargando jugadores');

    const data = await playersRes.json();
    const allPlayers: Player[] = data.players || [];
    const round = data.meta?.round || '';

    const teams = [...new Set(allPlayers.map((p) => p.team))].filter(Boolean).sort();

    const result: Record<
      string,
      {
        fixture: Player['fixture'];
        eleven: Array<{
          id: number;
          name: string;
          pos: string;
          avgPts: number;
          price: number;
          gamesPlayed: number;
          titularity: number;
          advancedScore: number;
          status: string;
          blankStreak: number;
        }>;
        formation: string;
        confidence: number;
        rotationWarning: boolean;
      }
    > = {};

    for (const team of teams) {
      const teamPlayers = allPlayers.filter((p) => p.team === team);
      const maxGames = Math.max(...teamPlayers.map((p) => p.gamesPlayed), 1);
      const teamIsRotating = detectRotationTeam(teamPlayers, maxGames);

      const available = teamPlayers.filter(
        (p) => p.status !== 'injured' && p.status !== 'suspended'
      );

      if (available.length < 11) continue;

      const { eleven, formation, confidence } = selectEleven(
        available,
        maxGames,
        teamIsRotating
      );

      result[team] = {
        fixture: teamPlayers[0]?.fixture || null,
        rotationWarning: teamIsRotating,
        eleven: eleven.map((p) => {
          let blankStreak = 0;
          for (let i = 0; i < Math.min(3, p.lastFive.length); i++) {
            if (p.lastFive[i] <= 0) blankStreak++;
            else break;
          }
          return {
            id: p.id,
            name: p.name,
            pos: p.pos,
            avgPts: p.avgPts,
            price: p.price,
            gamesPlayed: p.gamesPlayed,
            titularity: maxGames > 0 ? Math.round((p.gamesPlayed / maxGames) * 100) : 0,
            advancedScore: Math.round(advancedTitularity(p, maxGames, teamIsRotating)),
            status: p.status,
            blankStreak,
          };
        }),
        formation,
        confidence,
      };
    }

    return NextResponse.json({ teams: result, round });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error cargando datos de equipos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

