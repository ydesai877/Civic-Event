import { createHash } from "node:crypto";
import type { RawEvent, SourceConfig } from "./types";
import {
  resolveAudience,
  resolveEventType,
  type Audience,
  type EventType,
  type TypeSource,
} from "./taxonomy";

export const TIMEZONE = "America/Los_Angeles";

export interface NormalizedEvent {
  dedupeKey: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  locationText: string | null;
  isOnline: boolean;
  eventType: EventType;
  audience: Audience;
  typeSource: TypeSource;
  audienceSource: TypeSource;
  cancelled: boolean;
  canonicalUrl: string;
  primarySourceId: string;
  sourceIds: string[];
  contentHash: string;
}

/* ------------------------------------------------------------------ time */

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Turn a wall-clock time in `timeZone` into a real instant.
 *
 * Two passes: the first offset is looked up at the naive instant, the second
 * at the corrected one. That resolves the spring-forward and fall-back cases
 * where the offset changes between the two.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = TIMEZONE,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let offset = zoneOffsetMs(new Date(naive), timeZone);
  offset = zoneOffsetMs(new Date(naive - offset), timeZone);
  return new Date(naive - offset);
}

/** "6:30 PM" | "6 PM" | "10:30 AM" | "Noon" -> minutes past midnight */
export function parseTimeText(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (text.includes("all day")) return null;
  if (text === "noon") return 12 * 60;
  if (text === "midnight") return 0;

  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (!m) return null;

  let hour = Number(m[1]) % 12;
  if (m[3] === "pm") hour += 12;
  return hour * 60 + Number(m[2] ?? 0);
}

/* ------------------------------------------------------------------ misc */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/**
 * Branch codes the library uses as title prefixes, mapped to venue names a
 * reader recognizes. An unmapped code is passed through unchanged, so a new
 * branch shows up as its code rather than disappearing.
 */
const BRANCH_NAMES: Record<string, string> = {
  MAIN: "Sunnyvale Public Library",
  LIBRARY: "Sunnyvale Public Library",
};

/** Prefixes that describe the event, not where it happens. */
const NON_BRANCH_PREFIXES = new Set([
  "ONLINE",
  "RESCHEDULED",
  "CANCELED",
  "CANCELLED",
  "NEW",
  "POSTPONED",
  "SOLD OUT",
]);

/**
 * Library titles arrive prefixed with their delivery channel: "MAIN: Sewing
 * Lab", "ONLINE: Monthly Book Group", "RESCHEDULED: Info Session". The prefix
 * is real information, but it belongs in structured fields, not in the
 * display title.
 */
export function stripChannelPrefix(title: string): {
  title: string;
  isOnline: boolean;
  branch: string | null;
} {
  const m = title.match(/^([A-Z][A-Z .&'-]{1,24}):\s*(.+)$/);
  if (!m) return { title, isOnline: /\(online\)/i.test(title), branch: null };

  const channel = m[1].trim();
  const rest = m[2].trim();
  const online = channel === "ONLINE" || /\(online\)/i.test(rest);

  if (NON_BRANCH_PREFIXES.has(channel)) {
    return { title: rest, isOnline: online, branch: null };
  }

  return {
    title: rest,
    isOnline: online,
    branch: online ? null : (BRANCH_NAMES[channel] ?? channel),
  };
}

export function detectCancelled(title: string): boolean {
  return /\b(canceled|cancelled)\b/i.test(title);
}

/* ------------------------------------------------------------- normalize */

export interface NormalizeOptions {
  source: SourceConfig;
  /**
   * Sources that share an upstream id space. Sunnyvale's city and library
   * calendars are two views of one CivicEngage event store, so they use the
   * same namespace and the same event id resolves to one row.
   */
  dedupeNamespace: string;
  /** Assumed length when the publisher gives a start time and no end. */
  defaultDurationMinutes?: number;
}

export function normalizeEvent(raw: RawEvent, opts: NormalizeOptions): NormalizedEvent | null {
  const [y, mo, d] = raw.date.split("-").map(Number);
  if (!y || !mo || !d) return null;

  const startMinutes = parseTimeText(raw.timeText);
  const allDay = startMinutes === null;

  const startsAt = allDay
    ? zonedToUtc(y, mo, d, 0, 0)
    : zonedToUtc(y, mo, d, Math.floor(startMinutes / 60), startMinutes % 60);

  const endMinutes = raw.endTimeText ? parseTimeText(raw.endTimeText) : null;
  const endsAt = allDay
    ? zonedToUtc(y, mo, d, 23, 59)
    : endMinutes !== null
      ? zonedToUtc(y, mo, d, Math.floor(endMinutes / 60), endMinutes % 60)
      : new Date(startsAt.getTime() + (opts.defaultDurationMinutes ?? 90) * 60_000);

  const cleaned = stripChannelPrefix(raw.title);
  const title = cleaned.title.replace(/\s*[-–]?\s*(canceled|cancelled)\s*$/i, "").trim();

  const dedupeKey = `${opts.dedupeNamespace}:${raw.externalId}:${raw.date}`;
  const slug = `${slugify(title)}-${raw.date}-${raw.externalId}`;

  const locationText = raw.locationText ?? cleaned.branch;

  // Classify on the raw title, not the cleaned one: "MAIN: Teens Create" says
  // teens, and stripping the prefix must not cost us the rest of the signal.
  const { eventType, typeSource } = resolveEventType(
    raw.title,
    raw.description,
    raw.publisherTypes,
  );
  const { audience, audienceSource } = resolveAudience(raw.title, raw.publisherAudience);

  const contentHash = createHash("sha256")
    .update(
      JSON.stringify([
        title,
        startsAt.toISOString(),
        endsAt?.toISOString() ?? null,
        raw.description ?? null,
        locationText ?? null,
        raw.url,
        eventType,
        audience,
        detectCancelled(raw.title),
      ]),
    )
    .digest("hex")
    .slice(0, 32);

  return {
    dedupeKey,
    slug,
    title,
    description: raw.description ?? null,
    startsAt,
    endsAt,
    allDay,
    locationText,
    isOnline: cleaned.isOnline,
    eventType,
    audience,
    typeSource,
    audienceSource,
    cancelled: detectCancelled(raw.title),
    canonicalUrl: raw.url,
    primarySourceId: opts.source.id,
    sourceIds: [opts.source.id],
    contentHash,
  };
}
