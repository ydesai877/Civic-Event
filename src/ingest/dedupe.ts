import type { NormalizedEvent } from "./normalize";
import { slugify } from "./normalize";

/**
 * Two passes.
 *
 * 1. Exact: same dedupeKey. This catches the common case, where the city
 *    calendar and the library calendar publish the same CivicEngage event id
 *    for the same date.
 *
 * 2. Fuzzy: same start instant, same normalized title, different upstream id.
 *    This catches the same event published by two platforms — a library
 *    program that appears in both CivicEngage and LibCal. Title matching is
 *    deliberately strict; a false merge hides a real event, which is worse
 *    than showing a duplicate.
 */

export interface DedupeResult {
  merged: NormalizedEvent[];
  exactMerges: number;
  fuzzyMerges: number;
}

function fuzzyKey(e: NormalizedEvent): string {
  return `${e.startsAt.toISOString()}|${slugify(e.title)}`;
}

/** Sources with a higher priority win the canonical fields. */
export function dedupe(
  events: NormalizedEvent[],
  priorityBySource: Record<string, number>,
): DedupeResult {
  const byExact = new Map<string, NormalizedEvent>();
  let exactMerges = 0;

  for (const event of events) {
    const existing = byExact.get(event.dedupeKey);
    if (!existing) {
      byExact.set(event.dedupeKey, { ...event, sourceIds: [...event.sourceIds] });
      continue;
    }
    exactMerges++;
    byExact.set(event.dedupeKey, merge(existing, event, priorityBySource));
  }

  const byFuzzy = new Map<string, NormalizedEvent>();
  let fuzzyMerges = 0;

  for (const event of byExact.values()) {
    const key = fuzzyKey(event);
    const existing = byFuzzy.get(key);
    if (!existing) {
      byFuzzy.set(key, event);
      continue;
    }
    fuzzyMerges++;
    byFuzzy.set(key, merge(existing, event, priorityBySource));
  }

  return { merged: [...byFuzzy.values()], exactMerges, fuzzyMerges };
}

function merge(
  a: NormalizedEvent,
  b: NormalizedEvent,
  priority: Record<string, number>,
): NormalizedEvent {
  const aRank = priority[a.primarySourceId] ?? 0;
  const bRank = priority[b.primarySourceId] ?? 0;
  const winner = bRank > aRank ? b : a;
  const loser = winner === a ? b : a;

  // A type the publisher stated beats one we guessed, whichever source
  // ranks higher. The whole point of recording typeSource is to prefer it.
  const betterType = loser.typeSource === "publisher" && winner.typeSource === "inferred" ? loser : winner;
  const betterAudience =
    loser.audienceSource === "publisher" && winner.audienceSource === "inferred" ? loser : winner;

  return {
    ...winner,
    // Keep whichever description and location actually has content.
    description: winner.description ?? loser.description,
    locationText: winner.locationText ?? loser.locationText,
    eventType: betterType.eventType,
    typeSource: betterType.typeSource,
    audience: betterAudience.audience,
    audienceSource: betterAudience.audienceSource,
    // A cancellation reported by any source is a cancellation.
    cancelled: winner.cancelled || loser.cancelled,
    sourceIds: [...new Set([...winner.sourceIds, ...loser.sourceIds])].sort(),
  };
}
