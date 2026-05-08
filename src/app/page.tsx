'use client';

import Link from 'next/link';

const FEATURES = [
  {
    emoji: '🧠',
    title: '32 dimensiones de scoring',
    desc: 'Cada jugador se evalúa con 32 métricas: forma, consistencia, fixture, motivación, calendario UEFA, cuotas de apuestas, regresión a la media, techo explosivo y más.',
  },
  {
    emoji: '🏥',
    title: 'Partes médicos en tiempo real',
    desc: 'Cruzamos los 500+ jugadores de LaLiga con los partes médicos oficiales de API-Football Pro. Si un jugador está descartado, jamás aparecerá en tu once.',
  },
  {
    emoji: '💰',
    title: 'Dificultad Bet365',
    desc: 'En vez de la dificultad genérica de Biwenger, usamos las cuotas reales de Bet365 para calcular la dificultad exacta de cada partido.',
  },
  {
    emoji: '⚽',
    title: 'Alineaciones reales',
    desc: 'Analizamos los últimos 50 partidos de cada equipo para calcular el ratio de titularidad real de cada jugador. No adivinamos: medimos.',
  },
  {
    emoji: '🔥',
    title: 'Motivación y contexto',
    desc: 'Sabemos si un equipo pelea por Champions, se juega el descenso o está en tierra de nadie. Y eso afecta directamente a la recomendación.',
  },
  {
    emoji: '📅',
    title: 'Calendario UEFA',
    desc: 'Si un equipo juega Champions o Europa League entre semana, penalizamos a los titulares habituales por riesgo de rotación.',
  },
];

const SECTIONS = [
  {
    href: '/analyzer',
    emoji: '🤖',
    title: 'Copiloto IA',
    desc: 'Pega tu plantilla de Biwenger y recibe un once ideal personalizado con 32 dimensiones de análisis.',
    color: '#16a34a',
    border: 'rgba(34,197,94,0.3)',
  },
  {
    href: '/mejor-11',
    emoji: '🏆',
    title: 'Mejor 11 Global',
    desc: 'El mejor once posible de TODA LaLiga para la próxima jornada. Análisis de 500+ jugadores.',
    color: '#3b82f6',
    border: 'rgba(59,130,246,0.3)',
  },
  {
    href: '/jornada',
    emoji: '📊',
    title: 'Radar de Jornada',
    desc: 'Las 5 mejores gangas del mercado y los 4 mejores jugadores de cada equipo para esta jornada.',
    color: '#f59e0b',
    border: 'rgba(245,158,11,0.3)',
  },
  {
    href: '/equipos',
    emoji: '🏟',
    title: 'Onces por Equipo',
    desc: 'Once probable de cada equipo basado en titularidad real, lesiones y contexto de calendario.',
    color: '#8b5cf6',
    border: 'rgba(139,92,246,0.3)',
  },
];

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#081008', color: '#f3f4f6' }}>
      <nav style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>B</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>BiwengerIA</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Copiloto fantasy · API-Football Pro</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 14, flexWrap: 'wrap' }}>
          <Link href="/analyzer" style={{ color: '#d1d5db', textDecoration: 'none' }}>Copiloto</Link>
          <Link href="/mejor-11" style={{ color: '#d1d5db', textDecoration: 'none', fontWeight: 600 }}>🏆 Mejor 11</Link>
          <Link href="/jornada" style={{ color: '#d1d5db', textDecoration: 'none', fontWeight: 600 }}>📊 Jornada</Link>
          <Link href="/equipos" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>🏟 Equipos</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '88px 24px 56px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)', color: '#4ade80', fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
            ⚡ Powered by API-Football Pro · Bet365 Odds · Claude IA
          </div>
          <h1 style={{ fontSize: 'clamp(38px,6vw,72px)', lineHeight: 1.02, margin: 0, maxWidth: 900, fontWeight: 900 }}>
            No te contamos LaLiga.
            <br />
            <span style={{ color: '#22c55e' }}>Te decimos qué hacer en tu fantasy.</span>
          </h1>
          <p style={{ marginTop: 24, maxWidth: 680, fontSize: 20, lineHeight: 1.55, color: '#9ca3af' }}>
            BiwengerIA analiza 500+ jugadores con datos profesionales: alineaciones reales, partes médicos oficiales, cuotas de apuestas y contexto de liga. Todo para darte el mejor once posible cada jornada.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 }}>
            <Link href="/analyzer" style={{ background: '#16a34a', color: 'white', padding: '15px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 16 }}>
              Abrir copiloto
            </Link>
            <Link href="/mejor-11" style={{ background: '#1e3a8a', color: '#93c5fd', padding: '15px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 16, border: '1px solid #3b82f6' }}>
              🏆 Ver Mejor 11
            </Link>
            <Link href="/equipos" style={{ background: 'rgba(139,92,246,0.15)', color: '#c084fc', padding: '15px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 16, border: '1px solid rgba(139,92,246,0.3)' }}>
              🏟 Onces por equipo
            </Link>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section style={{ padding: '0 24px 48px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ padding: 22, borderRadius: 14, background: `${s.color}08`, border: `1px solid ${s.border}`, transition: 'transform 0.15s, box-shadow 0.15s', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${s.color}22`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
              >
                <div style={{ fontSize: 28, marginBottom: 10 }}>{s.emoji}</div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 17, fontWeight: 800, color: s.color }}>{s.title}</h3>
                <p style={{ margin: 0, color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 24, textAlign: 'center' }}>
            Motor de análisis <span style={{ color: '#22c55e' }}>profesional</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18 }}>
            {FEATURES.map((feature) => (
              <div key={feature.title} style={{ padding: 22, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{feature.emoji}</div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: 17, fontWeight: 800 }}>{feature.title}</h3>
                <p style={{ margin: 0, color: '#9ca3af', fontSize: 14, lineHeight: 1.6 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data sources */}
      <section style={{ padding: '0 24px 88px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          <div style={{ padding: 24, borderRadius: 14, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.16)' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: 12, letterSpacing: '0.08em', color: '#86efac', fontWeight: 800 }}>FUENTES DE DATOS</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                '⚽ API-Football Pro — Alineaciones reales',
                '🏥 API-Football Pro — Partes médicos oficiales',
                '💰 Bet365 — Cuotas de apuestas reales',
                '🏆 LaLiga Standings — Clasificación en directo',
                '📅 UEFA Calendar — Presión de calendario',
                '🤖 Claude IA — Análisis de noticias',
                '📰 Web Scraping — Noticias de LaLiga',
              ].map((item) => (
                <div key={item} style={{ fontSize: 14, color: '#d1d5db' }}>{item}</div>
              ))}
            </div>
          </div>

          <div style={{ padding: 24, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: 12, letterSpacing: '0.08em', color: '#6b7280', fontWeight: 800 }}>LO QUE HACE POR TI</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                'Once ideal con 32 dimensiones',
                'Capitán óptimo por fixture',
                'Fichajes accionables del mercado',
                'Radar de gangas por jornada',
                'Once probable por equipo',
                'Alertas de lesión en tiempo real',
                'Detección automática de rotaciones',
              ].map((item) => (
                <div key={item} style={{ fontSize: 14, color: '#d1d5db' }}>✓ {item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '24px', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
        BiwengerIA · Copiloto fantasy profesional · Powered by API-Football Pro + Claude IA
      </footer>
    </main>
  );
}
