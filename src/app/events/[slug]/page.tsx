import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEvents, loadEventsFile } from "@/lib/load-events";
import {
  audienceClass,
  audienceLabel,
  eventTypeLabel,
  formatDayHeading,
  formatTimeRange,
  KIND_LABELS,
} from "@/lib/format";

/**
 * One pre-rendered HTML file per event. `generateStaticParams` is what tells
 * the static export which pages to write; anything not listed here does not
 * exist in the output.
 */
export function generateStaticParams() {
  return loadEvents().map((e) => ({ slug: e.slug }));
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = loadEvents().find((e) => e.slug === slug);
  if (!event) notFound();

  const sourcesById = new Map(loadEventsFile().sources.map((s) => [s.id, s]));
  const publishers = event.sourceIds
    .map((id) => sourcesById.get(id)?.name)
    .filter((n): n is string => Boolean(n));

  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;

  return (
    <article className="max-w-2xl space-y-6">
      <Link href="/" className="text-sm text-[var(--muted)] underline-offset-4 hover:underline">
        ← All events
      </Link>

      <header className="space-y-2">
        {event.cancelled && (
          <p className="inline-block rounded-full bg-[var(--warn-soft)] px-3 py-1 text-sm font-medium text-[var(--warn)]">
            This event is canceled
          </p>
        )}
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">{event.title}</h1>
        <p className="text-[var(--muted)]">
          {/* No relative label: this page is built once and read later. */}
          {formatDayHeading(startsAt, false)} ·{" "}
          {formatTimeRange(startsAt, endsAt, event.allDay)}
        </p>
      </header>

      <dl className="grid grid-cols-[8rem_1fr] gap-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
        <Row label="Where">
          {event.isOnline ? "Online" : (event.locationText ?? event.jurisdiction)}
        </Row>
        <Row label="Event type">
          {eventTypeLabel(event.eventType)}
          {event.typeSource === "inferred" && <Guessed />}
        </Row>
        <Row label="Who it's for">
          <span className={audienceClass(event.audience)}>
            <span
              aria-hidden
              className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ background: "var(--aud)" }}
            />
            {audienceLabel(event.audience)}
          </span>
          {event.audienceSource === "inferred" && <Guessed />}
        </Row>
        <Row label="Published by">
          {publishers.length > 0
            ? publishers.join(" and ")
            : (KIND_LABELS[event.sourceKind] ?? event.sourceName)}
        </Row>
      </dl>

      {event.description && (
        <div className="leading-relaxed whitespace-pre-line">{event.description}</div>
      )}

      <a
        href={event.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[var(--bg)] hover:opacity-90"
      >
        Open the official page
      </a>

      <p className="text-sm text-[var(--muted)]">
        Times, locations and cancellations can change after we read them. The official page is
        always right.
      </p>
    </article>
  );
}

/**
 * Marks a value this site worked out from the title rather than read from the
 * publisher. Better to admit the guess than to present it as a fact.
 */
function Guessed() {
  return (
    <span
      className="ml-2 text-xs text-[var(--muted)]"
      title="The publisher does not label this event, so we inferred it from the title."
    >
      (inferred)
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
