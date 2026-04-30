import { NextRequest, NextResponse } from 'next/server';
import { buildPlayerSignals, consolidateFlags, scrapeInjuryNews } from '@/lib/scraper';
import { getClientIp, normalizePlayerNames, takeRateLimit } from '@/lib/server-guard';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limit = takeRateLimit(`scrape:${ip}`, 20, 3600_000);

    if (!limit.ok) {
      return NextResponse.json({ error: 'Limite de escaneos alcanzado. Prueba mas tarde.' }, { status: 429 });
    }

    const { players } = await req.json();
    const playerNames = normalizePlayerNames(players);
    if (!playerNames) {
      return NextResponse.json({ error: 'Lista de jugadores requerida.' }, { status: 400 });
    }

    const news = await scrapeInjuryNews(playerNames);
    const flags = consolidateFlags(news, playerNames);
    const signals = buildPlayerSignals(news, playerNames);

    return NextResponse.json({
      news: news.slice(0, 20),
      flags,
      signals: Object.values(signals).sort((a, b) => b.confidence - a.confidence),
      scrapedAt: new Date().toISOString(),
      sources: [...new Set(news.map((item) => item.source))],
      totalFound: news.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al escanear noticias.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
