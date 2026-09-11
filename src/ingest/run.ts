import { collectEvents } from "./collect";
import { enabledSources } from "./sources";
import { finishRun, markDisappeared, startRun, syncSourceRows, upsertEvents } from "./upsert";

/**
 * Ingestion into Postgres.
 *
 * The site does not use this — it is built from `data/events.json`, which
 * `npm run scrape` writes with no database at all. This path exists for when
 * the dataset outgrows a single JSON file and needs real queries and history.
 * Both paths share `collectEvents`, so they can never disagree about how an
 * event is read or classified.
 */

export interface RunOptions {
  monthsAhead?: number;
  sourceIds?: string[];
  dryRun?: boolean;
}

export interface RunReport {
  perSource: Array<{ sourceId: string; fetched: number; error?: string }>;
  exactMerges: number;
  fuzzyMerges: number;
  inserted: number;
  updated: number;
  unchanged: number;
  retired: number;
}

export async function runIngestion(opts: RunOptions = {}): Promise<RunReport> {
  const all = enabledSources();
  const selected = opts.sourceIds?.length
    ? all.filter((s) => opts.sourceIds!.includes(s.id))
    : all;

  if (selected.length === 0) throw new Error("No enabled sources matched");

  await syncSourceRows(selected);

  const runStartedAt = new Date();
  const collected = await collectEvents({
    monthsAhead: opts.monthsAhead ?? 2,
    sourceIds: opts.sourceIds,
  });

  const report: RunReport = {
    perSource: collected.perSource,
    exactMerges: collected.exactMerges,
    fuzzyMerges: collected.fuzzyMerges,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    retired: 0,
  };

  if (opts.dryRun) {
    console.log(`[dry run] ${collected.events.length} events would be written`);
    return report;
  }

  const runIds = new Map<string, number>();
  for (const s of collected.sources) {
    const failed = collected.perSource.find((p) => p.sourceId === s.id)?.error;
    if (!failed) runIds.set(s.id, await startRun(s.id));
  }

  const stats = await upsertEvents(collected.events);
  Object.assign(report, stats);

  for (const source of collected.sources) {
    const runId = runIds.get(source.id);
    if (runId === undefined) continue;

    const fetched = collected.perSource.find((p) => p.sourceId === source.id)?.fetched ?? 0;
    // Per-source insert counts are not separable after a cross-source dedupe,
    // so the run row keeps the batch totals beside its own fetch count.
    await finishRun(runId, "ok", { ...stats, fetched });
    report.retired += await markDisappeared(source.id, runStartedAt);
  }

  return report;
}

function parseArgs(argv: string[]): RunOptions & { help: boolean } {
  const opts: RunOptions & { help: boolean } = { help: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--months=")) opts.monthsAhead = Number(arg.split("=")[1]);
    else if (arg.startsWith("--source=")) opts.sourceIds = arg.split("=")[1].split(",");
  }
  return opts;
}

const isDirectRun =
  typeof process !== "undefined" && process.argv[1]?.replace(/\\/g, "/").endsWith("ingest/run.ts");

if (isDirectRun) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: npm run ingest -- [--months=2] [--source=a,b] [--dry-run]`);
    process.exit(0);
  }
  runIngestion(opts)
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
