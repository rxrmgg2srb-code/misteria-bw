'use client';

import Link from 'next/link';

const FEATURES = [
  {
    title: 'Que hacer hoy',
    desc: 'No te suelta una lista de datos. Te da tres decisiones claras antes del cierre: a quien alinear, a quien sentar y donde atacar el mercado.',
  },
  {
    title: 'Confianza real',
    desc: 'Cada recomendacion llega con una lectura de confianza, riesgo y margen de error para que no juegues a ciegas.',
  },
  {
    title: 'Mercado accionable',
    desc: 'No busca fichajes bonitos para todos. Prioriza operaciones que mejoren tu once y suban tu techo de puntos.',
  },
  {
    title: 'Radar de jornada',
    desc: 'Suelo esperado, techo diferencial, riesgo de rotacion y estabilidad del once en una sola lectura.',
  },
  {
    title: 'Contexto de liga',
    desc: 'La base ya esta preparada para evolucionar hacia decisiones segun tu plantilla, tu mercado y tu forma de competir.',
  },
  {
    title: 'Producto, no medio',
    desc: 'La ambicion no es ser otra web de noticias. Es ser el copiloto fantasy que te ayuda a ganar tu liga.',
  },
];

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#081008', color: '#f3f4f6' }}>
      <nav style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>B</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>BiwengerIA</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Copiloto fantasy</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 14 }}>
          <Link href="/analyzer" style={{ color: '#d1d5db', textDecoration: 'none' }}>Copiloto</Link>
          <Link href="/mejor-11" style={{ color: '#d1d5db', textDecoration: 'none', fontWeight: 600 }}>🏆 Mejor 11</Link>
          <Link href="/jornada" style={{ color: '#d1d5db', textDecoration: 'none', fontWeight: 600 }}>📊 Jornada</Link>
          <Link href="/equipos" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>🏙 Equipos</Link>
          {/* <Link href="/noticias" style={{ color: '#6b7280', textDecoration: 'none' }}>Noticias</Link> */}
        </div>
      </nav>

      <section style={{ padding: '88px 24px 56px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)', color: '#4ade80', fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
            Producto de decision para fantasy LaLiga
          </div>
          <h1 style={{ fontSize: 'clamp(38px,6vw,72px)', lineHeight: 1.02, margin: 0, maxWidth: 900, fontWeight: 900 }}>
            No te contamos LaLiga.
            <br />
            <span style={{ color: '#22c55e' }}>Te decimos que hacer en tu fantasy.</span>
          </h1>
          <p style={{ marginTop: 24, maxWidth: 680, fontSize: 20, lineHeight: 1.55, color: '#9ca3af' }}>
            BiwengerIA deja de ser un analizador generico y empieza a comportarse como un copiloto: plan del dia, once recomendado, capitan, radar de riesgo y siguiente movimiento de mercado.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 }}>
            <Link href="/analyzer" style={{ background: '#16a34a', color: 'white', padding: '15px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 16 }}>
              Abrir copiloto
            </Link>
            <Link href="/mejor-11" style={{ background: '#1e3a8a', color: '#93c5fd', padding: '15px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 16, border: '1px solid #3b82f6' }}>
              🏆 Ver Mejor 11
            </Link>
            <Link href="/jornada" style={{ background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', padding: '15px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 16, border: '1px solid rgba(255,255,255,0.10)' }}>
              📊 Ver Gangas de la Jornada
            </Link>
          </div>
        </div>
      </section>

      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18 }}>
          {FEATURES.map((feature) => (
            <div key={feature.title} style={{ padding: 22, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: 17, fontWeight: 800 }}>{feature.title}</h3>
              <p style={{ margin: 0, color: '#9ca3af', fontSize: 14, lineHeight: 1.6 }}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 24px 88px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          <div style={{ padding: 24, borderRadius: 14, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.16)' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: 12, letterSpacing: '0.08em', color: '#86efac', fontWeight: 800 }}>POSICIONAMIENTO</p>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>Tu ventaja no es publicar mas. Es decidir mejor.</h2>
            <p style={{ marginTop: 16, marginBottom: 0, color: '#d1d5db', lineHeight: 1.7, fontSize: 15 }}>
              Comuniate, Jornada Perfecta y FutbolFantasy ya dominan la informacion general. El hueco ganador esta en convertir esa informacion en decisiones personalizadas y rapidas. Ese es el producto que estamos construyendo aqui.
            </p>
          </div>

          <div style={{ padding: 24, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: 12, letterSpacing: '0.08em', color: '#6b7280', fontWeight: 800 }}>LO QUE YA HACE</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                'Plan de jornada',
                'Once, capitan y banquillo',
                'Fichajes sugeridos',
                'Lectura de riesgo',
                'Noticias como soporte',
              ].map((item) => (
                <div key={item} style={{ fontSize: 14, color: '#d1d5db' }}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '24px', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
        BiwengerIA · copiloto fantasy para tomar mejores decisiones de jornada
      </footer>
    </main>
  );
}
