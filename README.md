# Civic Events — Sunnyvale

Every event officially published by the City of Sunnyvale and Sunnyvale Public Library, in one
list. Unlike Meetup and Eventbrite, nothing here is user-submitted and nothing is promoted.

Live on GitHub Pages as a static site. A scheduled scraper writes one JSON file; the build turns
it into HTML. No server and no database at runtime.

**Setting it up: see [SETUP.md](SETUP.md).**

---

## What was found on the live sites

Discovery on 2026-08-31, before any code was written. This is what shapes the design.

**Both Sunnyvale calendars run the same CivicEngage (CivicPlus) instance.**
`www.sunnyvale.ca.gov` and `www.library.sunnyvale.ca.gov` share an event store. Event URLs are
`/Home/Components/Calendar/Event/{eventId}/{categoryId}` — category 19 for the city, 74 for the
library. One adapter reads both.

**The city calendar republishes every library event, with the same event id.**
September 2026 had 115 rows on the city calendar and 88 on the library calendar. The library rows
are a subset of the city rows. Without dedupe, most library programs would appear twice. This is
why `dedupeNamespace` exists in the source registry.

**No API, no iCal, no RSS.**
The legacy CivicPlus feeds (`/common/modules/iCalendar/iCalendar.aspx`, `/RSSFeed.aspx`) are gone.
The month grid is server-rendered HTML, so parsing it is the only route. The markup contract is
stable and specific:

```
table.calendar
  td.calendar_day_with_items[aria-label="Scheduled events, Monday, September 1, 2026"]
    div.calendar_item
      span.calendar_eventtime   -> "6:30 PM", empty for all-day
      a.calendar_eventlink      -> title + href
```

The date comes from the `aria-label`, not the day number in the cell — the number is ambiguous in
the grid's leading and trailing weeks.

**Both sites sit behind Akamai Bot Manager.**
A request from a datacenter IP can come back as a `bm-verify` interstitial instead of the page.
`src/ingest/fetcher.ts` starts with plain `fetch` and escalates to headless Chromium when it sees
a challenge. This constrains hosting — see *Deploying* below.

**The library also runs LibCal**, at `sunnyvale.libcal.com`, whose event pages carry clean
schema.org Event JSON-LD *and* the publisher's own audience and category facets. That adapter is
written and tested, but the source is disabled — see *The taxonomy* below for why.

---

## Architecture

```
official calendars
        │
        ▼
  fetcher.ts          plain fetch, escalates to headless Chromium on a bot challenge
        │
        ▼
  adapters/*.ts       one per publishing platform, not per city -> RawEvent[]
        │
        ▼
  normalize.ts        Pacific wall-clock -> instants, title cleanup, content hash
        │
        ▼
  taxonomy.ts         publisher's words -> canonical type + audience,
                      or inferred from the title when the source has none
        │
        ▼
  dedupe.ts           exact (shared upstream id) then fuzzy (same time + title)
        │
        ▼
  export-json.ts      data/events.json, committed to the repo
        │
        ▼
  next build          one HTML file per page, baked at build time
        │
        ▼
  GitHub Pages  ──►  browser (filters in the page, no round trip)
```

Two GitHub Actions do the work. `ingest` scrapes twice a day and commits the JSON; `pages` sees
that commit and rebuilds. A push made by a workflow does not trigger other workflows, which is
why `pages` listens on `workflow_run` rather than `push`.

Five ideas carry the design.

**No database in the request path.** The whole dataset is about 9 KB gzipped, so it ships inside
the page and the browser filters it. A Postgres path still exists in `src/db/` and `npm run
ingest` for when that stops being true — both share `collectEvents`, so they cannot drift.

**An adapter is a platform, not a city.** Adding Mountain View or Santa Clara — both CivicEngage —
is a row in `src/ingest/sources.ts`, not new code.

**Deduping happens across all sources, after fetching, before writing.** Doing it per source would
let the city and library writes race each other in the database.

**Every classified value records where it came from.** `publisher` or `inferred`, per event, so a
guess is never presented as a fact and the classifier's accuracy is a query rather than a hunch.

**`contentHash` decides insert / update / unchanged.** A run that finds nothing new touches only
`lastSeenAt`, so a spike in `updated` means the publisher changed something — not that you re-ran
the job. `ingest_runs` records every attempt, which is where you notice a feed going quiet before
users do.

---

## The taxonomy

Two independent axes, in `src/ingest/taxonomy.ts`. They answer different questions, so neither
collapses into the other.

**`audience`** — who it is for: `kids`, `teens`, `adults`, `all`. Four values, because this one
drives the colored bar down the left of each row and three colors are the most a person can read
at a glance. "All ages" gets no color: it is the absence of a targeted audience, not a fourth
category competing for attention.

**`eventType`** — what it is: the 27 types from Sunnyvale Public Library's own facet list, plus
`civic-meeting` and `closure` (the city calendar needs somewhere to put a council meeting and a
holiday) and `uncategorized`. This is the canonical vocabulary for the whole site; every source
maps into it whether or not its platform uses the same words.

Each value carries a `typeSource` / `audienceSource` of `publisher` or `inferred`:

- **publisher** — the source labelled the event itself. `mapPublisherTypes` translates its words
  into the canonical set. Add a new city's vocabulary to that table, not to the classifier.
- **inferred** — no label, so it was guessed from the title by the ordered rules in `TYPE_RULES`.

Recording which is which is the point. It shows on the event page as "(inferred)", it decides the
winner when two sources disagree in `dedupe.ts`, and `getClassifierCoverage()` turns it into a
number, so the classifier's accuracy is measurable rather than assumed.

On the seeded 64 events the rules leave 5 uncategorized. The misses are all the same shape —
online speaker talks with titles that name a person and a feeling, like "Shifting from Surviving
to Thriving" — and no keyword rule will fix them. Descriptions will.

### Where the publisher's own types are

**The city calendar publishes a category per event, and it is reachable.** The detail pages are
bot-walled, but the calendar's own category filter is not: picking a category rewrites the URL to
`/city-calendar/-selcat-33?curm=9&cury=2026` and returns a filtered month grid. Crawling each
category and recording which one an event appeared under is how city events get a real label
instead of a guess. Seven categories, from the calendar's `eventcats_50_1677_41` select:

| id | Category | Sept 2026 |
|----|----------|-----------|
| 24 | City Events | 0 |
| 25 | Community Forums & Workshops | 3 |
| 26 | Environmental | 0 |
| 27 | Holidays Observed | 1 |
| 41 | Library Events (all) | 85 |
| 31 | Non-City Classes & Events | 0 |
| 33 | Recreation & Community | 26 |

They partition the month exactly — 85 + 26 + 3 + 1 = 115, which is the unfiltered grid's count.
The adapter still reads the unfiltered grid first anyway, so an uncategorized event cannot vanish.

**Three of the seven are not event types.** "City Events", "Library Events (all)" and "Non-City
Classes & Events" say which department posted the event, not what it is — the same axis this app
already tracks as the source. `NON_TYPE_CATEGORIES` keeps them out of `eventType`, so a library
event falls through to inference rather than getting filed under a label that tells a reader
nothing.

**Two new types came out of this.** The library's 27 has no Markets and no Sports & Recreation,
because a library never needed them, so before the city's categories were wired in the Farmers'
Market classified as *Celebrations* and Youth Drop-In Basketball as *Self-Directed Activities*.
`recreation` and `environment` fix that. This is the concrete argument for not treating one
department's taxonomy as the whole city's.

On the seeded month that leaves 15 of 64 events publisher-typed and 49 inferred. The 49 are the
library's, and they need one of:

- **LibCal**, whose event pages do publish both facets as filter links — `Audience: Children`,
  `Categories: Passive`. `parseFacets()` reads them and is tested. But Sunnyvale's LibCal listing
  is broken: their own "Browse for more events" link points at `/calendar?cid=13025`, which 404s,
  so there is no way to enumerate event ids. The source stays disabled and the parsing waits.
- **Detail-page enrichment**, once something gets past the bot wall.

---

## The feed

Each date is a band; under it, one row per event: the city's mark, then what the event is, then
when, in a divided right column. A colored bar runs down the left of each row for the audience.

Color is never the only cue — every row also names its audience in text, and the legend above the
list says what the colors mean. Measured against the card surface, all three clear 4.5:1 in both
themes (`kids` 5.01 / 8.19, `teens` 4.60 / 8.21, `adults` 6.35 / 7.76). Under simulated
deuteranopia green/orange and orange/blue stay well apart; green and blue separate by hue but
barely by lightness, which is the pair the text label is carrying.

The city mark comes from `sources.logo`, a path under `public/logos`. Sunnyvale's is the sunburst
from the city's own logo file, with the wordmark dropped — a 269x80 wordmark is illegible in a
square tile — and served from this app rather than hotlinked. A source with no logo on file gets a
monogram tile, so adding a city never blocks on artwork.

---

## Running it

```bash
npm install
npm run scrape:fixtures   # build data/events.json from saved calendar copies
npm run dev               # http://localhost:3000
```

No network, no database, no accounts. `scrape:fixtures` replays HTML captured from the live
calendars on 2026-08-31, through the real parser, so what you see locally is real data.

Against the live sites:

```bash
npm run scrape                  # both sources, three months ahead
npm run scrape -- --months=1
npm run test                    # 39 tests: parser, timezones, classification, dedupe
```

`npm run scrape` refuses to write a file with zero events. A run that returns nothing is almost
always a changed selector or a bot block, and overwriting good data with an empty file would take
the site down.

## Deploying

GitHub Pages, free, no database. [SETUP.md](SETUP.md) has the click-by-click version.

The one constraint worth knowing: the Sunnyvale sites sit behind Akamai Bot Manager, so the
scraper sometimes needs a real headless Chromium. That rules out Vercel serverless functions and
Firebase Cloud Functions, and it is why scraping runs in GitHub Actions, where installing a
browser is one line.

Scraping and serving are fully decoupled. The scraper's only output is a committed JSON file, so
the site cannot go down because a scrape failed — it just serves the last good data, and the
About page shows when that was.

## Adding a city

For another CivicEngage site, add a row to `SOURCES`:

```ts
{
  id: "mountain-view-city",
  name: "City of Mountain View",
  jurisdiction: "Mountain View, CA",
  kind: "city",
  adapter: "civicengage",
  homepageUrl: "https://www.mountainview.gov",
  dedupeNamespace: "mountain-view-civicengage",  // its own id space
  priority: 10,
  enabled: true,
  config: { calendarUrl: "https://www.mountainview.gov/.../calendar" },
}
```

Then check three things before trusting it:

1. `npm run ingest -- --source=<id> --dry-run` returns a plausible count.
2. Spot-check five events against the official page — date, time, title.
3. Confirm the timezone. `normalize.ts` hardcodes `America/Los_Angeles`; make it per-source before
   you leave the Pacific time zone.

A platform that is not CivicEngage or LibCal needs a new adapter — roughly 80 lines, implementing
`SourceAdapter`.

Two more things per city, both optional:

- Drop its mark in `public/logos/<city>.svg` and set `logo` on the source row. Without one the
  row shows a monogram tile.
- Check the calendar for a category filter. If it has one, list the categories in the source's
  `config.categories` and add their words to `TYPE_VOCABULARY` in `src/ingest/taxonomy.ts` — and
  any that name a department rather than a kind of event to `NON_TYPE_CATEGORIES`. That is what
  "training the app" looks like for a new city: two mapping tables, not a model.

---

## Known gaps

- **Descriptions are not fetched.** The month grid gives title, date, time and link. Getting the
  body text means one request per event detail page. Worth doing, but it multiplies the request
  count by fifty, which matters behind a bot filter. Do it as a second pass over new events only.
- **Audience is single-valued.** "Youth Drop-In Basketball" is for kids and teens both, and the
  model makes it pick one, so it lands on "All ages" rather than claiming the wrong one. Multi-
  value audience is the honest fix.
- **Library events are still inferred** — 49 of 64. The city's per-category crawl covers the
  city's own programming; the library's only city category is a provenance label. 4 of 64 land in
  Uncategorized, all of them online speaker talks whose titles name a person and a feeling.
- **The per-category crawl costs 8 requests per month instead of 1.** Fine at Sunnyvale's scale
  and behind the fetcher's throttle; worth rethinking at fifteen cities.
- **Venues are a text field.** The `venues` table exists and is unused; nothing needs a map yet.
- **No recurrence model.** A weekly storytime is fifty independent rows, which is what the source
  publishes and what a person browsing one Saturday wants. A series view would need grouping.
- **The LibCal source is off** until its listing URL is confirmed — see the taxonomy section.
- **Only Sunnyvale has a logo on file.** Every other city will show a monogram until you add an
  SVG to `public/logos` and point its source row at it.
- **Fixtures are regenerated markup**, not captured pages. They prove the parser against the
  contract, not against every quirk of the live HTML. Re-capture a real page before trusting a
  parser change in production.
