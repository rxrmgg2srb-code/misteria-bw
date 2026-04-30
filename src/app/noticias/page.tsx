'use client';

import { useState } from 'react';
import { sanitizeArticleHtml } from '@/lib/sanitize-html';

const TOPICS = [
  'Los mejores fichajes para Biwenger esta jornada de LaLiga',
  'Jugadores más infravalorados del mercado de Biwenger',
  'Cómo elegir el capitán en Biwenger: guía definitiva',
  'Los porteros más rentables en fantasy LaLiga Sofascore',
  'Jugadores del Barça imprescindibles en Biwenger',
  'Mejores defensas para poner en tu once de Biwenger',
  'Jugadores con partido doble: maximiza puntos en Biwenger',
  'Cómo gestionar el presupuesto en Biwenger y ganar valor',
  'Errores más comunes en Biwenger y cómo evitarlos',
  'Análisis de la jornada: quién juega y quién descansa',
];

interface Article {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  tags: string[];
  readTime: number;
  publishedAt: string;
  topic: string;
}

const DEMO_MURO = [
  {
    player: 'Lamine Yamal',
    flag: 'injured',
    title: 'Lamine Yamal, baja por una lesión de grado 1 en la sindesmosis del tobillo derecho',
    source: 'FC Barcelona Oficial',
    time: 'Hace 12 min',
    desc: 'El jugador será baja alrededor de dos a tres semanas. Se pierde el partido con la Selección.',
    url: 'https://www.marca.com/futbol/barcelona/2024/11/11/lamine-yamal-baja-dos-tres-semanas.html',
  },
  {
    player: 'Lewandowski',
    flag: 'injured',
    title: 'Lewandowski sufre una lesión lumbar y estará 10 días de baja',
    source: 'AS',
    time: 'Hace 45 min',
    desc: 'El delantero polaco no viajará con su selección y descansará para recuperarse de sus molestias en la espalda.',
    url: 'https://as.com/futbol/primera/lewandowski-10-dias-de-baja-lamine-duda-n/',
  },
  {
    player: 'Isco',
    flag: 'fit',
    title: 'Isco acelera su recuperación y ya toca balón',
    source: 'Relevo',
    time: 'Hace 2 horas',
    desc: 'El mediocentro bético recorta plazos y su vuelta está más cerca que nunca.',
    url: 'https://www.relevo.com',
  },
  {
    player: 'Militao',
    flag: 'injured',
    title: 'Confirmada la rotura completa del ligamento cruzado de Éder Militao',
    source: 'Marca',
    time: 'Hace 5 horas',
    desc: 'El central brasileño dice adiós a la temporada. Pésima noticia para el Real Madrid y Biwenger.',
    url: 'https://www.marca.com/futbol/real-madrid/2024/11/09/militao-rotura-completa-ligamento-cruzado.html',
  },
  {
    player: 'Lo Celso',
    flag: 'risk',
    title: 'Pellegrini dará descanso a Lo Celso tras el parón',
    source: 'Estadio Deportivo',
    time: 'Hace 6 horas',
    desc: 'El técnico quiere proteger al argentino de una posible recaída por la acumulación de minutos.',
    url: 'https://www.estadiodeportivo.com',
  },
];

export default function Noticias() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [tab, setTab] = useState<'articulos' | 'muro'>('muro');
  const [selected, setSelected] = useState<Article | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const generateArticle = async (topic?: string) => {
    setGenerating(true);
    setError('');

    try {
      const url = topic ? `/api/news?topic=${encodeURIComponent(topic)}` : '/api/news';
      const res = await fetch(url);
      const data: Article & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo generar el artículo.');
      }
      setArticles((prev) => [data, ...prev]);
    } catch (e: any) {
      setError(e?.message || 'No se pudo generar el artículo.');
    } finally {
      setGenerating(false);
    }
  };

  if (selected) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0f0a', color: '#f1f5f9' }}>
        <nav style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#f1f5f9' }}>
            <div style={{ width: 32, height: 32, background: '#16a34a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>B</div>
            <span style={{ fontWeight: 700, fontSize: 18 }}>BiwengerIA</span>
          </a>
          <button onClick={() => setSelected(null)} style={{ background: 'rgba(255,255,255,0.07)', color: '#f1f5f9', padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 13 }}>
            ← Volver
          </button>
        </nav>

        <article style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {selected.tags?.map((tag, index) => (
              <span key={index} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
                {tag}
              </span>
            ))}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>{selected.title}</h1>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 40 }}>
            {new Date(selected.publishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · {selected.readTime || 3} min de lectura
          </p>
          <div
            style={{ lineHeight: 1.8, fontSize: 16, color: '#d1d5db' }}
            dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(selected.body) }}
          />
        </article>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0f0a', color: '#f1f5f9' }}>
      <nav style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#f1f5f9' }}>
          <div style={{ width: 32, height: 32, background: '#16a34a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>B</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>BiwengerIA</span>
        </a>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/analyzer" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 14 }}>Analizador</a>
          <span style={{ color: '#22c55e', fontSize: 14, fontWeight: 600 }}>Noticias</span>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Centro de Noticias</h1>
            <p style={{ color: '#9ca3af', fontSize: 15 }}>Todo lo que necesitas saber antes del cierre de jornada.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={() => setTab('muro')} style={{ background: 'none', border: 'none', padding: '0 0 12px 0', color: tab === 'muro' ? '#4ade80' : '#9ca3af', fontWeight: tab === 'muro' ? 700 : 600, fontSize: 16, cursor: 'pointer', borderBottom: tab === 'muro' ? '2px solid #4ade80' : '2px solid transparent' }}>
            🔴 Muro en Directo (Demo)
          </button>
          <button onClick={() => setTab('articulos')} style={{ background: 'none', border: 'none', padding: '0 0 12px 0', color: tab === 'articulos' ? '#4ade80' : '#9ca3af', fontWeight: tab === 'articulos' ? 700 : 600, fontSize: 16, cursor: 'pointer', borderBottom: tab === 'articulos' ? '2px solid #4ade80' : '2px solid transparent' }}>
            📝 Artículos SEO (IA)
          </button>
        </div>

        {tab === 'muro' && (
          <div>
            <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', padding: 16, borderRadius: 12, marginBottom: 24 }}>
              <p style={{ color: '#4ade80', fontSize: 14, fontWeight: 600 }}>
                Esta vista enseña el formato editorial final. Ahora mismo sigue siendo una demo visual y no un muro persistido en base de datos.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {DEMO_MURO.map((item, index) => {
                const color = item.flag === 'injured' ? '#f87171' : item.flag === 'risk' ? '#f97316' : '#4ade80';
                return (
                  <div key={index} style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `4px solid ${color}`, borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, background: `${color}22`, color, padding: '4px 10px', borderRadius: 20 }}>
                          {item.flag === 'injured' ? '✕ Baja' : item.flag === 'risk' ? '⚠ Rotación' : '✓ Disponible'}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>{item.player}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{item.time}</span>
                    </div>

                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>{item.title}</h3>
                    <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>{item.desc}</p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>FUENTE: {item.source}</span>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', textDecoration: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Leer original →
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'articulos' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ color: '#9ca3af', fontSize: 14 }}>Generador de artículos profundos para posicionar en Google.</p>
              <button onClick={() => generateArticle()} disabled={generating} style={{ background: '#16a34a', color: 'white', padding: '8px 16px', borderRadius: 8, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: generating ? 0.6 : 1 }}>
                {generating ? 'Generando...' : '+ Nuevo artículo'}
              </button>
            </div>

            {error && (
              <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5', padding: 12, borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
              {TOPICS.slice(0, 6).map((topic, index) => (
                <button key={index} onClick={() => generateArticle(topic)} disabled={generating} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db', cursor: 'pointer' }}>
                  {topic.length > 35 ? `${topic.substring(0, 35)}...` : topic}
                </button>
              ))}
            </div>

            {generating && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 32, textAlign: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Escribiendo artículo...</p>
                <p style={{ color: '#9ca3af', fontSize: 14 }}>La IA está redactando contenido optimizado.</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
              {articles.map((article, index) => (
                <div
                  key={index}
                  onClick={() => setSelected(article)}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)';
                    event.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    event.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    {(article.tags || []).slice(0, 2).map((tag, tagIndex) => (
                      <span key={tagIndex} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 10 }}>{article.title}</h3>
                  <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5, marginBottom: 14 }}>{article.excerpt}</p>
                  <p style={{ fontSize: 11, color: '#4b5563' }}>{new Date(article.publishedAt).toLocaleDateString('es-ES')} · {article.readTime || 3} min</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
