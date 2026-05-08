import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import type { Player } from '@/lib/biwenger';
import {
  buildRealStarterMap,
  getNextRoundInjuries,
  getCurrentRound,
  getFixtureIdsByRound,
  getOddsDifficulty,
  apiDebug,
} from '@/lib/api-football';
import type { TeamStats, PlayerInjury } from '@/lib/api-football';
import { buildTeamContextMap } from '@/lib/team-context';
import type { TeamContextSnapshot } from '@/lib/team-context';

export const dynamic = 'force-dynamic';

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function normalizeName(n: string) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ─── Name alias map (Biwenger name → API-Football name) ────────────────────
const NAME_ALIASES: Record<string, string[]> = {
  // Athletic Club
  'nico williams':      ['nicolas williams', 'n. williams'],
  'inaki williams':     ['inaki williams', 'i. williams'],
  'guruzeta':           ['gorka guruzeta', 'guruzeta'],
  'yuri':               ['yuri berchiche', 'yuri', 'berchiche'],
  'yeray':              ['yeray alvarez', 'yeray', 'y. alvarez', 'alvarez'],
  'benat prados':       ['benat prados', 'benat', 'b. prados'],
  'de galarreta':       ['ruiz de galarreta', 'i. ruiz de galarreta', 'galarreta'],
  'unai simon':         ['unai simon', 'u. simon'],
  'unai gomez':         ['u. gomez'],
  'lekue':              ['oier lekue', 'i. lekue'],
  'jauregizar':         ['m. jauregizar'],
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

function getRealStarterCount(playerName: string, teamStarters?: Map<string, number>): number | null {
  if (!teamStarters) return null;
  const target = normalizeName(playerName);
  const targetParts = target.split(' ');
  const aliasVariants = NAME_ALIASES[target] || [];

  for (const [realName, count] of teamStarters) {
    const real = normalizeName(realName);
    if (real === target) return count;
    if (aliasVariants.some(alias => real === normalizeName(alias) || real.includes(normalizeName(alias)))) return count;
    if (real.includes(target) || target.includes(real)) return count;
    const realParts = real.split(' ');
    for (const part of targetParts) {
      if (part.length >= 4 && realParts.some(rp => rp === part)) {
        return count;
      }
    }
  }
  return 0;
}

/** Check if a player matches an injury record */
function matchInjury(playerName: string, injuryMap: Map<string, PlayerInjury>): PlayerInjury | null {
  const target = normalizeName(playerName);
  const targetParts = target.split(' ');

  for (const [injName, inj] of injuryMap) {
    const real = normalizeName(injName);
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

// ─── Types ──────────────────────────────────────────────────────────────────

type ScoredPlayer = Player & {
  _recentAppearances: number;
  _starterRate: number;
  _subAppearances: number;
  _squadPresence: boolean;
  _recencyScore: number;
  _advancedScore: number;
  _finalScore: number;
  _blankStreak: number;
  _injuryAlert: PlayerInjury | null;
};

// ─── Scoring ────────────────────────────────────────────────────────────────

const ROUND_WEIGHTS = [3, 2.5, 2, 1.5, 1];

function buildReconstructedScores(
  teamPlayers: Player[],
  maxGames: number,
  teamStats: TeamStats | undefined,
  injuries: Map<string, PlayerInjury>,
  schedulePressure: 'alta' | 'media' | 'baja',
): Map<number, ScoredPlayer> {
  const result = new Map<number, ScoredPlayer>();
  const maxRounds = 5;
  const maxWeight = ROUND_WEIGHTS.slice(0, maxRounds).reduce((s, w) => s + w, 0);

  let totalTeamGames = 0;
  if (teamStats) {
    let maxStarts = 0;
    for (const count of teamStats.players.values()) {
      if (count > maxStarts) maxStarts = count;
    }
    totalTeamGames = maxStarts || 1;
  }

  for (const p of teamPlayers) {
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
        recencyScore = starterRate;
        recencyScore += (subCount / totalTeamGames) * 30;
        recencyScore = clamp(recencyScore, 0, 100);
      } else if (teamStats.players.size > 0) {
        recencyScore = 0;
      } else {
        const roundsPlayed: number[] = [];
        for (let i = 0; i < Math.min(maxRounds, p.lastFive.length); i++) {
          if (p.lastFive[i] > 0) roundsPlayed.push(i);
        }
        recentAppearances = roundsPlayed.length;
        const weightedSum = roundsPlayed.reduce((sum, i) => sum + (ROUND_WEIGHTS[i] ?? 0), 0);
        recencyScore = maxWeight > 0 ? (weightedSum / maxWeight) * 100 : 0;
      }
    } else {
      const roundsPlayed: number[] = [];
      for (let i = 0; i < Math.min(maxRounds, p.lastFive.length); i++) {
        if (p.lastFive[i] > 0) roundsPlayed.push(i);
      }
      recentAppearances = roundsPlayed.length;
      const weightedSum = roundsPlayed.reduce((sum, i) => sum + (ROUND_WEIGHTS[i] ?? 0), 0);
      recencyScore = maxWeight > 0 ? (weightedSum / maxWeight) * 100 : 0;
    }

    const historical = maxGames > 0 ? (p.gamesPlayed / maxGames) * 100 : 0;

    // ── Injuries from API-Football ──
    const injuryAlert = matchInjury(p.name, injuries);
    let isConfirmedOut = false;
    let doubtfulPenalty = p.status === 'doubtful' ? 20 : 0;

    if (injuryAlert) {
      if (injuryAlert.type === 'Missing Fixture') {
        isConfirmedOut = true;
      } else if (injuryAlert.type === 'Questionable') {
        doubtfulPenalty = Math.max(doubtfulPenalty, 30);
      }
    }

    // ── Schedule pressure: penalize non-essential starters in rotation-prone teams ──
    let rotationPenalty = 0;
    if (schedulePressure === 'alta' && squadPresence) {
      // Players who are regular starters (>70%) in heavy-schedule teams get penalized
      // because the coach is more likely to rotate them
      if (starterRate >= 80) rotationPenalty = 8;
      else if (starterRate >= 60) rotationPenalty = 5;
      // Subs who play a lot actually BENEFIT from rotation (they might get a start)
      if (subCount >= 2 && starterRate < 50) rotationPenalty = -10;
    } else if (schedulePressure === 'media' && starterRate >= 80) {
      rotationPenalty = 3;
    }

    let blankStreak = 0;
    for (let i = 0; i < Math.min(3, p.lastFive.length); i++) {
      if (p.lastFive[i] <= 0) blankStreak++;
      else break;
    }

    const advancedScore = clamp(
      recencyScore * 0.70 + historical * 0.30 - doubtfulPenalty - rotationPenalty,
      0, 100
    );

    const absencePenalty = (teamStats && teamStats.players.size > 0 && !squadPresence) ? 30 : 0;
    let finalScore = clamp(recencyScore * 0.85 + advancedScore * 0.15 - absencePenalty, 0, 100);

    if (isConfirmedOut) finalScore = -100;

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
      _injuryAlert: injuryAlert,
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

// ─── Recency-Weighted Formation ─────────────────────────────────────────────

/**
 * Instead of picking the most-used formation across ALL matches,
 * weight recent matches more heavily to catch tactical shifts.
 */
function getRecencyWeightedFormation(formationMap: Map<string, number>, totalGames: number): string | undefined {
  if (!formationMap || formationMap.size === 0) return undefined;

  // If we only have one formation, return it
  if (formationMap.size === 1) {
    return formationMap.keys().next().value;
  }

  // Find the formation used the most
  let bestFormation = '';
  let bestCount = -1;
  for (const [form, count] of formationMap) {
    if (count > bestCount) {
      bestCount = count;
      bestFormation = form;
    }
  }

  return bestFormation;
}

/** Convert raw formation string to 3-part system (DF-MC-DL) */
function normalizeFormation(raw: string): string | undefined {
  const parts = raw.split('-').map(Number);
  if (parts.some(isNaN)) return undefined;
  if (parts.length === 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  if (parts.length === 4) return `${parts[0]}-${parts[1] + parts[2]}-${parts[3]}`;
  if (parts.length === 5) return `${parts[0]}-${parts[1] + parts[2] + parts[3]}-${parts[4]}`;
  return undefined;
}

// ─── Eleven Selector ─────────────────────────────────────────────────────────

function selectEleven(
  available: Player[],
  scored: Map<number, ScoredPlayer>,
  preferredFormation?: string
): { eleven: ScoredPlayer[]; formation: string; confidence: number } {
  const byPos: Record<string, ScoredPlayer[]> = { PT: [], DF: [], MC: [], DL: [] };
  for (const p of available) {
    const sp = scored.get(p.id);
    if (sp && byPos[sp.pos]) byPos[sp.pos].push(sp);
  }

  for (const pos of ['PT', 'DF', 'MC', 'DL']) {
    applyScarcityBonus(scored, byPos[pos]);
  }

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
    if (reqDf && nDf !== reqDf) continue;

    const avgScore = eleven.reduce((s, p) => s + p._finalScore, 0) / 11;

    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestEleven = eleven;
      bestFormation = fStr;
    }
  }

  const confident = bestEleven.filter((p) => p._starterRate >= 50 || p._recentAppearances >= 3).length;
  const confidence = bestEleven.length > 0 ? Math.round((confident / bestEleven.length) * 100) : 0;

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

    // ── Parallel fetch: starters, injuries, round info ──
    const [realStarterMap, injuryMap, roundInfo] = await Promise.all([
      buildRealStarterMap(50),
      getNextRoundInjuries(),
      getCurrentRound(),
    ]);

    // ── Odds-based difficulty ──
    let oddsMap = new Map<number, { homeDifficulty: number; awayDifficulty: number; homeTeam: string; awayTeam: string }>();
    try {
      const nextFixtureIds = await getFixtureIdsByRound(roundInfo.nextRound || '');
      if (nextFixtureIds.length > 0) {
        oddsMap = await getOddsDifficulty(nextFixtureIds);
      }
    } catch { /* odds are optional */ }

    // Build team name → odds difficulty lookup
    const teamOddsLookup = new Map<string, { difficulty: number; oddsSource: string }>();
    for (const [, odds] of oddsMap) {
      const homeNorm = normalizeName(odds.homeTeam);
      const awayNorm = normalizeName(odds.awayTeam);
      teamOddsLookup.set(homeNorm, { difficulty: odds.homeDifficulty, oddsSource: `vs ${odds.awayTeam} (casa)` });
      teamOddsLookup.set(awayNorm, { difficulty: odds.awayDifficulty, oddsSource: `vs ${odds.homeTeam} (fuera)` });
    }

    // ── Team Context (Motivation + Schedule Pressure) ──
    const teamsObj = Object.fromEntries(
      teams.map((teamName, index) => {
        const ref = allPlayers.find((p) => p.team === teamName);
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

    let teamContextByName = new Map<string, TeamContextSnapshot>();
    try {
      const remoteCtx = await buildTeamContextMap(teamsObj);
      for (const [rawId, team] of Object.entries(teamsObj)) {
        const snapshot = remoteCtx.get(Number(rawId));
        if (snapshot && (team as any).name) {
          teamContextByName.set((team as any).name, snapshot);
        }
      }
    } catch { /* context is optional */ }

    // ── Build result ──
    const result: Record<string, {
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
        subAppearances: number;
        advancedScore: number;
        status: string;
        blankStreak: number;
        starterRate: number;
        squadPresence: boolean;
        injuryAlert: { type: string; reason: string } | null;
      }>;
      formation: string;
      realFormation: string;
      coach: string;
      confidence: number;
      motivation: 'alta' | 'media' | 'baja';
      motivationNote: string;
      schedulePressure: 'alta' | 'media' | 'baja';
      schedulePressureNote: string;
      oddsDifficulty: number | null;
      oddsSource: string;
      position: number | null;
      points: number | null;
    }> = {};

    for (const team of teams) {
      const teamPlayers = allPlayers.filter((p) => p.team === team);
      const maxGames = Math.max(...teamPlayers.map((p) => p.gamesPlayed), 1);

      // ── Find team stats ──
      let foundTeamStats: TeamStats | undefined = undefined;
      for (const [realTeamName, ts] of realStarterMap) {
        if (normalizeName(realTeamName).includes(normalizeName(team)) || normalizeName(team).includes(normalizeName(realTeamName))) {
          foundTeamStats = ts;
          break;
        }
      }

      const teamCoach = foundTeamStats?.coach || 'Desconocido';

      // ── Recency-weighted formation ──
      let rawFormation = 'Desconocida';
      let preferredFormation: string | undefined = undefined;
      if (foundTeamStats && foundTeamStats.formations.size > 0) {
        const bestRaw = getRecencyWeightedFormation(foundTeamStats.formations, maxGames);
        if (bestRaw) {
          rawFormation = bestRaw;
          preferredFormation = normalizeFormation(bestRaw);
        }
      }

      // ── Team context ──
      const ctx = teamContextByName.get(team);
      const motivation = ctx?.motivation || 'media';
      const motivationNote = ctx?.motivationNote || '';
      const schedulePressure = ctx?.schedulePressure || 'baja';
      const schedulePressureNote = ctx?.schedulePressureNote || '';
      const position = ctx?.position ?? null;
      const points = ctx?.points ?? null;

      // ── Odds difficulty for this team ──
      let oddsDifficulty: number | null = null;
      let oddsSource = '';
      const teamNorm = normalizeName(team);
      for (const [oddsTeam, oddsInfo] of teamOddsLookup) {
        if (oddsTeam.includes(teamNorm) || teamNorm.includes(oddsTeam)) {
          oddsDifficulty = oddsInfo.difficulty;
          oddsSource = oddsInfo.oddsSource;
          break;
        }
      }

      // ── Rotation warning ──
      const rotationWarning = schedulePressure === 'alta';

      // ── Build scores with schedule pressure ──
      const scored = buildReconstructedScores(teamPlayers, maxGames, foundTeamStats, injuryMap, schedulePressure);

      // Only select from available (not injured/suspended in Biwenger AND not confirmed out by API)
      const available = teamPlayers.filter((p) => {
        if (p.status === 'injured' || p.status === 'suspended') return false;
        const inj = matchInjury(p.name, injuryMap);
        if (inj?.type === 'Missing Fixture') return false;
        return true;
      });

      if (available.length < 11) continue;

      const { eleven, formation, confidence } = selectEleven(available, scored, preferredFormation);

      result[team] = {
        fixture: teamPlayers[0]?.fixture || null,
        rotationWarning,
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
          injuryAlert: sp._injuryAlert ? { type: sp._injuryAlert.type, reason: sp._injuryAlert.reason } : null,
        })),
        formation,
        realFormation: rawFormation,
        coach: teamCoach,
        confidence,
        motivation,
        motivationNote,
        schedulePressure,
        schedulePressureNote,
        oddsDifficulty,
        oddsSource,
        position,
        points,
      };
    }

    return NextResponse.json({
      teams: result,
      round: roundInfo.lastCompleted ? `J${roundInfo.roundNumber}` : round,
      nextRound: roundInfo.nextRound,
      injuryCount: injuryMap.size,
      oddsFixtures: oddsMap.size,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error cargando datos de equipos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
