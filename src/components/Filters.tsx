"use client";

import { useState } from "react";
import { audienceClass, audienceLabel, eventTypeLabel, KIND_LABELS } from "@/lib/format";

export interface FilterState {
  q: string;
  when: string;
  audience: string | null;
  kind: string | null;
  type: string | null;
  inPersonOnly: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  q: "",
  when: "upcoming",
  audience: null,
  kind: null,
  type: null,
  inPersonOnly: false,
};

export interface Facet {
  value: string;
  count: number;
}

/** Beyond this many type chips, the row becomes a wall. The rest hide. */
const TYPES_SHOWN = 10;

export function Filters({
  value,
  onChange,
  audiences,
  types,
  kinds,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  audiences: Facet[];
  types: Facet[];
  kinds: Facet[];
}) {
  const [showAllTypes, setShowAllTypes] = useState(false);
  // On a phone the facet rows fill the whole first screen and push the events
  // below the fold, so they start collapsed there and stay open on wider ones.
  const [showFacets, setShowFacets] = useState(false);
  const [draftQuery, setDraftQuery] = useState(value.q);

  const set = <K extends keyof FilterState>(key: K, next: FilterState[K]) =>
    onChange({ ...value, [key]: next });

  const activeCount = [value.audience, value.kind, value.type, value.inPersonOnly || null].filter(
    Boolean,
  ).length;

  // An active type outside the visible slice must still show, or the filter
  // looks like it turned itself off.
  const visibleTypes =
    showAllTypes || types.length <= TYPES_SHOWN
      ? types
      : [
          ...types.slice(0, TYPES_SHOWN),
          ...types.slice(TYPES_SHOWN).filter((t) => t.value === value.type),
        ];

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", draftQuery.trim());
        }}
      >
        <input
          name="q"
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder="Search events"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:border-[var(--accent)]"
        >
          Search
        </button>
      </form>

      <FilterRow label="When">
        {[
          ["upcoming", "Upcoming"],
          ["today", "Today"],
          ["weekend", "This weekend"],
          ["week", "Next 7 days"],
        ].map(([v, label]) => (
          <Chip key={v} active={value.when === v} onClick={() => set("when", v)}>
            {label}
          </Chip>
        ))}
      </FilterRow>

      <button
        type="button"
        onClick={() => setShowFacets((v) => !v)}
        aria-expanded={showFacets}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm sm:hidden"
      >
        <span className="font-medium">
          Filters
          {activeCount > 0 && (
            <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
              {activeCount}
            </span>
          )}
        </span>
        <span aria-hidden className="text-[var(--muted)]">
          {showFacets ? "Hide" : "Show"}
        </span>
      </button>

      <div className={`${showFacets ? "space-y-4" : "hidden"} sm:block sm:space-y-4`}>
        <FilterRow label="Who it's for">
          <Chip active={!value.audience} onClick={() => set("audience", null)}>
            Everyone
          </Chip>
          {audiences.map((a) => (
            <Chip
              key={a.value}
              active={value.audience === a.value}
              onClick={() => set("audience", value.audience === a.value ? null : a.value)}
              swatchClass={a.value === "all" ? undefined : audienceClass(a.value)}
            >
              {audienceLabel(a.value)} <Count>{a.count}</Count>
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Published by">
          <Chip active={!value.kind} onClick={() => set("kind", null)}>
            All
          </Chip>
          {kinds.map((k) => (
            <Chip
              key={k.value}
              active={value.kind === k.value}
              onClick={() => set("kind", value.kind === k.value ? null : k.value)}
            >
              {KIND_LABELS[k.value] ?? k.value} <Count>{k.count}</Count>
            </Chip>
          ))}
          <Chip
            active={value.inPersonOnly}
            onClick={() => set("inPersonOnly", !value.inPersonOnly)}
          >
            In person only
          </Chip>
        </FilterRow>

        <FilterRow label="Event type">
          <Chip active={!value.type} onClick={() => set("type", null)}>
            All
          </Chip>
          {visibleTypes.map((t) => (
            <Chip
              key={t.value}
              active={value.type === t.value}
              onClick={() => set("type", value.type === t.value ? null : t.value)}
            >
              {eventTypeLabel(t.value)} <Count>{t.count}</Count>
            </Chip>
          ))}
          {types.length > TYPES_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAllTypes((v) => !v)}
              className="px-2 py-1 text-sm text-[var(--muted)] underline-offset-4 hover:underline"
            >
              {showAllTypes ? "Show fewer" : `+${types.length - TYPES_SHOWN} more`}
            </button>
          )}
        </FilterRow>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-24 shrink-0 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  swatchClass,
  children,
}: {
  active: boolean;
  onClick: () => void;
  swatchClass?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${swatchClass ?? ""} inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
      }`}
    >
      {swatchClass && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--aud)" }}
        />
      )}
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 text-xs text-[var(--muted)]">{children}</span>;
}
