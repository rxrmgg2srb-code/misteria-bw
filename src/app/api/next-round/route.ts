import { NextResponse } from 'next/server';
import {
  getCurrentRound,
  getFixtureIdsByRound,
  getInjuriesForFixtures,
  getOddsDifficulty,
} from '@/lib/api-football';

export const dynamic = 'force-dynamic';

/**
 * GET /api/next-round
 * Returns:
 * - currentRound: last completed round
 * - nextRound: upcoming round
 * - roundNumber: numeric round number
 * - injuries: map of playerName → injury data
 * - fixtures: list of next round matches with odds-based difficulty
 */
export async function GET() {
  const KEY = process.env.APIFOOTBALL_KEY;
  if (!KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const { lastCompleted, nextRound, roundNumber } = await getCurrentRound();

    // Get fixture IDs for next round
    const fixtureIds = await getFixtureIdsByRound(nextRound);

    // Parallel: injuries + odds
    const [injuryMap, oddsMap] = await Promise.all([
      getInjuriesForFixtures(fixtureIds),
      getOddsDifficulty(fixtureIds),
    ]);

    // Build fixture list with difficulty
    const fixtures = fixtureIds.map((id) => {
      const odds = oddsMap.get(id);
      return {
        id,
        homeTeam: odds?.homeTeam || '',
        awayTeam: odds?.awayTeam || '',
        homeDifficulty: odds?.homeDifficulty ?? 3,
        awayDifficulty: odds?.awayDifficulty ?? 3,
      };
    }).filter(f => f.homeTeam);

    // Serialize injury map
    const injuries = Object.fromEntries(
      Array.from(injuryMap.entries()).map(([name, inj]) => [name, inj])
    );

    return NextResponse.json({
      currentRound: lastCompleted,
      nextRound,
      roundNumber,
      fixtures,
      injuries,
      injuryCount: injuryMap.size,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error loading round data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
