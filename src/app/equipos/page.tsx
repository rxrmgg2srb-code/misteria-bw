'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ─── Team colours & abbreviations ───────────────────────────────────────────
const TEAM_META: Record<string, { bg: string; text: string; abbr: string }> = {
  'Athletic':        { bg: '#CC0000', text: '#fff',    abbr: 'ATH' },
  'Atlético':        { bg: '#CB3524', text: '#fff',    abbr: 'ATM' },
  'Alavés':          { bg: '#005A9B', text: '#fff',    abbr: 'ALA' },
  'Barcelona':       { bg: '#A50044', text: '#004D98', abbr: 'BAR' },
  'Betis':           { bg: '#00954B', text: '#fff',    abbr: 'BET' },
  'Celta':           { bg: '#6CACE4', text: '#fff',    abbr: 'CEL' },
  'Espanyol':        { bg: '#004EA8', text: '#fff',    abbr: 'ESP' },
  'Getafe':          { bg: '#005CA9', text: '#fff',    abbr: 'GET' },
  'Girona':          { bg: '#CF122D', text: '#fff',    abbr: 'GIR' },
  'Leganés':         { bg: '#003E7E', text: '#fff',    abbr: 'LEG' },
  'Mallorca':        { bg: '#CE3524', text: '#FFE000', abbr: 'MAL' },
  'Osasuna':         { bg: '#C8142D', text: '#fff',    abbr: 'OSA' },
  'Real Madrid':     { bg: '#FEBE10', text: '#003087', abbr: 'RMA' },
  'Real Sociedad':   { bg: '#0070B5', text: '#fff',    abbr: 'RSO' },
  'Rayo':            { bg: '#E5002B', text: '#fff',    abbr: 'RAY' },
  'Sevilla':         { bg: '#D4302F', text: '#fff',    abbr: 'SEV' },
  'Valencia':        { bg: '#EE6900', text: '#fff',    abbr: 'VAL' },
  'Villarreal':      { bg: '#FFD700', text: '#003399', abbr: 'VIL' },
  'Levante':         { bg: '#D5002B', text: '#1967B0', abbr: 'LEV' },
  'Elche':           { bg: '#3DBF6B', text: '#fff',    abbr: 'ELC' },
  'Oviedo':          { bg: '#003082', text: '#fff',    abbr: 'OVI' },
  'Valladolid':      { bg: '#5C2B8C', text: '#fff',    abbr: 'VLL' },
  'Las Palmas':      { bg: '#FFEF00', text: '#003082', abbr: 'LPA' },
};

function getTeamMeta(team: string) {
  // Direct match
  if (TEAM_META[team]) return TEAM_META[team];
  // Partial match
  for (const key of Object.keys(TEAM_META)) {
    if (team.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(team.toLowerCase())) {
      return TEAM_META[key];
    }
  }
  return { bg: '#374151', text: '#fff', abbr: team.substring(0, 3).toUpperCase() };
}

const POS_COLOR: Record<string, string> = {
  PT: '#f59e0b',
  DF: '#3b82f6',
  MC: '#8b5cf6',
  DL: '#ef4444',
};

// ─── Types ───────────────────────────────────────────────────────────────────
type PlayerSlot = {
  id: number;
  name: string;
  pos: string;
  avgPts: number;
  price: number;
  gamesPlayed: number;
  titularity: number;
  status: string;
};

type TeamData = {
  fixture: { opponent: string; isHome: boolean; difficulty: number } | null;
  eleven: PlayerSlot[];
  formation: string;
  confidence: number;
};

type EquiposData = {
  teams: Record<string, TeamData>;
  round: string;
};

// ─── Pitch SVG Component ─────────────────────────────────────────────────────
function PitchWithPlayers({
  formation,
  eleven,
  teamMeta,
}: {
  formation: string;
  eleven: PlayerSlot[];
  teamMeta: { bg: string; text: string; abbr: string };
}) {
  const rows = [1, ...formation.split('-').map(Number)];
  const W = 520;
  const H = 620;
  const rowH = H / (rows.length + 1);

  const points: { player: PlayerSlot; x: number; y: number }[] = [];
  let idx = 0;
  rows.forEach((count, rowIdx) => {
    const y = H - rowH * (rowIdx + 0.75);
    for (let i = 0; i < count; i++) {
      if (idx < eleven.length) {
        points.push({
          player: eleven[idx],
          x: (W / (count + 1)) * (i + 1),
          y,
        });
        idx++;
      }
    }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 640, display: 'block', borderRadius: 16 }}>
      {/* Grass */}
      <rect width={W} height={H} rx={16} fill="#166534" />
      {/* Pitch lines */}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
      <circle cx={W / 2} cy={H / 2} r={52} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
      <circle cx={W / 2} cy={H / 2} r={3} fill="rgba(255,255,255,0.4)" />
      <rect x={W * 0.18} y={10} width={W * 0.64} height={80} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2} rx={2} />
      <rect x={W * 0.18} y={H - 90} width={W * 0.64} height={80} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2} rx={2} />
      <rect x={W * 0.32} y={10} width={W * 0.36} height={36} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} rx={2} />
      <rect x={W * 0.32} y={H - 46} width={W * 0.36} height={36} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} rx={2} />
      {/* Grass stripes */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={0} y={(H / 6) * i} width={W} height={H / 12} fill="rgba(255,255,255,0.025)" rx={0} />
      ))}

      {/* Players */}
      {points.map(({ player, x, y }) => {
        const initials = player.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
        const titStyle = player.titularity >= 75 ? '#4ade80' : player.titularity >= 50 ? '#fbbf24' : '#f87171';
        return (
          <g key={player.id}>
            {/* Shadow */}
            <ellipse cx={x} cy={y + 36} rx={22} ry={6} fill="rgba(0,0,0,0.3)" />
            {/* Jersey circle */}
            <circle cx={x} cy={y} r={26} fill={teamMeta.bg} stroke="rgba(255,255,255,0.9)" strokeWidth={2.5} />
            {/* Initials */}
            <text x={x} y={y + 5} textAnchor="middle" fontSize={11} fontWeight="800" fill={teamMeta.text}>
              {initials}
            </text>
            {/* Titularity ring */}
            <circle cx={x + 19} cy={y - 19} r={9} fill="#0f172a" stroke={titStyle} strokeWidth={1.5} />
            <text x={x + 19} y={y - 15} textAnchor="middle" fontSize={8} fontWeight="800" fill={titStyle}>
              {player.titularity}%
            </text>
            {/* Name background */}
            <rect x={x - 40} y={y + 30} width={80} height={18} fill="rgba(0,0,0,0.72)" rx={5} />
            <text x={x} y={y + 43} textAnchor="middle" fontSize={10} fontWeight="700" fill="#fff">
              {player.name.split(' ').slice(-1)[0].substring(0, 12)}
            </text>
            {/* Pos badge */}
            <rect x={x - 10} y={y + 50} width={20} height={13} fill={POS_COLOR[player.pos] || '#6b7280'} rx={4} />
            <text x={x} y={y + 61} textAnchor="middle" fontSize={8} fontWeight="800" fill="#fff">
              {player.pos}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function EquiposPage() {
  const [data, setData] = useState<EquiposData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/equipos')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          // Auto-select first team
          const first = Object.keys(d.teams || {})[0];
          if (first) setSelectedTeam(first);
        }
      })
      .catch(() => setError('Error cargando datos'))
      .finally(() => setLoading(false));
  }, []);

  const teams = data ? Object.keys(data.teams).sort() : [];
  const current = selectedTeam && data ? data.teams[selectedTeam] : null;
  const currentMeta = selectedTeam ? getTeamMeta(selectedTeam) : null;

  return (
    <main style={{ minHeight: '100vh', background: '#081008', color: '#f3f4f6' }}>
      {/* NAV */}
      <nav style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>B</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>BiwengerIA</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Copiloto fantasy</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 14, flexWrap: 'wrap' }}>
          <Link href="/analyzer" style={{ color: '#d1d5db', textDecoration: 'none' }}>Copiloto</Link>
          <Link href="/mejor-11" style={{ color: '#d1d5db', textDecoration: 'none' }}>🏆 Mejor 11</Link>
          <Link href="/jornada" style={{ color: '#d1d5db', textDecoration: 'none' }}>📊 Jornada</Link>
          <Link href="/equipos" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>🏟 Equipos</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)', color: '#4ade80', fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
            🏟 ONCE PROBABLE POR EQUIPO
          </div>
          <h1 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 900, margin: '0 0 8px 0' }}>
            {data?.round ? `Jornada ${data.round}` : 'Jornada actual'} — Alineaciones
          </h1>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
            Once probable por equipo basado en tasa de titularidad histórica · ~95% de fiabilidad
          </p>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚽</div>
            <div>Calculando titularidad de 500+ jugadores...</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 20, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            ⚠ {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* TEAM BADGE GRID */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 32 }}>
              {teams.map((team) => {
                const meta = getTeamMeta(team);
                const isSelected = team === selectedTeam;
                return (
                  <button
                    key={team}
                    onClick={() => setSelectedTeam(team)}
                    title={team}
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 12,
                      background: isSelected ? meta.bg : 'rgba(255,255,255,0.06)',
                      border: isSelected ? `2px solid ${meta.bg}` : '2px solid rgba(255,255,255,0.10)',
                      color: isSelected ? meta.text : '#9ca3af',
                      fontWeight: 900,
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? `0 0 16px ${meta.bg}66` : 'none',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>🛡️</span>
                    <span style={{ fontSize: 9, fontWeight: 800 }}>{meta.abbr}</span>
                  </button>
                );
              })}
            </div>

            {/* SELECTED TEAM DETAIL */}
            {current && selectedTeam && currentMeta && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* LEFT: Pitch */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: currentMeta.bg, boxShadow: `0 0 10px ${currentMeta.bg}` }} />
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{selectedTeam}</h2>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{current.formation}</span>
                    <span style={{
                      marginLeft: 'auto',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: current.confidence >= 90 ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                      color: current.confidence >= 90 ? '#4ade80' : '#fbbf24',
                      fontSize: 12,
                      fontWeight: 700,
                      border: `1px solid ${current.confidence >= 90 ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`,
                    }}>
                      {current.confidence}% fiabilidad
                    </span>
                  </div>
                  {current.fixture && (
                    <div style={{ marginBottom: 14, fontSize: 13, color: '#9ca3af' }}>
                      {current.fixture.isHome ? 'vs' : '@'} {current.fixture.opponent} · D{current.fixture.difficulty}
                    </div>
                  )}
                  <PitchWithPlayers
                    formation={current.formation}
                    eleven={current.eleven}
                    teamMeta={currentMeta}
                  />
                </div>

                {/* RIGHT: Player list */}
                <div>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, color: '#d1d5db' }}>
                    Los 11 — Titularidad
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {current.eleven.map((p) => {
                      const titColor = p.titularity >= 75 ? '#4ade80' : p.titularity >= 50 ? '#fbbf24' : '#f87171';
                      return (
                        <div
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <span style={{
                            background: POS_COLOR[p.pos] || '#6b7280',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 4,
                            minWidth: 28,
                            textAlign: 'center',
                          }}>
                            {p.pos}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{p.name}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: titColor, fontWeight: 700, fontSize: 13 }}>{p.titularity}%</div>
                            <div style={{ color: '#6b7280', fontSize: 11 }}>{p.avgPts} pts/j</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>LEYENDA TITULARIDAD</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>≥75%</span>
                        <span style={{ color: '#9ca3af' }}>Titular indiscutible</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>50-74%</span>
                        <span style={{ color: '#9ca3af' }}>Probable titular</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ color: '#f87171', fontWeight: 700 }}>&lt;50%</span>
                        <span style={{ color: '#9ca3af' }}>Rotativo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
