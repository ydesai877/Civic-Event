/**
 * The contract every source adapter satisfies.
 *
 * An adapter knows one publishing platform, not one city. Sunnyvale's city
 * site and its library site both run CivicEngage, so one adapter reads both.
 * Adding Mountain View, which also runs CivicEngage, is a config row.
 */

export type SourceKind = "city" | "library" | "parks" | "school-district";

export interface SourceConfig {
  id: string;
  name: string;
  jurisdiction: string;
  kind: SourceKind;
  adapter: string;
  homepageUrl: string;
  /** Path to the jurisdiction's mark under /public/logos, if we have one. */
  logo?: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
}

/**
 * What an adapter returns. Deliberately close to the wire format: no
 * timezone maths, no category mapping. Normalization happens in one place
 * so every source is treated the same way.
 */
export interface RawEvent {
  /** Stable id from the publisher. Must not change between runs. */
  externalId: string;
  title: string;
  /** Local date, YYYY-MM-DD, in the source's timezone. */
  date: string;
  /** Local start time as published, e.g. "6:30 PM". Empty means all day. */
  timeText: string;
  url: string;
  description?: string;
  locationText?: string;
  endTimeText?: string;

  /**
   * The publisher's own words, passed through untranslated. Mapping them to
   * the canonical vocabulary is the normalizer's job, not the adapter's, so
   * that a new city's vocabulary is one table edit rather than adapter code.
   */
  publisherTypes?: string[];
  publisherAudience?: string;
}

export interface FetchContext {
  /** Months of lookahead to crawl. */
  monthsAhead: number;
  fetchHtml: (url: string) => Promise<string>;
}

export interface SourceAdapter {
  name: string;
  fetchEvents(source: SourceConfig, ctx: FetchContext): Promise<RawEvent[]>;
}
