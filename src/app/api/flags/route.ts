import { NextRequest, NextResponse } from 'next/server';
import { askClaude } from '@/lib/claude';
import { normalizeStoredPlayer } from '@/lib/biwenger';
import type { Player } from '@/lib/biwenger';
import {
  applySignalsToSquad,
  buildPlayerSignals,
  consolidateFlags,
  scrapeInjuryNews,
} from '@/lib/scraper';
import type { SignalFlag } from '@/lib/scraper';
import { getClientIp, normalizePlayerNames, takeRateLimit } from '@/lib/server-guard';
import { getNextRoundInjuries } from '@/lib/api-football';
import type { PlayerInjury } from '@/lib/api-football';

function normName(n: string) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Match a player name against the API-Football injury map */
function findInjury(name: string, injuryMap: Map<string, PlayerInjury>): PlayerInjury | null {
  const target = normName(name);
  const targetParts = target.split(' ');
  for (const [injName, inj] of injuryMap) {
    const real = normName(injName);
    if (real === target || real.includes(target) || target.includes(real)) return inj;
    const realParts = real.split(' ');
    const realLast = realParts[realParts.length - 1];
    if (realLast.length >= 4 && targetParts.some(p => p === realLast)) return inj;
    for (const part of targetParts) {
      if (part.length >= 5 && realParts.some(rp => rp === part)) return inj;
    }
  }
  return null;
}

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

    // Parallel: scrape news + fetch API-Football injuries
    const [news, injuryMap] = await Promise.all([
      scrapeInjuryNews(playerNames),
      getNextRoundInjuries(),
    ]);

    const signals = buildPlayerSignals(news, playerNames);
    const rawFlags = consolidateFlags(news, playerNames);
    let mergedFlags: Record<string, SignalFlag> = { ...rawFlags };

    // Inject API-Football injuries as highest-priority flags
    const apiInjuries: { name: string; type: string; reason: string }[] = [];
    for (const name of playerNames) {
      const inj = findInjury(name, injuryMap);
      if (inj) {
        if (inj.type === 'Missing Fixture') {
          mergedFlags[name] = 'injured';
          apiInjuries.push({ name, type: inj.type, reason: inj.reason });
        } else if (inj.type === 'Questionable') {
          // Only override if not already marked as injured by scraper
          if (mergedFlags[name] !== 'injured') {
            mergedFlags[name] = 'doubtful';
          }
          apiInjuries.push({ name, type: inj.type, reason: inj.reason });
        }
      }
    }

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
        const aiMerged = mergeAiFlags(mergedFlags, parsed, signals);
        
        // Re-apply API-Football injuries (they always win over AI interpretation)
        for (const inj of apiInjuries) {
          if (inj.type === 'Missing Fixture') aiMerged[inj.name] = 'injured';
          else if (inj.type === 'Questionable' && aiMerged[inj.name] !== 'injured') aiMerged[inj.name] = 'doubtful';
        }
        mergedFlags = aiMerged;
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
      apiInjuries,
      updatedPlayers,
      scrapedAt: new Date().toISOString(),
      sources: [...new Set(news.map((item) => item.source)), 'API-Football Pro'],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al procesar noticias.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
