import * as cheerio from "cheerio";
import type { FetchContext, RawEvent, SourceAdapter, SourceConfig } from "../types";

/**
 * CivicEngage Central (CivicPlus) month-grid calendar.
 *
 * Verified against www.sunnyvale.ca.gov and www.library.sunnyvale.ca.gov on
 * 2026-08-31. The markup contract is:
 *
 *   table.calendar
 *     td.calendar_day_with_items[aria-label="Scheduled events, Monday, September 1, 2026"]
 *       div.calendar_item
 *         span.calendar_eventtime   -> "6:30 PM", or empty for all-day
 *         a.calendar_eventlink      -> title, href /Home/Components/Calendar/Event/{id}/{catId}
 *
 * The month is selected with ?curm=<1-12>&cury=<yyyy>.
 *
 * The aria-label is the date source, not the cell's day number. The number is
 * ambiguous in the leading and trailing week of the grid; the label is not.
 */

interface CivicEngageConfig {
  /** Month-grid page, without query string. */
  calendarUrl: string;
  /** Category id in the event URL. Informational: we read whatever is there. */
  categoryId?: string;
  /** Origin used to absolutize event links. Defaults to calendarUrl's origin. */
  origin?: string;
  /**
   * The calendar's own category filter, read off its `eventcats_*` select.
   *
   * When present, each month is crawled once per category and every event is
   * tagged with the category name it appeared under. That is the only way to
   * get the publisher's own label out of CivicEngage: the event detail pages
   * are behind bot protection, but the filtered month grids are not.
   *
   * Costs one request per category per month instead of one per month. On
   * Sunnyvale that is 7 instead of 1, which at the fetcher's throttle is a
   * few seconds for labels that would otherwise be guesswork.
   */
  categories?: Array<{ id: string; name: string }>;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "Scheduled events, Monday, September 1, 2026" -> "2026-09-01" */
export function parseAriaLabelDate(label: string): string | null {
  const m = label.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/);
  if (!m) return null;
  const monthIndex = MONTHS.indexOf(m[1].toLowerCase());
  if (monthIndex < 0) return null;
  const month = String(monthIndex + 1).padStart(2, "0");
  const day = m[2].padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

/** "/Home/Components/Calendar/Event/12841/74" -> "12841" */
export function parseEventId(href: string): string | null {
  const m = href.match(/\/Calendar\/Event\/(\d+)(?:\/(\d+))?/i);
  return m ? m[1] : null;
}

export function parseMonthGrid(html: string, origin: string): RawEvent[] {
  const $ = cheerio.load(html);
  const events: RawEvent[] = [];
  const seen = new Set<string>();

  $("td.calendar_day_with_items").each((_, td) => {
    const date = parseAriaLabelDate($(td).attr("aria-label") ?? "");
    if (!date) return;

    $(td)
      .find("div.calendar_item")
      .each((__, item) => {
        const link = $(item).find("a.calendar_eventlink").first();
        const href = link.attr("href");
        if (!href) return;

        const externalId = parseEventId(href);
        if (!externalId) return;

        const title = link.text().replace(/\s+/g, " ").trim();
        if (!title) return;

        const timeText = $(item).find("span.calendar_eventtime").first().text().trim();

        // The same occurrence can appear twice in one grid when an event is
        // filed under two categories.
        const key = `${date}|${externalId}`;
        if (seen.has(key)) return;
        seen.add(key);

        events.push({
          externalId,
          title,
          date,
          timeText,
          url: new URL(href, origin).toString(),
        });
      });
  });

  return events;
}

function monthUrl(base: string, year: number, month: number, categoryId?: string): string {
  // The category goes in the path, not the query: the calendar filters via
  // /city-calendar/-selcat-33?curm=9&cury=2026
  const path = categoryId ? `${base.replace(/\/$/, "")}/-selcat-${categoryId}` : base;
  const u = new URL(path);
  u.searchParams.set("curm", String(month));
  u.searchParams.set("cury", String(year));
  return u.toString();
}

export const civicEngageAdapter: SourceAdapter = {
  name: "civicengage",

  async fetchEvents(source: SourceConfig, ctx: FetchContext): Promise<RawEvent[]> {
    const cfg = source.config as unknown as CivicEngageConfig;
    if (!cfg.calendarUrl) throw new Error(`${source.id}: config.calendarUrl is required`);
    const origin = cfg.origin ?? new URL(cfg.calendarUrl).origin;

    const now = new Date();

    // Keyed by date + event id, so an event listed under two categories keeps
    // both labels instead of the last one winning.
    const collected = new Map<string, RawEvent>();

    for (let i = 0; i <= ctx.monthsAhead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;

      // Always read the unfiltered grid first. The categories should add up
      // to it, but an event filed under none of them would vanish if the
      // category crawl were the only pass.
      const baseUrl = monthUrl(cfg.calendarUrl, year, month);
      const baseHtml = await ctx.fetchHtml(baseUrl);
      const baseBatch = parseMonthGrid(baseHtml, origin);

      if (baseBatch.length === 0) {
        console.warn(`[${source.id}] ${baseUrl} returned no events — check the markup contract`);
      }
      for (const e of baseBatch) {
        collected.set(`${e.date}|${e.externalId}`, { ...e, publisherTypes: [] });
      }

      for (const category of cfg.categories ?? []) {
        const url = monthUrl(cfg.calendarUrl, year, month, category.id);
        const html = await ctx.fetchHtml(url);

        for (const e of parseMonthGrid(html, origin)) {
          const key = `${e.date}|${e.externalId}`;
          const existing = collected.get(key);

          if (existing) existing.publisherTypes = [...(existing.publisherTypes ?? []), category.name];
          // An event the unfiltered grid missed still belongs in the results.
          else collected.set(key, { ...e, publisherTypes: [category.name] });
        }
      }

      const labelled = [...collected.values()].filter((e) => e.publisherTypes?.length).length;
      if (cfg.categories?.length) {
        console.log(
          `[${source.id}] ${year}-${String(month).padStart(2, "0")}: ${baseBatch.length} events, ${labelled} carrying a publisher category`,
        );
      }
    }

    return [...collected.values()];
  },
};
