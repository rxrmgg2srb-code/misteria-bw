import { NextResponse } from 'next/server';
import { buildRealStarterMap } from '@/lib/api-football';

export async function GET() {
  const KEY = process.env.APIFOOTBALL_KEY || '';
  if (!KEY) {
    return NextResponse.json({
      error: 'APIFOOTBALL_KEY no configurada. Añádela en .env.local y en Vercel → Settings → Environment Variables',
    }, { status: 503 });
  }

  try {
    const starterMap = await buildRealStarterMap();

    // Convert Map to plain object for JSON
    const result: Record<string, Record<string, number>> = {};
    for (const [team, players] of starterMap) {
      result[team] = Object.fromEntries(players);
    }

    return NextResponse.json({
      source: 'API-Football (real lineups)',
      laligaId: process.env.APIFOOTBALL_LALIGA_ID || '87',
      teamsFound: Object.keys(result).length,
      teams: result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

