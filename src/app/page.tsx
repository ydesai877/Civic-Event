import { EventFeed } from "@/components/EventFeed";
import { loadEvents } from "@/lib/load-events";

export default function HomePage() {
  // Runs once, at build time. Every upcoming event ships inside the page.
  const events = loadEvents();

  return (
    <div className="space-y-6">
      {/* The page leads with the search bar; the masthead already says what
          this is. The heading stays for screen readers and search engines. */}
      <h1 className="sr-only">Upcoming official events in Sunnyvale, California</h1>

      <EventFeed events={events} />
    </div>
  );
}
