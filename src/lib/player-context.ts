import type { Player, PlayerContextInfo, PlayerFlag, PlayerLiveInfo, PlayerStatus } from '@/lib/biwenger';
import type { TeamContextSnapshot } from '@/lib/team-context';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function parseRoundNumber(round?: string) {
  if (!round) {
    return 0;
  }

  const match = /J(\d{1,2})/i.exec(round);
  return match ? Number(match[1]) : 0;
}

export function recentAppearancesFromLastFive(lastFive: number[]) {
  return lastFive.filter((value) => value > 0).length;
}

export function currentAppearanceStreakFromLastFive(lastFive: number[]) {
  let streak = 0;

  for (const value of lastFive.slice(0, 5)) {
    if (value > 0) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

export function currentBlankStreakFromLastFive(lastFive: number[]) {
  let streak = 0;

  for (const value of lastFive.slice(0, 5)) {
    if (value <= 0) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

function buildManagedReturnState(player: Pick<Player, 'avgPts' | 'gamesPlayed' | 'lastFive' | 'price' | 'status' | 'flag'>) {
  const streak = currentAppearanceStreakFromLastFive(player.lastFive || []);
  const recentWindow = (player.lastFive || []).slice(0, Math.max(1, Math.min(streak, 3)));
  const olderWindow = (player.lastFive || []).slice(streak);
  const olderZeros = olderWindow.filter((value) => value === 0).length;
  const recentAverage = recentWindow.length
    ? recentWindow.reduce((sum, value) => sum + value, 0) / recentWindow.length
    : 0;

  const likelyManagedReturn =
    player.status === 'fit' &&
    streak > 0 &&
    streak <= 3 &&
    player.gamesPlayed <= 7 &&
    olderZeros >= 2;

  return {
    streak,
    olderZeros,
    recentAverage,
    likelyManagedReturn,
    premiumQuality: player.avgPts >= 4.5 || recentAverage >= 5 || player.price >= 7000000,
  };
}

function estimatedMinutesBand(startConfidence: number, managedReturn: ReturnType<typeof buildManagedReturnState>) {
  let min = 0;
  let max = 30;

  if (startConfidence >= 84) {
    min = 75;
    max = 90;
  } else if (startConfidence >= 72) {
    min = 65;
    max = 85;
  } else if (startConfidence >= 58) {
    min = 45;
    max = 75;
  } else if (startConfidence >= 42) {
    min = 25;
    max = 60;
  }

  if (managedReturn.likelyManagedReturn) {
    max = Math.min(max, managedReturn.streak === 1 ? 35 : managedReturn.streak === 2 ? 55 : 70);
    min = Math.min(min, Math.max(10, max - 25));
  }

  return {
    min,
    max,
  };
}

function workloadTier(gamesPlayed: number, seasonShare: number): PlayerContextInfo['workloadTier'] {
  if (gamesPlayed >= 30 || seasonShare >= 0.85) {
    return 'muy_alta';
  }

  if (gamesPlayed >= 23 || seasonShare >= 0.65) {
    return 'alta';
  }

  if (gamesPlayed >= 10 || seasonShare >= 0.35) {
    return 'media';
  }

  return 'baja';
}

function seasonShare(gamesPlayed: number, seasonRound: number) {
  if (seasonRound <= 0) {
    return 0;
  }

  return clamp(gamesPlayed / seasonRound, 0, 1.2);
}

function startConfidence(player: Player, seasonRound: number, nowMs: number) {
  if (player.status === 'injured' || player.status === 'suspended') {
    return 0;
  }

  const recentAppearances = recentAppearancesFromLastFive(player.lastFive || []);
  const appearanceStreak = currentAppearanceStreakFromLastFive(player.lastFive || []);
  const recentBlankStreak = currentBlankStreakFromLastFive(player.lastFive || []);
  const share = seasonShare(player.gamesPlayed || 0, seasonRound);
  const managedReturn = buildManagedReturnState(player);
  let score = 60;

  score += recentAppearances * 6;
  score += appearanceStreak * 4;
  score -= recentBlankStreak * (player.pos === 'PT' ? 12 : 9);
  score += share * 16;

  if (player.gamesPlayed <= 3) {
    score -= 12;
  } else if (player.gamesPlayed <= 7) {
    score -= 5;
  }

  if (player.flag === 'boost') {
    score += 5;
  }
  if (player.flag === 'risk') {
    score -= 12;
  }
  if (player.flag === 'avoid') {
    score -= 18;
  }
  if (player.flag === 'return') {
    score -= 4;
  }

  if (player.status === 'doubtful') {
    score -= 24;
  }

  if (managedReturn.likelyManagedReturn) {
    score -= managedReturn.streak === 1 ? 22 : managedReturn.streak === 2 ? 14 : 8;
    if (managedReturn.premiumQuality) {
      score += 6;
    }
  }

  if (player.fixture?.start) {
    const daysToFixture = Math.round((player.fixture.start * 1000 - nowMs) / 86400000);
    if (daysToFixture <= 1 && (player.flag === 'risk' || player.status === 'doubtful')) {
      score -= 4;
    }
  }

  return clamp(Math.round(score), 0, 96);
}

export function buildPlayerContextInfo(
  player: Player,
  options?: {
    seasonRound?: number;
    nowMs?: number;
    teamContext?: TeamContextSnapshot;
  }
): PlayerContextInfo {
  const nowMs = options?.nowMs ?? Date.now();
  const seasonRound = options?.seasonRound || parseRoundNumber(player.fixture?.round) || 0;
  const recentAppearances = recentAppearancesFromLastFive(player.lastFive || []);
  const appearanceStreak = currentAppearanceStreakFromLastFive(player.lastFive || []);
  const recentBlankStreak = currentBlankStreakFromLastFive(player.lastFive || []);
  const share = seasonShare(player.gamesPlayed || 0, seasonRound);
  const managedReturn = buildManagedReturnState(player);
  const estimatedStartConfidence = startConfidence(player, seasonRound, nowMs);
  const minutes = estimatedMinutesBand(estimatedStartConfidence, managedReturn);
  const daysToFixture =
    typeof player.fixture?.start === 'number' && Number.isFinite(player.fixture.start)
      ? Math.round((player.fixture.start * 1000 - nowMs) / 86400000)
      : null;
  const teamContext = options?.teamContext;

  return {
    seasonRound,
    seasonShare: Number(share.toFixed(2)),
    recentAppearances,
    appearanceStreak,
    recentBlankStreak,
    returnWindow: managedReturn.likelyManagedReturn || player.flag === 'return' ? appearanceStreak : 0,
    estimatedStartConfidence,
    estimatedMinutesMin: minutes.min,
    estimatedMinutesMax: minutes.max,
    workloadTier: workloadTier(player.gamesPlayed || 0, share),
    daysToFixture,
    teamPosition: teamContext?.position ?? null,
    teamPoints: teamContext?.points ?? null,
    teamMotivation: teamContext?.motivation || 'media',
    teamMotivationNote: teamContext?.motivationNote || '',
    nextMatchGapDays: teamContext?.nextMatchGapDays ?? null,
    nextMatchCompetition: teamContext?.nextMatchCompetition || '',
    schedulePressure: teamContext?.schedulePressure || 'baja',
    schedulePressureNote: teamContext?.schedulePressureNote || '',
  };
}

export function buildPlayerLiveInfo(signal?: {
  flag?: string;
  confidence?: number;
  sourceCount?: number;
  freshnessMinutes?: number;
  checkedAt?: string;
  summary?: string;
}) {
  if (!signal?.flag) {
    return null;
  }

  return {
    flag: signal.flag,
    confidence: clamp(Math.round(Number(signal.confidence || 0)), 0, 100),
    sourceCount: Math.max(0, Math.round(Number(signal.sourceCount || 0))),
    freshnessMinutes: Math.max(0, Math.round(Number(signal.freshnessMinutes || 0))),
    checkedAt: typeof signal.checkedAt === 'string' ? signal.checkedAt : '',
  } as PlayerLiveInfo;
}

export function hydratePlayerContext(
  player: Player,
  options?: {
    seasonRound?: number;
    nowMs?: number;
    teamContext?: TeamContextSnapshot;
    signal?: {
      flag?: string;
      confidence?: number;
      sourceCount?: number;
      freshnessMinutes?: number;
      checkedAt?: string;
      summary?: string;
    };
  }
) {
  return {
    ...player,
    context: buildPlayerContextInfo(player, {
      seasonRound: options?.seasonRound,
      nowMs: options?.nowMs,
      teamContext: options?.teamContext,
    }),
    live: buildPlayerLiveInfo(options?.signal) || undefined,
  };
}
