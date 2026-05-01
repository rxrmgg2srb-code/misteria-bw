'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeStoredPlayer } from '@/lib/biwenger';
import type { Player, PlayerFlag } from '@/lib/biwenger';

const POS_LABEL: Record<string, string> = { PT: 'POR', DF: 'DEF', MC: 'CEN', DL: 'DEL' };
const POS_COLOR: Record<string, string> = { PT: '#f59e0b', DF: '#60a5fa', MC: '#4ade80', DL: '#f87171' };
const POS_ORDER = ['PT', 'DF', 'MC', 'DL'];

const FLAGS: Record<string, { label: string; color: string; border: string; dot: string }> = {
  normal: { label: 'Normal', color: 'transparent', border: 'transparent', dot: '#4b5563' },
  boost: { label: 'Racha', color: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.40)', dot: '#22c55e' },
  risk: { label: 'Rotacion', color: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.40)', dot: '#f97316' },
  avoid: { label: 'Evitar', color: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.40)', dot: '#ef4444' },
  return: { label: 'Vuelve', color: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.40)', dot: '#60a5fa' },
};

const FLAG_CYCLE: PlayerFlag[] = ['normal', 'boost', 'risk', 'avoid', 'return'];

const STATUS_COLOR: Record<string, string> = {
  fit: '#4ade80',
  injured: '#f87171',
  doubtful: '#fbbf24',
  suspended: '#f87171',
};

const STATUS_LABEL: Record<string, string> = {
  fit: 'OK',
  injured: 'Lesion',
  doubtful: 'Duda',
  suspended: 'Sancion',
};

interface Profile {
  id: string;
  name: string;
  squad: Player[];
  updatedAt: number;
}

interface PlayersResponse {
  players?: Player[];
  meta?: {
    round?: string;
    feedRound?: string;
    fixtureRound?: string;
    fixtureSource?: string;
    fixturesReady?: number;
  };
}

type StrategyMode = 'conservador' | 'equilibrado' | 'agresivo';

const STRATEGY_OPTIONS: Array<{
  id: StrategyMode;
  label: string;
  note: string;
}> = [
  { id: 'conservador', label: 'Conservador', note: 'Minutos y suelo' },
  { id: 'equilibrado', label: 'Equilibrado', note: 'Balance real' },
  { id: 'agresivo', label: 'Agresivo', note: 'Techo y diferencial' },
];

interface ActionItem {
  tipo: string;
  titulo: string;
  detalle: string;
  impacto: string;
  confianza: number;
  prioridad: 'alta' | 'media' | 'baja';
}

interface RadarItem {
  label: string;
  score: number;
  note: string;
}

interface DecisionItem {
  nombre: string;
  decision: string;
  confianza: number;
  motivo: string;
}

interface TransferItem {
  vender: string;
  comprar: string;
  posicion: string;
  precio_estimado: string;
  razon: string;
}

interface LiveSignalItem {
  player: string;
  flag: string;
  confidence: number;
  sourceCount: number;
  freshnessMinutes: number;
  summary: string;
  sources: string[];
  urls: string[];
}

interface LiveCheck {
  checkedAt: string;
  sourceCount: number;
  sources: string[];
  newsCount: number;
  signals: LiveSignalItem[];
}

type MonitorSource = 'manual' | 'analysis' | 'auto';

interface MonitorEvent {
  id: string;
  at: string;
  player: string;
  title: string;
  detail: string;
  level: 'high' | 'medium' | 'low';
  source: MonitorSource;
  urls: string[];
  sources: string[];
}

interface AnalysisResult {
  formacion: string;
  once: string[];
  capitan: string;
  vicecapitan: string;
  banquillo: string[];
  fichajes: TransferItem[];
  razonamiento: string;
  alertas: string[];
  puntuacion_estimada: number;
  resumen?: {
    titular: string;
    plan: string;
    confianza_general: number;
  };
  acciones_hoy?: ActionItem[];
  radar?: RadarItem[];
  decisiones_jugadores?: DecisionItem[];
  argumentos_once?: DecisionItem[];
  argumentos_banquillo?: DecisionItem[];
  liveCheck?: LiveCheck;
  adjustedSquad?: Player[];
  debugScores?: {
    name: string;
    pos: string;
    total: number;
    reliable: number;
    recent: number;
    fixture: number;
    flags: number;
    reliability: number;
    availability: number;
    workload: number;
    live: number;
    managed: number;
    bounceBack: number;
    momentum: number;
    motivation: number;
    consistency: number;
    zeroRate: number;
    ceiling: number;
    priceExp: number;
    schedule: number;
    trendSlope: number;
    recencyW: number;
    scarcity: number;
    stack: number;
    posRelative: number;
    clutch: number;
    fatigue: number;
    marginal: number;
    timing: number;
    diversification: number;
    cleanSheet: number;
    seasonPhase: number;
    meanReversion: number;
    derby: number;
    status: string;
    lastFive: number[];
    role: 'starter' | 'bench' | 'out';
  }[];
}

interface ToneStyle {
  text: string;
  bg: string;
  border: string;
}

interface ReviewItem {
  player: Player;
  score: number;
  title: string;
  detail: string;
  meta?: string;
  tone: ToneStyle;
}

function normalizeUiPlayer(value: unknown): Player | null {
  return normalizeStoredPlayer(value);
}

function normalizeProfile(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : Date.now();
  const squad = Array.isArray(row.squad)
    ? row.squad.map(normalizeUiPlayer).filter((player): player is Player => player !== null)
    : [];

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    squad,
    updatedAt,
  };
}

function mergeProfilesWithCatalog(profiles: Profile[], catalog: Player[]) {
  const playersById = new Map(catalog.map((player) => [player.id, player]));

  return profiles.map((profile) => ({
    ...profile,
    squad: profile.squad
      .map((player) => {
        const normalized = normalizeUiPlayer(player);
        if (!normalized) {
          return null;
        }

        const fresh = playersById.get(normalized.id);
        return fresh ? { ...fresh, flag: normalized.flag || 'normal' } : normalized;
      })
      .filter((player): player is Player => player !== null),
  }));
}

function fmtMoney(value: number) {
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`;
  }
  if (value >= 1e3) {
    return `${Math.round(value / 1e3)}K`;
  }
  return `${value}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function confidenceTone(value: number) {
  if (value >= 80) {
    return { text: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)' };
  }
  if (value >= 65) {
    return { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.28)' };
  }
  return { text: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.28)' };
}

function liveFlagLabel(flag: string) {
  if (flag === 'injured') return 'Baja';
  if (flag === 'doubtful') return 'Duda';
  if (flag === 'risk') return 'Rotacion';
  if (flag === 'fit') return 'Disponible';
  if (flag === 'boost') return 'Impulso';
  return 'Senal';
}

function liveFlagTone(flag: string) {
  if (flag === 'injured') return { text: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.28)' };
  if (flag === 'doubtful' || flag === 'risk') return { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.24)' };
  if (flag === 'fit' || flag === 'boost') return { text: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.24)' };
  return confidenceTone(50);
}

function neutralTone(): ToneStyle {
  return { text: '#cbd5e1', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)' };
}

function motivationTone(level?: string) {
  if (level === 'alta') {
    return { text: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.26)' };
  }
  if (level === 'baja') {
    return { text: '#cbd5e1', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.22)' };
  }
  return neutralTone();
}

function startConfidenceTone(value: number) {
  if (value >= 78) {
    return { text: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.26)' };
  }
  if (value >= 60) {
    return { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.24)' };
  }
  return { text: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.24)' };
}

function minutesTone(min: number, max: number) {
  if (max <= 55 || min <= 35) {
    return { text: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.24)' };
  }
  if (max <= 75) {
    return { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.24)' };
  }
  return neutralTone();
}

function schedulePressureTone(level?: string) {
  if (level === 'alta') {
    return { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.26)' };
  }
  if (level === 'media') {
    return { text: '#fdba74', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.22)' };
  }
  return { text: '#9ca3af', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)' };
}

function schedulePressureMeta(player?: Player | null) {
  if (!player) {
    return null;
  }

  const level = player.context?.schedulePressure || 'baja';
  if (level === 'baja') {
    return null;
  }

  const competition = (player.context?.nextMatchCompetition || '').toLowerCase();
  const isEurope =
    competition.includes('champions') ||
    competition.includes('uefa') ||
    competition.includes('europa league') ||
    competition.includes('conference');

  return {
    level,
    shortLabel: isEurope ? 'Rot. Europa' : 'Rot. semana',
    fullLabel: isEurope ? 'Posible rotacion por Europa' : 'Posible rotacion entre semana',
    title:
      player.context?.schedulePressureNote ||
      (isEurope
        ? 'El equipo llega con partido europeo cercano.'
        : 'El equipo llega con calendario apretado entre partidos.'),
  };
}

function SchedulePressureBadge({
  player,
  compact = false,
}: {
  player?: Player | null;
  compact?: boolean;
}) {
  const meta = schedulePressureMeta(player);

  if (!meta) {
    return null;
  }

  const tone = schedulePressureTone(meta.level);

  return (
    <span
      title={meta.title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: compact ? '3px 7px' : '4px 8px',
        borderRadius: 999,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.text,
        fontSize: compact ? 10 : 11,
        fontWeight: 800,
        lineHeight: 1.1,
      }}
    >
      {compact ? meta.shortLabel : meta.fullLabel}
    </span>
  );
}

function isRiskFlag(flag: string) {
  return flag === 'injured' || flag === 'doubtful' || flag === 'risk';
}

function formatFreshness(minutes: number) {
  if (minutes <= 0) {
    return 'ahora';
  }
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  return `hace ${hours} h`;
}

function monitorSourceLabel(source: MonitorSource) {
  if (source === 'analysis') return 'analisis';
  if (source === 'auto') return 'monitor';
  return 'manual';
}

function monitorEventTone(level: MonitorEvent['level']) {
  if (level === 'high') {
    return { text: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.24)' };
  }
  if (level === 'medium') {
    return { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.24)' };
  }
  return { text: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.24)' };
}

function sourceLinkLabel(index: number, sources?: string[]) {
  return sources?.[index] || `Fuente ${index + 1}`;
}

function strategyLabel(mode: StrategyMode) {
  return STRATEGY_OPTIONS.find((item) => item.id === mode)?.label || 'Equilibrado';
}

function SourceLinks({ urls, sources }: { urls?: string[]; sources?: string[] }) {
  if (!urls || urls.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {urls.slice(0, 3).map((url, index) => (
        <a
          key={`${url}-${index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: '#cbd5e1',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          {sourceLinkLabel(index, sources)}
        </a>
      ))}
    </div>
  );
}

function buildLiveCheckFromPayload(payload: any): LiveCheck | null {
  if (payload?.liveCheck) {
    return {
      checkedAt: payload.liveCheck.checkedAt || new Date().toISOString(),
      sourceCount: Array.isArray(payload.liveCheck.sources)
        ? payload.liveCheck.sources.length
        : Number(payload.liveCheck.sourceCount || 0),
      sources: Array.isArray(payload.liveCheck.sources) ? payload.liveCheck.sources : [],
      newsCount: Number(payload.liveCheck.newsCount || 0),
      signals: Array.isArray(payload.liveCheck.signals) ? payload.liveCheck.signals : [],
    };
  }

  if (payload?.scrapedAt || payload?.signals || payload?.sources || payload?.news) {
    return {
      checkedAt: payload.scrapedAt || new Date().toISOString(),
      sourceCount: Array.isArray(payload.sources) ? payload.sources.length : 0,
      sources: Array.isArray(payload.sources) ? payload.sources : [],
      newsCount: Array.isArray(payload.news) ? payload.news.length : 0,
      signals: Array.isArray(payload.signals) ? payload.signals : [],
    };
  }

  return null;
}

function buildMonitorEvents(params: {
  prevCheck: LiveCheck | null;
  nextCheck: LiveCheck | null;
  prevSquad: Player[];
  nextSquad: Player[];
  source: MonitorSource;
}) {
  const { prevCheck, nextCheck, prevSquad, nextSquad, source } = params;

  if (!nextCheck) {
    return [] as MonitorEvent[];
  }

  const prevSignals = new Map((prevCheck?.signals || []).map((signal) => [signal.player, signal]));
  const nextSignals = new Map((nextCheck.signals || []).map((signal) => [signal.player, signal]));
  const prevPlayers = new Map(prevSquad.map((player) => [player.name, player]));
  const nextPlayers = new Map(nextSquad.map((player) => [player.name, player]));
  const names = [...new Set([...nextPlayers.keys(), ...prevPlayers.keys(), ...nextSignals.keys(), ...prevSignals.keys()])];
  const events: MonitorEvent[] = [];

  for (const playerName of names) {
    const prevPlayer = prevPlayers.get(playerName);
    const nextPlayer = nextPlayers.get(playerName);
    const prevSignal = prevSignals.get(playerName);
    const nextSignal = nextSignals.get(playerName);

    if (!prevCheck && nextSignal && isRiskFlag(nextSignal.flag)) {
      const level = nextSignal.flag === 'injured' ? 'high' : 'medium';
      events.push({
        id: `${nextCheck.checkedAt}-${playerName}-initial`,
        at: nextCheck.checkedAt,
        player: playerName,
        title: `${playerName} entra con ${liveFlagLabel(nextSignal.flag).toLowerCase()}`,
        detail: `${monitorSourceLabel(source)} · ${nextSignal.confidence}% · ${nextSignal.summary}`,
        level,
        source,
        urls: nextSignal.urls || [],
        sources: nextSignal.sources || [],
      });
      continue;
    }

    if (prevPlayer && nextPlayer && prevPlayer.status !== nextPlayer.status) {
      const level =
        nextPlayer.status === 'injured' || nextPlayer.status === 'suspended'
          ? 'high'
          : nextPlayer.status === 'doubtful'
            ? 'medium'
            : 'low';

      events.push({
        id: `${nextCheck.checkedAt}-${playerName}-status`,
        at: nextCheck.checkedAt,
        player: playerName,
        title: `${playerName} pasa a ${STATUS_LABEL[nextPlayer.status].toLowerCase()}`,
        detail: `${monitorSourceLabel(source)} · ${nextSignal?.confidence || 0}% · ${nextSignal?.summary || 'estado ajustado por senales en vivo'}`,
        level,
        source,
        urls: nextSignal?.urls || [],
        sources: nextSignal?.sources || [],
      });
      continue;
    }

    if (nextSignal && (!prevSignal || prevSignal.flag !== nextSignal.flag)) {
      const level = nextSignal.flag === 'injured' ? 'high' : nextSignal.flag === 'doubtful' || nextSignal.flag === 'risk' ? 'medium' : 'low';
      events.push({
        id: `${nextCheck.checkedAt}-${playerName}-signal`,
        at: nextCheck.checkedAt,
        player: playerName,
        title: `${playerName} pasa a ${liveFlagLabel(nextSignal.flag).toLowerCase()}`,
        detail: `${monitorSourceLabel(source)} · ${nextSignal.confidence}% · ${nextSignal.summary}`,
        level,
        source,
        urls: nextSignal.urls || [],
        sources: nextSignal.sources || [],
      });
    }
  }

  return events.slice(0, 10);
}

function MiniBar({ value }: { value: number }) {
  const pct = Math.min((value / 12) * 100, 100);
  const color = value >= 7 ? '#4ade80' : value >= 4 ? '#fbbf24' : value > 0 ? '#f87171' : '#1f2937';

  return (
    <div title={`${value} pts`} style={{ width: 11, height: 26, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: '100%', height: `${Math.max(pct, value > 0 ? 8 : 0)}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function Pitch({ formation, eleven, captain }: { formation: string; eleven: string[]; captain: string }) {
  const rows = [1, ...formation.split('-').map(Number)];
  const width = 320;
  const height = 360;
  const rowHeight = height / (rows.length + 1);
  const points: { name: string; x: number; y: number; captain: boolean }[] = [];
  let index = 0;

  rows.forEach((count, rowIndex) => {
    const y = height - rowHeight * (rowIndex + 0.7);
    for (let i = 0; i < count; i += 1) {
      if (index < eleven.length) {
        const name = eleven[index];
        points.push({
          name,
          x: (width / (count + 1)) * (i + 1),
          y,
          captain: name === captain,
        });
        index += 1;
      }
    }
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block', maxHeight: 330, borderRadius: 14 }}>
      <rect width={width} height={height} rx={14} fill="#14532d" />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.15)" />
      <circle cx={width / 2} cy={height / 2} r={30} fill="none" stroke="rgba(255,255,255,0.15)" />
      <rect x={width * 0.2} y={8} width={width * 0.6} height={52} fill="none" stroke="rgba(255,255,255,0.12)" rx={2} />
      <rect x={width * 0.2} y={height - 60} width={width * 0.6} height={52} fill="none" stroke="rgba(255,255,255,0.12)" rx={2} />
      {points.map((point) => (
        <g key={point.name}>
          <svg x={point.x - 16} y={point.y - 20} width={32} height={32} viewBox="0 0 24 24" fill={point.captain ? '#f59e0b' : '#f3f4f6'} stroke={point.captain ? '#b45309' : '#9ca3af'} strokeWidth={1}>
            <path d="M20.38 3.46 16 2a8 8 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
          </svg>
          <text x={point.x} y={point.y + 22} textAnchor="middle" fontSize={7} fontWeight="800" fill="#f3f4f6" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}>
            {point.name.split(' ').slice(-1)[0].substring(0, 9)}
          </text>
          {point.captain && (
            <>
              <circle cx={point.x + 10} cy={point.y - 12} r={7} fill="#ef4444" stroke="#7f1d1d" strokeWidth={1} />
              <text x={point.x + 10} y={point.y - 9} textAnchor="middle" fontSize={7} fontWeight="800" fill="white">C</text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

function ProfileSelector({
  profiles,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  profiles: Profile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) {
      inputRef.current?.focus();
    }
  }, [creating]);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {profiles.map((profile) => (
        <div key={profile.id} style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => onSelect(profile.id)} style={{ padding: '8px 14px', borderRadius: '9px 0 0 9px', border: '1px solid', borderRight: 'none', borderColor: activeId === profile.id ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.12)', background: activeId === profile.id ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', color: activeId === profile.id ? '#4ade80' : '#d1d5db', cursor: 'pointer', fontSize: 13, fontWeight: activeId === profile.id ? 700 : 500 }}>
            {profile.name}
            <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280' }}>{profile.squad.length}j</span>
          </button>
          <button onClick={() => { if (confirm(`Borrar "${profile.name}"?`)) onDelete(profile.id); }} style={{ padding: '8px 9px', borderRadius: '0 9px 9px 0', border: '1px solid', borderColor: activeId === profile.id ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>
            x
          </button>
        </div>
      ))}

      {profiles.length < 4 && (
        creating ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && newName.trim()) {
                  onCreate(newName.trim());
                  setNewName('');
                  setCreating(false);
                }
                if (event.key === 'Escape') {
                  setCreating(false);
                }
              }}
              placeholder="Nombre de la liga"
              style={{ width: 170, padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(34,197,94,0.45)', background: 'rgba(34,197,94,0.08)', color: 'white', fontSize: 13, outline: 'none' }}
            />
            <button onClick={() => setCreating(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}>x</button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{ padding: '8px 12px', borderRadius: 9, border: '1px dashed rgba(255,255,255,0.18)', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>
            + Nueva plantilla
          </button>
        )
      )}
    </div>
  );
}

function PlayerRow({
  player,
  onRemove,
  onFlag,
}: {
  player: Player;
  onRemove: () => void;
  onFlag: (flag: PlayerFlag) => void;
}) {
  const flag = FLAGS[player.flag || 'normal'];
  const nextFlag = () => {
    const currentIndex = FLAG_CYCLE.indexOf(player.flag || 'normal');
    onFlag(FLAG_CYCLE[(currentIndex + 1) % FLAG_CYCLE.length]);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${player.flag !== 'normal' ? flag.border : 'rgba(255,255,255,0.07)'}`, borderLeft: `3px solid ${flag.dot}`, marginBottom: 6 }}>
      <span style={{ width: 30, textAlign: 'center', fontSize: 10, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: `${POS_COLOR[player.pos]}22`, color: POS_COLOR[player.pos], flexShrink: 0 }}>
        {POS_LABEL[player.pos]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.name}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: '#6b7280' }}>
          <span>{player.team}</span>
          {player.fixture && (
            <span style={{ color: player.fixture.difficulty <= 2 ? '#86efac' : player.fixture.difficulty >= 4 ? '#fbbf24' : '#9ca3af' }}>
              {player.fixture.opponent} · {player.fixture.isHome ? 'Casa' : 'Fuera'} · D{player.fixture.difficulty}
            </span>
          )}
        </div>
        <div style={{ marginTop: 6 }}>
          <SchedulePressureBadge player={player} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {player.lastFive.length ? player.lastFive.map((value, index) => <MiniBar key={`${player.id}-${index}`} value={value} />) : <span style={{ color: '#4b5563' }}>-</span>}
      </div>
      <div style={{ minWidth: 40, textAlign: 'right' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#4ade80' }}>{player.avgPts}</div>
        <div style={{ fontSize: 10, color: '#4b5563' }}>{fmtMoney(player.price)}</div>
      </div>
      {player.status !== 'fit' && <span style={{ fontSize: 11, color: STATUS_COLOR[player.status], flexShrink: 0 }}>{STATUS_LABEL[player.status]}</span>}
      <button onClick={nextFlag} title={flag.label} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${flag.dot}33`, background: flag.color || 'rgba(255,255,255,0.05)', color: flag.dot, fontWeight: 800, cursor: 'pointer' }}>
        {player.flag === 'boost' ? 'R' : player.flag === 'risk' ? '!' : player.flag === 'avoid' ? 'X' : player.flag === 'return' ? '+' : '.'}
      </button>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16 }}>x</button>
    </div>
  );
}

export default function AnalyzerPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [autoRound, setAutoRound] = useState('');
  const [feedRound, setFeedRound] = useState('');
  const [fixtureRound, setFixtureRound] = useState('');
  const [fixtureSource, setFixtureSource] = useState('');
  const [strategy, setStrategy] = useState<StrategyMode>('equilibrado');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState('');
  const [liveCheck, setLiveCheck] = useState<LiveCheck | null>(null);
  const [monitorFeed, setMonitorFeed] = useState<Record<string, MonitorEvent[]>>({});
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [monitorIntervalMinutes, setMonitorIntervalMinutes] = useState(2);
  const [view, setView] = useState<'builder' | 'result'>('builder');
  const searchRef = useRef<HTMLInputElement>(null);

  const activeProfile = profiles.find((profile) => profile.id === activeId) || null;
  const squad = activeProfile?.squad || [];
  const currentLiveCheck = liveCheck || result?.liveCheck || null;
  const monitorEvents = activeId ? monitorFeed[activeId] || [] : [];

  const saveProfiles = useCallback((updated: Profile[]) => {
    setProfiles(updated);
    localStorage.setItem('bwia_profiles_v2', JSON.stringify(updated));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bwia_profiles_v2');
      if (saved) {
        const parsedRaw = JSON.parse(saved);
        const parsed = Array.isArray(parsedRaw)
          ? parsedRaw.map(normalizeProfile).filter((profile): profile is Profile => profile !== null)
          : [];

        setProfiles(parsed);
        localStorage.setItem('bwia_profiles_v2', JSON.stringify(parsed));

        if (parsed.length > 0) {
          setActiveId(parsed[0].id);
        }
      }

      const savedMonitorFeed = localStorage.getItem('bwia_monitor_feed_v1');
      if (savedMonitorFeed) {
        const parsedFeed = JSON.parse(savedMonitorFeed);
        if (parsedFeed && typeof parsedFeed === 'object') {
          setMonitorFeed(parsedFeed);
        }
      }

      const savedMonitorPrefs = localStorage.getItem('bwia_monitor_prefs_v1');
      if (savedMonitorPrefs) {
        const parsedPrefs = JSON.parse(savedMonitorPrefs);
        if (parsedPrefs && typeof parsedPrefs === 'object') {
          setMonitorEnabled(Boolean(parsedPrefs.enabled));
          setMonitorIntervalMinutes(
            parsedPrefs.intervalMinutes === 1 || parsedPrefs.intervalMinutes === 2 || parsedPrefs.intervalMinutes === 5
              ? parsedPrefs.intervalMinutes
              : 2
          );
        }
      }

      const savedStrategy = localStorage.getItem('bwia_strategy_v1');
      if (savedStrategy === 'conservador' || savedStrategy === 'agresivo' || savedStrategy === 'equilibrado') {
        setStrategy(savedStrategy);
      }
    } catch {}

    fetch('/api/players')
      .then((res) => res.json())
      .then((data: PlayersResponse) => {
        const catalog = Array.isArray(data.players)
          ? data.players.map(normalizeUiPlayer).filter((player): player is Player => player !== null)
          : [];

        setAllPlayers(catalog);
        setAutoRound(data.meta?.round || '');
        setFeedRound(data.meta?.feedRound || '');
        setFixtureRound(data.meta?.fixtureRound || data.meta?.round || '');
        setFixtureSource(data.meta?.fixtureSource || '');

        if (catalog.length > 0) {
          setProfiles((current) => {
            const merged = mergeProfilesWithCatalog(current, catalog);
            localStorage.setItem('bwia_profiles_v2', JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPlayers(false));
  }, []);

  useEffect(() => {
    setResult(null);
    setLiveCheck(null);
    setScrapeMsg('');
  }, [activeId]);

  const updateSquad = useCallback((newSquad: Player[]) => {
    if (!activeId) {
      return;
    }

    saveProfiles(
      profiles.map((profile) =>
        profile.id === activeId
          ? { ...profile, squad: newSquad, updatedAt: Date.now() }
          : profile
      )
    );
  }, [activeId, profiles, saveProfiles]);

  const pushMonitorEvents = useCallback((profileId: string | null, events: MonitorEvent[]) => {
    if (!profileId || events.length === 0) {
      return;
    }

    setMonitorFeed((current) => {
      const next = {
        ...current,
        [profileId]: [...events, ...(current[profileId] || [])].slice(0, 30),
      };
      localStorage.setItem('bwia_monitor_feed_v1', JSON.stringify(next));
      return next;
    });
  }, []);

  const saveMonitorPrefs = useCallback((enabled: boolean, intervalMinutes: number) => {
    const nextPrefs = { enabled, intervalMinutes };
    setMonitorEnabled(enabled);
    setMonitorIntervalMinutes(intervalMinutes);
    localStorage.setItem('bwia_monitor_prefs_v1', JSON.stringify(nextPrefs));
  }, []);

  const selectStrategy = useCallback((next: StrategyMode) => {
    setStrategy(next);
    localStorage.setItem('bwia_strategy_v1', next);
  }, []);

  const createProfile = (name: string) => {
    const id = `profile_${Date.now()}`;
    const updated = [...profiles, { id, name, squad: [], updatedAt: Date.now() }];
    saveProfiles(updated);
    setActiveId(id);
  };

  const deleteProfile = (id: string) => {
    const updated = profiles.filter((profile) => profile.id !== id);
    saveProfiles(updated);
    setActiveId(updated[0]?.id || null);
    setMonitorFeed((current) => {
      const next = { ...current };
      delete next[id];
      localStorage.setItem('bwia_monitor_feed_v1', JSON.stringify(next));
      return next;
    });
  };

  const addPlayer = (player: Player) => {
    if (squad.some((item) => item.id === player.id)) {
      return;
    }
    updateSquad([...squad, { ...player, flag: 'normal' }]);
    setSearchQuery('');
    searchRef.current?.focus();
  };

  const removePlayer = (id: number) => updateSquad(squad.filter((player) => player.id !== id));
  const setFlag = (id: number, flag: PlayerFlag) =>
    updateSquad(squad.map((player) => (player.id === id ? { ...player, flag } : player)));
  const clearSquad = () => { if (confirm('Vaciar toda la plantilla?')) updateSquad([]); };

  const filteredPlayers = searchQuery.length >= 2
    ? allPlayers
        .filter((player) =>
          (posFilter === 'ALL' || player.pos === posFilter) &&
          !squad.some((picked) => picked.id === player.id) &&
          (player.name.toLowerCase().includes(searchQuery.toLowerCase()) || player.team.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .sort((a, b) => b.avgPts - a.avgPts)
        .slice(0, 8)
    : [];

  const grouped: Record<string, Player[]> = { PT: [], DF: [], MC: [], DL: [] };
  squad.forEach((player) => {
    if (grouped[player.pos]) {
      grouped[player.pos].push(player);
    }
  });

  const canAnalyze = squad.length >= 11;
  const confidence = clamp(result?.resumen?.confianza_general || 0, 0, 100);
  const confidenceColors = confidenceTone(confidence);
  const playersWithFixture = squad.filter((player) => player.fixture).length;
  const homeCount = squad.filter((player) => player.fixture?.isHome).length;
  const awayCount = squad.filter((player) => player.fixture && !player.fixture.isHome).length;
  const riskSignals = (currentLiveCheck?.signals || [])
    .filter((signal) => isRiskFlag(signal.flag))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
  const recentMonitorEvents = monitorEvents.slice(0, 6);

  const applyLivePayload = useCallback((payload: any, source: MonitorSource, baseSquad: Player[]) => {
    const nextLiveCheck = buildLiveCheckFromPayload(payload);
    const nextSquad = Array.isArray(payload.updatedPlayers || payload.adjustedSquad)
      ? (payload.updatedPlayers || payload.adjustedSquad)
          .map(normalizeUiPlayer)
          .filter((player: Player | null): player is Player => player !== null)
      : [];
    const finalSquad = nextSquad.length > 0 ? nextSquad : baseSquad;

    if (nextLiveCheck) {
      setLiveCheck(nextLiveCheck);
      setResult((current) => (current ? { ...current, liveCheck: nextLiveCheck } : current));

      const events = buildMonitorEvents({
        prevCheck: currentLiveCheck,
        nextCheck: nextLiveCheck,
        prevSquad: baseSquad,
        nextSquad: finalSquad,
        source,
      });

      pushMonitorEvents(activeId, events);

      const signalCount = (nextLiveCheck.signals || []).length;
      const prefix = source === 'auto' ? 'Monitor activo' : source === 'analysis' ? 'Verificado en vivo' : 'Revision manual';
      setScrapeMsg(`${prefix} - ${nextLiveCheck.sourceCount} fuentes - ${signalCount} senales`);
    }

    if (nextSquad.length > 0) {
      updateSquad(nextSquad);
      return;
    }

    if (payload?.flags && Object.keys(payload.flags).length > 0) {
      const map: Record<string, PlayerFlag> = {
        injured: 'avoid',
        doubtful: 'risk',
        fit: 'return',
        boost: 'boost',
        risk: 'risk',
      };

      updateSquad(
        baseSquad.map((player) => {
          const next = payload.flags[player.name];
          return next ? { ...player, flag: map[next] || player.flag } : player;
        })
      );
    }
  }, [activeId, currentLiveCheck, pushMonitorEvents, updateSquad]);

  const scrapeNews = useCallback(async (source: MonitorSource = 'manual') => {
    if (!squad.length) {
      return;
    }

    if (source === 'manual') {
      setScraping(true);
      setScrapeMsg('');
    }

    try {
      const res = await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: squad }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al escanear noticias');
      }

      applyLivePayload(data, source, squad);

      const count = Object.keys(data.flags || {}).length;
      const nextLiveCheck: LiveCheck = {
        checkedAt: data.scrapedAt || new Date().toISOString(),
        sourceCount: Array.isArray(data.sources) ? data.sources.length : 0,
        sources: Array.isArray(data.sources) ? data.sources : [],
        newsCount: Array.isArray(data.news) ? data.news.length : 0,
        signals: Array.isArray(data.signals) ? data.signals : [],
      };
      setLiveCheck(nextLiveCheck);
      setScrapeMsg(
        `${count} jugadores actualizados · ${nextLiveCheck.sourceCount} fuentes · ${nextLiveCheck.newsCount} señales`
      );

      if (Array.isArray(data.updatedPlayers) && data.updatedPlayers.length > 0) {
        const nextSquad = data.updatedPlayers
          .map(normalizeUiPlayer)
          .filter((player: Player | null): player is Player => player !== null);
        if (nextSquad.length > 0) {
          updateSquad(nextSquad);
        }
      } else if (count > 0) {
        const map: Record<string, PlayerFlag> = {
          injured: 'avoid',
          doubtful: 'risk',
          fit: 'return',
          boost: 'boost',
          risk: 'risk',
        };

        updateSquad(
          squad.map((player) => {
            const next = data.flags[player.name];
            return next ? { ...player, flag: map[next] || player.flag } : player;
          })
        );
      }
    } catch (caught: any) {
      if (source !== 'auto') {
        setScrapeMsg(caught?.message || 'No se pudo completar el escaneo');
      }
    } finally {
      if (source === 'manual') {
        setScraping(false);
      }
    }
  }, [applyLivePayload, squad]);

  useEffect(() => {
    if (!monitorEnabled || squad.length < 5 || loading || scraping) {
      return;
    }

    const timer = window.setInterval(() => {
      void scrapeNews('auto');
    }, monitorIntervalMinutes * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [loading, monitorEnabled, monitorIntervalMinutes, scrapeNews, scraping]);

  const analyze = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ squad, context: { jornada: autoRound, strategy } }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error de analisis');
      }
      applyLivePayload(data, 'analysis', squad);
      if (Array.isArray(data.adjustedSquad) && data.adjustedSquad.length > 0) {
        const nextSquad = data.adjustedSquad
          .map(normalizeUiPlayer)
          .filter((player: Player | null): player is Player => player !== null);
        if (nextSquad.length > 0) {
          updateSquad(nextSquad);
        }
      }
      if (data.liveCheck) {
        setLiveCheck(data.liveCheck);
        setScrapeMsg(
          `Verificado en vivo · ${data.liveCheck.sourceCount || 0} fuentes · ${data.liveCheck.newsCount || 0} señales`
        );
      }
      setResult(data);
      setView('result');
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo generar el analisis');
    } finally {
      setLoading(false);
    }
  };

  if (view === 'result' && result) {
    const onceArguments = result.argumentos_once || [];
    const benchArguments = result.argumentos_banquillo || [];
    const starterPlayers = (result.once || [])
      .map((name) => squad.find((player) => player.name === name))
      .filter((player): player is Player => Boolean(player));
    const stableStartCount = starterPlayers.filter((player) => (player.context?.estimatedStartConfidence || 0) >= 75).length;
    const managedMinutesCount = starterPlayers.filter(
      (player) =>
        (player.context?.returnWindow || 0) > 0 ||
        (((player.context?.estimatedMinutesMax || 90) <= 60) && (player.context?.estimatedStartConfidence || 0) < 75)
    ).length;
    const highLoadCount = starterPlayers.filter(
      (player) => player.context?.workloadTier === 'alta' || player.context?.workloadTier === 'muy_alta'
    ).length;
    const schedulePressureCount = starterPlayers.filter(
      (player) => player.context?.schedulePressure === 'alta' || player.context?.schedulePressure === 'media'
    ).length;
    const liveRiskCount = starterPlayers.filter((player) => ['injured', 'doubtful', 'risk'].includes(player.live?.flag || '')).length;

    return (
      <main style={{ minHeight: '100vh', background: '#070d07', color: '#f3f4f6' }}>
        <nav style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, background: '#070d07', zIndex: 50 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#f3f4f6' }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>B</div>
            <span style={{ fontWeight: 800, fontSize: 16 }}>BiwengerIA</span>
          </a>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <a href="/mejor-11" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>🏆 Mejor 11</a>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setResult(null); setView('builder'); }} style={{ padding: '8px 15px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)', color: '#f3f4f6', cursor: 'pointer', fontSize: 13 }}>
                Volver
              </button>
              <button onClick={analyze} disabled={loading} style={{ padding: '8px 15px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.30)', background: 'rgba(34,197,94,0.12)', color: '#4ade80', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Recalcular
              </button>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 980, margin: '0 auto', padding: '26px 20px 48px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 18, marginBottom: 18 }}>
            <div style={{ padding: 22, borderRadius: 14, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.16)' }}>
              <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', color: '#86efac', fontWeight: 800 }}>
                {result.resumen?.titular || 'QUE HACER HOY'}
              </p>
              <h1 style={{ margin: '10px 0 12px 0', fontSize: 32, lineHeight: 1.1, fontWeight: 900 }}>
                {result.resumen?.plan || 'El copiloto ya ha cerrado tu plan de jornada.'}
              </h1>
              <div style={{ display: 'inline-flex', padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#d1d5db', fontSize: 11, fontWeight: 800, marginBottom: 12 }}>
                Modo {strategyLabel(strategy)}
              </div>
              <p style={{ margin: 0, color: '#d1d5db', fontSize: 15, lineHeight: 1.7 }}>{result.razonamiento}</p>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ padding: 18, borderRadius: 14, background: confidenceColors.bg, border: `1px solid ${confidenceColors.border}` }}>
                <div style={{ fontSize: 12, color: confidenceColors.text, fontWeight: 800, letterSpacing: '0.08em' }}>CONFIANZA DEL PLAN</div>
                <div style={{ fontSize: 34, fontWeight: 900, color: confidenceColors.text, marginTop: 8 }}>{confidence}%</div>
                <div style={{ marginTop: 10, fontSize: 13, color: '#d1d5db' }}>
                  Lectura rapida de estabilidad, riesgo y margen de maniobra bajo modo {strategyLabel(strategy).toLowerCase()}.
                </div>
              </div>
              <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[
                    ['Formacion', result.formacion],
                    ['Capitan', result.capitan?.split(' ').slice(-1)[0] || '-'],
                    ['Vice', result.vicecapitan?.split(' ').slice(-1)[0] || '-'],
                    ['Techo', `${result.puntuacion_estimada} pts`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <section style={{ marginBottom: 18 }}>
            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>PROXIES GRATIS ACTIVOS</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Titulares con salida alta</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{stableStartCount}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Confianza estimada {'>= 75%'}</div>
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Minutos gestionados</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{managedMinutesCount}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Reentrada o ventana corta</div>
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Carga anual alta</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{highLoadCount}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Titulares con pulso competitivo alto</div>
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Europa o semana cargada</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{schedulePressureCount}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Titulares con posible rotacion extra</div>
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Riesgo vivo abierto</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{liveRiskCount}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Senales frescas de duda o rotacion</div>
              </div>
            </div>
          </section>

          {currentLiveCheck && (
            <section style={{ marginBottom: 18 }}>
              <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>VERIFICACION EN VIVO</p>
                    <div style={{ fontSize: 14, color: '#d1d5db' }}>
                      {new Date((result.liveCheck || liveCheck)!.checkedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {(result.liveCheck || liveCheck)!.sourceCount} fuentes · {(result.liveCheck || liveCheck)!.newsCount} senales revisadas
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {((result.liveCheck || liveCheck)!.sources || []).slice(0, 4).map((source) => (
                      <span key={source} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                        {source}
                      </span>
                    ))}
                  </div>
                </div>

                {((result.liveCheck || liveCheck)!.signals || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
                    {((result.liveCheck || liveCheck)!.signals || []).slice(0, 4).map((signal) => {
                      const tone = liveFlagTone(signal.flag);
                      return (
                        <div key={`${signal.player}-${signal.flag}`} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${tone.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>{signal.player}</div>
                            <div style={{ fontSize: 12, color: tone.text, fontWeight: 800 }}>{signal.confidence}%</div>
                          </div>
                          <div style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, background: tone.bg, color: tone.text, border: `1px solid ${tone.border}`, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                            {liveFlagLabel(signal.flag)}
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5, marginBottom: 4 }}>{signal.summary}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{formatFreshness(signal.freshnessMinutes)} · {signal.sourceCount} fuente{signal.sourceCount === 1 ? '' : 's'}</div>
                          <SourceLinks urls={signal.urls} sources={signal.sources} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {(riskSignals.length > 0 || recentMonitorEvents.length > 0) && (
            <section style={{ marginBottom: 18 }}>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>MONITOR DE ULTIMA HORA</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                {riskSignals.length > 0 && (
                  <div style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Alertas abiertas</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {riskSignals.slice(0, 4).map((signal) => {
                        const tone = liveFlagTone(signal.flag);
                        return (
                          <div key={`${signal.player}-${signal.flag}-result`} style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${tone.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                              <div style={{ fontWeight: 800 }}>{signal.player}</div>
                              <div style={{ fontSize: 11, color: tone.text, fontWeight: 800 }}>{signal.confidence}%</div>
                            </div>
                            <div style={{ fontSize: 11, color: tone.text, fontWeight: 700, marginBottom: 4 }}>{liveFlagLabel(signal.flag)}</div>
                            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.45 }}>{signal.summary}</div>
                            <SourceLinks urls={signal.urls} sources={signal.sources} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {recentMonitorEvents.length > 0 && (
                  <div style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Cambios recientes</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {recentMonitorEvents.slice(0, 4).map((event) => {
                        const tone = monitorEventTone(event.level);
                        return (
                          <div key={event.id} style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${tone.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                              <div style={{ fontWeight: 800 }}>{event.title}</div>
                              <div style={{ fontSize: 11, color: tone.text, fontWeight: 800 }}>
                                {monitorSourceLabel(event.source)} · {new Date(event.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.45 }}>{event.detail}</div>
                            <SourceLinks urls={event.urls} sources={event.sources} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {(result.acciones_hoy || []).length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>ACCIONES DE HOY</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                {(result.acciones_hoy || []).map((action, index) => {
                  const tone = confidenceTone(action.confianza);
                  return (
                    <div key={`${action.titulo}-${index}`} style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{action.titulo}</div>
                        <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}>
                          {action.confianza}%
                        </span>
                      </div>
                      <p style={{ margin: '0 0 10px 0', color: '#9ca3af', fontSize: 13, lineHeight: 1.6 }}>{action.detalle}</p>
                      <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>{action.impacto}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(result.radar || []).length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>RADAR DE JORNADA</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                {(result.radar || []).map((item) => {
                  const tone = confidenceTone(item.score);
                  return (
                    <div key={item.label} style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{item.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: tone.text }}>{item.score}</div>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 10 }}>
                        <div style={{ width: `${item.score}%`, height: '100%', borderRadius: 999, background: tone.text }} />
                      </div>
                      <p style={{ margin: 0, color: '#9ca3af', fontSize: 13, lineHeight: 1.6 }}>{item.note}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(result.alertas || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {result.alertas.map((alert, index) => (
                <div key={`${alert}-${index}`} style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.20)' }}>
                  {alert}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 18, marginBottom: 18 }}>
            <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>ONCE RECOMENDADO</p>
              <Pitch formation={result.formacion || '4-3-3'} eleven={result.once || []} captain={result.capitan || ''} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                {(result.once || []).map((name) => {
                  const player = squad.find((item) => item.name === name);
                  return (
                    <div key={name} style={{ padding: '6px 10px', borderRadius: 999, background: name === result.capitan ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${name === result.capitan ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.10)'}`, display: 'flex', gap: 6, alignItems: 'center' }}>
                      {name === result.capitan && <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 800 }}>C</span>}
                      {name === result.vicecapitan && name !== result.capitan && <span style={{ color: '#60a5fa', fontSize: 11, fontWeight: 800 }}>VC</span>}
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
                      {player && <span style={{ color: '#4ade80', fontSize: 11 }}>{player.avgPts}m</span>}
                      <SchedulePressureBadge player={player} compact />
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>BANQUILLO</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(result.banquillo || []).map((name, index) => {
                    const player = squad.find((item) => item.name === name);
                    return (
                      <span key={name} style={{ fontSize: 13, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>{index + 1}. {name}</span>
                        <SchedulePressureBadge player={player} compact />
                      </span>
                    );
                  })}
                </div>
              </div>

              {(result.decisiones_jugadores || []).length > 0 && (
                <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>JUGADORES CLAVE</p>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {(result.decisiones_jugadores || []).map((item) => (
                      <div key={item.nombre} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontWeight: 800 }}>{item.nombre}</div>
                          <div style={{ fontSize: 12, color: confidenceTone(item.confianza).text, fontWeight: 800 }}>{item.confianza}%</div>
                        </div>
                        <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>{item.decision}</div>
                        <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>{item.motivo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {(onceArguments.length > 0 || benchArguments.length > 0) && (
            <section style={{ marginBottom: 18 }}>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>ARGUMENTOS DEL PLAN</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 18 }}>
                {onceArguments.length > 0 && (
                  <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Por que entran</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {onceArguments.map((item) => (
                        <div key={`once-${item.nombre}`} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>{item.nombre}</div>
                            <div style={{ fontSize: 12, color: confidenceTone(item.confianza).text, fontWeight: 800 }}>{item.confianza}%</div>
                          </div>
                          <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>{item.decision}</div>
                          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>{item.motivo}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {benchArguments.length > 0 && (
                  <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Por que esperan</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {benchArguments.map((item) => (
                        <div key={`bench-${item.nombre}`} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>{item.nombre}</div>
                            <div style={{ fontSize: 12, color: confidenceTone(item.confianza).text, fontWeight: 800 }}>{item.confianza}%</div>
                          </div>
                          <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>{item.decision}</div>
                          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>{item.motivo}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {(result.fichajes || []).length > 0 && (
            <section>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>SIGUIENTE MOVIMIENTO DE MERCADO</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
                {result.fichajes.map((move, index) => (
                  <div key={`${move.vender}-${move.comprar}-${index}`} style={{ padding: 18, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ color: '#f87171', fontWeight: 700 }}>{move.vender}</span>
                      <span style={{ color: '#4b5563' }}>→</span>
                      <span style={{ color: '#4ade80', fontWeight: 800 }}>{move.comprar}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{move.precio_estimado}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>{move.razon}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(result.debugScores || []).length > 0 && (
            <section style={{ marginTop: 18 }}>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>RADIOGRAFIA DE SCORES (DEBUG)</p>
              <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 800, color: '#9ca3af', position: 'sticky', left: 0, background: '#0f1a0f', zIndex: 1 }}>Jugador</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, color: '#9ca3af' }}>Pos</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, color: '#f59e0b' }}>TOTAL</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Media</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Forma</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Rival</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Flag</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Fiab.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Disp.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Carga</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Live</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Vuelta</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Rebote</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Racha</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Motiv.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Consist.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Ceros</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Techo</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Precio</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Presion</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Tend.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>EMA</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Escas.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Stack</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>vsPos</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Clutch</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Fatiga</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Margin.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Hora</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Divers.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>CSheet</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Fase</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Regres.</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Derbi</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Ult.5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.debugScores!.map((row) => {
                      const roleBg = row.role === 'starter' ? 'rgba(34,197,94,0.08)' : row.role === 'bench' ? 'rgba(251,191,36,0.06)' : 'transparent';
                      const roleColor = row.role === 'starter' ? '#4ade80' : row.role === 'bench' ? '#fbbf24' : '#6b7280';
                      const cellColor = (v: number) => v > 0.5 ? '#4ade80' : v < -0.5 ? '#f87171' : '#9ca3af';
                      return (
                        <tr key={row.name} style={{ background: roleBg, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 800, color: roleColor, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: row.role === 'starter' ? '#0f1a0f' : row.role === 'bench' ? '#151a0f' : '#0a0f0a', zIndex: 1 }}>
                            {row.role === 'starter' ? '✓ ' : row.role === 'bench' ? '⏸ ' : ''}{row.name}
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center', color: '#9ca3af' }}>{row.pos}</td>
                          <td style={{ padding: '6px', textAlign: 'center', fontWeight: 900, color: '#f59e0b' }}>{row.total.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.reliable) }}>{row.reliable.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.recent) }}>{row.recent.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.fixture) }}>{row.fixture.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.flags) }}>{row.flags.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.reliability) }}>{row.reliability.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.availability) }}>{row.availability.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.workload) }}>{row.workload.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.live) }}>{row.live.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.managed) }}>{row.managed.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.bounceBack) }}>{row.bounceBack.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.momentum) }}>{row.momentum.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.motivation) }}>{row.motivation.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.consistency) }}>{row.consistency.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.zeroRate) }}>{row.zeroRate.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.ceiling) }}>{row.ceiling.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.priceExp) }}>{row.priceExp.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.schedule) }}>{row.schedule.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.trendSlope) }}>{row.trendSlope.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.recencyW) }}>{row.recencyW.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.scarcity) }}>{row.scarcity.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.stack) }}>{row.stack.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.posRelative) }}>{row.posRelative.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.clutch) }}>{row.clutch.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.fatigue) }}>{row.fatigue.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.marginal) }}>{row.marginal.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.timing) }}>{row.timing.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.diversification) }}>{row.diversification.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.cleanSheet) }}>{row.cleanSheet.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.seasonPhase) }}>{row.seasonPhase.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.meanReversion) }}>{row.meanReversion.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: cellColor(row.derby) }}>{row.derby.toFixed(1)}</td>
                          <td style={{ padding: '6px', textAlign: 'center', color: '#6b7280', fontSize: 10 }}>{row.lastFive.join(',')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#4b5563' }}>✓ = Titular · ⏸ = Banquillo · Verde = ayuda · Rojo = penaliza · 32 dimensiones por jugador</p>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#070d07', color: '#f3f4f6' }}>
      <nav style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, background: '#070d07', zIndex: 50 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#f3f4f6' }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>B</div>
          <span style={{ fontWeight: 800, fontSize: 16 }}>BiwengerIA</span>
        </a>
        <a href="/noticias" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 13 }}>Noticias</a>
      </nav>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 44px' }}>
        <div style={{ padding: 20, borderRadius: 14, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.16)', marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px 0', fontSize: 12, letterSpacing: '0.08em', color: '#86efac', fontWeight: 800 }}>COPILOTO FANTASY</p>
          <h1 style={{ margin: '0 0 10px 0', fontSize: 30, fontWeight: 900, lineHeight: 1.1 }}>Carga tu plantilla y deja que el sistema te diga que hacer hoy.</h1>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, fontSize: 15 }}>
            El objetivo ya no es darte mas contenido. El objetivo es cerrar tu once, protegerte del riesgo y marcar tu siguiente movimiento de mercado antes del cierre.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>MIS PLANTILLAS</p>
          <ProfileSelector profiles={profiles} activeId={activeId} onSelect={setActiveId} onCreate={createProfile} onDelete={deleteProfile} />
        </div>

        {!activeId ? (
          <div style={{ padding: '72px 20px', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.10)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>B</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Crea tu primera plantilla</div>
            <div style={{ color: '#6b7280', fontSize: 14 }}>Empieza por una liga y luego monta el once base que quieres pilotar.</div>
          </div>
        ) : (
          <>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {POS_ORDER.map((pos) => (
                <div key={pos} style={{ fontSize: 12, color: '#9ca3af' }}>
                  <span style={{ color: POS_COLOR[pos], fontWeight: 800 }}>{grouped[pos].length}</span>
                  <span style={{ color: '#4b5563' }}> / </span>
                  {POS_LABEL[pos]}
                </div>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{squad.length}/25 jugadores</div>
            </div>

            <div style={{ position: 'relative', marginBottom: 12, zIndex: 20 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {['ALL', 'PT', 'DF', 'MC', 'DL'].map((pos) => (
                  <button key={pos} onClick={() => setPosFilter(pos)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid', borderColor: posFilter === pos ? (pos === 'ALL' ? 'rgba(255,255,255,0.30)' : `${POS_COLOR[pos]}88`) : 'rgba(255,255,255,0.08)', background: posFilter === pos ? (pos === 'ALL' ? 'rgba(255,255,255,0.08)' : `${POS_COLOR[pos]}18`) : 'transparent', color: posFilter === pos ? (pos === 'ALL' ? '#f3f4f6' : POS_COLOR[pos]) : '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: posFilter === pos ? 800 : 500 }}>
                    {pos === 'ALL' ? 'Todos' : POS_LABEL[pos]}
                  </button>
                ))}
              </div>

              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchQuery('');
                  }
                  if (event.key === 'Enter' && filteredPlayers.length > 0) {
                    addPlayer(filteredPlayers[0]);
                  }
                }}
                disabled={loadingPlayers}
                placeholder={loadingPlayers ? 'Cargando jugadores...' : 'Busca jugador o equipo...'}
                style={{ width: '100%', padding: '13px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />

              {filteredPlayers.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, borderRadius: 10, overflow: 'hidden', background: '#111827', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 12px 30px rgba(0,0,0,0.50)' }}>
                  {filteredPlayers.map((player, index) => (
                    <div key={player.id} onClick={() => addPlayer(player)} style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', background: index === 0 ? 'rgba(34,197,94,0.05)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ width: 28, textAlign: 'center', fontSize: 10, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: `${POS_COLOR[player.pos]}22`, color: POS_COLOR[player.pos], flexShrink: 0 }}>{POS_LABEL[player.pos]}</span>
                      <span style={{ flex: 1, fontWeight: 700 }}>{player.name}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{player.team}</span>
                      <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 800 }}>{player.avgPts}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {squad.length === 0 ? (
              <div style={{ padding: '46px 20px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.10)', textAlign: 'center', color: '#6b7280' }}>
                Busca jugadores arriba para crear la base de tu copiloto.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#4b5563' }}>Click en el punto para rotar el contexto del jugador:</span>
                  {Object.entries(FLAGS).filter(([key]) => key !== 'normal').map(([key, value]) => (
                    <span key={key} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: value.color, color: value.dot, border: `1px solid ${value.border}` }}>
                      {value.label}
                    </span>
                  ))}
                </div>

                {POS_ORDER.map((pos) => (
                  grouped[pos].length > 0 && (
                    <div key={pos} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, color: POS_COLOR[pos], fontWeight: 800, letterSpacing: '0.08em' }}>{POS_LABEL[pos]} · {grouped[pos].length}</span>
                        <div style={{ flex: 1, height: 1, background: `${POS_COLOR[pos]}22` }} />
                      </div>
                      {grouped[pos].map((player) => (
                        <PlayerRow key={player.id} player={player} onRemove={() => removePlayer(player.id)} onFlag={(flag) => setFlag(player.id, flag)} />
                      ))}
                    </div>
                  )
                ))}

                <button onClick={clearSquad} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>
                  Vaciar plantilla
                </button>
              </>
            )}

            {squad.length >= 5 && (
              <div style={{ marginTop: 22, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Refrescar senales de ultima hora</div>
                  <div style={{ fontSize: 12, color: scrapeMsg ? '#4ade80' : '#6b7280' }}>
                    {scrapeMsg || 'Analizar tambien refresca estas senales en vivo antes de recomendar el once.'}
                  </div>
                  {liveCheck && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                      Ultima verificacion: {new Date(liveCheck.checkedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {liveCheck.sourceCount} fuentes
                    </div>
                  )}
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => saveMonitorPrefs(!monitorEnabled, monitorIntervalMinutes)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: `1px solid ${monitorEnabled ? 'rgba(34,197,94,0.32)' : 'rgba(255,255,255,0.10)'}`,
                        background: monitorEnabled ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                        color: monitorEnabled ? '#4ade80' : '#9ca3af',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {monitorEnabled ? 'Monitor ON' : 'Monitor OFF'}
                    </button>
                    {[1, 2, 5].map((minutes) => (
                      <button
                        key={minutes}
                        onClick={() => saveMonitorPrefs(monitorEnabled, minutes)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: `1px solid ${monitorIntervalMinutes === minutes ? 'rgba(34,197,94,0.28)' : 'rgba(255,255,255,0.08)'}`,
                          background: monitorIntervalMinutes === minutes ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.03)',
                          color: monitorIntervalMinutes === minutes ? '#4ade80' : '#9ca3af',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {minutes}m
                      </button>
                    ))}
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      {monitorEnabled ? `Auto cada ${monitorIntervalMinutes} min` : 'Auto en pausa'}
                    </span>
                  </div>
                </div>
                <button onClick={() => { void scrapeNews(); }} disabled={scraping} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.30)', background: scraping ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.10)', color: scraping ? '#6b7280' : '#4ade80', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {scraping ? 'Actualizando...' : 'Refrescar'}
                </button>
              </div>
            )}

            {squad.length >= 5 && (currentLiveCheck || monitorEnabled || recentMonitorEvents.length > 0) && (
              <div style={{ marginTop: 14, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800, letterSpacing: '0.08em' }}>MONITOR DE ULTIMA HORA</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: '#d1d5db' }}>
                      {currentLiveCheck
                        ? `Verificado ${new Date(currentLiveCheck.checkedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · ${currentLiveCheck.sourceCount} fuentes`
                        : 'Activa el monitor para vigilar cambios de estado y rotacion.'}
                    </div>
                  </div>
                  {monitorEvents[0] && (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      Ultimo cambio: {new Date(monitorEvents[0].at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>

                {riskSignals.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: recentMonitorEvents.length > 0 ? 12 : 0 }}>
                    {riskSignals.map((signal) => {
                      const tone = liveFlagTone(signal.flag);
                      return (
                        <div key={`${signal.player}-${signal.flag}-monitor`} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${tone.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <div style={{ fontWeight: 800 }}>{signal.player}</div>
                            <div style={{ fontSize: 12, color: tone.text, fontWeight: 800 }}>{signal.confidence}%</div>
                          </div>
                          <div style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 999, background: tone.bg, color: tone.text, border: `1px solid ${tone.border}`, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                            {liveFlagLabel(signal.flag)}
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>{signal.summary}</div>
                          <SourceLinks urls={signal.urls} sources={signal.sources} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: recentMonitorEvents.length > 0 ? 12 : 0 }}>
                    No hay alertas fuertes abiertas ahora mismo.
                  </div>
                )}

                {recentMonitorEvents.length > 0 && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {recentMonitorEvents.slice(0, 5).map((event) => {
                      const tone = monitorEventTone(event.level);
                      return (
                        <div key={event.id} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${tone.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 13, fontWeight: 800 }}>{event.title}</div>
                            <div style={{ fontSize: 11, color: tone.text, fontWeight: 800 }}>
                              {monitorSourceLabel(event.source)} · {new Date(event.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>{event.detail}</div>
                          <SourceLinks urls={event.urls} sources={event.sources} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 20, padding: 20, borderRadius: 14, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)' }}>
              <p style={{ margin: '0 0 14px 0', fontSize: 12, color: '#6b7280', letterSpacing: '0.08em', fontWeight: 800 }}>CONTEXTO AUTOMATICO DE JORNADA</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Jornada objetivo</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{autoRound || 'Pendiente'}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Cruces cargados</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{fixtureRound || autoRound || 'Pendiente'}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Jugadores con rival</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{playersWithFixture}/{squad.length || 0}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Locales</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{homeCount}</div>
                </div>
                <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Visitantes</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{awayCount}</div>
                </div>
              </div>
              <p style={{ margin: '0 0 16px 0', color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
                Cada jugador se analiza con su propio rival, si juega en casa o fuera y una dificultad estimada. Ya no hace falta meter un rival principal manual.
              </p>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, letterSpacing: '0.08em', fontWeight: 800 }}>
                  ESTRATEGIA DEL COPILOTO
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
                  {STRATEGY_OPTIONS.map((option) => {
                    const active = strategy === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => selectStrategy(option.id)}
                        style={{
                          textAlign: 'left',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: `1px solid ${active ? 'rgba(34,197,94,0.40)' : 'rgba(255,255,255,0.08)'}`,
                          background: active ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                          color: active ? '#f3f4f6' : '#d1d5db',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{option.label}</div>
                        <div style={{ fontSize: 12, color: active ? '#86efac' : '#9ca3af', lineHeight: 1.4 }}>{option.note}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                  Cambia el sesgo del once, del capitan y de los desempates en casos tipo Isco o jugadores de rotacion.
                </div>
              </div>
              {fixtureSource === 'official-schedule' && autoRound && (
                <p style={{ margin: '0 0 16px 0', color: '#86efac', fontSize: 13, lineHeight: 1.6 }}>
                  La API publica de Biwenger seguia sirviendo {feedRound || 'la jornada activa'}, asi que hemos cruzado el calendario oficial para preparar {autoRound}.
                </p>
              )}
              {error && <p style={{ marginBottom: 12, color: '#f87171', fontSize: 13 }}>{error}</p>}
              {!canAnalyze && squad.length > 0 && <p style={{ marginBottom: 12, color: '#6b7280', fontSize: 13 }}>Necesitas minimo 11 jugadores. Ahora mismo tienes {squad.length}.</p>}
              <button onClick={analyze} disabled={!canAnalyze || loading} style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: canAnalyze ? '#16a34a' : 'rgba(255,255,255,0.05)', color: canAnalyze ? 'white' : '#4b5563', cursor: canAnalyze && !loading ? 'pointer' : 'not-allowed', fontSize: 16, fontWeight: 800 }}>
                {loading ? 'Pensando el plan de la jornada...' : `Generar plan${autoRound ? ` - ${autoRound}` : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
