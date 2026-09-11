/**
 * Rebuild the HTML fixtures from the captured rows.
 *
 * The generated markup follows the CivicEngage contract observed on the live
 * sites: table.calendar > td.calendar_day_with_items[aria-label] >
 * div.calendar_item > span.calendar_eventtime + a.calendar_eventlink.
 *
 * Regenerating the HTML rather than storing a 400 KB page keeps the fixture
 * readable, but it means the fixture proves the parser against the *contract*,
 * not against every quirk of the live page. Re-capture a real page before
 * trusting a parser change in production.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CITY_ONLY_ROWS,
  LIBRARY_ROWS,
  MONTH,
  YEAR,
  parseRows,
  type CapturedRow,
} from "../fixtures/captured";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMonthGrid(rows: CapturedRow[], categoryId: string): string {
  const byDay = new Map<number, CapturedRow[]>();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day)!.push(r);
  }

  const cells = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, dayRows]) => {
      const weekday = WEEKDAYS[new Date(YEAR, MONTH - 1, day).getDay()];
      const label = `Scheduled events, ${weekday}, ${MONTH_NAMES[MONTH - 1]} ${day}, ${YEAR}`;
      const items = dayRows
        .map(
          (r) => `
        <div class="calendar_item">
          <span class="calendar_eventtime">${escapeHtml(r.timeText)}</span>
          <a class="calendar_eventlink" href="/Home/Components/Calendar/Event/${r.eventId}/${categoryId}">${escapeHtml(r.title)}</a>
        </div>`,
        )
        .join("");

      return `
    <td class="calendar_day calendar_day_with_items" aria-label="${escapeHtml(label)}" tabindex="0">
      <span class="calendar_daynumber">${day}</span>
      <div class="calendar_items">${items}
      </div>
    </td>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Events Calendar</title></head>
<body>
<div class="responsive-table-scroll left_scroll">
  <table id="events_calendar_table_50_1681_151" class="calendar calendar_grid">
    <caption>Event dates for ${MONTH_NAMES[MONTH - 1]} ${YEAR}</caption>
    <tbody>
      <tr>${cells}
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>
`;
}

mkdirSync(fixturesDir, { recursive: true });

const library = parseRows(LIBRARY_ROWS);
const cityOnly = parseRows(CITY_ONLY_ROWS);
// The city calendar carries its own events plus every library event.
const city = [...cityOnly, ...library];

writeFileSync(join(fixturesDir, "library-2026-09.html"), buildMonthGrid(library, "74"));
writeFileSync(join(fixturesDir, "city-2026-09.html"), buildMonthGrid(city, "19"));

console.log(
  `Wrote fixtures: library ${library.length} items, city ${city.length} items (${cityOnly.length} city-only + ${library.length} republished)`,
);
