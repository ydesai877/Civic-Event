"use client";

import { useEffect, useMemo, useState } from "react";
import { EventCard } from "./EventCard";
import { EMPTY_FILTERS, Filters, type Facet, type FilterState } from "./Filters";
import type { EventWithSource } from "@/lib/events";
import { dayKey, formatDayHeading, pacificDayOfWeek, startOfDayPacific } from "@/lib/format";

/**
 * The whole feed, filtered in the browser.
 *
 * Every upcoming event ships in the page, so filtering is a array pass rather
 * than a round trip. That is only reasonable because the dataset is tiny —
 * about 9 KB gzipped for Sunnyvale. Revisit when it stops being tiny.
 */

interface Parsed extends EventWithSource {
  start: Date;
  end: Date | null;
  haystack: string;
}

function windowFor(when: string): { from: Date; to?: Date } {
  const now = new Date();

  switch (when) {
    case "today":
      return { from: startOfDayPacific(now), to: startOfDayPacific(now, 1) };
    case "week":
      return { from: now, to: startOfDayPacific(now, 7) };
    case "weekend": {
      const daysToSaturday = (6 - pacificDayOfWeek(now) + 7) % 7;
      return {
        from: startOfDayPacific(now, daysToSaturday),
        to: startOfDayPacific(now, daysToSaturday + 2),
      };
    }
    default:
      return { from: now };
  }
}

/** Count each facet with its own filter lifted, so no chip reads zero. */
function countBy(rows: Parsed[], pick: (r: Parsed) => string): Facet[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = pick(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

const AUDIENCE_ORDER = ["kids", "teens", "adults", "all"];

export function EventFeed({ events }: { events: EventWithSource[] }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // "Today" and "Tomorrow" depend on when the page is VIEWED, but the HTML is
  // generated when the site is BUILT. Rendering them only after mount keeps
  // the first paint identical to the pre-rendered markup.
  const [mounted, setMounted] = useState(false);

  // Read filters out of the URL once, so a filtered link can be shared.
  useEffect(() => {
    setMounted(true);
    const p = new URLSearchParams(window.location.search);
    if (![...p.keys()].length) return;

    setFilters({
      q: p.get("q") ?? "",
      when: p.get("when") ?? "upcoming",
      audience: p.get("audience"),
      kind: p.get("kind"),
      type: p.get("type"),
      inPersonOnly: p.get("online") === "0",
    });
  }, []);

  // Mirror filters back into the URL without adding history entries.
  useEffect(() => {
    if (!mounted) return;
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.when !== "upcoming") p.set("when", filters.when);
    if (filters.audience) p.set("audience", filters.audience);
    if (filters.kind) p.set("kind", filters.kind);
    if (filters.type) p.set("type", filters.type);
    if (filters.inPersonOnly) p.set("online", "0");

    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filters, mounted]);

  const parsed = useMemo<Parsed[]>(
    () =>
      events.map((e) => ({
        ...e,
        start: new Date(e.startsAt),
        end: e.endsAt ? new Date(e.endsAt) : null,
        haystack: `${e.title} ${e.description ?? ""} ${e.locationText ?? ""}`.toLowerCase(),
      })),
    [events],
  );

  // Each predicate is separate so a facet's own filter can be lifted when
  // counting it. Without that, every unselected chip in the active row shows 0.
  const { visible, audiences, types, kinds } = useMemo(() => {
    const { from, to } = windowFor(filters.when);
    const needle = filters.q.trim().toLowerCase();

    const inWindow = (r: Parsed) =>
      (r.end ?? r.start).getTime() >= from.getTime() &&
      (!to || r.start.getTime() < to.getTime());
    const matchesQuery = (r: Parsed) => !needle || r.haystack.includes(needle);
    const matchesOnline = (r: Parsed) => !filters.inPersonOnly || !r.isOnline;
    const matchesAudience = (r: Parsed) => !filters.audience || r.audience === filters.audience;
    const matchesKind = (r: Parsed) => !filters.kind || r.sourceKind === filters.kind;
    const matchesType = (r: Parsed) => !filters.type || r.eventType === filters.type;

    const base = parsed.filter((r) => inWindow(r) && matchesQuery(r) && matchesOnline(r));

    const audienceFacets = countBy(
      base.filter((r) => matchesKind(r) && matchesType(r)),
      (r) => r.audience,
    ).sort((a, b) => AUDIENCE_ORDER.indexOf(a.value) - AUDIENCE_ORDER.indexOf(b.value));

    return {
      visible: base.filter((r) => matchesAudience(r) && matchesKind(r) && matchesType(r)),
      audiences: audienceFacets,
      kinds: countBy(base.filter((r) => matchesAudience(r) && matchesType(r)), (r) => r.sourceKind),
      types: countBy(base.filter((r) => matchesAudience(r) && matchesKind(r)), (r) => r.eventType),
    };
  }, [parsed, filters]);

  const groups = useMemo(() => {
    const byDay = new Map<string, Parsed[]>();
    for (const r of visible) {
      const key = dayKey(r.start);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    return [...byDay.entries()];
  }, [visible]);

  return (
    <div className="space-y-6">
      <Filters
        value={filters}
        onChange={setFilters}
        audiences={audiences}
        types={types}
        kinds={kinds}
      />

      <section>
        <p className="mb-4 text-sm text-[var(--muted)]">
          {visible.length} {visible.length === 1 ? "event" : "events"}
        </p>

        {visible.length === 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--muted)]">
            <p>No events match those filters.</p>
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-2 text-sm text-[var(--accent)] underline-offset-4 hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(([key, dayRows]) => (
              <section key={key}>
                <h2 className="sticky top-0 z-10 rounded-t-lg border border-b-0 border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-xs font-semibold tracking-wide uppercase">
                  {formatDayHeading(dayRows[0].start, mounted)}
                </h2>
                <ul className="overflow-hidden rounded-b-lg border border-[var(--border)]">
                  {dayRows.map((e) => (
                    <EventCard key={e.slug} {...e} startsAt={e.start} endsAt={e.end} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
