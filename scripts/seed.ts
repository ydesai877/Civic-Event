/**
 * Seed the database by running the real pipeline over the HTML fixtures.
 *
 * This is the same code path as `npm run ingest`, with the HTTP fetch swapped
 * for a file read. Parser, normalizer, deduper and upsert are all exercised;
 * only the network is stubbed.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMonthGrid } from "../src/ingest/adapters/civicengage";
import { CITY_CATEGORY_BY_ID, LIBRARY_CITY_CATEGORY } from "../fixtures/captured";
import { normalizeEvent, type NormalizedEvent } from "../src/ingest/normalize";
import { dedupe } from "../src/ingest/dedupe";
import { SOURCES } from "../src/ingest/sources";
import { syncSourceRows, upsertEvents } from "../src/ingest/upsert";
import { pool } from "../src/db";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");

const PLAN = [
  { sourceId: "sunnyvale-city", file: "city-2026-09.html", origin: "https://www.sunnyvale.ca.gov" },
  {
    sourceId: "sunnyvale-library",
    file: "library-2026-09.html",
    origin: "https://www.library.sunnyvale.ca.gov",
  },
];

async function main() {
  const selected = SOURCES.filter((s) => PLAN.some((p) => p.sourceId === s.id));
  await syncSourceRows(selected);

  const normalized: NormalizedEvent[] = [];

  for (const step of PLAN) {
    const source = SOURCES.find((s) => s.id === step.sourceId)!;
    const html = readFileSync(join(fixtures, step.file), "utf8");
    const raw = parseMonthGrid(html, step.origin);

    // Stand in for the adapter's per-category crawl, which cannot run here.
    if (step.sourceId === "sunnyvale-city") {
      for (const r of raw) {
        const category = CITY_CATEGORY_BY_ID[r.externalId] ?? LIBRARY_CITY_CATEGORY;
        r.publisherTypes = [category];
      }
    }

    const labelled = raw.filter((r) => r.publisherTypes?.length).length;
    console.log(`${source.id}: parsed ${raw.length} raw events (${labelled} with a publisher category)`);

    for (const r of raw) {
      const n = normalizeEvent(r, { source, dedupeNamespace: source.dedupeNamespace });
      if (n) normalized.push(n);
    }
  }

  const priority = Object.fromEntries(selected.map((s) => [s.id, s.priority]));
  const { merged, exactMerges, fuzzyMerges } = dedupe(normalized, priority);

  console.log(
    `normalized ${normalized.length} -> ${merged.length} unique (${exactMerges} exact merges, ${fuzzyMerges} fuzzy)`,
  );

  const stats = await upsertEvents(merged);
  console.log(`upsert: ${JSON.stringify(stats)}`);

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
