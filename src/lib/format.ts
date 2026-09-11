export const TZ = "America/Los_Angeles";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
});

const shortDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
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
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});

  return (
    Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) -
    instant.getTime()
  );
}

/**
 * Midnight Pacific on the day `ref` falls on, as a real instant. Two passes
 * so the DST changeover days land on the right hour.
 */
export function startOfDayPacific(ref: Date = new Date(), dayOffset = 0): Date {
  const [y, m, d] = dayKey(ref).split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d + dayOffset);
  let off = zoneOffsetMs(new Date(naive), TZ);
  off = zoneOffsetMs(new Date(naive - off), TZ);
  return new Date(naive - off);
}

/** 0 = Sunday, in Pacific time. */
export function pacificDayOfWeek(ref: Date = new Date()): number {
  const [y, m, d] = dayKey(ref).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "2026-09-01" in Pacific time, for grouping. */
export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * "Today" and "Tomorrow" depend on when the page is read, not when it was
 * built, so a statically generated page must not bake them in. Callers pass
 * `relative: false` for the first paint and `true` once the browser has taken
 * over.
 */
export function formatDayHeading(d: Date, relative = true): string {
  if (!relative) return dayFmt.format(d);

  const key = dayKey(d);
  if (key === dayKey(new Date())) return `Today · ${dayFmt.format(d)}`;
  if (key === dayKey(new Date(Date.now() + 86_400_000))) return `Tomorrow · ${dayFmt.format(d)}`;

  return dayFmt.format(d);
}

export function formatShortDay(d: Date): string {
  return shortDayFmt.format(d);
}

/**
 * "9:00 – 10:30 AM" when both ends share a meridiem, "11:00 AM – 12:30 PM"
 * when they do not. The repeated AM is noise in a dense list.
 */
export function formatTimeRange(start: Date, end: Date | null, allDay: boolean): string {
  if (allDay) return "All day";
  if (!end) return timeFmt.format(start);

  const a = timeFmt.format(start);
  const b = timeFmt.format(end);
  const aMeridiem = a.slice(-2);

  return aMeridiem === b.slice(-2)
    ? `${a.slice(0, -3)} – ${b}`
    : `${a} – ${b}`;
}

export {
  AUDIENCE_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  AUDIENCES,
  type Audience,
  type EventType,
} from "@/ingest/taxonomy";

import { AUDIENCE_LABELS, EVENT_TYPE_LABELS, type Audience, type EventType } from "@/ingest/taxonomy";

export function eventTypeLabel(t: string | null | undefined): string {
  if (!t) return EVENT_TYPE_LABELS.uncategorized;
  return EVENT_TYPE_LABELS[t as EventType] ?? t;
}

export function audienceLabel(a: string | null | undefined): string {
  if (!a) return AUDIENCE_LABELS.all;
  return AUDIENCE_LABELS[a as Audience] ?? a;
}

/** Maps to the .aud-* classes in globals.css, which set --aud. */
export function audienceClass(a: string | null | undefined): string {
  const known = ["kids", "teens", "adults", "all"];
  return `aud-${known.includes(a ?? "") ? a : "all"}`;
}

export const KIND_LABELS: Record<string, string> = {
  city: "City",
  library: "Library",
  parks: "Parks",
  "school-district": "Schools",
};
