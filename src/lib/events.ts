/**
 * The shape of `data/events.json` — the one file the website reads.
 *
 * The scraper writes it, the build bakes it into static pages, and nothing at
 * request time touches a database. At Sunnyvale's size the whole file is
 * about 9 KB gzipped, which is why this works: the entire dataset is smaller
 * than one photo, so there is nothing for a server to do that the browser
 * cannot do faster.
 */

export interface PublicEvent {
  slug: string;
  title: string;
  description: string | null;
  /** ISO 8601 with offset. JSON has no date type. */
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  eventType: string;
  audience: string;
  typeSource: "publisher" | "inferred";
  audienceSource: "publisher" | "inferred";
  locationText: string | null;
  isOnline: boolean;
  cancelled: boolean;
  canonicalUrl: string;
  primarySourceId: string;
  sourceIds: string[];
}

export interface PublicSource {
  id: string;
  name: string;
  jurisdiction: string;
  kind: string;
  homepageUrl: string;
  logo: string | null;
}

export interface EventsFile {
  /** When the scraper last ran. Shown on the About page. */
  generatedAt: string;
  /** How each source fared on that run, so a quiet feed is visible. */
  runs: Array<{ sourceId: string; fetched: number; error?: string }>;
  sources: PublicSource[];
  events: PublicEvent[];
}

export const EMPTY_EVENTS_FILE: EventsFile = {
  generatedAt: new Date(0).toISOString(),
  runs: [],
  sources: [],
  events: [],
};

/** A row with its publisher joined in, which is what the UI actually renders. */
export interface EventWithSource extends PublicEvent {
  sourceName: string;
  sourceKind: string;
  jurisdiction: string;
  sourceLogo: string | null;
}

export function joinSources(file: EventsFile): EventWithSource[] {
  const byId = new Map(file.sources.map((s) => [s.id, s]));

  return file.events.map((e) => {
    const s = byId.get(e.primarySourceId);
    return {
      ...e,
      sourceName: s?.name ?? e.primarySourceId,
      sourceKind: s?.kind ?? "city",
      jurisdiction: s?.jurisdiction ?? "",
      sourceLogo: s?.logo ?? null,
    };
  });
}
