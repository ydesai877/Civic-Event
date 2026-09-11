/**
 * Write `data/events.json` — the file the website is built from.
 *
 *   npm run scrape          scrape the live calendars
 *   npm run scrape:fixtures build the file from the offline fixtures
 *
 * Both go through the same collect → normalize → dedupe path, so the offline
 * file and the live one are the same shape and pass the same checks.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { collectEvents } from "../src/ingest/collect";
import { parseMonthGrid } from "../src/ingest/adapters/civicengage";
import { normalizeEvent, type NormalizedEvent } from "../src/ingest/normalize";
import { dedupe } from "../src/ingest/dedupe";
import { SOURCES, type RegisteredSource } from "../src/ingest/sources";
import { CITY_CATEGORY_BY_ID, LIBRARY_CITY_CATEGORY } from "../fixtures/captured";
import type { EventsFile, PublicEvent, PublicSource } from "../src/lib/events";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outPath = join(root, "data", "events.json");

function toPublic(e: NormalizedEvent): PublicEvent {
  return {
    slug: e.slug,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt ? e.endsAt.toISOString() : null,
    allDay: e.allDay,
    eventType: e.eventType,
    audience: e.audience,
    typeSource: e.typeSource,
    audienceSource: e.audienceSource,
    locationText: e.locationText,
    isOnline: e.isOnline,
    cancelled: e.cancelled,
    canonicalUrl: e.canonicalUrl,
    primarySourceId: e.primarySourceId,
    sourceIds: e.sourceIds,
  };
}

function toPublicSource(s: RegisteredSource): PublicSource {
  return {
    id: s.id,
    name: s.name,
    jurisdiction: s.jurisdiction,
    kind: s.kind,
    homepageUrl: s.homepageUrl,
    logo: s.logo ?? null,
  };
}

/** Rebuild the file from the checked-in HTML fixtures. No network. */
function fromFixtures() {
  const plan = [
    { sourceId: "sunnyvale-city", file: "city-2026-09.html", origin: "https://www.sunnyvale.ca.gov" },
    {
      sourceId: "sunnyvale-library",
      file: "library-2026-09.html",
      origin: "https://www.library.sunnyvale.ca.gov",
    },
  ];

  const selected = SOURCES.filter((s) => plan.some((p) => p.sourceId === s.id));
  const normalized: NormalizedEvent[] = [];
  const perSource: EventsFile["runs"] = [];

  for (const step of plan) {
    const source = SOURCES.find((s) => s.id === step.sourceId)!;
    const html = readFileSync(join(root, "fixtures", step.file), "utf8");
    const raw = parseMonthGrid(html, step.origin);

    // Stand in for the adapter's per-category crawl, which needs the network.
    if (step.sourceId === "sunnyvale-city") {
      for (const r of raw) {
        r.publisherTypes = [CITY_CATEGORY_BY_ID[r.externalId] ?? LIBRARY_CITY_CATEGORY];
      }
    }

    for (const r of raw) {
      const n = normalizeEvent(r, { source, dedupeNamespace: source.dedupeNamespace });
      if (n) normalized.push(n);
    }
    perSource.push({ sourceId: source.id, fetched: raw.length });
  }

  const priority = Object.fromEntries(selected.map((s) => [s.id, s.priority]));
  const { merged, exactMerges } = dedupe(normalized, priority);

  return { events: merged, sources: selected, perSource, exactMerges };
}

async function main() {
  const useFixtures = process.argv.includes("--fixtures");
  const monthsArg = process.argv.find((a) => a.startsWith("--months="));
  const monthsAhead = monthsArg ? Number(monthsArg.split("=")[1]) : 2;

  const result = useFixtures
    ? fromFixtures()
    : await collectEvents({ monthsAhead });

  // Drop events that already finished. The file is a "what's coming up"
  // feed, and past events are what makes it grow without bound.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const upcoming = result.events
    .filter((e) => (e.endsAt ?? e.startsAt).getTime() >= cutoff)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const file: EventsFile = {
    generatedAt: new Date().toISOString(),
    runs: result.perSource,
    sources: result.sources.map(toPublicSource),
    events: upcoming.map(toPublic),
  };

  // A scrape that returns nothing is almost always a broken selector or a bot
  // block, not a genuinely empty calendar. Overwriting a good file with an
  // empty one would take the site down, so refuse.
  if (file.events.length === 0) {
    console.error("Refusing to write: the run produced 0 events.");
    console.error(JSON.stringify(result.perSource, null, 2));
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(file, null, 2) + "\n");

  const published = file.events.filter((e) => e.typeSource === "publisher").length;
  console.log(
    [
      `Wrote data/events.json`,
      `  ${file.events.length} upcoming events from ${file.sources.length} sources`,
      `  ${result.exactMerges} duplicates merged`,
      `  ${published} carry a publisher-supplied type, ${file.events.length - published} inferred`,
      `  ${(JSON.stringify(file).length / 1024).toFixed(0)} KB on disk`,
    ].join("\n"),
  );

  for (const r of result.perSource) {
    if (r.error) console.warn(`  ! ${r.sourceId}: ${r.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
