import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import type { Player } from '@/lib/biwenger';
import { buildRealStarterMap } from '@/lib/api-football';

export const dynamic = 'force-dynamic';

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function normalizeName(n: string) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getRealStarterCount(playerName: string, teamStarters?: Map<string, number>): number | null {
  if (!teamStarters) return null;
  const target = normalizeName(playerName);
  const targetParts = target.split(' ');

  for (const [realName, count] of teamStarters) {
    const real = normalizeName(realName);
    if (real === target) return count;
    if (real.includes(target) || target.includes(real)) return count;
    
    // Check if main surname matches
    const realParts = real.split(' ');
    if (realParts.length > 0 && targetParts.length > 0) {
       if (realParts[realParts.length - 1] === targetParts[targetParts.length - 1]) {
           return count;
       }
    }
  }
  // Not found in real starters -> 0 appearances (or they are actually bench players)
  return 0;
}

/**
 * RECONSTRUCTED XI APPROACH
 *
 * For each team we rebuild the actual XI from each of the last 5 matchdays:
 *   - lastFive[0] = most recent matchday
 *   - lastFive[i] > 0 → the player was on the pitch that day
 *
 * From those 5 reconstructed XIs we calculate a weighted recency score.
 * More recent matchdays carry more weight.
 */

type ScoredPlayer = Player & {
  _recentAppearances: number;   // 0–5: how many of last 5 rounds they appeared
  _recencyScore: number;         // 0–100: weighted recent titularity
  _advancedScore: number;        // 0–100: backup signal (form, status, etc.)
  _finalScore: number;           // composite
  _blankStreak: number;
};

/** Weights for each round index: index 0 = most recent */
const ROUND_WEIGHTS = [3, 2.5, 2, 1.5, 1]; // sum = 10

function buildReconstructedScores(
  teamPlayers: Player[],
  maxGames: number,
  realStarters?: Map<string, number>
): Map<number, ScoredPlayer> {
  const result = new Map<number, ScoredPlayer>();
  const maxRounds = 5;
  const maxWeight = ROUND_WEIGHTS.slice(0, maxRounds).reduce((s, w) => s + w, 0);

  for (const p of teamPlayers) {
    // ── Step 1: Recent appearances (real API data prioritized, fallback to Biwenger lastFive)
    let recentAppearances = 0;
    let recencyScore = 0;
    
    const realCount = getRealStarterCount(p.name, realStarters);
    
    if (realCount !== null) {
      // We have real data: Cap at 5
      recentAppearances = clamp(realCount, 0, 5);
      // Give full score if 4 or 5 appearances, scale down otherwise
      recencyScore = (recentAppearances / 5) * 100;
    } else {
      // Fallback: use Biwenger lastFive > 0
      const roundsPlayed: number[] = [];
      for (let i = 0; i < Math.min(maxRounds, p.lastFive.length); i++) {
        if (p.lastFive[i] > 0) roundsPlayed.push(i);
      }
      recentAppearances = roundsPlayed.length;
      const weightedSum = roundsPlayed.reduce((sum, i) => sum + (ROUND_WEIGHTS[i] ?? 0), 0);
      recencyScore = maxWeight > 0 ? (weightedSum / maxWeight) * 100 : 0;
    }

    // ── Step 2 is now handled above

    // ── Step 3: Historical titularity as backup signal
    const historical = maxGames > 0 ? (p.gamesPlayed / maxGames) * 100 : 0;

    // ── Step 4: Status penalties
    const doubtfulPenalty = p.status === 'doubtful' ? 20 : 0;

    // ── Step 5: Consecutive blank streak
    let blankStreak = 0;
    for (let i = 0; i < Math.min(3, p.lastFive.length); i++) {
      if (p.lastFive[i] <= 0) blankStreak++;
      else break;
    }

    // Advanced score combines recency + history - penalties
    const advancedScore = clamp(
      recencyScore * 0.70 + historical * 0.30 - doubtfulPenalty,
      0, 100
    );

    // Final score: recency is the dominant signal (80%)
    const finalScore = recencyScore * 0.80 + advancedScore * 0.20;

    result.set(p.id, {
      ...p,
      _recentAppearances: recentAppearances,
      _recencyScore: Math.round(recencyScore),
      _advancedScore: Math.round(advancedScore),
      _finalScore: Math.round(finalScore),
      _blankStreak: blankStreak,
    });
  }

  return result;
}

/** If only 1 available player exists for a position, guarantee they start */
function applyScarcityBonus(scored: Map<number, ScoredPlayer>, candidates: ScoredPlayer[]) {
  if (candidates.length === 1) {
    const p = scored.get(candidates[0].id);
    if (p) { p._recencyScore = 100; p._finalScore = 100; }
  }
}

/** Detect rotation teams (playing multiple competitions) */
function detectRotationTeam(teamPlayers: Player[], maxGames: number): boolean {
  const playedAvg =
    teamPlayers.reduce((s, p) => s + p.gamesPlayed, 0) / (teamPlayers.length || 1);
  return playedAvg > maxGames * 1.15;
}

// ─── Eleven Selector ─────────────────────────────────────────────────────────

function selectEleven(
  available: Player[],
  scored: Map<number, ScoredPlayer>
): { eleven: ScoredPlayer[]; formation: string; confidence: number } {
  // Group available players by position
  const byPos: Record<string, ScoredPlayer[]> = { PT: [], DF: [], MC: [], DL: [] };
  for (const p of available) {
    const sp = scored.get(p.id);
    if (sp && byPos[sp.pos]) byPos[sp.pos].push(sp);
  }

  // Apply scarcity guarantee per position
  for (const pos of ['PT', 'DF', 'MC', 'DL']) {
    applyScarcityBonus(scored, byPos[pos]);
  }

  // Sort each position by finalScore descending
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b._finalScore - a._finalScore);
  }

  const pt = byPos['PT'].slice(0, 1);

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

  let bestEleven: ScoredPlayer[] = [];
  let bestFormation = '4-3-3';
  let bestScore = -1;

  for (const [nDf, nMc, nDl, fStr] of formations) {
    const df = byPos['DF'].slice(0, nDf);
    const mc = byPos['MC'].slice(0, nMc);
    const dl = byPos['DL'].slice(0, nDl);

    if (df.length < nDf || mc.length < nMc || dl.length < nDl) continue;

    const eleven = [...pt, ...df, ...mc, ...dl] as ScoredPlayer[];
    if (eleven.length !== 11) continue;

    const avgScore = eleven.reduce((s, p) => s + p._finalScore, 0) / 11;
    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestEleven = eleven;
      bestFormation = fStr;
    }
  }

  // Confidence: % of 11 who appeared in at least 3 of the last 5 games
  const confident = bestEleven.filter((p) => p._recentAppearances >= 3).length;
  const confidence =
    bestEleven.length > 0 ? Math.round((confident / bestEleven.length) * 100) : 0;

  return { eleven: bestEleven, formation: bestFormation, confidence };
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
        rotationWarning: boolean;
        eleven: Array<{
          id: number;
          name: string;
          pos: string;
          avgPts: number;
          price: number;
          gamesPlayed: number;
          titularity: number;
          recencyScore: number;
          recentAppearances: number;
          advancedScore: number;
          status: string;
          blankStreak: number;
        }>;
        formation: string;
        confidence: number;
      }
    > = {};

    // Parallel fetch: we don't await realStarters inside the loop
    const realStarterMap = await buildRealStarterMap();

    for (const team of teams) {
      const teamPlayers = allPlayers.filter((p) => p.team === team);
      const maxGames = Math.max(...teamPlayers.map((p) => p.gamesPlayed), 1);
      const teamIsRotating = detectRotationTeam(teamPlayers, maxGames);

      // We attempt to find the real team name in the map (it might be named slightly differently)
      // but exact match usually works, or we find it if it contains part of the name
      let teamStarters: Map<string, number> | undefined = undefined;
      for (const [realTeamName, starters] of realStarterMap) {
        if (normalizeName(realTeamName).includes(normalizeName(team)) || normalizeName(team).includes(normalizeName(realTeamName))) {
          teamStarters = starters;
          break;
        }
      }

      // Build reconstructed scores using real data when available
      const scored = buildReconstructedScores(teamPlayers, maxGames, teamStarters);

      // Only select from available (not injured/suspended)
      const available = teamPlayers.filter(
        (p) => p.status !== 'injured' && p.status !== 'suspended'
      );

      if (available.length < 11) continue;

      const { eleven, formation, confidence } = selectEleven(available, scored);

      result[team] = {
        fixture: teamPlayers[0]?.fixture || null,
        rotationWarning: teamIsRotating,
        eleven: eleven.map((sp) => ({
          id: sp.id,
          name: sp.name,
          pos: sp.pos,
          avgPts: sp.avgPts,
          price: sp.price,
          gamesPlayed: sp.gamesPlayed,
          titularity: maxGames > 0 ? Math.round((sp.gamesPlayed / maxGames) * 100) : 0,
          recencyScore: sp._recencyScore,
          recentAppearances: sp._recentAppearances,
          advancedScore: sp._advancedScore,
          status: sp.status,
          blankStreak: sp._blankStreak,
        })),
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
