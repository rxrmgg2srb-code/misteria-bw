'use client';

import { useEffect, useState } from 'react';
import { Player } from '@/lib/biwenger';

// Utilidades UI
const POS_COLOR: Record<string, string> = { PT: '#f59e0b', DF: '#60a5fa', MC: '#4ade80', DL: '#f87171' };

interface TransferItem {
  vender: string;
  comprar: string;
  posicion: string;
  precio_estimado: string;
  razon: string;
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
    razonamiento?: string;
    precio_equipo?: number;
  };
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

function Pitch({ formation, eleven, captain }: { formation: string; eleven: string[]; captain: string }) {
  const rows = [1, ...formation.split('-').map(Number)];
  const width = 500;
  const height = 560;
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
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block', maxHeight: 650, borderRadius: 14 }}>
      <rect width={width} height={height} rx={14} fill="#14532d" />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.15)" />
      <circle cx={width / 2} cy={height / 2} r={45} fill="none" stroke="rgba(255,255,255,0.15)" />
      <rect x={width * 0.2} y={12} width={width * 0.6} height={75} fill="none" stroke="rgba(255,255,255,0.12)" rx={2} />
      <rect x={width * 0.2} y={height - 87} width={width * 0.6} height={75} fill="none" stroke="rgba(255,255,255,0.12)" rx={2} />
      {points.map((point) => (
        <g key={point.name}>
          <svg x={point.x - 24} y={point.y - 28} width={48} height={48} viewBox="0 0 24 24" fill={point.captain ? '#f59e0b' : '#f3f4f6'} stroke={point.captain ? '#b45309' : '#9ca3af'} strokeWidth={1}>
            <path d="M20.38 3.46 16 2a8 8 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
          </svg>
          <rect x={point.x - 35} y={point.y + 24} width={70} height={18} fill="rgba(0,0,0,0.6)" rx={4} />
          <text x={point.x} y={point.y + 36} textAnchor="middle" fontSize={11} fontWeight="800" fill="#ffffff">
            {point.name.split(' ').slice(-1)[0].substring(0, 11)}
          </text>
          {point.captain && (
            <>
              <circle cx={point.x + 16} cy={point.y - 18} r={9} fill="#ef4444" stroke="#7f1d1d" strokeWidth={1} />
              <text x={point.x + 16} y={point.y - 14} textAnchor="middle" fontSize={9} fontWeight="800" fill="white">C</text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function Mejor11Page() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMejor11() {
      try {
        const response = await fetch('/api/mejor-11');
        if (!response.ok) {
          throw new Error('Error al generar el mejor 11');
        }
        const data = await response.json();
        setResult(data.result);
      } catch (err: any) {
        setError(err.message || 'Error desconocido');
      } finally {
        setLoading(false);
      }
    }
    
    fetchMejor11();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <h2 style={{ marginTop: 24, fontSize: 20, color: '#f3f4f6' }}>Analizando 500+ jugadores de LaLiga...</h2>
        <p style={{ color: '#9ca3af', marginTop: 8 }}>Calculando 32 dimensiones para encontrar el XI óptimo global.</p>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '16px', borderRadius: '8px' }}>
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <main style={{ minHeight: '100vh', background: '#030712', color: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#0a0a0a' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'white' }}>B</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f3f4f6' }}>BiwengerIA</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Copiloto fantasy</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 14, flexWrap: 'wrap' }}>
            <a href="/analyzer" style={{ color: '#d1d5db', textDecoration: 'none' }}>Copiloto</a>
            <a href="/mejor-11" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>🏆 Mejor 11</a>
            <a href="/jornada" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>📊 Jornada</a>
            {/* <a href="/noticias" style={{ color: '#6b7280', textDecoration: 'none' }}>Noticias</a> */}
          </div>
        </div>
      </header>

      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
          <section style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⭐</span> Once de Gala ({result.formacion})
            </h2>
            <Pitch formation={result.formacion} eleven={result.once} captain={result.capitan} />
            <div style={{ marginTop: '16px', background: 'rgba(59,130,246,0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#60a5fa' }}>Razonamiento de la IA</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#d1d5db', lineHeight: 1.5 }}>
                {result.resumen?.razonamiento || result.razonamiento}
              </p>
            </div>
          </section>

          <section style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#f3f4f6' }}>Puntuación Proyectada</h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '24px' }}>
              <span style={{ fontSize: '48px', fontWeight: 900, color: '#3b82f6', lineHeight: 1 }}>{Math.round(result.puntuacion_estimada * 1.5)}</span>
              <span style={{ fontSize: '18px', color: '#6b7280', paddingBottom: '6px' }}>pts</span>
            </div>
            
            {result.resumen?.precio_equipo && (
              <div style={{ marginBottom: '24px', background: 'rgba(245,158,11,0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#fcd34d', fontWeight: 700 }}>Valor del XI Ideal</span>
                <span style={{ fontSize: '18px', color: '#f59e0b', fontWeight: 900 }}>
                  {(result.resumen.precio_equipo / 1000000).toFixed(1)}M €
                </span>
              </div>
            )}
            
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#d1d5db', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Lista del Once</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {result.once.map((p) => (
                <div key={p} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontWeight: p === result.capitan ? 800 : 500, color: p === result.capitan ? '#f59e0b' : '#f3f4f6' }}>
                    {p} {p === result.capitan && '(C)'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {result.debugScores && result.debugScores.length > 0 && (
          <section style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📊</span> Radiografía de Scores (Top 50 Global)
            </h2>
            <div style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px' }}>
              <table style={{ width: '100%', minWidth: '1800px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#f3f4f6', position: 'sticky', left: 0, background: '#111827', zIndex: 2 }}>Jugador</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#9ca3af' }}>TOTAL</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Media</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Forma</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Rival</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Señales</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Fiab.</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Disp.</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Carga</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Live</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Rotac.</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Rebote</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Moment.</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Motiv.</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>Consis.</th>
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
                  {result.debugScores.slice(0, 50).map((row) => {
                    const roleColor = row.role === 'starter' ? '#4ade80' : row.role === 'bench' ? '#fcd34d' : '#9ca3af';
                    const roleBg = row.role === 'starter' ? 'rgba(74,222,128,0.05)' : row.role === 'bench' ? 'rgba(252,211,77,0.05)' : 'transparent';
                    const cellColor = (v: number) => v > 0.5 ? '#4ade80' : v < -0.5 ? '#f87171' : '#9ca3af';
                    return (
                      <tr key={row.name} style={{ background: roleBg, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 800, color: roleColor, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: row.role === 'starter' ? '#0f1a0f' : row.role === 'bench' ? '#151a0f' : '#0a0f0a', zIndex: 1 }}>
                          {row.role === 'starter' ? '✓ ' : row.role === 'bench' ? '⏸ ' : ''}{row.name} <span style={{ color: POS_COLOR[row.pos], fontSize: 10, marginLeft: 4 }}>{row.pos}</span>
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center', fontWeight: 800, color: '#f3f4f6', background: 'rgba(255,255,255,0.02)' }}>{row.total.toFixed(1)}</td>
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
            <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#4b5563' }}>✓ = Titular absoluto · ⏸ = Suplente Élite · 32 dimensiones por jugador</p>
          </section>
        )}
      </div>
    </main>
  );
}
