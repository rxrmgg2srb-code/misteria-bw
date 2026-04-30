import { NextRequest, NextResponse } from 'next/server';
import { generateNewsArticle } from '@/lib/claude';
import { getClientIp, normalizeTopic, takeRateLimit } from '@/lib/server-guard';

const TOPICS = [
  'Los mejores fichajes para Biwenger esta jornada',
  'Jugadores más infravalorados de LaLiga en fantasy',
  'Cómo elegir capitán en Biwenger: guía completa',
  'Los porteros más rentables en fantasy LaLiga',
  'Jugadores del Barça imprescindibles en Biwenger',
  'Mejores defensas para poner en tu eleven de Biwenger',
  'Jugadores con partido doble: máxima rentabilidad',
  'Cómo gestionar el presupuesto en Biwenger',
];

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limit = takeRateLimit(`news:${ip}`, 10, 3600_000);
    if (!limit.ok) {
      return NextResponse.json({ error: 'Límite de artículos alcanzado. Vuelve más tarde.' }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const requestedTopic = searchParams.get('topic');
    const normalizedTopic = normalizeTopic(requestedTopic);

    if (requestedTopic && !normalizedTopic) {
      return NextResponse.json({ error: 'Tema inválido.' }, { status: 400 });
    }

    const topic = normalizedTopic || TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const article = await generateNewsArticle(topic);
    return NextResponse.json({ ...article, publishedAt: new Date().toISOString(), topic });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error generando artículo.' }, { status: 500 });
  }
}
