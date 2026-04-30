import type { Player, PlayerFlag, PlayerStatus } from '@/lib/biwenger';

export type SignalFlag = 'injured' | 'doubtful' | 'fit' | 'boost' | 'risk';

export interface NewsItem {
  source: string;
  title: string;
  url: string;
  players: string[];
  flags: Record<string, SignalFlag>;
  summary: string;
  fetchedAt: string;
  publishedAt?: string;
  confidence?: number;
}

export interface PlayerSignal {
  player: string;
  flag: SignalFlag;
  confidence: number;
  sourceCount: number;
  freshnessMinutes: number;
  checkedAt: string;
  summary: string;
  sources: string[];
  urls: string[];
}

const RSS_FEEDS = [
  { name: 'Relevo', url: 'https://www.relevo.es/rss/futbol.xml', weight: 1.05 },
  { name: 'AS', url: 'https://as.com/rss/tags/fantasy_futbol.xml', weight: 1.0 },
  { name: 'Marca', url: 'https://www.marca.com/rss/futbol.xml', weight: 0.95 },
  { name: 'Sport', url: 'https://www.sport.es/es/rss/futbol/rss.xml', weight: 0.9 },
];

const STRUCTURED_PAGES = [
  { name: 'FutbolFantasy Lesionados', url: 'https://www.futbolfantasy.com/laliga/lesionados', kind: 'injuries' as const, weight: 1.35 },
  { name: 'FutbolFantasy Sancionados', url: 'https://www.futbolfantasy.com/laliga/sancionados', kind: 'sanctions' as const, weight: 1.3 },
];

const INJURY_KEYWORDS = [
  'lesionado',
  'lesion',
  'baja',
  'sancionado',
  'sancion',
  'descartado',
  'no podra',
  'se pierde',
  'rotura',
  'parte medico',
  'no entra en la convocatoria',
  'fuera de la lista',
  'out',
  'ausencia',
];

const DOUBT_KEYWORDS = [
  'duda',
  'dudoso',
  'en el aire',
  'pendiente',
  'molestia',
  'sobrecarga',
  'entre algodones',
  'pendiente de evolucion',
  'no esta al cien por cien',
];

const FIT_KEYWORDS = [
  'vuelve',
  'regresa',
  'disponible',
  'recuperado',
  'apto',
  'alta medica',
  'con el grupo',
  'entra en convocatoria',
];

const NEGATED_INJURY_KEYWORDS = [
  'no tiene lesion',
  'no sufre lesion',
  'sin lesion',
  'descartan lesion',
  'descartada la lesion',
  'descartada lesion',
  'no hay lesion',
  'no es lesion',
  'sin rotura',
];

const PAST_INJURY_CONTEXT_KEYWORDS = [
  'tras su lesion',
  'tras su ultima lesion',
  'despues de su lesion',
  'despues de la lesion',
  'tras superar lesiones',
  'tras superar la lesion',
  'regreso tras su lesion',
  'regresa tras su lesion',
  'vuelve tras su lesion',
  'recuperacion',
];

const BOOST_KEYWORDS = [
  'en forma',
  'racha',
  'goleador',
  'hat-trick',
  'asistencia',
  'destacado',
  'mvp',
  'figura',
];

const RISK_KEYWORDS = [
  'suplente',
  'rotacion',
  'rotara',
  'banquillo',
  'descansa',
  'reserva',
  'alternativa',
  'no apunta al once',
  'podria descansar',
  'podria ser suplente',
  'no sera titular',
  'gestion de cargas',
  'carga de minutos',
  'dosificacion',
];

const FLAG_PRIORITY: Record<SignalFlag, number> = {
  injured: 5,
  doubtful: 4,
  risk: 3,
  fit: 2,
  boost: 1,
};

const FLAG_BASE_SCORE: Record<SignalFlag, number> = {
  injured: 28,
  doubtful: 24,
  risk: 18,
  fit: 14,
  boost: 10,
};

const COMMON_LAST_NAMES = new Set([
  'garcia',
  'rodriguez',
  'fernandez',
  'martinez',
  'lopez',
  'sanchez',
  'perez',
  'gomez',
  'diaz',
  'torres',
  'moreno',
  'ruiz',
  'blanco',
  'soria',
  'costas',
  'martin',
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function decodeHtmlEntities(text: string) {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&aacute;': 'a',
    '&eacute;': 'e',
    '&iacute;': 'i',
    '&oacute;': 'o',
    '&uacute;': 'u',
    '&Aacute;': 'A',
    '&Eacute;': 'E',
    '&Iacute;': 'I',
    '&Oacute;': 'O',
    '&Uacute;': 'U',
    '&ntilde;': 'n',
    '&Ntilde;': 'N',
    '&uuml;': 'u',
    '&Uuml;': 'U',
  };

  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[A-Za-z#0-9]+;/g, (entity) => named[entity] || entity);
}

function stripHtml(text: string) {
  return decodeHtmlEntities(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeText(text: string) {
  return stripHtml(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionRegex(phrase: string) {
  const escaped = escapeRegExp(phrase.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i');
}

function containsMention(text: string, phrase: string) {
  return mentionRegex(phrase).test(text);
}

function mentionIndex(text: string, phrase: string) {
  const match = mentionRegex(phrase).exec(text);
  return match ? match.index + (match[1]?.length || 0) : -1;
}

function matchPlayerName(candidate: string, playerNames: string[]) {
  const normalizedCandidate = normalizeText(candidate);
  const candidateLast = normalizedCandidate.split(' ').pop() || normalizedCandidate;
  const allowLastNameFallback = candidateLast.length > 3 && !COMMON_LAST_NAMES.has(candidateLast);

  for (const playerName of playerNames) {
    const normalizedPlayer = normalizeText(playerName);
    const playerLast = normalizedPlayer.split(' ').pop() || normalizedPlayer;

    if (normalizedCandidate === normalizedPlayer) {
      return playerName;
    }

    if (allowLastNameFallback && candidateLast === playerLast) {
      return playerName;
    }
  }

  return null;
}

function extractPublishedAt(rawValue: string) {
  const parsed = Date.parse(stripHtml(rawValue));
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function keywordScore(context: string) {
  const lowered = normalizeText(context);
  const hasNegatedInjury = NEGATED_INJURY_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasPastInjuryContext = PAST_INJURY_CONTEXT_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasInjury = INJURY_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasDoubt = DOUBT_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasFit = FIT_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasRisk = RISK_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasBoost = BOOST_KEYWORDS.some((keyword) => lowered.includes(keyword));

  if (hasNegatedInjury && hasDoubt) {
    return 'doubtful' as const;
  }
  if (hasNegatedInjury && hasRisk) {
    return 'risk' as const;
  }
  if (hasNegatedInjury) {
    return 'fit' as const;
  }
  if (hasPastInjuryContext && hasDoubt) {
    return 'doubtful' as const;
  }
  if (hasPastInjuryContext && hasRisk) {
    return 'risk' as const;
  }
  if (hasPastInjuryContext) {
    return hasFit ? ('fit' as const) : null;
  }
  if (hasInjury && hasFit) {
    return 'doubtful' as const;
  }
  if (hasInjury) {
    return 'injured' as const;
  }
  if (hasDoubt) {
    return 'doubtful' as const;
  }
  if (hasRisk) {
    return 'risk' as const;
  }
  if (hasFit) {
    return 'fit' as const;
  }
  if (hasBoost) {
    return 'boost' as const;
  }

  return null;
}

function isNegativeFlag(flag: SignalFlag) {
  return flag === 'injured' || flag === 'doubtful' || flag === 'risk';
}

function detectFlags(text: string, playerNames: string[]): Record<string, SignalFlag> {
  const lowered = normalizeText(text);
  const flags: Record<string, SignalFlag> = {};

  for (const playerName of playerNames) {
    const normalizedName = normalizeText(playerName);
    const fullIndex = mentionIndex(lowered, normalizedName);
    const lastName = normalizedName.split(' ').pop() || normalizedName;
    const allowLastNameFallback = lastName.length > 3 && !COMMON_LAST_NAMES.has(lastName);
    const lastIndex = allowLastNameFallback ? mentionIndex(lowered, lastName) : -1;
    const index = fullIndex >= 0 ? fullIndex : lastIndex;

    if (index === -1) {
      continue;
    }

    const context = lowered.substring(Math.max(0, index - 120), Math.min(lowered.length, index + 220));
    const detected = keywordScore(context);
    if (detected) {
      flags[playerName] = detected;
    }
  }

  return flags;
}

function minutesSince(isoDate?: string) {
  if (!isoDate) {
    return 240;
  }

  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return 240;
  }

  return Math.max(0, Math.round((Date.now() - parsed) / 60000));
}

function sourceWeight(source: string) {
  const structured = STRUCTURED_PAGES.find((entry) => entry.name === source);
  if (structured) {
    return structured.weight;
  }

  const feed = RSS_FEEDS.find((entry) => entry.name === source);
  if (feed) {
    return feed.weight;
  }

  if (source.startsWith('Google News')) {
    return 0.8;
  }

  return 0.9;
}

async function fetchRss(feedUrl: string) {
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiwengerIA/1.0)' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return [];
    }

    const xml = await res.text();
    const items: Array<{ title: string; description: string; link: string; publishedAt?: string }> = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null = null;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const title = (/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(item) || /<title[^>]*>(.*?)<\/title>/i.exec(item))?.[1] || '';
      const description =
        (/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/i.exec(item) ||
          /<description[^>]*>(.*?)<\/description>/i.exec(item))?.[1] || '';
      const link = (/<link[^>]*>(.*?)<\/link>/i.exec(item))?.[1] || '';
      const publishedRaw =
        (/<pubDate[^>]*>(.*?)<\/pubDate>/i.exec(item) ||
          /<updated[^>]*>(.*?)<\/updated>/i.exec(item) ||
          /<dc:date[^>]*>(.*?)<\/dc:date>/i.exec(item))?.[1] || '';

      if (!title) {
        continue;
      }

      items.push({
        title: stripHtml(title),
        description: stripHtml(description).slice(0, 320),
        link: stripHtml(link),
        publishedAt: extractPublishedAt(publishedRaw),
      });
    }

    return items.slice(0, 18);
  } catch {
    return [];
  }
}

function mapStructuredStatus(kind: 'injuries' | 'sanctions', statusLine: string, probability: number): SignalFlag | null {
  const normalizedStatus = normalizeText(statusLine);

  if (kind === 'sanctions') {
    if (normalizedStatus.includes('sancionado') || normalizedStatus.includes('cumple sancion')) {
      return 'injured';
    }
    if (normalizedStatus.includes('apercibido')) {
      return 'risk';
    }
    return null;
  }

  if (normalizedStatus.includes('baja')) {
    return 'injured';
  }
  if (normalizedStatus.includes('duda')) {
    return 'doubtful';
  }
  if (normalizedStatus.includes('disponible')) {
    return probability <= 30 ? 'risk' : 'fit';
  }

  if (probability <= 15) {
    return 'doubtful';
  }

  return null;
}

function splitStructuredBlocks(html: string) {
  return html
    .split(/<div class="elemento /g)
    .slice(1)
    .map((chunk) => `<div class="elemento ${chunk}`);
}

async function scrapeStructuredPage(
  source: (typeof STRUCTURED_PAGES)[number],
  playerNames: string[]
): Promise<NewsItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiwengerIA/1.0)' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return [];
    }

    const html = await res.text();
    const blocks = splitStructuredBlocks(html);
    const items: NewsItem[] = [];
    const now = new Date().toISOString();

    for (const block of blocks) {
      const rawName = /class="jugador">([^<]+)<\/a>/i.exec(block)?.[1] || '';
      const matchedPlayer = rawName ? matchPlayerName(rawName, playerNames) : null;

      if (!matchedPlayer) {
        continue;
      }

      const probability = Number(/class="prob-[^"]*">(\d+)%<\/span>/i.exec(block)?.[1] || '0');
      const lesionOrNote = /<span class="lesion">([^<]+)<\/span>/i.exec(block)?.[1] || '';
      const statusLine = /<span class="gravedad-[^"]*">([^<]+)<\/span>/i.exec(block)?.[1] || '';
      const link = /<a href="([^"]+)" class="[^"]*link/i.exec(block)?.[1] || source.url;
      const flag = mapStructuredStatus(source.kind, statusLine, probability);

      if (!flag) {
        continue;
      }

      const summaryParts = [stripHtml(lesionOrNote), stripHtml(statusLine), `${probability}% de titularidad`].filter(Boolean);
      items.push({
        source: source.name,
        title: `${matchedPlayer}: ${stripHtml(statusLine) || stripHtml(lesionOrNote) || 'senal detectada'}`,
        url: link.startsWith('http') ? link : `https://www.futbolfantasy.com${link}`,
        players: [matchedPlayer],
        flags: { [matchedPlayer]: flag },
        summary: summaryParts.join(' · '),
        fetchedAt: now,
        confidence: clamp(Math.round(68 + source.weight * 14 + (flag === 'injured' ? 8 : 0) + (probability <= 15 ? 6 : 0)), 55, 97),
      });
    }

    return items;
  } catch {
    return [];
  }
}

export async function scrapeInjuryNews(playerNames: string[]): Promise<NewsItem[]> {
  const query = playerNames
    .map((name) => `"${stripHtml(name)}"`)
    .join(' OR ');
  const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`(${query}) (lesion OR baja OR duda OR titular OR rotacion OR convocatoria OR descanso) when:3d`)}&hl=es-ES&gl=ES&ceid=ES:es`;
  const allFeeds = [...RSS_FEEDS, { name: 'Google News', url: googleNewsUrl, weight: 0.8 }];
  const results: NewsItem[] = [];
  const relevanceTerms = [
    'lesion',
    'baja',
    'sancion',
    'vuelve',
    'regresa',
    'disponible',
    'duda',
    'titular',
    'convocado',
    'rotacion',
    'descanso',
    'fantasy',
    'biwenger',
    'once',
  ];

  const rssResults = await Promise.all(allFeeds.map((feed) => fetchRss(feed.url)));

  rssResults.forEach((items, index) => {
    const feed = allFeeds[index];

    for (const item of items) {
      const text = `${item.title} ${item.description}`;
      const normalized = normalizeText(text);
      const isRelevant =
        relevanceTerms.some((term) => normalized.includes(term)) ||
        playerNames.some((playerName) => {
          const normalizedPlayer = normalizeText(playerName);
          const lastName = normalizedPlayer.split(' ').pop() || normalizedPlayer;
          const allowLastNameFallback = lastName.length > 3 && !COMMON_LAST_NAMES.has(lastName);
          return containsMention(normalized, normalizedPlayer) || (allowLastNameFallback && containsMention(normalized, lastName));
        });

      const ageMinutes = minutesSince(item.publishedAt);
      if (item.publishedAt && ageMinutes > 72 * 60) {
        continue;
      }

      if (!isRelevant) {
        continue;
      }

      const flags = detectFlags(text, playerNames);
      const mentionedPlayers = playerNames.filter((playerName) => {
        const normalizedPlayer = normalizeText(playerName);
        const lastName = normalizedPlayer.split(' ').pop() || normalizedPlayer;
        const allowLastNameFallback = lastName.length > 3 && !COMMON_LAST_NAMES.has(lastName);
        return containsMention(normalized, normalizedPlayer) || (allowLastNameFallback && containsMention(normalized, lastName));
      });

      if (mentionedPlayers.length === 0 && Object.keys(flags).length === 0) {
        continue;
      }

      results.push({
        source: feed.name,
        title: item.title,
        url: item.link,
        players: mentionedPlayers,
        flags,
        summary: item.description,
        fetchedAt: new Date().toISOString(),
        publishedAt: item.publishedAt,
      });
    }
  });

  const structuredResults = await Promise.all(
    STRUCTURED_PAGES.map((page) => scrapeStructuredPage(page, playerNames))
  );

  const merged = [...results, ...structuredResults.flat()];
  const seen = new Set<string>();

  return merged.filter((item) => {
    const key = `${item.source}:${normalizeText(item.title).slice(0, 80)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildPlayerSignals(news: NewsItem[], playerNames: string[]) {
  const grouped = new Map<
    string,
    Array<{
      flag: SignalFlag;
      score: number;
      source: string;
      summary: string;
      url: string;
      freshnessMinutes: number;
    }>
  >();

  for (const item of news) {
    for (const [playerName, flag] of Object.entries(item.flags)) {
      if (!playerNames.includes(playerName)) {
        continue;
      }

      const freshnessMinutes = minutesSince(item.publishedAt || item.fetchedAt);
      const freshnessBoost = freshnessMinutes <= 60 ? 12 : freshnessMinutes <= 180 ? 8 : freshnessMinutes <= 720 ? 4 : 0;
      const score =
        FLAG_BASE_SCORE[flag] +
        freshnessBoost +
        sourceWeight(item.source) * 8 +
        ((item.confidence || 60) - 60) * 0.3;

      const bucket = grouped.get(playerName) || [];
      bucket.push({
        flag,
        score,
        source: item.source,
        summary: item.summary || item.title,
        url: item.url,
        freshnessMinutes,
      });
      grouped.set(playerName, bucket);
    }
  }

  const signals: Record<string, PlayerSignal> = {};

  for (const playerName of playerNames) {
    const evidence = grouped.get(playerName);
    if (!evidence || evidence.length === 0) {
      continue;
    }

    const scoreByFlag = new Map<SignalFlag, number>();

    for (const row of evidence) {
      scoreByFlag.set(row.flag, (scoreByFlag.get(row.flag) || 0) + row.score);
    }

    const orderedFlags = [...scoreByFlag.entries()].sort((a, b) => {
      if (b[1] === a[1]) {
        return FLAG_PRIORITY[b[0]] - FLAG_PRIORITY[a[0]];
      }
      return b[1] - a[1];
    });

    let selectedFlag = orderedFlags[0][0];
    const strongestNegative = orderedFlags.find(([flag]) => flag === 'injured' || flag === 'doubtful' || flag === 'risk');
    if (strongestNegative && strongestNegative[1] >= orderedFlags[0][1] - 8) {
      selectedFlag = strongestNegative[0];
    }
    const negativeScore = orderedFlags
      .filter(([flag]) => isNegativeFlag(flag))
      .reduce((sum, [, score]) => sum + score, 0);
    const positiveScore = orderedFlags
      .filter(([flag]) => !isNegativeFlag(flag))
      .reduce((sum, [, score]) => sum + score, 0);
    const hasFreshNegative = evidence.some((row) => isNegativeFlag(row.flag) && row.freshnessMinutes <= 24 * 60);
    const hasFreshPositive = evidence.some((row) => !isNegativeFlag(row.flag) && row.freshnessMinutes <= 24 * 60);
    const hasMaterialConflict = hasFreshNegative && hasFreshPositive && negativeScore >= 20 && positiveScore >= 18;

    if (hasMaterialConflict) {
      selectedFlag = strongestNegative?.[0] === 'injured' ? 'doubtful' : strongestNegative?.[0] || 'doubtful';
    }

    const selectedEvidence = (hasMaterialConflict
      ? [...evidence].sort((a, b) => {
          if (a.freshnessMinutes === b.freshnessMinutes) {
            return b.score - a.score;
          }
          return a.freshnessMinutes - b.freshnessMinutes;
        })
      : evidence.filter((row) => row.flag === selectedFlag).sort((a, b) => a.freshnessMinutes - b.freshnessMinutes)
    ).slice(0, 3);
    const sources = [...new Set(selectedEvidence.map((row) => row.source))];
    const urls = [...new Set(selectedEvidence.map((row) => row.url))].slice(0, 3);
    const freshnessMinutes = Math.min(...selectedEvidence.map((row) => row.freshnessMinutes));
    const conflictPenalty = Math.max(0, orderedFlags.length - 1) * 6 + (hasMaterialConflict ? 14 : 0);
    const confidence = clamp(
      Math.round(34 + orderedFlags[0][1] + sources.length * 5 - conflictPenalty),
      42,
      98
    );
    const summaryPrefix = hasMaterialConflict ? 'Senales cruzadas - ' : '';
    const summary = `${summaryPrefix}${selectedEvidence
      .slice(0, 2)
      .map((row) => row.summary)
      .join(' | ')}`;

    signals[playerName] = {
      player: playerName,
      flag: selectedFlag,
      confidence,
      sourceCount: sources.length,
      freshnessMinutes,
      checkedAt: new Date().toISOString(),
      summary,
      sources,
      urls,
    };
  }

  return signals;
}

export function consolidateFlags(news: NewsItem[], playerNames?: string[]) {
  const candidates = playerNames || [...new Set(news.flatMap((item) => Object.keys(item.flags)))];
  const signals = buildPlayerSignals(news, candidates);
  const final: Record<string, SignalFlag> = {};

  for (const [playerName, signal] of Object.entries(signals)) {
    final[playerName] = signal.flag;
  }

  return final;
}

function mergeFlag(currentFlag: PlayerFlag | undefined, signalFlag: SignalFlag): PlayerFlag {
  if (signalFlag === 'injured') {
    return 'avoid';
  }
  if (signalFlag === 'doubtful' || signalFlag === 'risk') {
    return currentFlag === 'avoid' ? 'avoid' : 'risk';
  }
  if (signalFlag === 'fit') {
    return currentFlag === 'avoid' || currentFlag === 'risk' ? currentFlag : 'return';
  }
  if (signalFlag === 'boost') {
    return currentFlag === 'avoid' || currentFlag === 'risk' ? currentFlag : 'boost';
  }

  return currentFlag || 'normal';
}

function mergeStatus(currentStatus: PlayerStatus, signalFlag: SignalFlag, confidence: number): PlayerStatus {
  if (signalFlag === 'injured' && confidence >= 70) {
    return 'injured';
  }
  if (signalFlag === 'doubtful' && confidence >= 65) {
    return 'doubtful';
  }
  if (signalFlag === 'fit' && confidence >= 62) {
    return 'fit';
  }
  return currentStatus;
}

export function applySignalsToSquad(squad: Player[], signals: Record<string, PlayerSignal>) {
  return squad.map((player) => {
    const signal = signals[player.name];
    if (!signal) {
      return player;
    }

    return {
      ...player,
      flag: mergeFlag(player.flag, signal.flag),
      status: mergeStatus(player.status, signal.flag, signal.confidence),
    };
  });
}
