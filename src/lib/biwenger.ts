export const POS_MAP: Record<number, string> = { 1: 'PT', 2: 'DF', 3: 'MC', 4: 'DL' };
export const VALID_POSITIONS = new Set(['PT', 'DF', 'MC', 'DL']);
export const VALID_STATUSES = new Set(['fit', 'injured', 'doubtful', 'suspended']);
export const VALID_FLAGS = new Set(['normal', 'boost', 'risk', 'avoid', 'return']);

export type PlayerStatus = 'fit' | 'injured' | 'doubtful' | 'suspended';
export type PlayerFlag = 'normal' | 'boost' | 'risk' | 'avoid' | 'return';

export interface FixtureInfo {
  round: string;
  opponent: string;
  isHome: boolean;
  difficulty: number;
  start?: number | null;
}

export interface PlayerContextInfo {
  seasonRound: number;
  seasonShare: number;
  recentAppearances: number;
  appearanceStreak: number;
  recentBlankStreak: number;
  returnWindow: number;
  estimatedStartConfidence: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  workloadTier: 'baja' | 'media' | 'alta' | 'muy_alta';
  daysToFixture: number | null;
  teamPosition?: number | null;
  teamPoints?: number | null;
  teamMotivation?: 'alta' | 'media' | 'baja';
  teamMotivationNote?: string;
  nextMatchGapDays?: number | null;
  nextMatchCompetition?: string;
  schedulePressure?: 'alta' | 'media' | 'baja';
  schedulePressureNote?: string;
}

export interface PlayerLiveInfo {
  flag: string;
  confidence: number;
  sourceCount: number;
  freshnessMinutes: number;
  checkedAt: string;
  summary: string;
}

export interface Player {
  id: number;
  name: string;
  pos: string;
  price: number;
  avgPts: number;
  totalPts: number;
  gamesPlayed: number;
  status: PlayerStatus;
  team: string;
  lastFive: number[];
  flag?: PlayerFlag;
  fixture?: FixtureInfo | null;
  context?: PlayerContextInfo;
  live?: PlayerLiveInfo;
}

function cleanNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeBiwengerStatus(value: unknown): PlayerStatus {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';

  switch (status) {
    case 'injured':
      return 'injured';
    case 'doubt':
    case 'doubtful':
      return 'doubtful';
    case 'sanctioned':
    case 'suspended':
      return 'suspended';
    case 'discarded':
      return 'injured';
    case 'warned':
    case 'ok':
    case 'fit':
    default:
      return 'fit';
  }
}

export function normalizePlayerFlag(value: unknown): PlayerFlag {
  return typeof value === 'string' && VALID_FLAGS.has(value) ? (value as PlayerFlag) : 'normal';
}

export function normalizeLastFive(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 5)
    .map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? entry : 0))
    .filter((entry) => entry >= 0);
}

export function normalizeFixture(value: unknown): FixtureInfo | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const fixture = value as Record<string, unknown>;
  const opponent = typeof fixture.opponent === 'string' ? fixture.opponent.trim() : '';

  if (!opponent) {
    return null;
  }

  const round = typeof fixture.round === 'string' ? fixture.round.trim().slice(0, 30) : '';
  const difficulty = Math.max(1, Math.min(5, Math.round(cleanNumber(fixture.difficulty, 3))));
  const start = typeof fixture.start === 'number' && Number.isFinite(fixture.start) ? fixture.start : null;

  return {
    round,
    opponent: opponent.slice(0, 60),
    isHome: Boolean(fixture.isHome),
    difficulty,
    start,
  };
}

export function normalizePlayerContext(value: unknown): PlayerContextInfo | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const row = value as Record<string, unknown>;
  const seasonRound = Math.max(0, Math.round(cleanNumber(row.seasonRound)));
  const recentAppearances = Math.max(0, Math.round(cleanNumber(row.recentAppearances)));
  const appearanceStreak = Math.max(0, Math.round(cleanNumber(row.appearanceStreak)));
  const recentBlankStreak = Math.max(0, Math.round(cleanNumber(row.recentBlankStreak)));
  const returnWindow = Math.max(0, Math.round(cleanNumber(row.returnWindow)));
  const estimatedStartConfidence = Math.max(0, Math.min(100, Math.round(cleanNumber(row.estimatedStartConfidence))));
  const estimatedMinutesMin = Math.max(0, Math.round(cleanNumber(row.estimatedMinutesMin)));
  const estimatedMinutesMax = Math.max(0, Math.round(cleanNumber(row.estimatedMinutesMax)));
  const rawTier = typeof row.workloadTier === 'string' ? row.workloadTier : 'media';
  const workloadTier =
    rawTier === 'baja' || rawTier === 'alta' || rawTier === 'muy_alta' || rawTier === 'media' ? rawTier : 'media';
  const daysToFixture =
    typeof row.daysToFixture === 'number' && Number.isFinite(row.daysToFixture) ? Math.round(row.daysToFixture) : null;
  const teamPosition =
    typeof row.teamPosition === 'number' && Number.isFinite(row.teamPosition) ? Math.round(row.teamPosition) : null;
  const teamPoints =
    typeof row.teamPoints === 'number' && Number.isFinite(row.teamPoints) ? Math.round(row.teamPoints) : null;
  const teamMotivation =
    row.teamMotivation === 'alta' || row.teamMotivation === 'media' || row.teamMotivation === 'baja'
      ? row.teamMotivation
      : 'media';
  const nextMatchGapDays =
    typeof row.nextMatchGapDays === 'number' && Number.isFinite(row.nextMatchGapDays)
      ? Math.round(row.nextMatchGapDays)
      : null;
  const schedulePressure =
    row.schedulePressure === 'alta' || row.schedulePressure === 'media' || row.schedulePressure === 'baja'
      ? row.schedulePressure
      : 'baja';

  return {
    seasonRound,
    seasonShare: Math.max(0, Math.min(1.2, cleanNumber(row.seasonShare))),
    recentAppearances,
    appearanceStreak,
    recentBlankStreak,
    returnWindow,
    estimatedStartConfidence,
    estimatedMinutesMin,
    estimatedMinutesMax,
    workloadTier,
    daysToFixture,
    teamPosition,
    teamPoints,
    teamMotivation,
    teamMotivationNote: typeof row.teamMotivationNote === 'string' ? row.teamMotivationNote.slice(0, 160) : '',
    nextMatchGapDays,
    nextMatchCompetition: typeof row.nextMatchCompetition === 'string' ? row.nextMatchCompetition.slice(0, 80) : '',
    schedulePressure,
    schedulePressureNote: typeof row.schedulePressureNote === 'string' ? row.schedulePressureNote.slice(0, 160) : '',
  };
}

export function normalizePlayerLive(value: unknown): PlayerLiveInfo | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const row = value as Record<string, unknown>;
  const flag = typeof row.flag === 'string' ? row.flag.trim().slice(0, 24) : '';

  if (!flag) {
    return undefined;
  }

  return {
    flag,
    confidence: Math.max(0, Math.min(100, Math.round(cleanNumber(row.confidence)))),
    sourceCount: Math.max(0, Math.round(cleanNumber(row.sourceCount))),
    freshnessMinutes: Math.max(0, Math.round(cleanNumber(row.freshnessMinutes))),
    checkedAt: typeof row.checkedAt === 'string' ? row.checkedAt.slice(0, 50) : '',
    summary: typeof row.summary === 'string' ? row.summary.slice(0, 220) : '',
  };
}

export function normalizeStoredPlayer(value: unknown): Player | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const player = value as Record<string, unknown>;
  const name = typeof player.name === 'string' ? player.name.trim() : '';
  const pos = typeof player.pos === 'string' ? player.pos : '';

  if (!name || !VALID_POSITIONS.has(pos)) {
    return null;
  }

  const id = cleanNumber(player.id);
  const price = cleanNumber(player.price);
  const avgPts = cleanNumber(player.avgPts);
  const totalPts = cleanNumber(player.totalPts);
  const gamesPlayed = cleanNumber(player.gamesPlayed);
  const team = typeof player.team === 'string' ? player.team.trim().slice(0, 60) : '';

  return {
    id,
    name: name.slice(0, 60),
    pos,
    price,
    avgPts,
    totalPts,
    gamesPlayed,
    status: normalizeBiwengerStatus(player.status),
    team,
    lastFive: normalizeLastFive(player.lastFive),
    flag: normalizePlayerFlag(player.flag),
    fixture: normalizeFixture(player.fixture),
    context: normalizePlayerContext(player.context),
    live: normalizePlayerLive(player.live),
  };
}
