import { NextResponse } from 'next/server';
import { fetchAllPlayerStats } from '@/lib/api-football';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sync-stats
 * Fetches all player stats for the current La Liga season from API-Football (Pro plan)
 * and caches them as a JSON file in /public/cache/player-stats.json
 * 
 * This endpoint uses ~54 API requests. Call it manually (or from a cron) once per day.
 */
export async function GET() {
  const KEY = process.env.APIFOOTBALL_KEY;
  if (!KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    console.log('[sync-stats] Fetching player stats from API-Football Pro...');
    const statsMap = await fetchAllPlayerStats();
    
    const statsObj = Object.fromEntries(
      Array.from(statsMap.entries()).map(([name, stats]) => [name, stats])
    );

    // Persist to public/cache so it can be served as a static file
    const cacheDir = join(process.cwd(), 'public', 'cache');
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      join(cacheDir, 'player-stats.json'),
      JSON.stringify({ updatedAt: new Date().toISOString(), players: statsObj }, null, 2)
    );

    return NextResponse.json({
      ok: true,
      count: statsMap.size,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error syncing stats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
