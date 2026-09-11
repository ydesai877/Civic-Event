import { sql, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { events, sources as sourcesTable, ingestRuns } from "@/db/schema";
import type { NormalizedEvent } from "./normalize";
import type { RegisteredSource } from "./sources";

export interface UpsertStats {
  inserted: number;
  updated: number;
  unchanged: number;
}

export async function syncSourceRows(list: RegisteredSource[]) {
  for (const s of list) {
    await db
      .insert(sourcesTable)
      .values({
        id: s.id,
        name: s.name,
        jurisdiction: s.jurisdiction,
        kind: s.kind,
        adapter: s.adapter,
        homepageUrl: s.homepageUrl,
        logo: s.logo ?? null,
        config: s.config,
        enabled: s.enabled,
      })
      .onConflictDoUpdate({
        target: sourcesTable.id,
        set: {
          name: s.name,
          jurisdiction: s.jurisdiction,
          kind: s.kind,
          adapter: s.adapter,
          homepageUrl: s.homepageUrl,
          logo: s.logo ?? null,
          config: s.config,
          enabled: s.enabled,
        },
      });
  }
}

/**
 * Idempotent write.
 *
 * contentHash decides insert / update / unchanged, so a run that finds no
 * changes touches only lastSeenAt. That keeps the run log honest: a spike in
 * `updated` means the publisher changed something, not that we re-ran.
 */
export async function upsertEvents(batch: NormalizedEvent[]): Promise<UpsertStats> {
  if (batch.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };

  const keys = batch.map((e) => e.dedupeKey);
  const existing = await db
    .select({ dedupeKey: events.dedupeKey, contentHash: events.contentHash })
    .from(events)
    .where(inArray(events.dedupeKey, keys));

  const existingHash = new Map(existing.map((r) => [r.dedupeKey, r.contentHash]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const e of batch) {
    const prior = existingHash.get(e.dedupeKey);

    if (prior === e.contentHash) {
      unchanged++;
      await db
        .update(events)
        .set({ lastSeenAt: new Date(), sourceIds: e.sourceIds })
        .where(eq(events.dedupeKey, e.dedupeKey));
      continue;
    }

    prior === undefined ? inserted++ : updated++;

    await db
      .insert(events)
      .values({
        dedupeKey: e.dedupeKey,
        slug: e.slug,
        title: e.title,
        description: e.description,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        allDay: e.allDay,
        locationText: e.locationText,
        isOnline: e.isOnline,
        eventType: e.eventType,
        audience: e.audience,
        typeSource: e.typeSource,
        audienceSource: e.audienceSource,
        cancelled: e.cancelled,
        canonicalUrl: e.canonicalUrl,
        primarySourceId: e.primarySourceId,
        sourceIds: e.sourceIds,
        contentHash: e.contentHash,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: events.dedupeKey,
        set: {
          title: e.title,
          description: e.description,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          allDay: e.allDay,
          locationText: e.locationText,
          isOnline: e.isOnline,
          eventType: e.eventType,
          audience: e.audience,
          typeSource: e.typeSource,
          audienceSource: e.audienceSource,
          cancelled: e.cancelled,
          canonicalUrl: e.canonicalUrl,
          primarySourceId: e.primarySourceId,
          sourceIds: e.sourceIds,
          contentHash: e.contentHash,
          lastSeenAt: new Date(),
        },
      });
  }

  return { inserted, updated, unchanged };
}

export async function startRun(sourceId: string): Promise<number> {
  const [row] = await db
    .insert(ingestRuns)
    .values({ sourceId, status: "running" })
    .returning({ id: ingestRuns.id });
  return row.id;
}

export async function finishRun(
  runId: number,
  status: "ok" | "failed",
  stats: UpsertStats & { fetched: number },
  error?: string,
) {
  await db
    .update(ingestRuns)
    .set({
      status,
      finishedAt: new Date(),
      fetched: stats.fetched,
      inserted: stats.inserted,
      updated: stats.updated,
      unchanged: stats.unchanged,
      error: error?.slice(0, 2000),
    })
    .where(eq(ingestRuns.id, runId));
}

/**
 * An event that stops appearing in its source feed has been pulled. Mark it
 * cancelled rather than deleting it: a link that 404s is worse than a page
 * that says the event is gone.
 */
export async function markDisappeared(sourceId: string, runStartedAt: Date) {
  const result = await db
    .update(events)
    .set({ cancelled: true })
    .where(
      sql`${events.primarySourceId} = ${sourceId}
          AND ${events.lastSeenAt} < ${runStartedAt}
          AND ${events.startsAt} > now()
          AND ${events.cancelled} = false`,
    );
  return result.rowCount ?? 0;
}
