import { NextResponse } from 'next/server';
import { GET as getPlayers } from '../players/route';
import { analyzeGlobalPlayers } from '@/lib/claude';
import type { Player } from '@/lib/biwenger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener la lista completa de jugadores (reutilizando la lógica de /api/players)
    const playersRes = await getPlayers();
    
    if (!playersRes.ok) {
      return NextResponse.json({ error: 'Error obteniendo jugadores de Biwenger' }, { status: 500 });
    }
    
    const data = await playersRes.json();
    const playersList = data.players as Player[];
    
    // 2. Ejecutar el análisis global usando las 32 dimensiones
    const result = await analyzeGlobalPlayers(playersList, { strategy: 'equilibrado' });
    
    return NextResponse.json({ result, meta: data.meta });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error calculando el mejor 11';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
