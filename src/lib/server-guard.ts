import type { NextRequest } from "next/server";

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function takeRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = rateBuckets.get(key);

  if (!entry || now > entry.resetAt) {
    const nextEntry = { count: 1, resetAt: now + windowMs };
    rateBuckets.set(key, nextEntry);
    return { ok: true, remaining: Math.max(max - 1, 0), resetAt: nextEntry.resetAt };
  }

  if (entry.count >= max) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { ok: true, remaining: Math.max(max - entry.count, 0), resetAt: entry.resetAt };
}

export function normalizePlayerNames(players: unknown, maxPlayers = 25): string[] | null {
  if (!Array.isArray(players) || players.length === 0 || players.length > maxPlayers) {
    return null;
  }

  const names = players
    .map((player) => {
      if (typeof player === "string") {
        return player.trim();
      }

      if (
        player &&
        typeof player === "object" &&
        "name" in player &&
        typeof player.name === "string"
      ) {
        return player.name.trim();
      }

      return "";
    })
    .filter((name) => name.length >= 2 && name.length <= 60);

  if (names.length !== players.length) {
    return null;
  }

  return [...new Set(names)];
}

export function normalizeTopic(topic: string | null): string | null {
  if (topic === null) {
    return null;
  }

  const normalized = topic.trim().replace(/\s+/g, " ");
  if (normalized.length < 8 || normalized.length > 120) {
    return null;
  }

  return normalized;
}
