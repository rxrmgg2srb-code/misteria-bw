import { NextRequest, NextResponse } from 'next/server';
import { askClaude } from '@/lib/claude';
import { normalizeStoredPlayer, type Player } from '@/lib/biwenger';
import {
  applySignalsToSquad,
  buildPlayerSignals,
  consolidateFlags,
  scrapeInjuryNews,
  type SignalFlag,
} from '@/lib/scraper';
import { getClientIp, normalizePlayerNames, takeRateLimit } from '@/lib/server-guard';

function mergeAiFlags(
  baseFlags: Record<string, SignalFlag>,
  aiFlags: Record<string, string>,
  signals: ReturnType<typeof buildPlayerSignals>
) {
  const merged: Record<string, SignalFlag> = { ...baseFlags };

  for (const [playerName, flag] of Object.entries(aiFlags)) {
    if (flag !== 'injured' && flag !== 'doubtful' && flag !== 'fit' && flag !== 'boost' && flag !== 'risk') {
      continue;
    }

    const existing = signals[playerName];
    if (existing && (existing.flag === 'injured' || existing.flag === 'doubtful') && existing.confidence >= 72) {
      continue;
    }

    merged[playerName] = flag;
  }

  return merged;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limit = takeRateLimit(`flags:${ip}`, 20, 3600_000);

    if (!limit.ok) {
      return NextResponse.json({ error: 'Limite de escaneos alcanzado. Prueba mas tarde.' }, { status: 429 });
    }

    const { players } = await req.json();
    const playerNames = normalizePlayerNames(players);

    if (!playerNames) {
      return NextResponse.json({ error: 'La lista de jugadores es invalida.' }, { status: 400 });
    }

    const normalizedPlayers = Array.isArray(players)
      ? players.map(normalizeStoredPlayer).filter((player): player is Player => player !== null)
      : [];

    const news = await scrapeInjuryNews(playerNames);
    const signals = buildPlayerSignals(news, playerNames);
    const rawFlags = consolidateFlags(news, playerNames);
    let mergedFlags: Record<string, SignalFlag> = { ...rawFlags };

    if (news.length > 0) {
      const newsText = news
        .slice(0, 12)
        .map((item) => `[${item.source}] ${item.title}: ${item.summary}`)
        .join('\n');

      const prompt = `Analiza estas noticias recientes de LaLiga y decide si hay una señal clara para alguno de estos jugadores.

JUGADORES:
${playerNames.join(', ')}

NOTICIAS:
${newsText}

REGLAS:
- "injured": baja confirmada, lesion, sancion, fuera de convocatoria
- "doubtful": duda real, molestias, pendiente de evolucion
- "fit": recuperado, disponible, vuelve con el grupo
- "boost": llega en gran forma o vuelve a ser muy recomendable
- "risk": rotacion, suplencia probable, descanso, titularidad muy dudosa
- Se conservador: si hay una duda seria, no marques "fit"
- Solo devuelve jugadores con informacion clara

Responde SOLO con JSON:
{"NombreJugador":"flag"}`;

      try {
        const text = await askClaude(prompt);
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as Record<string, string>;
        mergedFlags = mergeAiFlags(rawFlags, parsed, signals);
      } catch {}
    }

    const mergedSignals = Object.fromEntries(
      Object.entries(signals).map(([playerName, signal]) => [
        playerName,
        mergedFlags[playerName] && mergedFlags[playerName] !== signal.flag
          ? { ...signal, flag: mergedFlags[playerName] }
          : signal,
      ])
    );

    const updatedPlayers =
      normalizedPlayers.length > 0 ? applySignalsToSquad(normalizedPlayers, mergedSignals) : undefined;

    return NextResponse.json({
      flags: mergedFlags,
      signals: Object.values(mergedSignals)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 12),
      news: news.slice(0, 18),
      updatedPlayers,
      scrapedAt: new Date().toISOString(),
      sources: [...new Set(news.map((item) => item.source))],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al procesar noticias.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
