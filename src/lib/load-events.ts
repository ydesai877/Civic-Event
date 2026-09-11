import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_EVENTS_FILE, joinSources, type EventsFile, type EventWithSource } from "./events";

/**
 * Read `data/events.json` at build time.
 *
 * Called only from server components, which in this app run once during
 * `next build` and never again — the output is plain HTML and JSON on a CDN.
 */
export function loadEventsFile(): EventsFile {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "data", "events.json"), "utf8"));
  } catch {
    // A missing file means the scraper has not run yet. Build an empty site
    // rather than failing the build, so the first deploy still succeeds.
    console.warn("data/events.json not found — building an empty site.");
    return EMPTY_EVENTS_FILE;
  }
}

export function loadEvents(): EventWithSource[] {
  return joinSources(loadEventsFile());
}
