import * as cheerio from "cheerio";
import type { FetchContext, RawEvent, SourceAdapter, SourceConfig } from "../types";

/**
 * Springshare LibCal.
 *
 * Sunnyvale Public Library also runs LibCal at sunnyvale.libcal.com. Its
 * event pages carry schema.org Event JSON-LD, which is the cleanest thing
 * either Sunnyvale platform publishes:
 *
 *   {"@context":"https://schema.org","@type":"Event",
 *    "name":"Back to School Scavenger Hunt",
 *    "startDate":"2026-08-31T00:00:00-07:00",
 *    "endDate":"2026-08-31T23:59:59-07:00",
 *    "url":"https://sunnyvale.libcal.com/event/17066956",
 *    "location":{"@type":"Place","name":"Children's Room"}}
 *
 * Event pages also carry the publisher's own facets as linked filters, which
 * is the only place in Sunnyvale where a real event type is published:
 *
 *   Audience:   <a href="...audience[]=3475">Children</a>
 *   Categories: <a href="...ct[]=62035">Passive</a>
 *
 * Status: the JSON-LD and the facet links are both verified against live
 * pages. The listing page that enumerates event ids is NOT — Sunnyvale's own
 * "Browse for more events" link points at /calendar?cid=13025, which returns
 * 404. Until that is solved this adapter has no way to discover event ids,
 * so the source is disabled. The per-event parsing below is ready.
 */

interface LibCalConfig {
  /** Page that links to /event/{id} pages. */
  listingUrl: string;
  origin?: string;
}

interface SchemaEvent {
  "@type"?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  description?: string;
  eventStatus?: string;
  eventAttendanceMode?: string;
  location?: { name?: string; address?: unknown };
}

export function parseJsonLdEvent(html: string): SchemaEvent | null {
  const $ = cheerio.load(html);
  let found: SchemaEvent | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const parsed = JSON.parse($(el).text());
      const candidates: SchemaEvent[] = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"] && Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
      found = candidates.find((c) => c["@type"] === "Event") ?? null;
    } catch {
      // A malformed block on one page must not abort the run.
    }
  });

  return found;
}

/** "2026-08-31T00:00:00-07:00" -> { date: "2026-08-31", timeText: "12:00 AM" } */
function splitIso(iso: string): { date: string; timeText: string } {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return { date: iso.slice(0, 10), timeText: "" };
  let hour = Number(m[2]);
  const minute = m[3];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return { date: m[1], timeText: `${hour}:${minute} ${suffix}` };
}

/** An all-day LibCal event runs 00:00:00 to 23:59:59. */
function isAllDay(start?: string, end?: string): boolean {
  return !!start && !!end && start.includes("T00:00:00") && end.includes("T23:59:59");
}

/**
 * Read the publisher's own facets off an event page.
 *
 * The facets are links back into the calendar's filters, so the query key
 * identifies them: `ct[]` for category, `audience[]` for audience. Matching
 * on the query key rather than on surrounding markup means a template change
 * has to break the filter links themselves before it breaks this.
 */
export function parseFacets(html: string): { types: string[]; audience?: string } {
  const $ = cheerio.load(html);
  const types: string[] = [];
  const audiences: string[] = [];

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const text = $(a).text().replace(/\s+/g, " ").trim();
    if (!text) return;

    // Both the raw and percent-encoded forms appear, depending on the page.
    if (/(?:^|[?&])ct(?:\[\]|%5B%5D)=/.test(href)) types.push(text);
    else if (/(?:^|[?&])audience(?:\[\]|%5B%5D)=/.test(href)) audiences.push(text);
  });

  return { types, audience: audiences[0] };
}

export const libCalAdapter: SourceAdapter = {
  name: "libcal",

  async fetchEvents(source: SourceConfig, ctx: FetchContext): Promise<RawEvent[]> {
    const cfg = source.config as unknown as LibCalConfig;
    if (!cfg.listingUrl) throw new Error(`${source.id}: config.listingUrl is required`);
    const origin = cfg.origin ?? new URL(cfg.listingUrl).origin;

    const listing = await ctx.fetchHtml(cfg.listingUrl);
    const $ = cheerio.load(listing);

    const eventUrls = new Set<string>();
    $('a[href*="/event/"]').each((_, a) => {
      const href = $(a).attr("href");
      if (!href) return;
      const abs = new URL(href, origin).toString();
      if (/\/event\/\d+/.test(abs)) eventUrls.add(abs.split("?")[0]);
    });

    const events: RawEvent[] = [];
    for (const url of eventUrls) {
      const html = await ctx.fetchHtml(url);
      const ld = parseJsonLdEvent(html);
      if (!ld?.name || !ld.startDate) continue;

      const externalId = url.match(/\/event\/(\d+)/)?.[1];
      if (!externalId) continue;

      const allDay = isAllDay(ld.startDate, ld.endDate);
      const start = splitIso(ld.startDate);
      const facets = parseFacets(html);

      events.push({
        externalId,
        title: ld.name.replace(/\s+/g, " ").trim(),
        date: start.date,
        timeText: allDay ? "" : start.timeText,
        endTimeText: !allDay && ld.endDate ? splitIso(ld.endDate).timeText : undefined,
        url: ld.url ?? url,
        description: ld.description,
        locationText: ld.location?.name,
        publisherTypes: facets.types,
        publisherAudience: facets.audience,
      });
    }

    return events;
  },
};
