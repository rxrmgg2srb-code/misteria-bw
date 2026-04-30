type TeamGame = {
  date?: number;
  status?: string;
  competition?: {
    id?: number;
    name?: string;
    slug?: string;
  };
  home?: {
    id?: number;
  };
  away?: {
    id?: number;
  };
  round?: {
    id?: number;
  };
};

type TeamSeed = {
  id: number;
  name: string;
  nextGames?: TeamGame[];
  currentFixtureStart?: number | null;
  currentFixtureRound?: string;
};

type StandingsRow = {
  position?: number;
  points?: number;
  team?: {
    name?: string;
  };
};

type UefaCompetitionSeed = {
  competitionId: number;
  name: string;
};

type UefaMatch = {
  competition?: {
    metaData?: {
      name?: string;
    };
    translations?: {
      name?: {
        ES?: string;
        EN?: string;
      };
    };
  };
  homeTeam?: {
    internationalName?: string;
    translations?: {
      displayName?: {
        ES?: string;
        EN?: string;
      };
      displayOfficialName?: {
        ES?: string;
        EN?: string;
      };
      shortName?: {
        ES?: string;
        EN?: string;
      };
    };
  };
  awayTeam?: {
    internationalName?: string;
    translations?: {
      displayName?: {
        ES?: string;
        EN?: string;
      };
      displayOfficialName?: {
        ES?: string;
        EN?: string;
      };
      shortName?: {
        ES?: string;
        EN?: string;
      };
    };
  };
  kickOffTime?: {
    date?: string;
    dateTime?: string;
  };
  round?: {
    metaData?: {
      name?: string;
      type?: string;
    };
    translations?: {
      name?: {
        ES?: string;
        EN?: string;
      };
      shortName?: {
        ES?: string;
        EN?: string;
      };
    };
  };
  status?: string;
};

type TeamScheduleSignal = {
  nextMatchGapDays: number | null;
  nextMatchCompetition: string;
  schedulePressure: 'alta' | 'media' | 'baja';
  schedulePressureNote: string;
};

type UefaTeamMatch = {
  timestamp: number;
  competition: string;
  roundName: string;
  status: string;
};

export type TeamContextSnapshot = {
  position: number | null;
  points: number | null;
  motivation: 'alta' | 'media' | 'baja';
  motivationNote: string;
  nextMatchGapDays: number | null;
  nextMatchCompetition: string;
  schedulePressure: 'alta' | 'media' | 'baja';
  schedulePressureNote: string;
};

const LALIGA_STANDINGS_URL = 'https://www.laliga.com/es-ES/laliga-easports/clasificacion';
const UEFA_MATCH_API_URL = 'https://match.uefa.com/v5/matches';
const UEFA_COMPETITIONS: UefaCompetitionSeed[] = [
  { competitionId: 1, name: 'UEFA Champions League' },
  { competitionId: 14, name: 'UEFA Europa League' },
  { competitionId: 2019, name: 'UEFA Conference League' },
];

const TEAM_NAME_ALIASES: Record<string, string> = {
  alaves: 'alaves',
  athletic: 'athletic',
  'athletic club': 'athletic',
  atleti: 'atletico madrid',
  atletico: 'atletico madrid',
  'atletico madrid': 'atletico madrid',
  barcelona: 'barcelona',
  betis: 'betis',
  'celta vigo': 'celta',
  celta: 'celta',
  espanyol: 'espanyol',
  'espanyol barcelona': 'espanyol',
  getafe: 'getafe',
  girona: 'girona',
  leganes: 'leganes',
  levante: 'levante',
  mallorca: 'mallorca',
  osasuna: 'osasuna',
  oviedo: 'oviedo',
  'rayo vallecano': 'rayo vallecano',
  'rayo vallecano madrid': 'rayo vallecano',
  'real madrid': 'real madrid',
  sociedad: 'real sociedad',
  'real sociedad': 'real sociedad',
  sevilla: 'sevilla',
  valencia: 'valencia',
  villarreal: 'villarreal',
};

function normalizeTeamKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(futbol|football|club|cf|fc|rcd|cd|sd|ca|ud|de|del|la|el|balompie|deportivo|reial|union|sad)\b/g, ' ')
    .replace(/\b[a-z]\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamMatchKey(name: string) {
  const normalized = normalizeTeamKey(name);
  return TEAM_NAME_ALIASES[normalized] || normalized;
}

function extractStandingsJson(html: string) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function fetchStandingsMap() {
  const res = await fetch(LALIGA_STANDINGS_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    next: { revalidate: 21600 },
  });

  if (!res.ok) {
    throw new Error(`Standings fetch failed: ${res.status}`);
  }

  const html = await res.text();
  const data = extractStandingsJson(html);
  const rows = (data?.props?.pageProps?.standings || []) as StandingsRow[];
  const map = new Map<string, { position: number; points: number }>();

  for (const row of rows) {
    const teamName = row.team?.name;
    if (!teamName || typeof row.position !== 'number' || typeof row.points !== 'number') {
      continue;
    }

    map.set(teamMatchKey(teamName), {
      position: row.position,
      points: row.points,
    });
  }

  return map;
}

function findStandingsEntry(standingsMap: Map<string, { position: number; points: number }>, teamName: string) {
  const key = teamMatchKey(teamName);
  const direct = standingsMap.get(key);

  if (direct) {
    return direct;
  }

  for (const [rowKey, row] of standingsMap.entries()) {
    if (rowKey.includes(key) || key.includes(rowKey)) {
      return row;
    }
  }

  return null;
}

function motivationFromStandings(
  position: number | null,
  points: number | null,
  orderedRows: Array<{ position: number; points: number }>
) {
  if (position === null || points === null || orderedRows.length === 0) {
    return {
      motivation: 'media' as const,
      note: 'sin tabla clara de referencia, asi que el motor no fuerza lectura de objetivo liguero',
    };
  }

  const leader = orderedRows[0]?.points ?? points;
  const fourth = orderedRows.find((row) => row.position === 4)?.points ?? points;
  const sixth = orderedRows.find((row) => row.position === 6)?.points ?? points;
  const eighteenth = orderedRows.find((row) => row.position === 18)?.points ?? points;
  const gapToLeader = Math.max(0, leader - points);
  const gapToTopFour = Math.max(0, fourth - points);
  const gapToTopSix = Math.max(0, sixth - points);
  const gapToDrop = Math.max(0, points - eighteenth);

  if (position <= 2 && gapToLeader <= 6) {
    return {
      motivation: 'alta' as const,
      note: `el equipo sigue muy metido en la pelea alta de la liga (P${position}, a ${gapToLeader} pts del lider)`,
    };
  }

  if (position <= 6 || gapToTopSix <= 4 || gapToTopFour <= 4) {
    return {
      motivation: 'alta' as const,
      note: `el equipo sigue peleando plazas europeas o posiciones altas (P${position})`,
    };
  }

  if (position >= 16 || gapToDrop <= 6) {
    return {
      motivation: 'alta' as const,
      note: `el equipo sigue en tension por la zona baja (P${position}, ${gapToDrop} pts sobre el descenso)`,
    };
  }

  if (position >= 8 && position <= 14 && gapToTopSix >= 8 && gapToDrop >= 8) {
    return {
      motivation: 'baja' as const,
      note: `el equipo vive una zona media mas plana y puede gestionar mas rotaciones de lo normal (P${position})`,
    };
  }

  return {
    motivation: 'media' as const,
    note: `el equipo sigue compitiendo por cerrar bien la liga, aunque sin urgencia extrema en la tabla (P${position})`,
  };
}

function competitionImportanceLevel(label: string) {
  const lowered = label.toLowerCase();
  if (lowered.includes('champions')) {
    return 3;
  }
  if (lowered.includes('europa league')) {
    return 2;
  }
  if (lowered.includes('conference')) {
    return 1;
  }
  if (lowered.includes('copa')) {
    return 1;
  }
  return 0;
}

function pressureWeight(value: TeamScheduleSignal['schedulePressure']) {
  if (value === 'alta') {
    return 3;
  }
  if (value === 'media') {
    return 2;
  }
  return 1;
}

function buildDomesticScheduleSignal(team: TeamSeed): TeamScheduleSignal {
  const nextGames = Array.isArray(team.nextGames) ? team.nextGames : [];
  const referenceStart =
    typeof team.currentFixtureStart === 'number' && Number.isFinite(team.currentFixtureStart)
      ? team.currentFixtureStart
      : nextGames
          .filter((game) => typeof game.date === 'number' && Number.isFinite(game.date))
          .sort((a, b) => Number(a.date) - Number(b.date))[0]?.date || null;

  if (!referenceStart) {
    return {
      nextMatchGapDays: null,
      nextMatchCompetition: '',
      schedulePressure: 'baja',
      schedulePressureNote: 'sin atasco inmediato de calendario detectado',
    };
  }

  const following = nextGames
    .filter((game) => typeof game.date === 'number' && Number(game.date) > referenceStart)
    .sort((a, b) => Number(a.date) - Number(b.date))[0];

  if (!following?.date) {
    return {
      nextMatchGapDays: null,
      nextMatchCompetition: '',
      schedulePressure: 'baja',
      schedulePressureNote: 'sin atasco inmediato de calendario detectado',
    };
  }

  const gapDays = Math.round(((Number(following.date) - referenceStart) * 1000) / 86400000);
  const competition = following.competition?.name?.trim() || 'Otro partido';
  const lowered = competition.toLowerCase();
  const isEuropean = lowered.includes('champions') || lowered.includes('europa') || lowered.includes('conference');
  const isCup = lowered.includes('copa');

  if (gapDays <= 4) {
    return {
      nextMatchGapDays: gapDays,
      nextMatchCompetition: competition,
      schedulePressure: 'alta',
      schedulePressureNote: `hay otro partido ${gapDays <= 2 ? 'casi encima' : 'muy cerca'} tras esta jornada: ${competition}`,
    };
  }

  if (gapDays <= 6 && (isEuropean || isCup)) {
    return {
      nextMatchGapDays: gapDays,
      nextMatchCompetition: competition,
      schedulePressure: 'media',
      schedulePressureNote: `el equipo enlaza pronto con ${competition}, asi que existe algo de gestion de esfuerzos`,
    };
  }

  return {
    nextMatchGapDays: gapDays,
    nextMatchCompetition: competition,
    schedulePressure: 'baja',
    schedulePressureNote: 'el siguiente partido no aprieta lo suficiente como para forzar una rotacion clara',
  };
}

function extractUefaTeamNames(team?: UefaMatch['homeTeam']) {
  if (!team) {
    return [];
  }

  return [
    team.internationalName,
    team.translations?.displayOfficialName?.ES,
    team.translations?.displayOfficialName?.EN,
    team.translations?.displayName?.ES,
    team.translations?.displayName?.EN,
    team.translations?.shortName?.ES,
    team.translations?.shortName?.EN,
  ].filter((value): value is string => Boolean(value && value.trim()));
}

function extractUefaMatchTimestamp(match: UefaMatch) {
  const value = match.kickOffTime?.dateTime;
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function extractUefaRoundName(match: UefaMatch) {
  return (
    match.round?.translations?.name?.ES ||
    match.round?.translations?.name?.EN ||
    match.round?.metaData?.name ||
    ''
  ).trim();
}

function extractUefaCompetitionName(match: UefaMatch, fallback: string) {
  return (
    match.competition?.translations?.name?.ES ||
    match.competition?.translations?.name?.EN ||
    match.competition?.metaData?.name ||
    fallback
  ).trim();
}

async function fetchUefaMatches(competition: UefaCompetitionSeed) {
  const limit = 200;
  let offset = 0;
  const all: UefaMatch[] = [];

  for (let page = 0; page < 5; page += 1) {
    const url = `${UEFA_MATCH_API_URL}?offset=${offset}&limit=${limit}&competitionId=${competition.competitionId}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      next: { revalidate: 21600 },
    });

    if (!res.ok) {
      throw new Error(`UEFA matches fetch failed: ${competition.name} ${res.status}`);
    }

    const chunk = (await res.json()) as UefaMatch[];
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    all.push(...chunk);
    if (chunk.length < limit) {
      break;
    }

    offset += chunk.length;
  }

  return all;
}

async function buildUefaScheduleMap(teamNames: string[]) {
  const wantedKeys = new Set(teamNames.map(teamMatchKey));
  const scheduleMap = new Map<string, UefaTeamMatch[]>();

  const results = await Promise.allSettled(UEFA_COMPETITIONS.map((competition) => fetchUefaMatches(competition)));

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const competition = UEFA_COMPETITIONS[index];
    if (result.status !== 'fulfilled') {
      continue;
    }

    for (const match of result.value) {
      const timestamp = extractUefaMatchTimestamp(match);
      if (!timestamp) {
        continue;
      }

      const competitionName = extractUefaCompetitionName(match, competition.name);
      const roundName = extractUefaRoundName(match);
      const status = match.status || '';
      const candidates = [match.homeTeam, match.awayTeam];

      for (const team of candidates) {
        const matchedKey = extractUefaTeamNames(team)
          .map(teamMatchKey)
          .find((key) => wantedKeys.has(key));

        if (!matchedKey) {
          continue;
        }

        const current = scheduleMap.get(matchedKey) || [];
        current.push({
          timestamp,
          competition: competitionName,
          roundName,
          status,
        });
        scheduleMap.set(matchedKey, current);
      }
    }
  }

  return scheduleMap;
}

function pickStrongerSignal(current: TeamScheduleSignal, candidate: TeamScheduleSignal) {
  const currentWeight = pressureWeight(current.schedulePressure);
  const candidateWeight = pressureWeight(candidate.schedulePressure);

  if (candidateWeight > currentWeight) {
    return candidate;
  }

  if (candidateWeight < currentWeight) {
    return current;
  }

  const currentGap = current.nextMatchGapDays ?? Number.MAX_SAFE_INTEGER;
  const candidateGap = candidate.nextMatchGapDays ?? Number.MAX_SAFE_INTEGER;
  return candidateGap < currentGap ? candidate : current;
}

function buildUefaScheduleSignal(team: TeamSeed, uefaMatches: UefaTeamMatch[]) {
  if (!uefaMatches.length) {
    return {
      nextMatchGapDays: null,
      nextMatchCompetition: '',
      schedulePressure: 'baja' as const,
      schedulePressureNote: 'sin atasco europeo detectado alrededor de este partido',
    };
  }

  const referenceStart =
    typeof team.currentFixtureStart === 'number' && Number.isFinite(team.currentFixtureStart)
      ? team.currentFixtureStart * 1000
      : null;
  const matches = [...uefaMatches].sort((a, b) => a.timestamp - b.timestamp);
  const upcoming = referenceStart === null ? matches.filter((match) => match.timestamp >= Date.now()) : matches.filter((match) => match.timestamp > referenceStart);
  const recent = referenceStart === null ? [] : matches.filter((match) => match.timestamp < referenceStart);
  const nextMatch = upcoming[0];
  const previousMatch = recent[recent.length - 1];

  let best: TeamScheduleSignal = {
    nextMatchGapDays: null,
    nextMatchCompetition: '',
    schedulePressure: 'baja',
    schedulePressureNote: 'sin atasco europeo detectado alrededor de este partido',
  };

  if (nextMatch && referenceStart !== null) {
    const gapDays = Math.round((nextMatch.timestamp - referenceStart) / 86400000);
    const stageLabel = nextMatch.roundName ? `${nextMatch.competition} (${nextMatch.roundName})` : nextMatch.competition;
    const importance = competitionImportanceLevel(nextMatch.competition);

    if (gapDays <= 4) {
      best = pickStrongerSignal(best, {
        nextMatchGapDays: gapDays,
        nextMatchCompetition: stageLabel,
        schedulePressure: importance >= 2 ? 'alta' : 'media',
        schedulePressureNote: `el equipo puede reservar porque juega ${stageLabel} en ${gapDays} dia${gapDays === 1 ? '' : 's'}`,
      });
    } else if (gapDays <= 6) {
      best = pickStrongerSignal(best, {
        nextMatchGapDays: gapDays,
        nextMatchCompetition: stageLabel,
        schedulePressure: importance >= 2 ? 'media' : 'baja',
        schedulePressureNote: `hay cita europea relativamente cerca tras esta jornada: ${stageLabel} en ${gapDays} dias`,
      });
    }
  } else if (nextMatch && referenceStart === null) {
    const gapDays = Math.round((nextMatch.timestamp - Date.now()) / 86400000);
    if (gapDays >= 0 && gapDays <= 5) {
      const stageLabel = nextMatch.roundName ? `${nextMatch.competition} (${nextMatch.roundName})` : nextMatch.competition;
      best = pickStrongerSignal(best, {
        nextMatchGapDays: gapDays,
        nextMatchCompetition: stageLabel,
        schedulePressure: competitionImportanceLevel(nextMatch.competition) >= 2 ? 'media' : 'baja',
        schedulePressureNote: `se acerca partido europeo: ${stageLabel}`,
      });
    }
  }

  if (previousMatch && referenceStart !== null) {
    const gapDays = Math.round((referenceStart - previousMatch.timestamp) / 86400000);
    const stageLabel = previousMatch.roundName ? `${previousMatch.competition} (${previousMatch.roundName})` : previousMatch.competition;
    const importance = competitionImportanceLevel(previousMatch.competition);

    if (gapDays <= 3) {
      best = pickStrongerSignal(best, {
        nextMatchGapDays: best.nextMatchGapDays,
        nextMatchCompetition: best.nextMatchCompetition,
        schedulePressure: importance >= 2 ? 'alta' : 'media',
        schedulePressureNote: `el equipo viene de jugar ${stageLabel} hace ${gapDays} dia${gapDays === 1 ? '' : 's'}, asi que puede haber fatiga o gestion de cargas`,
      });
    } else if (gapDays <= 5) {
      best = pickStrongerSignal(best, {
        nextMatchGapDays: best.nextMatchGapDays,
        nextMatchCompetition: best.nextMatchCompetition,
        schedulePressure: importance >= 2 ? 'media' : 'baja',
        schedulePressureNote: `el equipo llega con desgaste reciente tras ${stageLabel}`,
      });
    }
  }

  return best;
}

export async function buildTeamContextMap(
  teamsObj: Record<
    number,
    {
      name?: string;
      nextGames?: TeamGame[];
      currentFixtureStart?: number | null;
      currentFixtureRound?: string;
    }
  >
) {
  let standingsMap = new Map<string, { position: number; points: number }>();
  let uefaScheduleMap = new Map<string, UefaTeamMatch[]>();

  const teamNames = Object.values(teamsObj || {})
    .map((team) => team?.name || '')
    .filter(Boolean);

  try {
    standingsMap = await fetchStandingsMap();
  } catch {
    standingsMap = new Map();
  }

  try {
    uefaScheduleMap = await buildUefaScheduleMap(teamNames);
  } catch {
    uefaScheduleMap = new Map();
  }

  const orderedRows = [...standingsMap.values()].sort((a, b) => a.position - b.position);
  const contextMap = new Map<number, TeamContextSnapshot>();

  for (const [rawId, rawTeam] of Object.entries(teamsObj || {})) {
    const id = Number(rawId);
    const name = rawTeam?.name || '';
    const standings = findStandingsEntry(standingsMap, name);
    const motivation = motivationFromStandings(standings?.position ?? null, standings?.points ?? null, orderedRows);
    const domesticSchedule = buildDomesticScheduleSignal({
      id,
      name,
      nextGames: rawTeam?.nextGames || [],
      currentFixtureStart: rawTeam?.currentFixtureStart ?? null,
      currentFixtureRound: rawTeam?.currentFixtureRound,
    });
    const europeanSchedule = buildUefaScheduleSignal(
      {
        id,
        name,
        nextGames: rawTeam?.nextGames || [],
        currentFixtureStart: rawTeam?.currentFixtureStart ?? null,
        currentFixtureRound: rawTeam?.currentFixtureRound,
      },
      uefaScheduleMap.get(teamMatchKey(name)) || []
    );
    const schedule = pickStrongerSignal(domesticSchedule, europeanSchedule);

    contextMap.set(id, {
      position: standings?.position ?? null,
      points: standings?.points ?? null,
      motivation: motivation.motivation,
      motivationNote: motivation.note,
      nextMatchGapDays: schedule.nextMatchGapDays,
      nextMatchCompetition: schedule.nextMatchCompetition,
      schedulePressure: schedule.schedulePressure,
      schedulePressureNote: schedule.schedulePressureNote,
    });
  }

  return contextMap;
}
