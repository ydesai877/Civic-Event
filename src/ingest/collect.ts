import { Fetcher } from "./fetcher";
import { ADAPTERS, enabledSources, type RegisteredSource } from "./sources";
import { normalizeEvent, type NormalizedEvent } from "./normalize";
import { dedupe } from "./dedupe";

/**
 * Everything up to, but not including, writing anywhere.
 *
 * This is the half of ingestion that has no opinion about storage. It fetches,
 * normalizes and dedupes, and hands back a plain array. The database path in
 * `run.ts` and the JSON path in `scripts/export-json.ts` both start here, so
 * the two can never drift apart in how they read or classify an event.
 */

export interface CollectOptions {
  monthsAhead?: number;
  sourceIds?: string[];
}

export interface CollectResult {
  events: NormalizedEvent[];
  sources: RegisteredSource[];
  perSource: Array<{ sourceId: string; fetched: number; error?: string }>;
  exactMerges: number;
  fuzzyMerges: number;
}

export async function collectEvents(opts: CollectOptions = {}): Promise<CollectResult> {
  const monthsAhead = opts.monthsAhead ?? 2;
  const all = enabledSources();
  const selected = opts.sourceIds?.length
    ? all.filter((s) => opts.sourceIds!.includes(s.id))
    : all;

  if (selected.length === 0) throw new Error("No enabled sources matched");

  const fetcher = new Fetcher("http");
  const perSource: CollectResult["perSource"] = [];
  const normalized: NormalizedEvent[] = [];

  try {
    for (const source of selected) {
      const adapter = ADAPTERS[source.adapter];
      if (!adapter) {
        perSource.push({ sourceId: source.id, fetched: 0, error: "unknown adapter" });
        continue;
      }

      try {
        const raw = await adapter.fetchEvents(source, {
          monthsAhead,
          fetchHtml: (url) => fetcher.html(url),
        });

        for (const r of raw) {
          const n = normalizeEvent(r, {
            source,
            dedupeNamespace: source.dedupeNamespace,
          });
          if (n) normalized.push(n);
        }

        perSource.push({ sourceId: source.id, fetched: raw.length });
      } catch (err) {
        // One broken source must not take the whole run down. The others
        // still produce events, and the error is reported per source.
        const message = err instanceof Error ? err.message : String(err);
        perSource.push({ sourceId: source.id, fetched: 0, error: message });
      }
    }
  } finally {
    await fetcher.close();
  }

  const priority = Object.fromEntries(selected.map((s) => [s.id, s.priority]));
  const { merged, exactMerges, fuzzyMerges } = dedupe(normalized, priority);

  return { events: merged, sources: selected, perSource, exactMerges, fuzzyMerges };
}
