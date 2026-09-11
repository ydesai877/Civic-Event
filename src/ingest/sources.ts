import type { SourceAdapter, SourceConfig } from "./types";
import { civicEngageAdapter } from "./adapters/civicengage";
import { libCalAdapter } from "./adapters/libcal";

export const ADAPTERS: Record<string, SourceAdapter> = {
  civicengage: civicEngageAdapter,
  libcal: libCalAdapter,
};

/**
 * The source registry.
 *
 * Adding a city that runs CivicEngage — Mountain View, Santa Clara, Cupertino
 * — is a row here, not new code. `dedupeNamespace` groups sources that share
 * one upstream event store.
 */
export interface RegisteredSource extends SourceConfig {
  dedupeNamespace: string;
  /** Preferred when the same occurrence comes from several sources. Higher wins. */
  priority: number;
}

export const SOURCES: RegisteredSource[] = [
  {
    id: "sunnyvale-city",
    name: "City of Sunnyvale",
    jurisdiction: "Sunnyvale, CA",
    kind: "city",
    adapter: "civicengage",
    homepageUrl: "https://www.sunnyvale.ca.gov",
    logo: "/logos/sunnyvale.svg",
    dedupeNamespace: "sunnyvale-civicengage",
    priority: 10,
    enabled: true,
    config: {
      calendarUrl: "https://www.sunnyvale.ca.gov/news-center-and-events-calendar/city-calendar",
      categoryId: "19",
      // Read off the calendar's own `eventcats_50_1677_41` select on
      // 2026-08-31. Crawling each one is what gives city events a publisher
      // type instead of a guess.
      categories: [
        { id: "24", name: "City Events" },
        { id: "25", name: "Community Forums & Workshops" },
        { id: "26", name: "Environmental" },
        { id: "27", name: "Holidays Observed" },
        { id: "41", name: "Library Events (all)" },
        { id: "31", name: "Non-City Classes & Events" },
        { id: "33", name: "Recreation & Community" },
      ],
    },
  },
  {
    id: "sunnyvale-library",
    name: "Sunnyvale Public Library",
    jurisdiction: "Sunnyvale, CA",
    kind: "library",
    adapter: "civicengage",
    homepageUrl: "https://www.library.sunnyvale.ca.gov",
    // The library is a city department, so it carries the city mark.
    logo: "/logos/sunnyvale.svg",
    // Same CivicEngage instance as the city calendar: the city republishes
    // every library event under category 19 with the SAME event id. The
    // shared namespace is what collapses those into one row.
    dedupeNamespace: "sunnyvale-civicengage",
    // Higher than the city so a library event is credited to the library.
    priority: 20,
    enabled: true,
    config: {
      calendarUrl: "https://www.library.sunnyvale.ca.gov/events/calendar-month-view",
      categoryId: "74",
    },
  },
  {
    id: "sunnyvale-libcal",
    name: "Sunnyvale Public Library (LibCal)",
    jurisdiction: "Sunnyvale, CA",
    kind: "library",
    adapter: "libcal",
    homepageUrl: "https://sunnyvale.libcal.com",
    logo: "/logos/sunnyvale.svg",
    // Separate namespace: LibCal ids are unrelated to CivicEngage ids.
    // Cross-platform duplicates need the fuzzy pass in dedupe.ts.
    dedupeNamespace: "sunnyvale-libcal",
    priority: 15,
    // Off until the listing URL is confirmed. See adapters/libcal.ts.
    enabled: false,
    config: {
      listingUrl: "https://sunnyvale.libcal.com/calendar",
    },
  },
];

export function enabledSources(): RegisteredSource[] {
  return SOURCES.filter((s) => s.enabled);
}
