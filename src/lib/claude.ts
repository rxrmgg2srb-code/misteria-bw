import type { FixtureInfo, Player as SquadPlayer } from '@/lib/biwenger';
import { buildPlayerContextInfo, parseRoundNumber } from '@/lib/player-context';

const API = 'https://api.groq.com/openai/v1/chat/completions';
const API_KEY = process.env.GROQ_API_KEY || '';
const DEMO_MODE = !API_KEY;

export type AnalysisStrategy = 'conservador' | 'equilibrado' | 'agresivo';

type AnalysisContext = {
  jornada?: string;
  autoRound?: string;
  strategy?: AnalysisStrategy;
};

type StrategyProfile = {
  label: string;
  summary: string;
  prompt: string;
  formationBias: {
    defense: number;
    midfield: number;
    attack: number;
  };
  lineup: {
    reliableWeight: number;
    recentWeight: number;
    fixtureWeight: number;
    flagWeight: number;
    reliabilityWeight: number;
    availabilityWeight: number;
    workloadWeight: number;
    liveWeight: number;
    doubtfulPenalty: number;
  };
  managedReturn: {
    base: number;
    premium: number;
    easyFixture: number;
    home: number;
  };
  captain: {
    reliableWeight: number;
    boostBonus: number;
    easyFixtureBonus: number;
    hardFixturePenalty: number;
    managedReturnPenalty: number;
  };
  confidence: {
    base: number;
    boostBonus: number;
    injuredPenalty: number;
    doubtfulPenalty: number;
    riskPenalty: number;
    fixtureKnownBonus: number;
    homeBonus: number;
    difficultyWeight: number;
    recentWeight: number;
  };
  projection: {
    fixtureWeight: number;
    flagWeight: number;
  };
};

const STRATEGY_PROFILES: Record<AnalysisStrategy, StrategyProfile> = {
  conservador: {
    label: 'Conservador',
    summary: 'prioriza minutos, continuidad y evitar un cero inesperado',
    prompt: 'Prioriza suelo, continuidad y minutos estables. Si tienes duda razonable entre dos jugadores, elige el perfil mas seguro.',
    formationBias: {
      defense: 0.2,
      midfield: 0.08,
      attack: -0.03,
    },
    lineup: {
      reliableWeight: 1.18,
      recentWeight: 0.24,
      fixtureWeight: 0.82,
      flagWeight: 0.9,
      reliabilityWeight: 1.35,
      availabilityWeight: 1.18,
      workloadWeight: 0.45,
      liveWeight: 0.55,
      doubtfulPenalty: 3.6,
    },
    managedReturn: {
      base: -1.2,
      premium: 0.2,
      easyFixture: 0.1,
      home: 0.1,
    },
    captain: {
      reliableWeight: 0.58,
      boostBonus: 1.0,
      easyFixtureBonus: 0.8,
      hardFixturePenalty: 0.9,
      managedReturnPenalty: 3.1,
    },
    confidence: {
      base: 76,
      boostBonus: 3.5,
      injuredPenalty: 18,
      doubtfulPenalty: 9.5,
      riskPenalty: 7.5,
      fixtureKnownBonus: 0.8,
      homeBonus: 0.8,
      difficultyWeight: 5.5,
      recentWeight: 0.9,
    },
    projection: {
      fixtureWeight: 0.85,
      flagWeight: 1,
    },
  },
  equilibrado: {
    label: 'Equilibrado',
    summary: 'mezcla suelo y techo para no regalar seguridad ni upside',
    prompt: 'Busca equilibrio entre seguridad y techo. Si hay empate, usa el mejor cruce individual y el menor riesgo de ultima hora.',
    formationBias: {
      defense: 0,
      midfield: 0,
      attack: 0,
    },
    lineup: {
      reliableWeight: 1,
      recentWeight: 0.35,
      fixtureWeight: 1,
      flagWeight: 1,
      reliabilityWeight: 1,
      availabilityWeight: 1,
      workloadWeight: 0.35,
      liveWeight: 0.45,
      doubtfulPenalty: 2.4,
    },
    managedReturn: {
      base: 0.15,
      premium: 0.45,
      easyFixture: 0.15,
      home: 0.1,
    },
    captain: {
      reliableWeight: 0.45,
      boostBonus: 1.4,
      easyFixtureBonus: 1.1,
      hardFixturePenalty: 0.7,
      managedReturnPenalty: 2.3,
    },
    confidence: {
      base: 73,
      boostBonus: 4,
      injuredPenalty: 18,
      doubtfulPenalty: 8,
      riskPenalty: 6,
      fixtureKnownBonus: 0.8,
      homeBonus: 0.6,
      difficultyWeight: 5,
      recentWeight: 1.1,
    },
    projection: {
      fixtureWeight: 1,
      flagWeight: 1,
    },
  },
  agresivo: {
    label: 'Agresivo',
    summary: 'empuja diferenciales, cruces y techo aunque aceptes algo mas de varianza',
    prompt: 'Premia el techo, los diferenciales y las jornadas abiertas. Si hay empate, acepta algo mas de riesgo si el upside compensa.',
    formationBias: {
      defense: -0.08,
      midfield: 0.14,
      attack: 0.22,
    },
    lineup: {
      reliableWeight: 0.9,
      recentWeight: 0.52,
      fixtureWeight: 1.2,
      flagWeight: 1.2,
      reliabilityWeight: 0.58,
      availabilityWeight: 0.82,
      workloadWeight: 0.18,
      liveWeight: 0.35,
      doubtfulPenalty: 1.7,
    },
    managedReturn: {
      base: 0.35,
      premium: 2.5,
      easyFixture: 0.55,
      home: 0.35,
    },
    captain: {
      reliableWeight: 0.32,
      boostBonus: 2.2,
      easyFixtureBonus: 1.5,
      hardFixturePenalty: 0.35,
      managedReturnPenalty: 0.95,
    },
    confidence: {
      base: 69,
      boostBonus: 4.5,
      injuredPenalty: 18,
      doubtfulPenalty: 6.5,
      riskPenalty: 4.5,
      fixtureKnownBonus: 0.7,
      homeBonus: 0.4,
      difficultyWeight: 3.9,
      recentWeight: 1.35,
    },
    projection: {
      fixtureWeight: 1.18,
      flagWeight: 1.1,
    },
  },
};

type AnalysisAction = {
  tipo: string;
  titulo: string;
  detalle: string;
  impacto: string;
  confianza: number;
  prioridad: 'alta' | 'media' | 'baja';
};

type AnalysisRadar = {
  label: string;
  score: number;
  note: string;
};

type PlayerDecision = {
  nombre: string;
  decision: string;
  confianza: number;
  motivo: string;
};

type TransferItem = {
  vender: string;
  comprar: string;
  posicion: string;
  precio_estimado: string;
  razon: string;
};

type AnalysisResult = {
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
  acciones_hoy?: AnalysisAction[];
  radar?: AnalysisRadar[];
  decisiones_jugadores?: PlayerDecision[];
  argumentos_once?: PlayerDecision[];
  argumentos_banquillo?: PlayerDecision[];
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
    depthOpportunity: number;
    peakRatio: number;
    starterAvg: number;
    status: string;
    lastFive: number[];
    role: 'starter' | 'bench' | 'out';
  }[];
};

export async function askClaude(prompt: string): Promise<string> {
  if (DEMO_MODE) {
    return '';
  }

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1900,
      messages: [
        {
          role: 'system',
          content: 'Eres un experto en fantasy LaLiga. Respondes siempre en espanol y con foco total en decisiones accionables.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveStrategy(strategy?: string): AnalysisStrategy {
  if (strategy === 'conservador' || strategy === 'agresivo' || strategy === 'equilibrado') {
    return strategy;
  }

  return 'equilibrado';
}

function getStrategyProfile(strategy?: string) {
  return STRATEGY_PROFILES[resolveStrategy(strategy)];
}

function findPlayer(squad: SquadPlayer[], name: string) {
  return squad.find((player) => player.name === name) || null;
}

function fixturePhrase(fixture?: FixtureInfo | null) {
  if (!fixture) {
    return 'sin partido detectado';
  }

  return `${fixture.isHome ? 'en casa ante' : 'fuera ante'} ${fixture.opponent}`;
}

function fixtureTag(fixture?: FixtureInfo | null) {
  if (!fixture) {
    return 'sin fixture';
  }

  const venue = fixture.isHome ? 'Casa' : 'Fuera';
  const round = fixture.round ? `${fixture.round} - ` : '';
  return `${round}${fixture.opponent} (${venue}, D${fixture.difficulty})`;
}

function recentForm(player: SquadPlayer) {
  return average(player.lastFive.slice(0, 3));
}

function recentAppearances(player: SquadPlayer) {
  return player.lastFive.filter((value) => value > 0).length;
}

function currentAppearanceStreak(player: SquadPlayer) {
  let streak = 0;

  for (const value of player.lastFive.slice(0, 5)) {
    if (value > 0) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

function currentBlankStreak(player: SquadPlayer) {
  let streak = 0;

  for (const value of player.lastFive.slice(0, 5)) {
    if (value <= 0) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

function playerContextInfo(player: SquadPlayer) {
  return (
    player.context ||
    buildPlayerContextInfo(player, {
      seasonRound: parseRoundNumber(player.fixture?.round),
    })
  );
}

function managedReturnProfile(player: SquadPlayer) {
  const streak = currentAppearanceStreak(player);
  const recentWindow = player.lastFive.slice(0, Math.max(1, Math.min(streak, 3)));
  const olderWindow = player.lastFive.slice(streak);
  const olderZeros = olderWindow.filter((value) => value === 0).length;
  const recentAverage = average(recentWindow);
  const likelyManagedReturn =
    player.status === 'fit' &&
    streak > 0 &&
    streak <= 3 &&
    player.gamesPlayed <= 6 &&
    olderZeros >= 2;

  if (!likelyManagedReturn && player.flag !== 'return') {
    return null;
  }

  return {
    streak,
    olderZeros,
    recentAverage,
    likelyManagedReturn,
    premiumQuality: player.avgPts >= 4.5 || recentAverage >= 5 || player.price >= 7000000,
  };
}

function availabilitySwing(player: SquadPlayer) {
  const context = playerContextInfo(player);
  const startDelta = (context.estimatedStartConfidence - 60) * 0.09;
  const blankPenalty = context.recentBlankStreak >= 2 ? -1.2 - (context.recentBlankStreak - 2) * 0.45 : 0;
  const shareBonus = context.seasonShare >= 0.8 ? 0.6 : context.seasonShare >= 0.6 ? 0.25 : 0;
  const returnPenalty = context.returnWindow > 0 && context.estimatedMinutesMax <= 55 ? -0.75 : 0;
  return startDelta + blankPenalty + shareBonus + returnPenalty;
}

function workloadSwing(player: SquadPlayer) {
  const context = playerContextInfo(player);
  let swing = 0;

  if (context.workloadTier === 'muy_alta') {
    swing -= player.flag === 'risk' || player.status === 'doubtful' ? 0.9 : 0.2;
  } else if (context.workloadTier === 'alta') {
    swing -= player.flag === 'risk' ? 0.35 : 0;
  } else if (context.workloadTier === 'baja' && context.estimatedStartConfidence >= 74) {
    swing += 0.35;
  }

  if (context.daysToFixture !== null && context.daysToFixture <= 1 && (player.flag === 'risk' || player.status === 'doubtful')) {
    swing -= 0.35;
  }

  return swing;
}

function liveSignalSwing(player: SquadPlayer) {
  const live = player.live;

  if (!live?.flag) {
    return 0;
  }

  const freshnessFactor = live.freshnessMinutes <= 180 ? 1 : live.freshnessMinutes <= 720 ? 0.75 : 0.45;
  const sourceFactor = live.sourceCount >= 3 ? 1.05 : live.sourceCount >= 2 ? 0.92 : 0.8;
  const confidenceFactor = clamp(live.confidence / 100, 0.2, 1);
  const weight = freshnessFactor * sourceFactor * confidenceFactor;

  if (live.flag === 'injured') {
    return -2.6 * weight;
  }
  if (live.flag === 'doubtful') {
    return -1.9 * weight;
  }
  if (live.flag === 'risk') {
    return -1.15 * weight;
  }
  if (live.flag === 'fit') {
    return 0.45 * weight;
  }
  if (live.flag === 'boost') {
    return 0.65 * weight;
  }

  return 0;
}

function reliableAverage(player: SquadPlayer) {
  const games = player.gamesPlayed || 0;
  const trust = clamp((games + 2) / 10, 0.35, 1);
  return player.avgPts * trust;
}

function fixtureSwing(player: SquadPlayer) {
  const fixture = player.fixture;

  if (!fixture) {
    return 0;
  }

  let swing = (3 - fixture.difficulty) * 1.1;
  
  if (fixture.isHome) {
    swing += fixture.difficulty <= 2 ? 0.8 : 0.4;
  } else {
    swing -= fixture.difficulty >= 4 ? 1.2 : 0.4;
  }

  if (player.pos === 'PT' || player.pos === 'DF') {
    swing += (3 - fixture.difficulty) * 0.45;
  }

  if (player.pos === 'DL' && fixture.difficulty <= 2) {
    swing += 0.5;
  }

  if (fixture.difficulty >= 5 && (player.pos === 'PT' || player.pos === 'DF')) {
    swing -= 0.8;
  }

  return swing;
}

function bounceBackSwing(player: SquadPlayer) {
  const context = playerContextInfo(player);
  if (player.status !== 'fit' || context.recentAppearances === 0 || !player.lastFive || player.lastFive.length < 2) return 0;
  
  const isPremium = player.avgPts >= 5 || player.price >= 8000000;
  const blankedLast = player.lastFive[0] <= 0 && player.lastFive[1] > 0;
  
  if (isPremium && blankedLast) {
    return 1.8;
  }
  return 0;
}

function momentumSwing(player: SquadPlayer) {
  if (!player.lastFive || player.lastFive.length < 3) return 0;
  if (player.lastFive[0] > player.lastFive[1] && player.lastFive[1] > player.lastFive[2] && player.lastFive[0] >= 6) {
    return 1.8;
  }
  if (player.lastFive[0] >= 6 && player.lastFive[1] >= 6 && player.lastFive[2] >= 6) {
    return 1.4;
  }
  return 0;
}

function motivationSwing(player: SquadPlayer) {
  const context = playerContextInfo(player);
  if (context.teamMotivation === 'alta') return 0.8;
  if (context.teamMotivation === 'baja') return -0.8;
  return 0;
}

function consistencySwing(player: SquadPlayer) {
  const scores = player.lastFive.filter((v) => v > 0);
  if (scores.length < 2) return -0.6;
  const mean = average(scores);
  const variance = scores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 1;
  const isPremium = player.avgPts >= 5.0 || player.price >= 8000000;
  
  if (cv <= 0.25) return 1.0;
  if (cv <= 0.45) return 0.4;
  if (cv >= 0.8) return isPremium ? 0 : -0.8; // Perdonar inconsistencia por lesiones a los cracks
  return 0;
}

function zeroRateSwing(player: SquadPlayer) {
  if (!player.lastFive || player.lastFive.length === 0) return -1.5;
  const zeros = player.lastFive.filter((v) => v <= 0).length;
  const rate = zeros / player.lastFive.length;
  const isPremium = player.avgPts >= 5.0 || player.price >= 8000000;
  
  // Los cracks no rotan por decisión técnica, sus roscos son lesiones o tarjetas.
  // Si están disponibles (status fit), ignoramos la penalización por roscos.
  if (isPremium && player.status === 'fit') {
    return rate === 0 ? 0.5 : 0;
  }
  
  if (rate >= 0.8) return -3.5;
  if (rate >= 0.6) return -2.2;
  if (rate >= 0.4) return -1.0;
  if (rate === 0) return 0.5;
  return 0;
}

function ceilingSwing(player: SquadPlayer, strategy: AnalysisStrategy) {
  if (!player.lastFive || player.lastFive.length === 0) return 0;
  const maxScore = Math.max(...player.lastFive);
  const strategyMult = strategy === 'agresivo' ? 1.5 : strategy === 'conservador' ? 0.5 : 1.0;
  if (maxScore >= 12) return 1.2 * strategyMult;
  if (maxScore >= 8) return 0.6 * strategyMult;
  if (maxScore <= 2 && player.lastFive.length >= 3) return -0.5;
  return 0;
}

function priceExpectationSwing(player: SquadPlayer) {
  const priceM = player.price / 1e6;
  if (priceM >= 12 && player.avgPts < 4) return -1.5;
  if (priceM >= 8 && player.avgPts < 3) return -1.2;
  if (priceM <= 4 && player.avgPts >= 5) return 1.2;
  if (priceM <= 6 && player.avgPts >= 4.5) return 0.6;
  return 0;
}

function schedulePressureSwing(player: SquadPlayer) {
  const context = playerContextInfo(player);
  if (context.schedulePressure === 'alta') {
    return player.flag === 'risk' || player.status === 'doubtful' ? -1.5 : -0.4;
  }
  if (context.schedulePressure === 'baja') {
    return 0.4;
  }
  return 0;
}

function trendSlopeSwing(player: SquadPlayer) {
  const pts = player.lastFive.slice(0, 5);
  if (pts.length < 3) return 0;
  const n = pts.length;
  const reversed = [...pts].reverse();
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += reversed[i]; sumXY += i * reversed[i]; sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  if (slope >= 2.5) return 1.5;
  if (slope >= 1.0) return 0.8;
  if (slope <= -2.5) return -1.2;
  if (slope <= -1.0) return -0.6;
  return 0;
}

function positionalScarcitySwing(player: SquadPlayer, squad: SquadPlayer[]) {
  const fitAtPos = squad.filter((p) => p.pos === player.pos && p.status !== 'injured' && p.status !== 'suspended');
  const required = player.pos === 'PT' ? 1 : player.pos === 'DL' ? 1 : 2;
  if (fitAtPos.length <= required) return 1.8;
  if (fitAtPos.length <= required + 1) return 0.8;
  return 0;
}

function teamStackSwing(player: SquadPlayer, squad: SquadPlayer[]) {
  if (!player.fixture || player.fixture.difficulty >= 4) return 0;
  const sameTeamStarters = squad.filter(
    (p) => p.team === player.team && p.status !== 'injured' && p.status !== 'suspended' && p.name !== player.name
  );
  const stackCount = sameTeamStarters.length;
  if (stackCount >= 3 && player.fixture.difficulty <= 2) return 1.0;
  if (stackCount >= 2 && player.fixture.difficulty <= 2) return 0.5;
  return 0;
}

function recencyWeightedSwing(player: SquadPlayer) {
  const pts = player.lastFive.slice(0, 5);
  if (pts.length === 0) return 0;
  const weights = [0.35, 0.25, 0.20, 0.12, 0.08];
  let weighted = 0, totalW = 0;
  for (let i = 0; i < pts.length; i++) {
    weighted += pts[i] * (weights[i] || 0.05);
    totalW += weights[i] || 0.05;
  }
  const ema = weighted / totalW;
  const delta = ema - player.avgPts;
  if (delta >= 2) return 1.2;
  if (delta >= 1) return 0.5;
  if (delta <= -2) return -1.0;
  if (delta <= -1) return -0.4;
  return 0;
}

function positionRelativeSwing(player: SquadPlayer, squad: SquadPlayer[]) {
  const peers = squad.filter((p) => p.pos === player.pos && p.status !== 'injured' && p.status !== 'suspended');
  if (peers.length < 2) return 0;
  const peerAvg = average(peers.map((p) => p.avgPts));
  if (peerAvg <= 0) return 0;
  const ratio = player.avgPts / peerAvg;
  if (ratio >= 1.6) return 1.5;
  if (ratio >= 1.3) return 0.7;
  if (ratio <= 0.5) return -1.2;
  if (ratio <= 0.7) return -0.5;
  return 0;
}

function clutchSwing(player: SquadPlayer) {
  const diff = player.fixture?.difficulty ?? 3;
  if (diff <= 2) return 0;
  const recentScores = player.lastFive.filter((v) => v > 0);
  if (recentScores.length === 0) return 0;
  const avgRecent = average(recentScores);
  if (avgRecent >= 7 && diff >= 4) return 1.4;
  if (avgRecent >= 5 && diff >= 4) return 0.6;
  if (avgRecent <= 2 && diff >= 4) return -0.8;
  return 0;
}

function fatigueSwing(player: SquadPlayer) {
  const context = playerContextInfo(player);
  const daysToMatch = context.daysToFixture;
  const workload = context.workloadTier;
  let swing = 0;
  if (daysToMatch !== null && daysToMatch >= 5 && workload === 'muy_alta') {
    swing += 0.6;
  } else if (daysToMatch !== null && daysToMatch <= 2 && workload === 'muy_alta') {
    swing -= 1.0;
  } else if (daysToMatch !== null && daysToMatch <= 2 && workload === 'alta') {
    swing -= 0.5;
  }
  if (context.seasonShare >= 0.9 && context.appearanceStreak >= 5) {
    swing -= 0.4;
  }
  return swing;
}

function marginalValueSwing(player: SquadPlayer, squad: SquadPlayer[]) {
  const peers = squad
    .filter((p) => p.pos === player.pos && p.name !== player.name && p.status !== 'injured' && p.status !== 'suspended')
    .sort((a, b) => b.avgPts - a.avgPts);
  if (peers.length === 0) return 2.0;
  const nextBest = peers[0];
  const gap = player.avgPts - nextBest.avgPts;
  if (gap >= 3) return 1.8;
  if (gap >= 1.5) return 1.0;
  if (gap >= 0.5) return 0.4;
  if (gap <= -2) return -0.8;
  return 0;
}

function fixtureTimingSwing(player: SquadPlayer) {
  if (!player.fixture?.start) return 0;
  const matchDate = new Date(player.fixture.start);
  const day = matchDate.getDay();
  if (day === 5) return 0.5;
  if (day === 6 && matchDate.getHours() <= 16) return 0.3;
  if (day === 1) return -0.3;
  return 0;
}

function diversificationSwing(player: SquadPlayer, squad: SquadPlayer[]) {
  const sameTeam = squad.filter(
    (p) => p.team === player.team && p.status !== 'injured' && p.status !== 'suspended'
  ).length;
  if (sameTeam >= 5) return -1.5;
  if (sameTeam >= 4) return -0.8;
  return 0;
}

function cleanSheetSwing(player: SquadPlayer) {
  if (player.pos !== 'PT' && player.pos !== 'DF') return 0;
  const diff = player.fixture?.difficulty ?? 3;
  const isHome = player.fixture?.isHome ?? false;
  if (diff <= 1 && isHome) return 1.5;
  if (diff <= 2 && isHome) return 0.8;
  if (diff <= 2) return 0.4;
  if (diff >= 5) return -0.6;
  if (diff >= 4 && !isHome) return -0.4;
  return 0;
}

function seasonPhaseSwing(player: SquadPlayer) {
  const context = playerContextInfo(player);
  const round = context.seasonRound;
  if (round <= 0) return 0;
  if (round >= 35) {
    if (context.teamMotivation === 'baja') return -1.2;
    if (context.teamMotivation === 'alta') return 0.8;
    return -0.3;
  }
  if (round <= 5) {
    return -0.3;
  }
  return 0;
}

function meanReversionSwing(player: SquadPlayer) {
  const recent = recentForm(player);
  const season = player.avgPts;
  if (season <= 0) return 0;
  const deviation = recent - season;
  if (deviation >= 4) return -0.7;
  if (deviation >= 2.5) return -0.3;
  if (deviation <= -3) return 0.5;
  if (deviation <= -2) return 0.3;
  return 0;
}

const DERBY_PAIRS: Record<string, string[]> = {
  'Real Madrid': ['Barcelona', 'Atletico'],
  'Barcelona': ['Real Madrid', 'Espanyol'],
  'Atletico': ['Real Madrid', 'Getafe'],
  'Sevilla': ['Betis'],
  'Betis': ['Sevilla'],
  'Athletic': ['Real Sociedad'],
  'Real Sociedad': ['Athletic'],
  'Valencia': ['Villarreal', 'Levante'],
  'Villarreal': ['Valencia'],
  'Espanyol': ['Barcelona'],
  'Getafe': ['Atletico', 'Rayo Vallecano', 'Leganes'],
  'Rayo Vallecano': ['Getafe', 'Leganes'],
  'Leganes': ['Getafe', 'Rayo Vallecano'],
};

function derbySwing(player: SquadPlayer) {
  if (!player.fixture?.opponent) return 0;
  const rivals = DERBY_PAIRS[player.team];
  if (!rivals) return 0;
  const opp = player.fixture.opponent;
  const isDerby = rivals.some((r) => opp.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(opp.toLowerCase()));
  if (!isDerby) return 0;
  if (player.pos === 'DF' || player.pos === 'PT') return -0.4;
  if (player.pos === 'DL' && player.avgPts >= 5) return 0.5;
  return 0.2;
}

// ──────────────────────────────────────────────────────────────────
// DIM 33 – Depth Opportunity: Efecto Dominó por lesión del titular
// ──────────────────────────────────────────────────────────────────
function depthOpportunitySwing(player: SquadPlayer, allPlayers?: SquadPlayer[]) {
  if (!allPlayers || allPlayers.length === 0) return 0;

  // Compañeros del mismo equipo y misma posición
  const teammates = allPlayers.filter(
    (p) => p.team === player.team && p.pos === player.pos && p.name !== player.name
  );

  if (teammates.length === 0) return 0;

  // Jugadores por encima en el depth chart (más puntos totales)
  const aboveInDepth = teammates.filter((p) => p.totalPts > player.totalPts);

  if (aboveInDepth.length === 0) {
    // Este jugador YA es el top de su posición en su equipo → no necesita boost
    return 0;
  }

  // Contar cuántos de los que están por encima están lesionados/sancionados
  const injuredAbove = aboveInDepth.filter(
    (p) => p.status === 'injured' || p.status === 'suspended'
  );

  if (injuredAbove.length === 0) return 0;

  // Calcular la "calidad perdida" → cuanto mejor era el lesionado, más oportunidad
  const avgInjuredPts = average(injuredAbove.map((p) => p.avgPts));
  const bestInjuredPts = Math.max(...injuredAbove.map((p) => p.totalPts));

  // El boost es proporcional a cuántos titulares hay fuera y su calidad
  const coverageRatio = injuredAbove.length / aboveInDepth.length; // 1.0 = todos los de arriba lesionados
  const qualityFactor = clamp(avgInjuredPts / 5, 0.5, 2.0); // Escalar por calidad del ausente

  // Boost base: entre 1.5 y 4.0 puntos dependiendo de la situación
  let boost = coverageRatio * qualityFactor * 2.5;

  // Si TODOS los jugadores por encima están fuera, boost máximo (caso Gonzalo con Mbappé + Rodrygo out)
  if (coverageRatio >= 1.0) {
    boost += 1.5;
  }

  // Bonus extra si el jugador ha demostrado picos altos (sabe rendir cuando le dan minutos)
  const maxRecent = player.lastFive.length > 0 ? Math.max(...player.lastFive) : 0;
  if (maxRecent >= 8) {
    boost += 0.8;
  }

  return clamp(boost, 0, 5.0);
}

// ──────────────────────────────────────────────────────────────────
// DIM 34 – Peak Ratio: ratio pico/media para detectar suplentes explosivos
// ──────────────────────────────────────────────────────────────────
function peakRatioSwing(player: SquadPlayer) {
  if (!player.lastFive || player.lastFive.length < 2) return 0;
  if (player.avgPts <= 0) return 0;

  const maxInFitness = Math.max(...player.lastFive);
  const ratio = maxInFitness / player.avgPts;

  // Un ratio alto (ej: pico 21, media 2.7 → ratio 7.8) indica un suplente que explota
  // Un titular consistente tendría ratio ~1.5-2.0
  if (ratio >= 5.0) return 1.8;  // Suplente mega-explosivo (caso Gonzalo: 21/2.7 = 7.8)
  if (ratio >= 3.5) return 1.2;  // Suplente explosivo
  if (ratio >= 2.5) return 0.5;  // Cierta explosividad
  if (ratio <= 1.2 && player.gamesPlayed >= 15) return 0.3; // Titular ultra-consistente (bonus menor)
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// DIM 35 – Starter Avg: estimar la media real "como titular"
// ──────────────────────────────────────────────────────────────────
function starterAvgSwing(player: SquadPlayer) {
  if (!player.lastFive || player.lastFive.length < 3) return 0;
  if (player.avgPts <= 0) return 0;

  // Separar las puntuaciones en "partidos altos" (probable titular) y "partidos bajos" (probable suplente/cameo)
  const scores = [...player.lastFive].filter((v) => v >= 0);
  if (scores.length < 2) return 0;

  const sorted = [...scores].sort((a, b) => b - a);
  const highScores = sorted.filter((v) => v >= 4); // 4+ pts = probablemente jugó muchos minutos
  const lowScores = sorted.filter((v) => v >= 0 && v <= 2); // 0-2 pts = probable cameo

  // Si no hay mezcla clara de altos y bajos, no es un patrón de suplente
  if (highScores.length === 0 || lowScores.length === 0) return 0;

  // La "media como titular" usando solo los partidos altos
  const starterAverage = average(highScores);
  const gap = starterAverage - player.avgPts;

  // Si la diferencia entre su media de titular y su media global es brutal, es una ganga oculta
  if (gap >= 6) return 2.0;  // Media de titular 8.5+ pero media global 2.5 → GANGA TOTAL
  if (gap >= 4) return 1.4;  // Diferencia significativa
  if (gap >= 2) return 0.7;  // Diferencia notable
  return 0;
}

function flagSwing(player: SquadPlayer) {
  switch (player.flag) {
    case 'boost':
      return 2.4;
    case 'risk':
      return -1.9;
    case 'avoid':
      return -3.2;
    case 'return':
      return 0.7;
    default:
      return 0;
  }
}

function reliabilitySwing(player: SquadPlayer) {
  const games = player.gamesPlayed || 0;
  const recentApps = recentAppearances(player);
  const comeback = managedReturnProfile(player);
  const context = playerContextInfo(player);
  let swing = 0;

  if (games <= 3) {
    swing -= (4 - Math.max(1, games)) * 0.9;
  } else if (games <= 8) {
    swing -= 0.7;
  }

  if (player.status === 'fit') {
    if (recentApps === 0) {
      swing -= player.pos === 'PT' ? 5.8 : 4.2;
    } else if (recentApps === 1) {
      swing -= player.pos === 'PT' ? 2.8 : 1.9;
    }
  }

  if (player.flag === 'return') {
    swing += 1.4;
  }

  if (comeback?.likelyManagedReturn) {
    const qualityBoost =
      clamp((comeback.recentAverage - 2.5) * 0.45, 0, 1.2) +
      clamp(((player.price / 1e6) - 5) * 0.08, 0, 0.7);
    const minutesPenalty = comeback.streak === 1 ? 1.2 : comeback.streak === 2 ? 0.75 : 0.35;
    swing += qualityBoost - minutesPenalty;

    if (comeback.premiumQuality) {
      swing += 0.35;
    }

    if ((player.fixture?.difficulty ?? 3) >= 5) {
      swing -= 0.35;
    }
  }

  if (context.recentBlankStreak >= 2) {
    swing -= context.recentBlankStreak * 0.45;
  }

  if (context.appearanceStreak >= 3 && context.estimatedStartConfidence >= 80) {
    swing += 0.45;
  }

  return swing;
}

function managedReturnStrategySwing(player: SquadPlayer, strategy: AnalysisStrategy) {
  const comeback = managedReturnProfile(player);
  if (!comeback?.likelyManagedReturn) {
    return 0;
  }

  const profile = getStrategyProfile(strategy).managedReturn;
  let swing = profile.base;

  if (comeback.premiumQuality) {
    swing += profile.premium;
  }

  if ((player.fixture?.difficulty ?? 3) <= 2) {
    swing += profile.easyFixture;
  }

  if (player.fixture?.isHome) {
    swing += profile.home;
  }

  return swing;
}

function playerLineupScore(player: SquadPlayer, strategy: AnalysisStrategy = 'equilibrado', squad?: SquadPlayer[], allPlayers?: SquadPlayer[]) {
  if (player.status === 'injured' || player.status === 'suspended') {
    return -999;
  }

  const profile = getStrategyProfile(strategy);
  let score = reliableAverage(player) * profile.lineup.reliableWeight;
  score += recentForm(player) * profile.lineup.recentWeight;
  score += fixtureSwing(player) * profile.lineup.fixtureWeight;
  score += flagSwing(player) * profile.lineup.flagWeight;
  score += reliabilitySwing(player) * profile.lineup.reliabilityWeight;
  score += availabilitySwing(player) * profile.lineup.availabilityWeight;
  score += workloadSwing(player) * profile.lineup.workloadWeight;
  score += liveSignalSwing(player) * profile.lineup.liveWeight;
  score += managedReturnStrategySwing(player, strategy);
  score += bounceBackSwing(player);
  score += momentumSwing(player);
  score += motivationSwing(player);
  score += consistencySwing(player);
  score += zeroRateSwing(player);
  score += ceilingSwing(player, strategy);
  score += priceExpectationSwing(player);
  score += schedulePressureSwing(player);
  score += trendSlopeSwing(player);
  score += recencyWeightedSwing(player);
  score += clutchSwing(player);
  score += fatigueSwing(player);
  score += fixtureTimingSwing(player);
  score += cleanSheetSwing(player);
  score += seasonPhaseSwing(player);
  score += meanReversionSwing(player);
  score += derbySwing(player);
  // Nuevas dimensiones: Radar de Gangas
  score += depthOpportunitySwing(player, allPlayers || squad);
  score += peakRatioSwing(player);
  score += starterAvgSwing(player);
  if (squad) {
    score += positionalScarcitySwing(player, squad);
    score += teamStackSwing(player, squad);
    score += positionRelativeSwing(player, squad);
    score += marginalValueSwing(player, squad);
    score += diversificationSwing(player, squad);
  }

  if (player.status === 'doubtful') {
    score -= profile.lineup.doubtfulPenalty;
  }

  return score;
}

function playerScoreBreakdown(player: SquadPlayer, strategy: AnalysisStrategy = 'equilibrado', squad?: SquadPlayer[], allPlayers?: SquadPlayer[]) {
  const profile = getStrategyProfile(strategy);
  const reliable = reliableAverage(player) * profile.lineup.reliableWeight;
  const recent = recentForm(player) * profile.lineup.recentWeight;
  const fixture = fixtureSwing(player) * profile.lineup.fixtureWeight;
  const flags = flagSwing(player) * profile.lineup.flagWeight;
  const reliability = reliabilitySwing(player) * profile.lineup.reliabilityWeight;
  const availability = availabilitySwing(player) * profile.lineup.availabilityWeight;
  const workload = workloadSwing(player) * profile.lineup.workloadWeight;
  const live = liveSignalSwing(player) * profile.lineup.liveWeight;
  const managed = managedReturnStrategySwing(player, strategy);
  const bounceBack = bounceBackSwing(player);
  const momentum = momentumSwing(player);
  const motivation = motivationSwing(player);
  const consistency = consistencySwing(player);
  const zeroRate = zeroRateSwing(player);
  const ceiling = ceilingSwing(player, strategy);
  const priceExp = priceExpectationSwing(player);
  const schedule = schedulePressureSwing(player);
  const trendSlope = trendSlopeSwing(player);
  const recencyW = recencyWeightedSwing(player);
  const scarcity = squad ? positionalScarcitySwing(player, squad) : 0;
  const stack = squad ? teamStackSwing(player, squad) : 0;
  const posRelative = squad ? positionRelativeSwing(player, squad) : 0;
  const clutch = clutchSwing(player);
  const fatigue = fatigueSwing(player);
  const marginal = squad ? marginalValueSwing(player, squad) : 0;
  const timing = fixtureTimingSwing(player);
  const diversification = squad ? diversificationSwing(player, squad) : 0;
  const cleanSheet = cleanSheetSwing(player);
  const seasonPhase = seasonPhaseSwing(player);
  const meanReversion = meanReversionSwing(player);
  const derby = derbySwing(player);
  const depthOpp = depthOpportunitySwing(player, allPlayers || squad);
  const peakR = peakRatioSwing(player);
  const starterA = starterAvgSwing(player);
  const doubtful = player.status === 'doubtful' ? -profile.lineup.doubtfulPenalty : 0;

  return {
    total: reliable + recent + fixture + flags + reliability + availability + workload + live + managed + bounceBack + momentum + motivation + consistency + zeroRate + ceiling + priceExp + schedule + trendSlope + recencyW + scarcity + stack + posRelative + clutch + fatigue + marginal + timing + diversification + cleanSheet + seasonPhase + meanReversion + derby + depthOpp + peakR + starterA + doubtful,
    reliable,
    recent,
    fixture,
    flags,
    reliability,
    availability,
    workload,
    live,
    managed,
    bounceBack,
    momentum,
    motivation,
    consistency,
    zeroRate,
    ceiling,
    priceExp,
    schedule,
    trendSlope,
    recencyW,
    scarcity,
    stack,
    posRelative,
    clutch,
    fatigue,
    marginal,
    timing,
    diversification,
    cleanSheet,
    seasonPhase,
    meanReversion,
    derby,
    depthOpportunity: depthOpp,
    peakRatio: peakR,
    starterAvg: starterA,
  };
}

function playerContributionWindow(player: SquadPlayer) {
  return player.lastFive.filter((value) => value > 0).length;
}

function trendSummary(player: SquadPlayer) {
  const recent = recentForm(player);
  const delta = recent - player.avgPts;

  if (delta >= 1.2) {
    return `momento al alza (${recent.toFixed(1)} recientes vs ${player.avgPts.toFixed(1)} anual)`;
  }

  if (delta <= -1.2) {
    return `momento a la baja (${recent.toFixed(1)} recientes vs ${player.avgPts.toFixed(1)} anual)`;
  }

  return `momento bastante estable (${recent.toFixed(1)} recientes vs ${player.avgPts.toFixed(1)} anual)`;
}

function continuitySummary(player: SquadPlayer) {
  const contributionWindow = playerContributionWindow(player);
  const streak = currentAppearanceStreak(player);

  if (contributionWindow >= 4) {
    return `${contributionWindow}/5 jornadas recientes sumando y ${streak >= 2 ? `${streak} seguidas con presencia util` : 'continuidad alta'}`;
  }

  if (contributionWindow <= 1) {
    return `${contributionWindow}/5 jornadas recientes sumando, con continuidad muy floja`;
  }

  return `${contributionWindow}/5 jornadas recientes sumando, con continuidad media`;
}

function seasonSampleSummary(player: SquadPlayer) {
  if (player.gamesPlayed >= 30) {
    return `${player.gamesPlayed} partidos del curso y muestra muy fiable`;
  }

  if (player.gamesPlayed >= 20) {
    return `${player.gamesPlayed} partidos del curso y muestra solida`;
  }

  if (player.gamesPlayed >= 8) {
    return `${player.gamesPlayed} partidos del curso y muestra intermedia`;
  }

  return `${player.gamesPlayed} partidos del curso y muestra corta`;
}

function recoverySummary(player: SquadPlayer) {
  const comeback = managedReturnProfile(player);
  const context = playerContextInfo(player);

  if (comeback?.likelyManagedReturn) {
    return `lleva ${comeback.streak} jornada${comeback.streak === 1 ? '' : 's'} de vuelta y sigue en reentrada (${context.estimatedMinutesMin}-${context.estimatedMinutesMax} min estimados)`;
  }

  if (player.flag === 'return') {
    return context.returnWindow > 0
      ? `viene marcado como vuelta reciente y abre una ventana estimada de ${context.estimatedMinutesMin}-${context.estimatedMinutesMax} min`
      : 'viene marcado como vuelta reciente';
  }

  return '';
}

function workloadSummary(player: SquadPlayer) {
  const context = playerContextInfo(player);
  const loadLabel =
    context.workloadTier === 'muy_alta'
      ? 'carga anual muy alta'
      : context.workloadTier === 'alta'
        ? 'carga anual sostenida'
        : context.workloadTier === 'baja'
          ? 'rodaje anual corto'
          : 'carga anual media';
  const sharePct = Math.round(context.seasonShare * 100);
  return `${loadLabel}, presencia del ${sharePct}% del calendario`;
}

function signalSummary(player: SquadPlayer) {
  if (player.status === 'doubtful') {
    return 'arrastra senal de duda';
  }

  if (player.flag === 'risk' || player.flag === 'avoid') {
    return 'arrastra senal de riesgo';
  }

  if (player.flag === 'boost') {
    return 'llega con senal positiva de racha';
  }

  if (player.flag === 'return') {
    return 'llega con senal de vuelta';
  }

  return '';
}

function startConfidenceSummary(player: SquadPlayer) {
  const context = playerContextInfo(player);
  return `confianza de salida estimada en ${context.estimatedStartConfidence}%`;
}

function minutesSummary(player: SquadPlayer) {
  const context = playerContextInfo(player);
  return `ventana de minutos ${context.estimatedMinutesMin}-${context.estimatedMinutesMax}`;
}

function scheduleWindowSummary(player: SquadPlayer) {
  const context = playerContextInfo(player);
  if (context.daysToFixture === null) {
    return '';
  }

  if (context.daysToFixture <= 0) {
    return 'partido practicamente encima';
  }

  if (context.daysToFixture === 1) {
    return 'partido en menos de 48h';
  }

  return `partido dentro de ${context.daysToFixture} dias`;
}

function liveSignalSummary(player: SquadPlayer) {
  const live = player.live;

  if (!live?.flag || !live.summary) {
    return '';
  }

  const freshness =
    live.freshnessMinutes <= 0
      ? 'ahora mismo'
      : live.freshnessMinutes < 60
        ? `hace ${live.freshnessMinutes} min`
        : `hace ${Math.round(live.freshnessMinutes / 60)} h`;

  return `senal viva ${live.flag} ${freshness}: ${live.summary}`;
}

function baseProfileReason(player: SquadPlayer) {
  const parts = [
    seasonSampleSummary(player),
    continuitySummary(player),
    trendSummary(player),
    startConfidenceSummary(player),
    minutesSummary(player),
    workloadSummary(player),
    recoverySummary(player),
    scheduleWindowSummary(player),
    liveSignalSummary(player),
    signalSummary(player),
  ].filter(Boolean);

  return parts.slice(0, 5).join(', ');
}

function captainScore(player: SquadPlayer, strategy: AnalysisStrategy = 'equilibrado', squad?: SquadPlayer[], allPlayers?: SquadPlayer[]) {
  const context = playerContextInfo(player);
  
  if (player.status !== 'fit' || player.flag === 'risk' || player.flag === 'avoid' || context.estimatedStartConfidence < 85) {
    return -999;
  }

  const profile = getStrategyProfile(strategy);
  let score = playerLineupScore(player, strategy, squad, allPlayers) + reliableAverage(player) * profile.captain.reliableWeight;
  const comeback = managedReturnProfile(player);

  if (player.flag === 'boost') {
    score += profile.captain.boostBonus;
  }

  if (player.fixture?.difficulty === 1) {
    score += profile.captain.easyFixtureBonus;
  }

  if (player.fixture?.difficulty === 5) {
    score -= profile.captain.hardFixturePenalty;
  }

  if (comeback?.likelyManagedReturn) {
    score -= comeback.streak <= 2 ? profile.captain.managedReturnPenalty : profile.captain.managedReturnPenalty * 0.65;
  }

  return score;
}

function orderPlayersForLineup(squad: SquadPlayer[], strategy: AnalysisStrategy = 'equilibrado', allPlayers?: SquadPlayer[]) {
  return [...squad]
    .filter((player) => player.status !== 'injured' && player.status !== 'suspended')
    .sort((a, b) => playerLineupScore(b, strategy, squad, allPlayers) - playerLineupScore(a, strategy, squad, allPlayers));
}

type FormationShape = {
  defs: number;
  mids: number;
  forwards: number;
};

type FormationCandidate = {
  formacion: string;
  oncePlayers: SquadPlayer[];
  score: number;
  shape: FormationShape;
};

const FORMATION_CANDIDATES: FormationShape[] = [
  { defs: 3, mids: 4, forwards: 3 },
  { defs: 3, mids: 5, forwards: 2 },
  { defs: 4, mids: 3, forwards: 3 },
  { defs: 4, mids: 4, forwards: 2 },
  { defs: 4, mids: 5, forwards: 1 },
  { defs: 5, mids: 3, forwards: 2 },
  { defs: 5, mids: 4, forwards: 1 },
];

function buildFormationReason(best: FormationCandidate, alt: FormationCandidate | null) {
  if (!alt || alt.formacion === best.formacion) {
    return `El ${best.formacion} es el que mejor encaja con tus notas actuales por puestos.`;
  }

  const bestOnly = best.oncePlayers.filter((player) => !alt.oncePlayers.some((other) => other.name === player.name));
  const altOnly = alt.oncePlayers.filter((player) => !best.oncePlayers.some((other) => other.name === player.name));
  const bestNames = bestOnly.map((player) => player.name).slice(0, 2);
  const altNames = altOnly.map((player) => player.name).slice(0, 2);

  if (bestNames.length > 0 && altNames.length > 0) {
    return `Sale ${best.formacion} porque abre hueco a ${bestNames.join(' y ')} por delante de ${altNames.join(' y ')}.`;
  }

  return `Sale ${best.formacion} porque supera al ${alt.formacion} en suma esperada de titulares.`;
}

function buildFallbackLineup(squad: SquadPlayer[], strategy: AnalysisStrategy = 'equilibrado', allPlayers?: SquadPlayer[]) {
  const ordered = orderPlayersForLineup(squad, strategy, allPlayers);
  const sortedByPos = (pos: string) =>
    ordered
      .filter((player) => player.pos === pos)
      .sort((a, b) => playerLineupScore(b, strategy, squad, allPlayers) - playerLineupScore(a, strategy, squad, allPlayers));

  const pt = sortedByPos('PT')[0] || ordered[0];
  const defenders = sortedByPos('DF');
  const midfielders = sortedByPos('MC');
  const forwards = sortedByPos('DL');
  const profile = getStrategyProfile(strategy);
  const candidates = FORMATION_CANDIDATES.map((shape) => {
    if (!pt || defenders.length < shape.defs || midfielders.length < shape.mids || forwards.length < shape.forwards) {
      return null;
    }

    const oncePlayers = [
      pt,
      ...defenders.slice(0, shape.defs),
      ...midfielders.slice(0, shape.mids),
      ...forwards.slice(0, shape.forwards),
    ].filter(Boolean) as SquadPlayer[];

    const score =
      oncePlayers.reduce((sum, player) => sum + playerLineupScore(player, strategy, squad, allPlayers), 0) +
      shape.defs * profile.formationBias.defense +
      shape.mids * profile.formationBias.midfield +
      shape.forwards * profile.formationBias.attack;

    return {
      formacion: `${shape.defs}-${shape.mids}-${shape.forwards}`,
      oncePlayers,
      score,
      shape,
    } satisfies FormationCandidate;
  }).filter(Boolean) as FormationCandidate[];

  const selected =
    [...candidates].sort((a, b) => b.score - a.score)[0] ||
    ({
      formacion: `${Math.min(4, defenders.length)}-${Math.min(3, midfielders.length)}-${Math.min(3, forwards.length)}`,
      oncePlayers: [
        pt,
        ...defenders.slice(0, 4),
        ...midfielders.slice(0, 3),
        ...forwards.slice(0, 3),
      ].filter(Boolean).slice(0, 11) as SquadPlayer[],
      score: 0,
      shape: { defs: Math.min(4, defenders.length), mids: Math.min(3, midfielders.length), forwards: Math.min(3, forwards.length) },
    } satisfies FormationCandidate);

  const oncePlayers = selected.oncePlayers;
  const onceNames = oncePlayers.map((player) => player.name);
  const benchPlayers = ordered.filter((player) => !onceNames.includes(player.name)).slice(0, 4);
  const captain =
    [...oncePlayers].sort((a, b) => captainScore(b, strategy, squad, allPlayers) - captainScore(a, strategy, squad, allPlayers))[0] || oncePlayers[0];
  const vicecaptain =
    [...oncePlayers]
      .filter((player) => player.name !== captain?.name)
      .sort((a, b) => captainScore(b, strategy, squad, allPlayers) - captainScore(a, strategy, squad, allPlayers))[0] || oncePlayers[1];

  return {
    formacion: selected.formacion,
    oncePlayers,
    benchPlayers,
    captain: captain?.name || onceNames[0] || '',
    vicecaptain: vicecaptain?.name || onceNames[1] || '',
    formationReason: buildFormationReason(selected, candidates.length > 1 ? [...candidates].sort((a, b) => b.score - a.score)[1] || null : null),
  };
}

function estimateProjectedPoints(starters: SquadPlayer[], strategy: AnalysisStrategy = 'equilibrado', captain?: SquadPlayer, squad?: SquadPlayer[], allPlayers?: SquadPlayer[]) {
  const profile = getStrategyProfile(strategy);
  const basePoints = starters.reduce((sum, player) => {
    // Si la IA sabe que es titular por baja ajena o rinde brutal como titular, ajustamos su suelo
    const depthBoost = depthOpportunitySwing(player, allPlayers || squad);
    const starterAvg = starterAvgSwing(player);
    let base = player.avgPts || 0;
    
    if (depthBoost > 0 || starterAvg > 0) {
      // Como mínimo, un titular competente suele sacar 4 puntos
      base = Math.max(base, starterAvg > 0 ? (player.avgPts || 0) + starterAvg : 4.0);
    }
    
    const swing =
      fixtureSwing(player) * profile.projection.fixtureWeight +
      flagSwing(player) * profile.projection.flagWeight +
      managedReturnStrategySwing(player, strategy) * 0.45;
      
    return sum + Math.max(0.5, base + swing);
  }, 0);

  // El capitán suma el doble, así que le sumamos sus puntos proyectados una vez más
  let captainBonus = 0;
  if (captain) {
    const depthBoost = depthOpportunitySwing(captain, allPlayers || squad);
    const starterAvg = starterAvgSwing(captain);
    let capBase = captain.avgPts || 0;
    if (depthBoost > 0 || starterAvg > 0) {
      capBase = Math.max(capBase, starterAvg > 0 ? (captain.avgPts || 0) + starterAvg : 4.0);
    }
    const capSwing =
      fixtureSwing(captain) * profile.projection.fixtureWeight +
      flagSwing(captain) * profile.projection.flagWeight +
      managedReturnStrategySwing(captain, strategy) * 0.45;
    captainBonus = Math.max(0.5, capBase + capSwing);
  }

  return Math.round(basePoints + captainBonus);
}

function confidenceFromSquad(squad: SquadPlayer[], once: string[], strategy: AnalysisStrategy = 'equilibrado') {
  const starters = once.map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const profile = getStrategyProfile(strategy);
  const injured = starters.filter((player) => player.status === 'injured' || player.status === 'suspended').length;
  const doubtful = starters.filter((player) => player.status === 'doubtful').length;
  const risky = starters.filter((player) => player.flag === 'risk' || player.flag === 'avoid').length;
  const boosts = starters.filter((player) => player.flag === 'boost').length;
  const fixtureKnown = starters.filter((player) => player.fixture).length;
  const homeCount = starters.filter((player) => player.fixture?.isHome).length;
  const avgDifficulty = average(starters.map((player) => player.fixture?.difficulty ?? 3));
  const recent = average(starters.flatMap((player) => player.lastFive.slice(0, 3)));

  const raw =
    profile.confidence.base +
    boosts * profile.confidence.boostBonus -
    injured * profile.confidence.injuredPenalty -
    doubtful * profile.confidence.doubtfulPenalty -
    risky * profile.confidence.riskPenalty +
    fixtureKnown * profile.confidence.fixtureKnownBonus +
    homeCount * profile.confidence.homeBonus -
    (avgDifficulty - 3) * profile.confidence.difficultyWeight +
    recent * profile.confidence.recentWeight;

  return clamp(Math.round(raw), 45, 94);
}

function actionPriorityFromConfidence(confidence: number): 'alta' | 'media' | 'baja' {
  if (confidence >= 80) {
    return 'alta';
  }
  if (confidence >= 63) {
    return 'media';
  }
  return 'baja';
}

function buildActions(
  result: AnalysisResult,
  squad: SquadPlayer[],
  strategy: AnalysisStrategy = 'equilibrado',
  allPlayers?: SquadPlayer[]
): AnalysisAction[] {
  const profile = getStrategyProfile(strategy);
  const starters = (result.once || []).map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const bench = (result.banquillo || []).map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const captain = findPlayer(squad, result.capitan);
  const riskStarter = starters.find(
    (player) => player.flag === 'risk' || player.flag === 'avoid' || player.status === 'doubtful'
  );
  const bestFixtureStarter = starters
    .filter((player) => player.fixture)
    .sort(
      (a, b) =>
        a.fixture!.difficulty - b.fixture!.difficulty || playerLineupScore(b, strategy, squad, allPlayers) - playerLineupScore(a, strategy, squad, allPlayers)
    )[0];
  const benchUpgrade = bench
    .filter((player) => player.fixture)
    .sort((a, b) => playerLineupScore(b, strategy, squad, allPlayers) - playerLineupScore(a, strategy, squad, allPlayers))[0];
  const confidence = result.resumen?.confianza_general || confidenceFromSquad(squad, result.once || [], strategy);
  const bestBenchMid = bench
    .filter((player) => player.pos === 'MC')
    .sort((a, b) => playerLineupScore(b, strategy, squad, allPlayers) - playerLineupScore(a, strategy, squad, allPlayers))[0];
  const weakestStarterDef = starters
    .filter((player) => player.pos === 'DF')
    .sort((a, b) => playerLineupScore(a, strategy, squad, allPlayers) - playerLineupScore(b, strategy, squad, allPlayers))[0];
  const formationHint =
    bestBenchMid &&
      weakestStarterDef &&
      playerLineupScore(bestBenchMid, strategy, squad, allPlayers) > playerLineupScore(weakestStarterDef, strategy, squad, allPlayers)
      ? ` El cuarto medio ${bestBenchMid.name} aprieta mas que tu defensa mas floja (${weakestStarterDef.name}), asi que una variante tipo 3-4-3 queda muy abierta.`
      : '';

  const actions: AnalysisAction[] = [
    {
      tipo: 'alineacion',
      titulo: `Cierra el once ${result.formacion}`,
      detalle: `El plan sale con ${result.capitan} al mando y un enfoque ${profile.label.toLowerCase()} que pesa cada fixture jugador a jugador, no un rival global inventado.${formationHint}`,
      impacto:
        strategy === 'conservador'
          ? `Suelo estimado ${result.puntuacion_estimada} pts`
          : `Techo estimado ${result.puntuacion_estimada} pts`,
      confianza: confidence,
      prioridad: actionPriorityFromConfidence(confidence),
    },
  ];

  if (captain) {
    actions.push({
      tipo: 'capitania',
      titulo: `Manten a ${captain.name} de capitan`,
      detalle: `${captain.name} llega ${fixturePhrase(captain.fixture)} y combina media, forma y contexto para doblar puntos con sentido.`,
      impacto: `${reliableAverage(captain).toFixed(1)} pts de media fiable`,
      confianza: clamp(confidence + 4, 55, 95),
      prioridad: 'alta',
    });
  }

  if (riskStarter) {
    actions.push({
      tipo: 'riesgo',
      titulo: `Vigila a ${riskStarter.name} hasta el cierre`,
      detalle: `${riskStarter.name} entra ${fixturePhrase(riskStarter.fixture)} pero arrastra riesgo por estado "${riskStarter.status}" o flag "${riskStarter.flag}".`,
      impacto: 'Te protege de un cero o de una suplencia corta',
      confianza: clamp(confidence - 6, 48, 88),
      prioridad: 'alta',
    });
  } else if (bestFixtureStarter) {
    actions.push({
      tipo: 'fixture',
      titulo: `Aprieta con ${bestFixtureStarter.name}`,
      detalle: `Es uno de los titulares con mejor calendario inmediato: ${fixtureTag(bestFixtureStarter.fixture)}.`,
      impacto: 'Sube suelo y tambien techo de la alineacion',
      confianza: clamp(confidence + 1, 55, 92),
      prioridad: 'media',
    });
  }

  if (benchUpgrade) {
    actions.push({
      tipo: 'banquillo',
      titulo: `Deja preparado a ${benchUpgrade.name}`,
      detalle: `Si hay una baja de ultima hora, es la cobertura con mejor cruce disponible: ${fixtureTag(benchUpgrade.fixture)}.`,
      impacto: `${reliableAverage(benchUpgrade).toFixed(1)} pts de media fiable desde el banquillo`,
      confianza: clamp(confidence - 2, 52, 90),
      prioridad: 'media',
    });
  }

  if (result.fichajes?.[0]) {
    const move = result.fichajes[0];
    actions.push({
      tipo: 'mercado',
      titulo: `Prepara la operacion ${move.vender} -> ${move.comprar}`,
      detalle: move.razon,
      impacto: `Objetivo ${move.precio_estimado}`,
      confianza: clamp(confidence - 3, 50, 88),
      prioridad: 'media',
    });
  }

  return actions.slice(0, 4);
}

function buildRadar(
  result: AnalysisResult,
  squad: SquadPlayer[],
  strategy: AnalysisStrategy = 'equilibrado'
): AnalysisRadar[] {
  const starters = (result.once || []).map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const confidence = result.resumen?.confianza_general || confidenceFromSquad(squad, result.once || [], strategy);
  const riskCount = starters.filter(
    (player) => player.flag === 'risk' || player.flag === 'avoid' || player.status === 'doubtful'
  ).length;
  const reliableStarter = average(starters.map((player) => reliableAverage(player)));
  const avgFixtureDifficulty = average(starters.map((player) => player.fixture?.difficulty ?? 3));
  const fixturePulse = average(starters.map((player) => fixtureSwing(player)));
  const fixtureKnown = starters.filter((player) => player.fixture).length;

  return [
    {
      label: 'Confianza del once',
      score: confidence,
      note: 'Lectura global del plan contando estado, forma y dificultad individual de cada partido.',
    },
    {
      label: 'Pulso de calendario',
      score: clamp(Math.round(62 + fixturePulse * 10 - (avgFixtureDifficulty - 3) * 8), 32, 94),
      note: 'Mide si tus titulares llegan con cruces favorables o con una jornada cuesta arriba.',
    },
    {
      label: 'Suelo de puntos',
      score: clamp(Math.round(reliableStarter * 11 + fixturePulse * 4), 42, 95),
      note: 'Base razonable de la jornada si el once ejecuta cerca de su media.',
    },
    {
      label: 'Riesgo de ultima hora',
      score: clamp(Math.round(86 - riskCount * 18 + fixtureKnown * 1.5), 24, 92),
      note: 'Un valor bajo te pide mirar noticias y convocatorias hasta el final.',
    },
  ];
}

function buildPlayerDecision(
  player: SquadPlayer,
  result: AnalysisResult,
  confidence: number,
  strategy: AnalysisStrategy = 'equilibrado'
): PlayerDecision {
  const fixture = fixtureTag(player.fixture);
  const comeback = managedReturnProfile(player);

  if (player.name === result.capitan) {
    return {
      nombre: player.name,
      decision: 'Capitan fijo',
      confianza: clamp(confidence + 4, 60, 96),
      motivo: `Es tu mejor mezcla de forma y partido individual. Llega con ${fixture}.`,
    };
  }

  if (player.flag === 'boost') {
    return {
      nombre: player.name,
      decision: 'Titular agresivo',
      confianza: clamp(confidence + 2, 58, 93),
      motivo: `Llega en racha y su cruce ayuda a empujarlo: ${fixture}.`,
    };
  }

  if (player.flag === 'risk' || player.flag === 'avoid' || player.status === 'doubtful') {
    return {
      nombre: player.name,
      decision: 'Vigilar antes del cierre',
      confianza: clamp(confidence - 8, 45, 84),
      motivo: `Tiene senales de riesgo y puede obligarte a reaccionar tarde. Partido detectado: ${fixture}.`,
    };
  }

  if (comeback?.likelyManagedReturn) {
    if (result.once.includes(player.name)) {
      return {
        nombre: player.name,
        decision:
          strategy === 'agresivo' ? 'Titular diferencial' : 'Titular de techo con minutos vigilados',
        confianza: clamp(confidence - (strategy === 'conservador' ? 7 : strategy === 'agresivo' ? 2 : 4), 50, 89),
        motivo:
          strategy === 'agresivo'
            ? `Vuelve con minutos gestionados, pero su techo sigue siendo diferencial y el cruce invita a empujarlo. Partido detectado: ${fixture}.`
            : `Acaba de volver y aun no tiene rol largo asegurado, pero su calidad por toque le mantiene muy vivo. Partido detectado: ${fixture}.`,
      };
    }

    return {
      nombre: player.name,
      decision:
        strategy === 'conservador'
          ? 'Banquillo protegido'
          : strategy === 'agresivo'
            ? 'Apuesta de techo lista'
            : 'Banquillo premium',
      confianza: clamp(confidence - (strategy === 'conservador' ? 4 : 2), 52, 88),
      motivo:
        strategy === 'conservador'
          ? `Viene en reentrada y el plan prefiere esperar continuidad antes de regalarle un sitio. Tiene ${fixture}.`
          : strategy === 'agresivo'
            ? `Puede cambiarte la jornada en pocos minutos si rompe el guion, aunque aun no tenga 90 minutos garantizados. Tiene ${fixture}.`
            : `Viene en reentrada y puede romper la jornada en pocos minutos, pero aun necesita confirmar continuidad. Tiene ${fixture}.`,
    };
  }

  if (player.flag === 'return') {
    return {
      nombre: player.name,
      decision: 'Activo para aprovechar',
      confianza: clamp(confidence - 1, 55, 90),
      motivo: `Su vuelta puede darte ventaja si confirma minutos. Le acompana ${fixture}.`,
    };
  }

  if ((player.fixture?.difficulty ?? 3) <= 2 && result.once.includes(player.name)) {
    return {
      nombre: player.name,
      decision: 'Titular con viento a favor',
      confianza: clamp(confidence + 1, 55, 92),
      motivo: `Su partido individual es de los mas favorables del once: ${fixture}.`,
    };
  }

  return {
    nombre: player.name,
    decision: result.once.includes(player.name) ? 'Titular estable' : 'Banquillo util',
    confianza: confidence,
    motivo: result.once.includes(player.name)
      ? `Te da suelo competitivo y llega con ${fixture}.`
      : `Es una cobertura razonable si salta una baja. Tiene ${fixture}.`,
  };
}

function nearestCutPlayer(player: SquadPlayer, pool: SquadPlayer[], strategy: AnalysisStrategy, mode: 'up' | 'down') {
  const current = playerLineupScore(player, strategy);

  return pool
    .map((candidate) => ({
      candidate,
      diff: playerLineupScore(candidate, strategy) - current,
    }))
    .filter((entry) => (mode === 'up' ? entry.diff >= 0 : entry.diff <= 0))
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0]?.candidate || null;
}

function preferredStarterComparator(player: SquadPlayer, bench: SquadPlayer[], strategy: AnalysisStrategy) {
  const samePos = nearestCutPlayer(
    player,
    bench.filter((candidate) => candidate.pos === player.pos),
    strategy,
    'down'
  );
  const overall = nearestCutPlayer(player, bench, strategy, 'down');

  if (!samePos) {
    return overall;
  }

  if (!overall) {
    return samePos;
  }

  return overall.pos !== player.pos && Math.abs(playerLineupScore(player, strategy) - playerLineupScore(overall, strategy)) <= 0.7
    ? overall
    : samePos;
}

function preferredBenchComparator(player: SquadPlayer, starters: SquadPlayer[], strategy: AnalysisStrategy) {
  const samePos = nearestCutPlayer(
    player,
    starters.filter((candidate) => candidate.pos === player.pos),
    strategy,
    'up'
  );
  const overall = nearestCutPlayer(player, starters, strategy, 'up');

  if (!samePos) {
    return overall;
  }

  if (!overall) {
    return samePos;
  }

  return overall.pos !== player.pos && Math.abs(playerLineupScore(overall, strategy) - playerLineupScore(player, strategy)) <= 0.7
    ? overall
    : samePos;
}

function comparisonReason(winner: SquadPlayer, loser: SquadPlayer, strategy: AnalysisStrategy) {
  const win = playerScoreBreakdown(winner, strategy);
  const lose = playerScoreBreakdown(loser, strategy);
  const winContext = playerContextInfo(winner);
  const loseContext = playerContextInfo(loser);
  const recentGap = win.recent - lose.recent;
  const reliableGap = win.reliable - lose.reliable;
  const fixtureGap = win.fixture - lose.fixture;
  const availabilityGap = win.availability - lose.availability;
  const workloadGap = win.workload - lose.workload;
  const liveGap = win.live - lose.live;
  const managedGap = win.managed - lose.managed;

  if (availabilityGap >= 0.8) {
    return `tiene mejor probabilidad de salir de inicio (${winContext.estimatedStartConfidence}% vs ${loseContext.estimatedStartConfidence}%)`;
  }

  if (recentGap >= 0.7) {
    return `llega con mejor pulso reciente (${recentForm(winner).toFixed(1)} vs ${recentForm(loser).toFixed(1)})`;
  }

  if (reliableGap >= 0.7) {
    return `te da mas suelo fiable hoy (${reliableAverage(winner).toFixed(1)} vs ${reliableAverage(loser).toFixed(1)})`;
  }

  if (fixtureGap >= 0.6) {
    return `sale mejor parado por cruce individual (${fixtureTag(winner.fixture)} frente a ${fixtureTag(loser.fixture)})`;
  }

  if (workloadGap >= 0.45) {
    return `llega con una carga mas limpia y una ventana de minutos mas creible (${winContext.estimatedMinutesMin}-${winContext.estimatedMinutesMax} vs ${loseContext.estimatedMinutesMin}-${loseContext.estimatedMinutesMax})`;
  }

  if (liveGap >= 0.35) {
    return 'arrastra una senal viva mas limpia en la previa';
  }

  if (managedGap >= 0.9) {
    return 'su techo diferencial pesa mas en este modo de juego';
  }

  return `hoy el modelo lo ve ligeramente por delante (${win.total.toFixed(2)} vs ${lose.total.toFixed(2)})`;
}

function formationStructureReason(selected: SquadPlayer, excluded: SquadPlayer, formacion: string) {
  if (selected.pos === excluded.pos) {
    return '';
  }

  if (selected.pos === 'DF' && excluded.pos === 'DL') {
    return ` El ${formacion} cierra una plaza atras antes que forzar un tercer punta.`;
  }

  if (selected.pos === 'MC' && excluded.pos === 'DL') {
    return ` El ${formacion} abre un centro del campo extra antes que meter un tercer delantero.`;
  }

  if (selected.pos === 'DL' && excluded.pos === 'DF') {
    return ` El ${formacion} compra un punta mas antes que una defensa de cuatro o cinco.`;
  }

  if (selected.pos === 'MC' && excluded.pos === 'DF') {
    return ` El ${formacion} se inclina por un medio mas antes que reforzar la zaga.`;
  }

  return '';
}

function structureChoiceReason(player: SquadPlayer, formacion: string, mode: 'starter' | 'bench') {
  if (mode === 'starter') {
    if (player.pos === 'DF') {
      return `el ${formacion} necesita sostener una plaza atras antes que abrir otro perfil ofensivo`;
    }
    if (player.pos === 'MC') {
      return `el ${formacion} prefiere meter un centrocampista extra antes que forzar otra pieza arriba o atras`;
    }
    if (player.pos === 'DL') {
      return `el ${formacion} compra una plaza ofensiva extra porque tu techo arriba compensa`;
    }
  }

  if (player.pos === 'DL') {
    return `el ${formacion} no compra un tercer punta hoy`;
  }
  if (player.pos === 'DF') {
    return `el ${formacion} no necesita una defensa mas larga hoy`;
  }
  if (player.pos === 'MC') {
    return `el ${formacion} no abre un quinto medio hoy`;
  }

  return `el ${formacion} no le hace hueco hoy`;
}

function capitalizeSentence(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function buildLineupArguments(
  result: AnalysisResult,
  squad: SquadPlayer[],
  strategy: AnalysisStrategy = 'equilibrado'
): PlayerDecision[] {
  const starters = (result.once || []).map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const bench = (result.banquillo || []).map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const confidence = result.resumen?.confianza_general || confidenceFromSquad(squad, result.once || [], strategy);

  return starters.map((player) => {
    const base = buildPlayerDecision(player, result, confidence, strategy);
    const comparator = preferredStarterComparator(player, bench, strategy);
    const profileReason = baseProfileReason(player);

    if (!comparator) {
      return {
        ...base,
        motivo: `${base.motivo} ${profileReason}.`,
      };
    }

    if (comparator.pos !== player.pos) {
      return {
        ...base,
        motivo: `${base.motivo} ${profileReason}. Entra porque ${structureChoiceReason(player, result.formacion, 'starter')}. ${capitalizeSentence(comparisonReason(player, comparator, strategy))} frente al primer corte ofensivo (${comparator.name}).`,
      };
    }

    return {
      ...base,
      motivo: `${base.motivo} ${profileReason}. Se queda dentro por delante de ${comparator.name} porque ${comparisonReason(player, comparator, strategy)}.${formationStructureReason(player, comparator, result.formacion)}`,
    };
  });
}

function buildBenchArguments(
  result: AnalysisResult,
  squad: SquadPlayer[],
  strategy: AnalysisStrategy = 'equilibrado'
): PlayerDecision[] {
  const starters = (result.once || []).map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const bench = (result.banquillo || []).map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const confidence = result.resumen?.confianza_general || confidenceFromSquad(squad, result.once || [], strategy);

  return bench.map((player) => {
    const base = buildPlayerDecision(player, result, confidence, strategy);
    const comparator = preferredBenchComparator(player, starters, strategy);
    const recentGap = comparator ? recentForm(comparator) - recentForm(player) : 0;
    const reliableGap = comparator ? reliableAverage(comparator) - reliableAverage(player) : 0;
    const profileReason = baseProfileReason(player);

    let decision = base.decision;
    if (decision === 'Banquillo util' && comparator) {
      if (comparator.pos !== player.pos) {
        decision = 'Banquillo por estructura';
      } else if (recentGap >= 1) {
        decision = 'Banquillo por pulso';
      } else if (reliableGap >= 0.8) {
        decision = 'Banquillo por suelo';
      } else {
        decision = 'Banquillo por corte fino';
      }
    }

    if (!comparator) {
      return { ...base, decision, motivo: `${base.motivo} ${profileReason}.` };
    }

    if (comparator.pos !== player.pos) {
      return {
        ...base,
        decision,
        motivo: `${base.motivo} ${profileReason}. Se cae hoy porque ${structureChoiceReason(player, result.formacion, 'bench')}. Tu pulso actual no compensa romper esa estructura: ${comparisonReason(comparator, player, strategy)} a favor de ${comparator.name}.`,
      };
    }

    return {
      ...base,
      decision,
      motivo: `${base.motivo} ${profileReason}. Se cae hoy por detras de ${comparator.name} porque ${comparisonReason(comparator, player, strategy)}.${formationStructureReason(comparator, player, result.formacion)}`,
    };
  });
}

function buildPlayerDecisions(
  result: AnalysisResult,
  squad: SquadPlayer[],
  strategy: AnalysisStrategy = 'equilibrado'
): PlayerDecision[] {
  const names = [result.capitan, result.vicecapitan, ...(result.once || []), ...(result.banquillo || [])].filter(
    Boolean
  );

  const uniquePlayers = [...new Set(names)]
    .map((name) => findPlayer(squad, name))
    .filter(Boolean) as SquadPlayer[];

  const interesting = uniquePlayers
    .filter(
      (player) =>
        player.flag === 'boost' ||
        player.flag === 'risk' ||
        player.flag === 'avoid' ||
        player.flag === 'return' ||
        Boolean(managedReturnProfile(player)?.likelyManagedReturn) ||
        player.name === result.capitan ||
        player.name === result.vicecapitan ||
        (player.fixture?.difficulty ?? 3) <= 2
    )
    .slice(0, 4);

  const pool = interesting.length > 0 ? interesting : uniquePlayers.slice(0, 4);
  const confidence = result.resumen?.confianza_general || confidenceFromSquad(squad, result.once || [], strategy);

  return pool.map((player) => buildPlayerDecision(player, result, confidence, strategy));
}

function normalizeActions(rawActions: unknown): AnalysisAction[] | null {
  if (!Array.isArray(rawActions)) {
    return null;
  }

  const valid = rawActions
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const titulo = typeof row.titulo === 'string' ? row.titulo.trim() : '';
      const detalle = typeof row.detalle === 'string' ? row.detalle.trim() : '';
      const impacto = typeof row.impacto === 'string' ? row.impacto.trim() : '';
      const tipo = typeof row.tipo === 'string' ? row.tipo.trim() : 'decision';
      const confianza = clamp(Number(row.confianza) || 0, 0, 100);
      const prioridad =
        row.prioridad === 'alta' || row.prioridad === 'media' || row.prioridad === 'baja'
          ? row.prioridad
          : actionPriorityFromConfidence(confianza);

      if (!titulo || !detalle) {
        return null;
      }

      return { tipo, titulo, detalle, impacto, confianza, prioridad };
    })
    .filter(Boolean) as AnalysisAction[];

  return valid.length ? valid.slice(0, 4) : null;
}

function normalizeRadar(rawRadar: unknown): AnalysisRadar[] | null {
  if (!Array.isArray(rawRadar)) {
    return null;
  }

  const valid = rawRadar
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const label = typeof row.label === 'string' ? row.label.trim() : '';
      const note = typeof row.note === 'string' ? row.note.trim() : '';
      const score = clamp(Number(row.score) || 0, 0, 100);

      if (!label || !note) {
        return null;
      }

      return { label, score, note };
    })
    .filter(Boolean) as AnalysisRadar[];

  return valid.length ? valid.slice(0, 4) : null;
}

function normalizePlayerDecisions(rawDecisions: unknown): PlayerDecision[] | null {
  if (!Array.isArray(rawDecisions)) {
    return null;
  }

  const valid = rawDecisions
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const nombre = typeof row.nombre === 'string' ? row.nombre.trim() : '';
      const decision = typeof row.decision === 'string' ? row.decision.trim() : '';
      const motivo = typeof row.motivo === 'string' ? row.motivo.trim() : '';
      const confianza = clamp(Number(row.confianza) || 0, 0, 100);

      if (!nombre || !decision || !motivo) {
        return null;
      }

      return { nombre, decision, motivo, confianza };
    })
    .filter(Boolean) as PlayerDecision[];

  return valid.length ? valid.slice(0, 4) : null;
}

function normalizeTransfers(rawTransfers: unknown): TransferItem[] {
  if (!Array.isArray(rawTransfers)) {
    return [];
  }

  return rawTransfers
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const vender = typeof row.vender === 'string' ? row.vender.trim() : '';
      const comprar = typeof row.comprar === 'string' ? row.comprar.trim() : '';
      const posicion = typeof row.posicion === 'string' ? row.posicion.trim() : '';
      const precio_estimado = typeof row.precio_estimado === 'string' ? row.precio_estimado.trim() : '';
      const razon = typeof row.razon === 'string' ? row.razon.trim() : '';

      if (!vender || !comprar || !razon) {
        return null;
      }

      return { vender, comprar, posicion, precio_estimado, razon };
    })
    .filter(Boolean)
    .slice(0, 3) as TransferItem[];
}

function uniqueKnownNames(value: unknown, squad: SquadPlayer[], limit: number, exclude: string[] = []) {
  const known = new Set(squad.map((player) => player.name));
  const blocked = new Set(exclude);
  const result: string[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }

      const name = entry.trim();
      if (!name || !known.has(name) || blocked.has(name) || result.includes(name)) {
        continue;
      }

      result.push(name);

      if (result.length >= limit) {
        break;
      }
    }
  }

  return result;
}

// Biwenger-IA v3 - Deploy Trigger: 2026-04-30
function finalizeAnalysis(raw: unknown, squad: SquadPlayer[], context: AnalysisContext, allPlayers?: SquadPlayer[]): AnalysisResult {
  const strategy = resolveStrategy(context.strategy);
  const profile = getStrategyProfile(strategy);
  const fallback = buildFallbackLineup(squad, strategy, allPlayers);
  const fallbackOnce = fallback.oncePlayers.map((player) => player.name);
  const fallbackBench = fallback.benchPlayers.map((player) => player.name);
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const finalOnce = fallbackOnce.slice(0, 11);
  const finalBench = fallbackBench.slice(0, 4);

  const captainCandidate = fallback.captain;
  const viceCandidate = fallback.vicecaptain !== captainCandidate ? fallback.vicecaptain : finalOnce.find((name) => name !== captainCandidate) || '';

  const starters = finalOnce.map((name) => findPlayer(squad, name)).filter(Boolean) as SquadPlayer[];
  const confidence = clamp(
    Number((row.resumen as Record<string, unknown> | undefined)?.confianza_general) ||
    confidenceFromSquad(squad, finalOnce, strategy),
    0,
    100
  );

  const reasoning =
    typeof row.razonamiento === 'string' && row.razonamiento
      ? row.razonamiento
      : `El sistema ha construido un once con enfoque ${profile.label.toLowerCase()} y lectura individual por jugador. ${fallback.formationReason} Pesa la media, el estado, la racha y el rival real de cada pieza en ${context.jornada || context.autoRound || 'la proxima jornada'}.`;

  const alerts = Array.isArray(row.alertas)
    ? row.alertas.filter((item): item is string => typeof item === 'string').slice(0, 6)
    : [];

  const base: AnalysisResult = {
    formacion: typeof row.formacion === 'string' && row.formacion ? row.formacion : fallback.formacion,
    once: finalOnce,
    capitan: captainCandidate,
    vicecapitan: viceCandidate,
    banquillo: finalBench,
    fichajes: normalizeTransfers(row.fichajes),
    razonamiento: reasoning,
    alertas: alerts,
    puntuacion_estimada: Number(row.puntuacion_estimada) || estimateProjectedPoints(starters, strategy),
    resumen: {
      titular:
        typeof (row.resumen as Record<string, unknown> | undefined)?.titular === 'string' &&
          (row.resumen as Record<string, unknown>).titular
          ? String((row.resumen as Record<string, unknown>).titular)
          : 'Que hacer hoy',
      plan:
        typeof (row.resumen as Record<string, unknown> | undefined)?.plan === 'string' &&
          (row.resumen as Record<string, unknown>).plan
          ? String((row.resumen as Record<string, unknown>).plan)
          : `Asegura el bloque titular con un sesgo ${profile.label.toLowerCase()}, deja fuera el riesgo innecesario y usa el fixture real de cada jugador para no regalar puntos. ${fallback.formationReason}`,
      confianza_general: confidence,
    },
  };

  base.acciones_hoy = normalizeActions(row.acciones_hoy) || buildActions(base, squad, strategy);
  base.radar = normalizeRadar(row.radar) || buildRadar(base, squad, strategy);
  base.decisiones_jugadores =
    normalizePlayerDecisions(row.decisiones_jugadores) || buildPlayerDecisions(base, squad, strategy);
  base.argumentos_once =
    normalizePlayerDecisions(row.argumentos_once) || buildLineupArguments(base, squad, strategy);
  base.argumentos_banquillo =
    normalizePlayerDecisions(row.argumentos_banquillo) || buildBenchArguments(base, squad, strategy);

  return base;
}

export async function analyzeSquad(squad: SquadPlayer[], context: AnalysisContext, allPlayers?: SquadPlayer[]): Promise<AnalysisResult> {
  const strategy = resolveStrategy(context.strategy);
  const strategyProfile = getStrategyProfile(strategy);
  const fallback = buildFallbackLineup(squad, strategy, allPlayers);
  const onceNames = fallback.oncePlayers.map((player) => player.name);
  const starters = fallback.oncePlayers;
  const confidence = confidenceFromSquad(squad, onceNames, strategy);
  const jornadaLabel = context.jornada || context.autoRound || 'la proxima jornada';

  const toughPlayers = starters
    .filter((player) => (player.fixture?.difficulty ?? 3) >= 4)
    .map((player) => `${player.name} (${fixtureTag(player.fixture)})`);
  const riskAlerts = squad
    .filter((player) => player.status === 'injured' || player.status === 'suspended')
    .map((player) => `${player.name} queda fuera por baja confirmada.`);
  const boostPlayers = starters
    .filter((player) => player.flag === 'boost')
    .map((player) => player.name);
  const bounceBackPlayers = starters
    .filter((player) => bounceBackSwing(player) > 0)
    .map((player) => `${player.name} viene de un rosco y rebota con cruce favorable.`);
  const momentumPlayers = starters
    .filter((player) => momentumSwing(player) > 0)
    .map((player) => `${player.name} lleva una racha de fuego en las ultimas jornadas.`);

  const weakestStarter = [...starters].sort((a, b) => playerLineupScore(a, strategy, squad, allPlayers) - playerLineupScore(b, strategy, squad, allPlayers))[0];
  const bestBench = fallback.benchPlayers[0];

  const fichajes: { vender: string; comprar: string; posicion: string; precio_estimado: string; razon: string }[] = [];
  if (weakestStarter && bestBench) {
    const gap = playerLineupScore(bestBench, strategy, squad, allPlayers) - playerLineupScore(weakestStarter, strategy, squad, allPlayers);
    if (gap > -1) {
      fichajes.push({
        vender: weakestStarter.name,
        comprar: 'Jugador de mercado con mejor perfil',
        posicion: weakestStarter.pos,
        precio_estimado: `${Math.round(weakestStarter.price / 1e6)}M`,
        razon: `${weakestStarter.name} es el titular mas justo del once (score ${playerLineupScore(weakestStarter, strategy, squad, allPlayers).toFixed(1)}). Busca una mejora en ${weakestStarter.pos} con mejor cruce o forma.`,
      });
    }
  }
  if (fallback.benchPlayers.length >= 2) {
    const expendable = fallback.benchPlayers[fallback.benchPlayers.length - 1];
    fichajes.push({
      vender: expendable.name,
      comprar: 'Diferencial de mercado',
      posicion: expendable.pos,
      precio_estimado: `${Math.round(expendable.price / 1e6)}M`,
      razon: `${expendable.name} no entra en rotacion y su hueco puede reciclarse por un perfil con mas techo.`,
    });
  }

  const alerts = [
    ...riskAlerts,
    ...(toughPlayers.length > 0 ? [`Partidos exigentes: ${toughPlayers.slice(0, 3).join(', ')}.`] : []),
    ...(boostPlayers.length > 0 ? [`En racha: ${boostPlayers.join(', ')}.`] : []),
    ...bounceBackPlayers.slice(0, 2),
    ...momentumPlayers.slice(0, 2),
  ];

  const debugScores = squad
    .filter((p) => p.status !== 'injured' && p.status !== 'suspended')
    .map((p) => {
      const bd = playerScoreBreakdown(p, strategy, squad);
      const role = onceNames.includes(p.name) ? 'starter' as const
        : fallback.benchPlayers.some((b) => b.name === p.name) ? 'bench' as const
        : 'out' as const;
      return {
        name: p.name, pos: p.pos, total: Math.round(bd.total * 100) / 100,
        reliable: Math.round(bd.reliable * 100) / 100,
        recent: Math.round(bd.recent * 100) / 100,
        fixture: Math.round(bd.fixture * 100) / 100,
        flags: Math.round(bd.flags * 100) / 100,
        reliability: Math.round(bd.reliability * 100) / 100,
        availability: Math.round(bd.availability * 100) / 100,
        workload: Math.round(bd.workload * 100) / 100,
        live: Math.round(bd.live * 100) / 100,
        managed: Math.round(bd.managed * 100) / 100,
        bounceBack: Math.round(bd.bounceBack * 100) / 100,
        momentum: Math.round(bd.momentum * 100) / 100,
        motivation: Math.round(bd.motivation * 100) / 100,
        consistency: Math.round(bd.consistency * 100) / 100,
        zeroRate: Math.round(bd.zeroRate * 100) / 100,
        ceiling: Math.round(bd.ceiling * 100) / 100,
        priceExp: Math.round(bd.priceExp * 100) / 100,
        schedule: Math.round(bd.schedule * 100) / 100,
        trendSlope: Math.round(bd.trendSlope * 100) / 100,
        recencyW: Math.round(bd.recencyW * 100) / 100,
        scarcity: Math.round(bd.scarcity * 100) / 100,
        stack: Math.round(bd.stack * 100) / 100,
        posRelative: Math.round(bd.posRelative * 100) / 100,
        clutch: Math.round(bd.clutch * 100) / 100,
        fatigue: Math.round(bd.fatigue * 100) / 100,
        marginal: Math.round(bd.marginal * 100) / 100,
        timing: Math.round(bd.timing * 100) / 100,
        diversification: Math.round(bd.diversification * 100) / 100,
        cleanSheet: Math.round(bd.cleanSheet * 100) / 100,
        seasonPhase: Math.round(bd.seasonPhase * 100) / 100,
        meanReversion: Math.round(bd.meanReversion * 100) / 100,
        derby: Math.round(bd.derby * 100) / 100,
        depthOpportunity: Math.round(bd.depthOpportunity * 100) / 100,
        peakRatio: Math.round(bd.peakRatio * 100) / 100,
        starterAvg: Math.round(bd.starterAvg * 100) / 100,
        status: p.status, lastFive: p.lastFive, role,
      };
    })
    .sort((a, b) => b.total - a.total);

  const result = finalizeAnalysis(
    {
      formacion: fallback.formacion,
      once: onceNames,
      capitan: fallback.captain,
      vicecapitan: fallback.vicecaptain,
      banquillo: fallback.benchPlayers.map((player) => player.name),
      fichajes,
      razonamiento: `El motor ha construido un once con enfoque ${strategyProfile.label.toLowerCase()}: ${strategyProfile.summary}. ${fallback.formationReason} ${fallback.captain} queda como capitan porque combina mejor techo, forma y cruce individual en ${jornadaLabel}. Se han evaluado 32 dimensiones por jugador (incluyendo DFS pro-metrics como regresion a la media, clean sheets, y factor derbi).`,
      alertas: alerts,
      puntuacion_estimada: estimateProjectedPoints(starters, strategy, fallback.oncePlayers.find(p => p.name === fallback.captain), squad, allPlayers),
      resumen: {
        titular: 'Que hacer hoy',
        plan: `Asegura el bloque titular con modo ${strategyProfile.label.toLowerCase()}, usa a ${fallback.captain} como ventaja principal y deja que cada fixture pese jugador a jugador. ${fallback.formationReason}`,
        confianza_general: confidence,
      },
    },
    squad,
    context,
    allPlayers
  );

  result.debugScores = debugScores;
  return result;
}

export async function analyzeGlobalPlayers(allPlayers: SquadPlayer[], context: AnalysisContext): Promise<AnalysisResult> {
  const strategy = resolveStrategy(context.strategy);
  
  // 1. Initial base score - pasamos allPlayers para que el Depth Chart detecte oportunidades por lesiones
  const baseRanked = [...allPlayers]
    .filter((p) => p.status !== 'injured' && p.status !== 'suspended')
    .sort((a, b) => playerLineupScore(b, strategy, undefined, allPlayers) - playerLineupScore(a, strategy, undefined, allPlayers));

  // 2. Select top por posiciones para formar un "mock squad" élite
  const pt = baseRanked.filter((p) => p.pos === 'PT').slice(0, 5);
  const df = baseRanked.filter((p) => p.pos === 'DF').slice(0, 15);
  const mc = baseRanked.filter((p) => p.pos === 'MC').slice(0, 15);
  const dl = baseRanked.filter((p) => p.pos === 'DL').slice(0, 15);
  const topSet = new Set([...pt, ...df, ...mc, ...dl].map((p) => p.name));

  // 2b. Radar de Gangas: buscar jugadores con alta oportunidad por lesiones que el top-15 habría ignorado
  const depthGems = baseRanked
    .filter((p) => !topSet.has(p.name) && depthOpportunitySwing(p, allPlayers) >= 1.5)
    .slice(0, 10);

  const mockSquad = [...pt, ...df, ...mc, ...dl, ...depthGems];

  // 3. Now we use the normal analysis pipeline on this mock squad
  const result = await analyzeSquad(mockSquad, context);
  
  // 4. Recalcular debugScores pasando allPlayers para que el Depth Chart vea a los lesionados (ej. Mbappé)
  if (result.debugScores) {
    const onceSet = new Set(result.once);
    const benchSet = new Set(result.banquillo);
    result.debugScores = mockSquad
      .filter((p) => p.status !== 'injured' && p.status !== 'suspended')
      .map((p) => {
        const bd = playerScoreBreakdown(p, strategy, mockSquad, allPlayers);
        const role = onceSet.has(p.name) ? 'starter' as const
          : benchSet.has(p.name) ? 'bench' as const
          : 'out' as const;
        return {
          name: p.name, pos: p.pos, total: Math.round(bd.total * 100) / 100,
          reliable: Math.round(bd.reliable * 100) / 100,
          recent: Math.round(bd.recent * 100) / 100,
          fixture: Math.round(bd.fixture * 100) / 100,
          flags: Math.round(bd.flags * 100) / 100,
          reliability: Math.round(bd.reliability * 100) / 100,
          availability: Math.round(bd.availability * 100) / 100,
          workload: Math.round(bd.workload * 100) / 100,
          live: Math.round(bd.live * 100) / 100,
          managed: Math.round(bd.managed * 100) / 100,
          bounceBack: Math.round(bd.bounceBack * 100) / 100,
          momentum: Math.round(bd.momentum * 100) / 100,
          motivation: Math.round(bd.motivation * 100) / 100,
          consistency: Math.round(bd.consistency * 100) / 100,
          zeroRate: Math.round(bd.zeroRate * 100) / 100,
          ceiling: Math.round(bd.ceiling * 100) / 100,
          priceExp: Math.round(bd.priceExp * 100) / 100,
          schedule: Math.round(bd.schedule * 100) / 100,
          trendSlope: Math.round(bd.trendSlope * 100) / 100,
          recencyW: Math.round(bd.recencyW * 100) / 100,
          scarcity: Math.round(bd.scarcity * 100) / 100,
          stack: Math.round(bd.stack * 100) / 100,
          posRelative: Math.round(bd.posRelative * 100) / 100,
          clutch: Math.round(bd.clutch * 100) / 100,
          fatigue: Math.round(bd.fatigue * 100) / 100,
          marginal: Math.round(bd.marginal * 100) / 100,
          timing: Math.round(bd.timing * 100) / 100,
          diversification: Math.round(bd.diversification * 100) / 100,
          cleanSheet: Math.round(bd.cleanSheet * 100) / 100,
          seasonPhase: Math.round(bd.seasonPhase * 100) / 100,
          meanReversion: Math.round(bd.meanReversion * 100) / 100,
          derby: Math.round(bd.derby * 100) / 100,
          depthOpportunity: Math.round(bd.depthOpportunity * 100) / 100,
          peakRatio: Math.round(bd.peakRatio * 100) / 100,
          starterAvg: Math.round(bd.starterAvg * 100) / 100,
          status: p.status, lastFive: p.lastFive, role,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  // 5. Modificar ligeramente el razonamiento para que tenga sentido en este contexto global
  if (result.resumen) {
    result.resumen.razonamiento = `Se han analizado ${allPlayers.length} jugadores de LaLiga preseleccionando a los 50 mejores. ${result.resumen.razonamiento || ''}`;
    
    // Calcular el precio total del once ideal
    const oncePrice = result.once.reduce((total, playerName) => {
      const player = allPlayers.find(p => p.name === playerName);
      return total + (player?.price || 0);
    }, 0);
    result.resumen.precio_equipo = oncePrice;
  }
  
  return result;
}

export async function generateNewsArticle(topic: string): Promise<Record<string, unknown>> {
  if (DEMO_MODE) {
    return {
      title: `[DEMO] ${topic}`,
      slug: topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
      excerpt: `Articulo demo sobre "${topic}". Conecta tu API key de Anthropic para contenido real generado con IA.`,
      body: `<h2>${topic}</h2>
<p><strong>Modo demo activo.</strong> Este articulo es un placeholder. Cuando configures tu API key de Anthropic, la IA generara articulos completos y utiles.</p>
<h2>Que veras en la version completa</h2>
<ul>
<li>Analisis detallado de jugadores y fichajes recomendados</li>
<li>Estadisticas actualizadas de la jornada</li>
<li>Consejos de capitan y plan de alineacion</li>
<li>Alertas de lesiones y rotaciones</li>
</ul>
<p>La IA utiliza Claude Sonnet para generar contenido unico y orientado a managers fantasy.</p>`,
      tags: ['biwenger', 'fantasy laliga', 'demo'],
      readTime: 2,
    };
  }

  const prompt = `Escribe un articulo de calidad sobre fantasy LaLiga / Biwenger sobre el tema: "${topic}"

El articulo debe:
- Tener titulo SEO atractivo (max 60 caracteres)
- Ser util para managers de Biwenger y Comunio
- Incluir consejos concretos y accionables
- Minimo 350 palabras
- Usar lenguaje natural, no robotico

Responde SOLO con JSON:
{
  "title": "Titulo SEO",
  "slug": "titulo-para-url",
  "excerpt": "Meta description de 150 chars max para SEO",
  "body": "<p>Contenido HTML completo con etiquetas p, h2, ul, li...</p>",
  "tags": ["biwenger","fantasy laliga","tag3"],
  "readTime": 3
}`;

  const text = await askClaude(prompt);
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}