import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import type { Player } from '@/lib/biwenger';
import { buildRealStarterMap, apiDebug } from '@/lib/api-football';
import type { TeamStats } from '@/lib/api-football';

export const dynamic = 'force-dynamic';

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ─── Name alias map (Biwenger name → API-Football name) ────────────────────
// Add entries here when the AI misidentifies players due to name differences
const NAME_ALIASES: Record<string, string[]> = {
  // Athletic Club
  'nico williams':      ['nicolas williams', 'n. williams'],
  'guruzeta':           ['gorka guruzeta', 'guruzeta'],
  'yuri':               ['yuri berchiche', 'yuri'],
  'unai simon':         ['unai simon'],
  'lekue':              ['oier lekue'],
  'jauregizar':         ['andoni gorosabel', 'jauregizar'],
  // Real Madrid
  'vinicius':           ['vinicius junior', 'vinicius jr'],
  'valverde':           ['fede valverde', 'federico valverde'],
  'tchouameni':         ['aurelien tchouameni'],
  // Barça
  'yamal':              ['lamine yamal'],
  'lewandowski':        ['robert lewandowski'],
  // Generic
  'de paul':            ['rodrigo de paul'],
  'de jong':            ['frenkie de jong'],
};

function normalizeName(n: string) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getRealStarterCount(playerName: string, teamStarters?: Map<string, number>): number | null {
  if (!teamStarters) return null;
  const target = normalizeName(playerName);
  const targetParts = target.split(' ');
  
  // Resolve alias: check if target name has known API equivalents
  const aliasVariants = NAME_ALIASES[target] || [];

  for (const [realName, count] of teamStarters) {
    const real = normalizeName(realName);
    
    // 1. Exact match
    if (real === target) return count;
    
    // 2. Alias match
    if (aliasVariants.some(alias => real === normalizeName(alias) || real.includes(normalizeName(alias)))) return count;
    
    // 3. Substring match (both ways)
    if (real.includes(target) || target.includes(real)) return count;
    
    // 4. Check if ANY word from target appears in real name (surname match)
    const realParts = real.split(' ');
    for (const part of targetParts) {
      if (part.length >= 4 && realParts.some(rp => rp === part)) {
        return count;
      }
    }
  }
  // Not found in real starters -> 0 appearances
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
  _recentAppearances: number;   // starts in the API sample
  _starterRate: number;          // 0-100: starts/totalGames
  _subAppearances: number;       // sub appearances in sample
  _squadPresence: boolean;       // was seen at all (starter or sub) in the sample
  _recencyScore: number;         // 0–100: weighted recent titularity
  _advancedScore: number;        // 0–100: combined signal
  _finalScore: number;           // composite
  _blankStreak: number;
};

/** Weights for each round index: index 0 = most recent */
const ROUND_WEIGHTS = [3, 2.5, 2, 1.5, 1]; // sum = 10

function buildReconstructedScores(
  teamPlayers: Player[],
  maxGames: number,
  teamStats?: TeamStats
): Map<number, ScoredPlayer> {
  const result = new Map<number, ScoredPlayer>();
  const maxRounds = 5;
  const maxWeight = ROUND_WEIGHTS.slice(0, maxRounds).reduce((s, w) => s + w, 0);

  // Count total games this team appeared in the API data
  let totalTeamGames = 0;
  if (teamStats) {
    // The team with the most starts tells us how many games we have data for
    let maxStarts = 0;
    for (const count of teamStats.players.values()) {
      if (count > maxStarts) maxStarts = count;
    }
    totalTeamGames = maxStarts || 1;
  }

  for (const p of teamPlayers) {
    // ── Step 1: Starter appearances from API
    let recentAppearances = 0;
    let starterRate = 0;
    let subCount = 0;
    let squadPresence = false;
    let recencyScore = 0;

    if (teamStats) {
      const realStartCount = getRealStarterCount(p.name, teamStats.players);
      const realSubCount = getRealStarterCount(p.name, teamStats.subs);

      if (realStartCount !== null && realStartCount > 0) {
        recentAppearances = realStartCount;
        starterRate = Math.min((realStartCount / totalTeamGames) * 100, 100);
        squadPresence = true;
      }
      if (realSubCount !== null && realSubCount > 0) {
        subCount = realSubCount;
        squadPresence = true;
      }

      if (squadPresence) {
        // Starter rate is the primary signal
        recencyScore = starterRate;
        // Subs count as 30% of a start (they participate but aren't relied upon)
        recencyScore += (subCount / totalTeamGames) * 30;
        recencyScore = clamp(recencyScore, 0, 100);
      } else if (teamStats.players.size > 0) {
        // Player not seen in any game - strong signal they are fringe/injured
        recencyScore = 0;
      } else {
        // No API data at all - fallback to Biwenger
        const roundsPlayed: number[] = [];
        for (let i = 0; i < Math.min(maxRounds, p.lastFive.length); i++) {
          if (p.lastFive[i] > 0) roundsPlayed.push(i);
        }
        recentAppearances = roundsPlayed.length;
        const weightedSum = roundsPlayed.reduce((sum, i) => sum + (ROUND_WEIGHTS[i] ?? 0), 0);
        recencyScore = maxWeight > 0 ? (weightedSum / maxWeight) * 100 : 0;
      }
    } else {
      // Fallback: use Biwenger lastFive
      const roundsPlayed: number[] = [];
      for (let i = 0; i < Math.min(maxRounds, p.lastFive.length); i++) {
        if (p.lastFive[i] > 0) roundsPlayed.push(i);
      }
      recentAppearances = roundsPlayed.length;
      const weightedSum = roundsPlayed.reduce((sum, i) => sum + (ROUND_WEIGHTS[i] ?? 0), 0);
      recencyScore = maxWeight > 0 ? (weightedSum / maxWeight) * 100 : 0;
    }

    // ── Historical titularity as backup signal
    const historical = maxGames > 0 ? (p.gamesPlayed / maxGames) * 100 : 0;

    // ── Status penalties
    const doubtfulPenalty = p.status === 'doubtful' ? 20 : 0;

    // ── Consecutive blank streak (from Biwenger lastFive)
    let blankStreak = 0;
    for (let i = 0; i < Math.min(3, p.lastFive.length); i++) {
      if (p.lastFive[i] <= 0) blankStreak++;
      else break;
    }

    // ── Advanced score: API starter rate (70%) + historical (30%) - penalties
    const advancedScore = clamp(
      recencyScore * 0.70 + historical * 0.30 - doubtfulPenalty,
      0, 100
    );

    // ── Final score: recency is king (85%), historical gives a small boost (15%)
    // Players not seen in ANY game (not even as subs) get an extra penalty
    const absencePenalty = (teamStats && teamStats.players.size > 0 && !squadPresence) ? 30 : 0;
    const finalScore = clamp(recencyScore * 0.85 + advancedScore * 0.15 - absencePenalty, 0, 100);

    result.set(p.id, {
      ...p,
      _recentAppearances: recentAppearances,
      _starterRate: Math.round(starterRate),
      _subAppearances: subCount,
      _squadPresence: squadPresence,
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
  scored: Map<number, ScoredPlayer>,
  preferredFormation?: string
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

    const reqDf = preferredFormation ? parseInt(preferredFormation.split('-')[0], 10) : null;
    
    // Force the AI to use the real-life number of defenders. 
    // This allows flexibility in attack (e.g. 4-3-3 instead of 4-5-1) to fit star wingers.
    if (reqDf && nDf !== reqDf) {
      continue;
    }

    const avgScore = eleven.reduce((s, p) => s + p._finalScore, 0) / 11;

    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestEleven = eleven;
      bestFormation = fStr;
    }
  }

  // Confidence: % of 11 who have a real starter rate >= 50% in our API sample
  const confident = bestEleven.filter((p) => p._starterRate >= 50 || p._recentAppearances >= 3).length;
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
        realFormation: string;
        coach: string;
        confidence: number;
      }
    > = {};

    // Parallel fetch: we don't await realStarters inside the loop
    const realStarterMap = await buildRealStarterMap();

    for (const team of teams) {
      const teamPlayers = allPlayers.filter((p) => p.team === team);
      const maxGames = Math.max(...teamPlayers.map((p) => p.gamesPlayed), 1);
      const teamIsRotating = detectRotationTeam(teamPlayers, maxGames);

      let rawFormation = 'Desconocida';
      let teamCoach = 'Desconocido';
      
      // Find the full teamStats object for this team
      let foundTeamStats2: TeamStats | undefined = undefined;
      for (const [realTeamName, ts] of realStarterMap) {
        if (normalizeName(realTeamName).includes(normalizeName(team)) || normalizeName(team).includes(normalizeName(realTeamName))) {
          foundTeamStats2 = ts;
          teamCoach = ts.coach;
          break;
        }
      }

      // Translate preferred formation from API data
      let preferredFormation: string | undefined = undefined;
      if (foundTeamStats2 && foundTeamStats2.formations.size > 0) {
        let maxCount = -1;
        let bestRawFormation = '';
        for (const [form, count] of foundTeamStats2.formations) {
          if (count > maxCount) { maxCount = count; bestRawFormation = form; }
        }
        rawFormation = bestRawFormation;
        const parts = bestRawFormation.split('-').map(Number);
        if (parts.length === 3) preferredFormation = `${parts[0]}-${parts[1]}-${parts[2]}`;
        else if (parts.length === 4) preferredFormation = `${parts[0]}-${parts[1] + parts[2]}-${parts[3]}`;
        else if (parts.length === 5) preferredFormation = `${parts[0]}-${parts[1] + parts[2] + parts[3]}-${parts[4]}`;
      }

      // Find the full teamStats object for this team
      let foundTeamStats: TeamStats | undefined = undefined;
      for (const [realTeamName, ts] of realStarterMap) {
        if (normalizeName(realTeamName).includes(normalizeName(team)) || normalizeName(team).includes(normalizeName(realTeamName))) {
          foundTeamStats = ts;
          break;
        }
      }

      // Build reconstructed scores using full API data (starters + subs + formations)
      const scored = buildReconstructedScores(teamPlayers, maxGames, foundTeamStats);

      // Only select from available (not injured/suspended)
      const available = teamPlayers.filter(
        (p) => p.status !== 'injured' && p.status !== 'suspended'
      );

      if (available.length < 11) continue;

      const { eleven, formation, confidence } = selectEleven(available, scored, preferredFormation);

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
            starterRate: sp._starterRate,
            recentAppearances: sp._recentAppearances,
            subAppearances: sp._subAppearances,
            squadPresence: sp._squadPresence,
            advancedScore: sp._advancedScore,
            status: sp.status,
            blankStreak: sp._blankStreak,
          })),
        formation,
        realFormation: rawFormation,
        coach: teamCoach,
        confidence,
        _debugAllPlayers: team === 'Athletic' ? Array.from(scored.values()).map(sp => ({
          name: sp.name,
          pos: sp.pos,
          score: sp._finalScore,
          recency: sp._recencyScore,
          starterRate: sp._starterRate,
          subApp: sp._subAppearances,
          presence: sp._squadPresence
        })) : undefined,
      };
    }

    return NextResponse.json({ 
      teams: result, 
      round,
      debug: {
        realStarterTeamsFound: realStarterMap.size,
        realStarterKeys: Array.from(realStarterMap.keys()),
        keyStart: (process.env.APIFOOTBALL_KEY || 'MISSING').substring(0, 4),
        apiStatus: apiDebug.lastStatus,
        apiError: apiDebug.lastError,
        apiUrl: apiDebug.lastUrl
      }
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error cargando datos de equipos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
