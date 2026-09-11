import Link from "next/link";
import { CityLogo } from "./CityLogo";
import {
  audienceClass,
  audienceLabel,
  eventTypeLabel,
  formatTimeRange,
  KIND_LABELS,
} from "@/lib/format";

export interface EventCardProps {
  slug: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  eventType: string;
  audience: string;
  locationText: string | null;
  isOnline: boolean;
  cancelled: boolean;
  sourceName: string;
  sourceKind: string;
  jurisdiction: string;
  sourceLogo: string | null;
  sourceIds: string[];
}

/**
 * One event row: city mark, then what it is, then when.
 *
 * The colored bar down the left edge is the audience. It is decorative —
 * the row also names its audience in text, so the color carries nothing a
 * reader can only get by seeing it.
 */
export function EventCard(e: EventCardProps) {
  const place = e.isOnline ? "Online" : (e.locationText ?? e.jurisdiction);
  const publisher = KIND_LABELS[e.sourceKind] ?? e.sourceName;

  // The month grid publishes no description, so the classified facts stand
  // in until detail-page enrichment lands.
  const summary = e.description ?? `${eventTypeLabel(e.eventType)} · ${place}`;

  return (
    <li className={`${audienceClass(e.audience)} border-b border-[var(--border)] last:border-b-0`}>
      <Link
        href={`/events/${e.slug}`}
        className="group flex items-stretch gap-3 border-l-[3px] bg-[var(--surface)] px-3 py-3 transition-colors hover:bg-[var(--accent-soft)] sm:gap-4 sm:px-4 sm:py-4"
        style={{ borderLeftColor: "var(--aud)" }}
      >
        <CityLogo logo={e.sourceLogo} jurisdiction={e.jurisdiction} />

        <div className="min-w-0 flex-1">
          <h3
            className={`leading-snug font-medium group-hover:underline ${
              e.cancelled ? "text-[var(--muted)] line-through" : ""
            }`}
          >
            {e.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{summary}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
            {e.cancelled && (
              <span className="rounded-full bg-[var(--warn-soft)] px-2 py-0.5 font-medium text-[var(--warn)]">
                Canceled
              </span>
            )}
            <span
              className={e.audience === "all" ? "font-medium" : "font-medium text-[var(--aud)]"}
            >
              {audienceLabel(e.audience)}
            </span>
            <span aria-hidden>·</span>
            <span
              title={
                e.sourceIds.length > 1
                  ? `Published on ${e.sourceIds.length} official calendars`
                  : undefined
              }
            >
              {publisher}
            </span>
          </p>
        </div>

        <time
          dateTime={e.startsAt.toISOString()}
          className="flex w-[74px] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--border)] pl-2 text-center text-xs tabular-nums text-[var(--muted)] sm:w-28 sm:pl-3 sm:text-sm"
        >
          {splitRange(formatTimeRange(e.startsAt, e.endsAt, e.allDay)).map((line, i) => (
            <span key={line} className={i === 0 ? "font-medium text-[var(--text)]" : undefined}>
              {line}
            </span>
          ))}
        </time>
      </Link>
    </li>
  );
}

/**
 * "9:00 – 10:30 AM" -> ["9:00 AM", "10:30 AM"] so the narrow right column
 * stacks start over end instead of wrapping mid-range. The meridiem the
 * range shares has to be put back on the start.
 */
function splitRange(range: string): string[] {
  const parts = range.split(" – ");
  if (parts.length !== 2) return [range];

  const [start, end] = parts;
  const meridiem = end.slice(-2);
  return [/[AP]M$/.test(start) ? start : `${start} ${meridiem}`, end];
}
