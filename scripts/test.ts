/**
 * Contract tests for the pure parts of the pipeline: parsing, time handling,
 * classification and dedupe. No database, no network.
 *
 * Run with: npm test
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

import {
  parseMonthGrid,
  parseAriaLabelDate,
  parseEventId,
} from "../src/ingest/adapters/civicengage";
import { parseJsonLdEvent, parseFacets } from "../src/ingest/adapters/libcal";
import {
  detectCancelled,
  normalizeEvent,
  parseTimeText,
  stripChannelPrefix,
  zonedToUtc,
} from "../src/ingest/normalize";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  inferAudience,
  inferEventType,
  isProvenanceLabel,
  mapPublisherAudience,
  mapPublisherTypes,
  resolveAudience,
  resolveEventType,
} from "../src/ingest/taxonomy";
import { dedupe } from "../src/ingest/dedupe";
import { SOURCES } from "../src/ingest/sources";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("\nCivicEngage parser");

test("reads the date from aria-label, not the day number", () => {
  assert.equal(
    parseAriaLabelDate("Scheduled events, Monday, September 1, 2026"),
    "2026-09-01",
  );
  assert.equal(parseAriaLabelDate("Scheduled events, Sunday, December 7, 2025"), "2025-12-07");
  assert.equal(parseAriaLabelDate("nonsense"), null);
});

test("pulls the event id out of the href", () => {
  assert.equal(parseEventId("/Home/Components/Calendar/Event/12841/74"), "12841");
  assert.equal(parseEventId("/Home/Components/Calendar/Event/283/19"), "283");
  assert.equal(parseEventId("/some/other/path"), null);
});

test("parses the library month grid", () => {
  const html = readFileSync(join(fixtures, "library-2026-09.html"), "utf8");
  const events = parseMonthGrid(html, "https://www.library.sunnyvale.ca.gov");

  assert.equal(events.length, 50);

  const storytime = events.find((e) => e.externalId === "12334");
  assert.ok(storytime, "expected event 12334");
  assert.equal(storytime.title, "MAIN: Toddler Storytime");
  assert.equal(storytime.date, "2026-09-01");
  assert.equal(storytime.timeText, "11 AM");
  assert.equal(
    storytime.url,
    "https://www.library.sunnyvale.ca.gov/Home/Components/Calendar/Event/12334/74",
  );
});

test("keeps all-day rows, which have no time text", () => {
  const html = readFileSync(join(fixtures, "library-2026-09.html"), "utf8");
  const closed = parseMonthGrid(html, "https://www.library.sunnyvale.ca.gov").find(
    (e) => e.externalId === "10269",
  );
  assert.ok(closed);
  assert.equal(closed.timeText, "");
  assert.equal(closed.title, "Library Closed");
});

test("returns nothing rather than guessing when the markup changes", () => {
  assert.equal(parseMonthGrid("<html><body><p>nope</p></body></html>", "https://x.test").length, 0);
});

console.log("\nLibCal parser");

test("reads schema.org Event JSON-LD", () => {
  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Event","name":"Back to School Scavenger Hunt",
     "startDate":"2026-08-31T00:00:00-07:00","endDate":"2026-08-31T23:59:59-07:00",
     "url":"https://sunnyvale.libcal.com/event/17066956",
     "location":{"@type":"Place","name":"Children's Room"}}
  </script></head><body></body></html>`;

  const ld = parseJsonLdEvent(html);
  assert.equal(ld?.name, "Back to School Scavenger Hunt");
  assert.equal(ld?.location?.name, "Children's Room");
});

test("survives a malformed JSON-LD block", () => {
  assert.equal(parseJsonLdEvent('<script type="application/ld+json">{oops</script>'), null);
});

console.log("\nTime handling");

test("parses the time formats the calendars actually publish", () => {
  assert.equal(parseTimeText("6:30 PM"), 18 * 60 + 30);
  assert.equal(parseTimeText("11 AM"), 11 * 60);
  assert.equal(parseTimeText("12 AM"), 0);
  assert.equal(parseTimeText("12 PM"), 12 * 60);
  assert.equal(parseTimeText("10:30 AM"), 10 * 60 + 30);
  assert.equal(parseTimeText(""), null);
  assert.equal(parseTimeText("All Day"), null);
});

test("converts Pacific wall-clock to the right instant in PDT", () => {
  // 2026-09-01 11:00 PDT is 18:00 UTC.
  assert.equal(zonedToUtc(2026, 9, 1, 11, 0).toISOString(), "2026-09-01T18:00:00.000Z");
});

test("converts Pacific wall-clock to the right instant in PST", () => {
  // 2026-01-15 11:00 PST is 19:00 UTC.
  assert.equal(zonedToUtc(2026, 1, 15, 11, 0).toISOString(), "2026-01-15T19:00:00.000Z");
});

test("handles the day the clocks go forward", () => {
  // 2026-03-08: 02:00 PST becomes 03:00 PDT. 01:30 is still PST (-08:00).
  assert.equal(zonedToUtc(2026, 3, 8, 1, 30).toISOString(), "2026-03-08T09:30:00.000Z");
  // 03:30 is PDT (-07:00).
  assert.equal(zonedToUtc(2026, 3, 8, 3, 30).toISOString(), "2026-03-08T10:30:00.000Z");
});

console.log("\nTitle handling");

test("moves the branch prefix out of the title", () => {
  const r = stripChannelPrefix("MAIN: Sewing Lab");
  assert.equal(r.title, "Sewing Lab");
  assert.equal(r.branch, "Sunnyvale Public Library");
  assert.equal(r.isOnline, false);
});

test("treats ONLINE as a channel, not a place", () => {
  const r = stripChannelPrefix("ONLINE: Monthly Book Group");
  assert.equal(r.title, "Monthly Book Group");
  assert.equal(r.isOnline, true);
  assert.equal(r.branch, null);
});

test("does not turn a status prefix into a venue", () => {
  const r = stripChannelPrefix("RESCHEDULED: Level Up Adult Literacy Info Session");
  assert.equal(r.title, "Level Up Adult Literacy Info Session");
  assert.equal(r.branch, null);
});

test("leaves an ordinary title alone", () => {
  const r = stripChannelPrefix("Sunnyvale Farmers' Market");
  assert.equal(r.title, "Sunnyvale Farmers' Market");
  assert.equal(r.branch, null);
});

test("spots a cancellation in the title", () => {
  assert.equal(detectCancelled("Zumba - Canceled"), true);
  assert.equal(detectCancelled("Zumba"), false);
});

console.log("\nTaxonomy");

test("every event type has a label", () => {
  for (const t of EVENT_TYPES) {
    assert.ok(EVENT_TYPE_LABELS[t], `missing label for ${t}`);
  }
});

test("infers the event types a reader would expect", () => {
  assert.equal(inferEventType("MAIN: Toddler Storytime"), "storytime");
  assert.equal(inferEventType("Zumba"), "health-wellness");
  assert.equal(inferEventType("MAIN: Sewing Lab"), "crafts-hobbies");
  assert.equal(inferEventType("ONLINE: ESL Conversation Group"), "learn-english");
  assert.equal(inferEventType("MAIN: Get Connected"), "computer-help");
  assert.equal(inferEventType("City Council Study Session"), "civic-meeting");
  assert.equal(inferEventType("MAIN: Silent Book Club"), "books-authors");
  assert.equal(inferEventType("MAIN: Master Gardeners: The Mysteries of Purple Veggies"), "nature-gardening");
  assert.equal(inferEventType("Free Tenant-Landlord Counseling"), "community-resources");
  assert.equal(inferEventType("MAIN: Teen Volunteer Club"), "volunteer");
});

test("falls back to uncategorized rather than guessing wildly", () => {
  assert.equal(inferEventType("Sunnyvale Beam Celebration"), "celebrations");
  assert.equal(inferEventType("Qqqq Zzzz"), "uncategorized");
});

test("the specific rules beat the general ones", () => {
  // "holiday" would match closure, but a council meeting is a meeting.
  assert.equal(inferEventType("City Council Meeting - Holiday Schedule"), "civic-meeting");
  // "create" would match crafts, but ESL is more specific.
  assert.equal(inferEventType("ESL Conversation Group"), "learn-english");
});

test("reads the audience from the title", () => {
  assert.equal(inferAudience("MAIN: Teens Create: Mini Libraries"), "teens");
  assert.equal(inferAudience("MAIN: Toddler Storytime"), "kids");
  assert.equal(inferAudience("MAIN: Adults Create: Sewing by Hand"), "adults");
  assert.equal(inferAudience("Sunnyvale Farmers' Market"), "all");
  assert.equal(inferAudience("MAIN: Paws to Read"), "kids");
});

test("translates a publisher's own words", () => {
  // Verified against sunnyvale.libcal.com, which tags events "Passive".
  assert.equal(mapPublisherTypes(["Passive"]), "self-directed");
  assert.equal(mapPublisherAudience("Children"), "kids");
  assert.equal(mapPublisherAudience("Young Adult"), "teens");
  assert.equal(mapPublisherAudience("All Ages"), "all");
});

test("maps the city calendar's own categories", () => {
  // Read off the city calendar's category filter on 2026-08-31.
  assert.equal(mapPublisherTypes(["Recreation & Community"]), "recreation");
  assert.equal(mapPublisherTypes(["Community Forums & Workshops"]), "community-resources");
  assert.equal(mapPublisherTypes(["Environmental"]), "environment");
  assert.equal(mapPublisherTypes(["Holidays Observed"]), "closure");
});

test("a label naming the department is not an event type", () => {
  // Three of the city's seven categories say who posted it, not what it is.
  for (const label of ["City Events", "Library Events (all)", "Non-City Classes & Events"]) {
    assert.equal(isProvenanceLabel(label), true, label);
    assert.equal(mapPublisherTypes([label]), null, label);
  }
});

test("a provenance label does not block a real one beside it", () => {
  assert.equal(mapPublisherTypes(["Library Events (all)", "Recreation & Community"]), "recreation");
});

test("the city's category rescues events the library vocabulary misfiles", () => {
  // Before the city categories existed these two landed in Celebrations and
  // Self-Directed Activities, because the library list has no Markets and no
  // Sports & Recreation.
  assert.equal(inferEventType("Sunnyvale Farmers' Market"), "celebrations");
  assert.equal(
    resolveEventType("Sunnyvale Farmers' Market", null, ["Recreation & Community"]).eventType,
    "recreation",
  );
  assert.equal(
    resolveEventType("Youth Drop-In Basketball", null, ["Recreation & Community"]).eventType,
    "recreation",
  );
});

test("an unknown publisher word does not become a bogus type", () => {
  assert.equal(mapPublisherTypes(["Blorptacular"]), null);
  assert.equal(mapPublisherAudience("Blorptacular"), null);
});

test("takes the first word it recognizes when a publisher tags several", () => {
  assert.equal(mapPublisherTypes(["Blorptacular", "Storytime"]), "storytime");
});

test("a published type beats an inferred one, and says so", () => {
  const published = resolveEventType("Sewing Lab", null, ["Passive"]);
  assert.deepEqual(published, { eventType: "self-directed", typeSource: "publisher" });

  const guessed = resolveEventType("Sewing Lab", null, []);
  assert.deepEqual(guessed, { eventType: "crafts-hobbies", typeSource: "inferred" });

  const audience = resolveAudience("Sewing Lab", "Adults");
  assert.deepEqual(audience, { audience: "adults", audienceSource: "publisher" });
});

test("reads LibCal's facet links", () => {
  // The real markup: facets are links back into the calendar's filters.
  const html = `<html><body>
    <dt>Audience:</dt><dd><a href="/calendar?cid=13025&audience%5B%5D=3475">Children</a></dd>
    <dt>Categories:</dt><dd><a href="/calendar?cid=13025&ct%5B%5D=62035">Passive</a></dd>
    <a href="/event/123">Some unrelated link</a>
  </body></html>`;

  const f = parseFacets(html);
  assert.deepEqual(f.types, ["Passive"]);
  assert.equal(f.audience, "Children");
});

test("reads the unencoded bracket form too", () => {
  const html = `<a href="/calendar?ct[]=1">Storytime</a><a href="/calendar?audience[]=2">Teens</a>`;
  const f = parseFacets(html);
  assert.deepEqual(f.types, ["Storytime"]);
  assert.equal(f.audience, "Teens");
});

console.log("\nNormalize and dedupe");

const city = SOURCES.find((s) => s.id === "sunnyvale-city")!;
const library = SOURCES.find((s) => s.id === "sunnyvale-library")!;

test("all-day events span the whole local day", () => {
  const n = normalizeEvent(
    { externalId: "283", title: "City Holiday - Labor Day", date: "2026-09-07", timeText: "", url: "https://x.test/1" },
    { source: city, dedupeNamespace: city.dedupeNamespace },
  )!;
  assert.equal(n.allDay, true);
  assert.equal(n.startsAt.toISOString(), "2026-09-07T07:00:00.000Z"); // 00:00 PDT
  assert.equal(n.endsAt!.toISOString(), "2026-09-08T06:59:00.000Z"); // 23:59 PDT
});

test("the same upstream event from two calendars collapses to one row", () => {
  const raw = {
    externalId: "12334",
    title: "MAIN: Toddler Storytime",
    date: "2026-09-01",
    timeText: "11 AM",
    url: "https://x.test/12334",
  };

  const fromCity = normalizeEvent(raw, { source: city, dedupeNamespace: city.dedupeNamespace })!;
  const fromLibrary = normalizeEvent(raw, {
    source: library,
    dedupeNamespace: library.dedupeNamespace,
  })!;

  assert.equal(fromCity.dedupeKey, fromLibrary.dedupeKey);

  const { merged, exactMerges } = dedupe([fromCity, fromLibrary], {
    "sunnyvale-city": city.priority,
    "sunnyvale-library": library.priority,
  });

  assert.equal(merged.length, 1);
  assert.equal(exactMerges, 1);
  // The library outranks the city, so the library gets the credit.
  assert.equal(merged[0].primarySourceId, "sunnyvale-library");
  assert.deepEqual(merged[0].sourceIds, ["sunnyvale-city", "sunnyvale-library"]);
});

test("two different events on the same day stay separate", () => {
  const a = normalizeEvent(
    { externalId: "1", title: "Zumba", date: "2026-09-01", timeText: "6:30 PM", url: "https://x.test/a" },
    { source: city, dedupeNamespace: city.dedupeNamespace },
  )!;
  const b = normalizeEvent(
    { externalId: "2", title: "Yoga", date: "2026-09-01", timeText: "6:30 PM", url: "https://x.test/b" },
    { source: city, dedupeNamespace: city.dedupeNamespace },
  )!;

  assert.equal(dedupe([a, b], { "sunnyvale-city": 10 }).merged.length, 2);
});

test("a cancellation from any source wins the merge", () => {
  const base = { externalId: "9", date: "2026-09-15", timeText: "6:30 PM", url: "https://x.test/9" };
  const live = normalizeEvent({ ...base, title: "Zumba" }, {
    source: city,
    dedupeNamespace: city.dedupeNamespace,
  })!;
  const cancelled = normalizeEvent({ ...base, title: "Zumba - Canceled" }, {
    source: library,
    dedupeNamespace: library.dedupeNamespace,
  })!;

  const { merged } = dedupe([live, cancelled], {
    "sunnyvale-city": 10,
    "sunnyvale-library": 20,
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].cancelled, true);
});

test("the audience survives prefix stripping", () => {
  // "MAIN: Teens Create" loses its prefix in the title but must stay teens.
  const n = normalizeEvent(
    { externalId: "7", title: "MAIN: Teens Create: Mini Libraries", date: "2026-09-03", timeText: "5 PM", url: "https://x.test/7" },
    { source: library, dedupeNamespace: library.dedupeNamespace },
  )!;
  assert.equal(n.title, "Teens Create: Mini Libraries");
  assert.equal(n.audience, "teens");
  assert.equal(n.eventType, "crafts-hobbies");
});

test("a publisher-supplied type wins the merge over an inferred one", () => {
  const base = { externalId: "8", date: "2026-09-04", timeText: "2 PM", url: "https://x.test/8", title: "Scavenger Hunt" };

  const inferredSide = normalizeEvent(base, { source: city, dedupeNamespace: city.dedupeNamespace })!;
  const publishedSide = normalizeEvent(
    { ...base, publisherTypes: ["Passive"], publisherAudience: "Children" },
    { source: library, dedupeNamespace: library.dedupeNamespace },
  )!;

  const { merged } = dedupe([inferredSide, publishedSide], {
    "sunnyvale-city": 10,
    "sunnyvale-library": 20,
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].typeSource, "publisher");
  assert.equal(merged[0].eventType, "self-directed");
  assert.equal(merged[0].audience, "kids");
});

test("the content hash changes only when the content changes", () => {
  const raw = { externalId: "5", title: "Yoga", date: "2026-09-02", timeText: "9 AM", url: "https://x.test/5" };
  const opts = { source: city, dedupeNamespace: city.dedupeNamespace };

  const a = normalizeEvent(raw, opts)!;
  const b = normalizeEvent(raw, opts)!;
  const c = normalizeEvent({ ...raw, timeText: "10 AM" }, opts)!;

  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.contentHash, c.contentHash);
});

test("the full fixture set dedupes to the expected count", () => {
  const cityHtml = readFileSync(join(fixtures, "city-2026-09.html"), "utf8");
  const libHtml = readFileSync(join(fixtures, "library-2026-09.html"), "utf8");

  const all = [
    ...parseMonthGrid(cityHtml, "https://www.sunnyvale.ca.gov").map((r) =>
      normalizeEvent(r, { source: city, dedupeNamespace: city.dedupeNamespace })!,
    ),
    ...parseMonthGrid(libHtml, "https://www.library.sunnyvale.ca.gov").map((r) =>
      normalizeEvent(r, { source: library, dedupeNamespace: library.dedupeNamespace })!,
    ),
  ];

  const { merged, exactMerges } = dedupe(all, {
    "sunnyvale-city": city.priority,
    "sunnyvale-library": library.priority,
  });

  assert.equal(all.length, 114);
  assert.equal(exactMerges, 50);
  assert.equal(merged.length, 64);
  assert.equal(merged.filter((e) => e.sourceIds.length === 2).length, 50);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
