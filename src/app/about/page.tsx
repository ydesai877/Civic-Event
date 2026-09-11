import Link from "next/link";
import { loadEventsFile } from "@/lib/load-events";

export default function AboutPage() {
  const file = loadEventsFile();
  const inferred = file.events.filter((e) => e.typeSource === "inferred").length;

  return (
    <div className="max-w-2xl space-y-8">
      <Link href="/" className="text-sm text-[var(--muted)] underline-offset-4 hover:underline">
        ← All events
      </Link>

      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">How this works</h1>
        <p className="leading-relaxed">
          Meetup and Eventbrite show you what anyone chose to post. This site shows you only what
          the city and its library have officially scheduled. Nothing here is user-submitted, and
          nothing is promoted.
        </p>
        <p className="leading-relaxed">
          A job reads each official calendar twice a day, converts what it finds into one shape,
          and merges duplicates. The city calendar republishes every library event, so most library
          programs arrive twice; they appear here once, credited to the library.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sources</h2>
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4">
          {file.sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 py-3">
              <a
                href={s.homepageUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline-offset-4 hover:underline"
              >
                {s.name}
              </a>
              <span className="text-sm text-[var(--muted)]">{s.jurisdiction}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Last update</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
          <dt className="text-[var(--muted)]">Checked</dt>
          <dd>
            {file.events.length === 0
              ? "Never"
              : new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/Los_Angeles",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(file.generatedAt))}
          </dd>

          <dt className="text-[var(--muted)]">Upcoming events</dt>
          <dd>{file.events.length}</dd>

          {file.runs.map((r) => (
            <ReadRow key={r.sourceId} label={r.sourceId} value={r.error ?? `${r.fetched} read`} />
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">About the labels</h2>
        <p className="leading-relaxed">
          Where a publisher labels its own events, this site uses that label. Where it does not,
          the type is worked out from the title and marked <em>(inferred)</em> on the event page.
          Right now {inferred} of {file.events.length} upcoming events are inferred.
        </p>
      </section>
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
