import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  serial,
} from "drizzle-orm/pg-core";

/**
 * A publisher we ingest from. One row per calendar feed, not per city:
 * Sunnyvale publishes a city calendar and a library calendar from the same
 * CivicEngage instance, and they must stay separately attributable.
 */
export const sources = pgTable("sources", {
  id: text("id").primaryKey(), // e.g. "sunnyvale-city"
  name: text("name").notNull(), // "City of Sunnyvale"
  jurisdiction: text("jurisdiction").notNull(), // "Sunnyvale, CA"
  kind: text("kind").notNull(), // "city" | "library" | "parks" | "school-district"
  adapter: text("adapter").notNull(), // "civicengage" | "libcal"
  homepageUrl: text("homepage_url").notNull(),
  /** Path to the city's mark under /public/logos. Null falls back to a monogram. */
  logo: text("logo"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
});

/**
 * Physical place an event happens. Venues are shared across sources so that
 * "Sunnyvale Public Library, Program Room" is one place, not one per feed.
 */
export const venues = pgTable(
  "venues",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    lat: text("lat"),
    lon: text("lon"),
  },
  (t) => [uniqueIndex("venues_name_city_idx").on(t.name, t.city)],
);

/**
 * One occurrence of an event. A weekly storytime produces one row per week,
 * because that is what a person browsing "this Saturday" wants to see.
 *
 * dedupeKey is the identity of the occurrence across ALL sources. The city
 * calendar republishes every library event under its own category, so the
 * same occurrence arrives twice with the same upstream id. The key collapses
 * them into one row and `sourceIds` records everyone who published it.
 */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    slug: text("slug").notNull(),

    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),

    venueId: integer("venue_id").references(() => venues.id),
    locationText: text("location_text"),
    isOnline: boolean("is_online").notNull().default(false),

    // Two independent axes. audience drives the card's border color;
    // eventType is the 27-value library vocabulary, shown as text.
    eventType: text("event_type").notNull().default("uncategorized"),
    audience: text("audience").notNull().default("all"),

    // "publisher" when the source told us, "inferred" when we guessed from
    // the title. Recorded so the classifier's accuracy is measurable.
    typeSource: text("type_source").notNull().default("inferred"),
    audienceSource: text("audience_source").notNull().default("inferred"),

    cost: text("cost"),
    registrationUrl: text("registration_url"),

    // Provenance. primarySourceId is who we credit; sourceIds is everyone
    // who published this occurrence.
    primarySourceId: text("primary_source_id")
      .notNull()
      .references(() => sources.id),
    sourceIds: text("source_ids").array().notNull(),
    canonicalUrl: text("canonical_url").notNull(),

    cancelled: boolean("cancelled").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [
    uniqueIndex("events_dedupe_key_idx").on(t.dedupeKey),
    uniqueIndex("events_slug_idx").on(t.slug),
    index("events_starts_at_idx").on(t.startsAt),
    index("events_event_type_idx").on(t.eventType),
    index("events_audience_idx").on(t.audience),
  ],
);

/**
 * One row per ingestion attempt per source. This is the operational record:
 * if the library feed silently stops returning events, the run log is where
 * you see it before users do.
 */
export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // "running" | "ok" | "failed"
  fetched: integer("fetched").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  unchanged: integer("unchanged").notNull().default(0),
  error: text("error"),
});
