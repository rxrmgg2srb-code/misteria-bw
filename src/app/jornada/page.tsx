'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type InjuryAlert = {
  playerName: string;
  teamName: string;
  type: string;
  reason: string;
};

type PlayerCard = {
  name: string;
  pos: string;
  team: string;
  price: number;
  avgPts: number;
  status: string;
  flag?: string;
  lastFive: number[];
  fixture?: { opponent: string; isHome: boolean; difficulty: number; round?: string } | null;
  score: number;
  razon: string;
  injuryAlert?: InjuryAlert;
};

type JornadaData = {
  gangas: PlayerCard[];
  byTeam: Record<string, PlayerCard[]>;
  round: string;
  nextRound: string;
  roundNumber: number;
  totalPlayers: number;
  injuryCount: number;
  oddsFixtures: number;
};

const POS_COLOR: Record<string, string> = {
  PT: '#f59e0b',
  DF: '#3b82f6',
  MC: '#8b5cf6',
  DL: '#ef4444',
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  fit: { label: '✓ Disponible', color: '#22c55e' },
  doubtful: { label: '⚠ Duda', color: '#f59e0b' },
  injured: { label: '✗ Lesionado', color: '#ef4444' },
  suspended: { label: '⛔ Sancionado', color: '#ef4444' },
};

function PriceTag({ price }: { price: number }) {
  const m = price / 1e6;
  const color = m <= 4 ? '#22c55e' : m <= 7 ? '#86efac' : '#9ca3af';
  return (
    <span style={{ color, fontWeight: 700, fontSize: 13 }}>
      {m.toFixed(1)}M
    </span>
  );
}

function MiniForm({ pts }: { pts: number[] }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {pts.map((v, i) => (
        <div
          key={i}
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: v >= 8 ? '#16a34a' : v >= 5 ? '#3b82f6' : v >= 2 ? '#4b5563' : '#374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: v > 0 ? 'white' : '#6b7280',
          }}
        >
          {v > 0 ? v : '-'}
        </div>
      ))}
    </div>
  );
}

function DifficultyBadge({ diff, fromOdds }: { diff: number; fromOdds?: boolean }) {
  const colors = ['', '#22c55e', '#86efac', '#f59e0b', '#f97316', '#ef4444'];
  const labels = ['', 'Muy fácil', 'Fácil', 'Neutral', 'Difícil', 'Muy difícil'];
  return (
    <span
      title={`${labels[diff] || ''} ${fromOdds ? '(basado en cuotas reales)' : '(estimado)'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        color: colors[diff] || '#6b7280',
      }}
    >
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[diff] || '#6b7280',
      }} />
      D{diff}{fromOdds ? ' 📊' : ''}
    </span>
  );
}

function InjuryAlertBadge({ injury }: { injury: InjuryAlert }) {
  const isDoubtful = injury.type === 'Questionable';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 8,
      background: isDoubtful ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${isDoubtful ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)'}`,
      fontSize: 11,
      fontWeight: 700,
      color: isDoubtful ? '#fbbf24' : '#f87171',
    }}>
      {isDoubtful ? '⚠' : '🏥'} API: {injury.type} — {injury.reason}
    </div>
  );
}

function PlayerCardComponent({ player, isGanga }: { player: PlayerCard; isGanga?: boolean }) {
  const statusInfo = STATUS_BADGE[player.status] || STATUS_BADGE.fit;
  const diff = player.fixture?.difficulty ?? 3;
  const hasRealInjury = !!player.injuryAlert;
  const hasOddsDiff = player.razon?.includes('(odds)');

  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 12,
      background: hasRealInjury
        ? 'rgba(239,68,68,0.06)'
        : isGanga
          ? 'rgba(34,197,94,0.08)'
          : 'rgba(255,255,255,0.04)',
      border: hasRealInjury
        ? '1px solid rgba(239,68,68,0.2)'
        : isGanga
          ? '1px solid rgba(34,197,94,0.25)'
          : '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: POS_COLOR[player.pos] || '#6b7280',
              color: 'white',
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 4,
            }}>
              {player.pos}
            </span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{player.name}</span>
            {player.flag === 'boost' && <span title="Boost IA">🔥</span>}
            {isGanga && !hasRealInjury && <span title="Ganga IA" style={{ fontSize: 12 }}>💎</span>}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{player.team}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <PriceTag price={player.price} />
          <div style={{ fontSize: 12, color: '#9ca3af' }}>{player.avgPts} pts/j</div>
        </div>
      </div>

      {/* Injury alert from API-Football */}
      {player.injuryAlert && <InjuryAlertBadge injury={player.injuryAlert} />}

      {player.fixture && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#9ca3af' }}>
          <DifficultyBadge diff={diff} fromOdds={hasOddsDiff} />
          <span>{player.fixture.isHome ? 'vs' : '@'} {player.fixture.opponent}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MiniForm pts={player.lastFive} />
        <span style={{ color: statusInfo.color, fontSize: 11, fontWeight: 600 }}>{statusInfo.label}</span>
      </div>

      <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
        💡 {player.razon}
      </div>
    </div>
  );
}

export default function JornadaPage() {
  const [data, setData] = useState<JornadaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/jornada')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Error cargando datos'))
      .finally(() => setLoading(false));
  }, []);

  const teams = data ? Object.keys(data.byTeam).sort() : [];

  return (
    <main style={{ minHeight: '100vh', background: '#081008', color: '#f3f4f6' }}>
      {/* NAV */}
      <nav style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
          <Link href="/jornada" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>📊 Jornada</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 20px' }}>
        {/* HEADER */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)', color: '#4ade80', fontSize: 12, fontWeight: 700 }}>
              📊 ANÁLISIS DE JORNADA
            </div>
            {data?.injuryCount !== undefined && data.injuryCount > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 12, fontWeight: 700 }}>
                🏥 {data.injuryCount} lesiones API
              </div>
            )}
            {data?.oddsFixtures !== undefined && data.oddsFixtures > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
                📊 Dificultad por cuotas
              </div>
            )}
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 900, margin: '0 0 8px 0' }}>
            {data?.round ? `Jornada ${data.round}` : 'Jornada actual'}
            {data?.nextRound && (
              <span style={{ fontSize: 16, fontWeight: 600, color: '#6b7280', marginLeft: 14 }}>
                → Próxima: J{data.roundNumber + 1}
              </span>
            )}
          </h1>
          <p style={{ color: '#9ca3af', fontSize: 15, margin: 0 }}>
            Gangas y mejores opciones analizadas con datos reales de la API Pro
            {data?.totalPlayers ? ` · ${data.totalPlayers} jugadores` : ''}
          </p>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚽</div>
            <div>Analizando toda LaLiga con datos Pro...</div>
            <div style={{ fontSize: 12, marginTop: 8, color: '#4b5563' }}>Lesiones + cuotas + forma reciente</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 20, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            ⚠ {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* GANGAS */}
            <section style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 4, height: 28, borderRadius: 2, background: '#22c55e' }} />
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🔥 Las 5 Gangas de la Jornada</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
                {data.gangas.map((p) => (
                  <PlayerCardComponent key={p.name} player={p} isGanga />
                ))}
              </div>
            </section>

            {/* EQUIPOS */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 4, height: 28, borderRadius: 2, background: '#3b82f6' }} />
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🏟 Mejores por Equipo</h2>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                <button
                  onClick={() => setSelectedTeam(null)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: selectedTeam === null ? '#16a34a' : 'rgba(255,255,255,0.06)', color: selectedTeam === null ? 'white' : '#9ca3af', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Todos
                </button>
                {teams.map((team) => (
                  <button
                    key={team}
                    onClick={() => setSelectedTeam(team === selectedTeam ? null : team)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: selectedTeam === team ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.08)', background: selectedTeam === team ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)', color: selectedTeam === team ? '#93c5fd' : '#d1d5db', fontWeight: selectedTeam === team ? 700 : 500, fontSize: 13, cursor: 'pointer' }}
                  >
                    {team}
                  </button>
                ))}
              </div>

              {selectedTeam ? (
                <div>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#93c5fd' }}>
                    {selectedTeam} — Top jugadores
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
                    {(data.byTeam[selectedTeam] || []).map((p) => (
                      <PlayerCardComponent key={p.name} player={p} />
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 32 }}>
                  {teams.map((team) => (
                    <div key={team}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{team}</h3>
                        <button
                          onClick={() => setSelectedTeam(team)}
                          style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 12 }}
                        >
                          Ver solo {team} →
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
                        {(data.byTeam[team] || []).map((p) => (
                          <PlayerCardComponent key={p.name} player={p} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* FOOTER INFO */}
            <div style={{ marginTop: 48, padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12, color: '#4b5563', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <span>⚡ Datos en tiempo real · API-Football Pro</span>
              <span>🏥 Lesiones reales por partido</span>
              <span>📊 Dificultad calculada desde cuotas de Bet365</span>
              <span>🤖 {data.totalPlayers} jugadores analizados</span>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
