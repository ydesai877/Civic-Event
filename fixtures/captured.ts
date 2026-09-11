/**
 * Real events captured from the live Sunnyvale calendars on 2026-08-31,
 * for September 2026. Format: "day|time|eventId|title".
 *
 * These exist so the parser, the normalizer and the deduper can be exercised
 * against real data — real titles, real ids, real all-day rows, a real
 * cancellation — without a live HTTP round trip.
 *
 * The overlap between the two lists is the point: the city calendar
 * republishes every library event under category 19 with the same event id.
 */

export const YEAR = 2026;
export const MONTH = 9;

/** Category 74, www.library.sunnyvale.ca.gov */
export const LIBRARY_ROWS = `
1|11 AM|12334|MAIN: Toddler Storytime
1|11 AM|12547|ONLINE: The Democracy We Must Keep with Historian David O. Stewart
2|10 AM|12841|MAIN: Sewing Lab
2|11 AM|12336|MAIN: Preschool Storytime
2|2 PM|12106|MAIN: Get Connected
2|6:30 PM|12549|MAIN: Silent Book Club
3|10:30 AM|12338|MAIN: Baby Lapsit & Playtime
3|11 AM|12553|ONLINE: Authentic Family-Style Cooking with Jenny Martinez
3|5 PM|12379|MAIN: Teens Create: Mini Libraries
3|7 PM|12371|MAIN: Night Owl Storytime
4|10 AM|12214|MAIN: Yarn Lab
4|11 AM|12381|Storytime at Magical Bridge Playground
4|4 PM|12383|MAIN: East Bay Vivarium
5|10:30 AM|12557|MAIN: Bike Safety Information and Repair Workshop
5|11 AM|12340|MAIN: Family Storytime
5|3 PM|12385|MAIN: Decorate a playhouse
6|2 PM|12575|MAIN: Mindfulness Practice
7||10269|Library Closed
8|11 AM|12368|MAIN: Toddler Storytime
8|2 PM|12630|RESCHEDULED: Level Up Adult Literacy Info Session
8|4 PM|12387|MAIN: Lego Builders
8|4 PM|12632|ONLINE: Author Talk with a 2026 Pulitzer Prize Winner
9|10 AM|12840|MAIN: Sewing Lab
9|11 AM|12364|MAIN: Preschool Storytime
9|2 PM|12105|MAIN: Get Connected
9|3 PM|9820|Free Tenant-Landlord Counseling
9|3 PM|12735|MAIN: Sensory Storytime
9|6 PM|12967|MAIN: Home Repair Workshop: Basic Plumbing
10|10:30 AM|12360|MAIN: Baby Lapsit & Playtime
10|5 PM|12389|MAIN: Teen Volunteer Club with Silicon Valley Bike Exchange
10|6 PM|12634|MAIN: Adults Create: Sewing by Hand
10|7 PM|12377|MAIN: Night Owl Storytime
11|11 AM|12551|MAIN: Bilingual Hebrew-English Storytime
11|2 PM|12636|MAIN: Kickstart Your Solo Travel Life
12|10:30 AM|12729|MAIN: Master Gardeners: The Mysteries of Purple Veggies
12|11 AM|12357|MAIN: Family Storytime
13|2 PM|12391|MAIN: Mid-Autumn Festival Storytime and Craft
14|11 AM|12393|MAIN: ASL for Babies
14|2 PM|12638|ONLINE: ESL Conversation Group
14|4 PM|12555|MAIN: National Library Card Sign Up Month
15|11 AM|12367|MAIN: Toddler Storytime
15|1 PM|12640|ONLINE: Building Better, Stronger Relationships with Priya Parker
15|3:30 PM|12395|MAIN: Paws to Read
16|10 AM|12839|MAIN: Sewing Lab
16|11 AM|12363|MAIN: Preschool Storytime
16|2 PM|12104|MAIN: Get Connected
16|4:30 PM|12397|ONLINE: Successfully Navigating College Admissions This Fall
16|7 PM|12642|ONLINE: Monthly Book Group
17|10:30 AM|12359|MAIN: Baby Lapsit & Playtime
17|11 AM|12646|ONLINE: Shifting from Surviving to Thriving with Yasmine Cheyenne
`.trim();

/** Category 19, www.sunnyvale.ca.gov — city-only programming. */
export const CITY_ONLY_ROWS = `
1|9 AM|12961|Sunnyvale Beam Celebration
1|6:30 PM|12901|Zumba
3|6:30 PM|12900|Zumba
4|7 PM|12286|Youth Drop-In Basketball
5|9 AM|11426|Sunnyvale Farmers' Market
7||283|City Holiday - Labor Day
8|6:30 PM|12899|Zumba
9|11 AM|12428|Parents Helping Parents
10|6:30 PM|12898|Zumba
11|7 PM|12287|Youth Drop-In Basketball
12|9 AM|11425|Sunnyvale Farmers' Market
12|10 AM|12943|SHD FitFest
13|10 AM|11857|Animal Assisted Happiness Farm
15|6:30 PM|12897|Zumba - Canceled
`.trim();

/**
 * The city calendar's own category per event, captured from its category
 * filter on 2026-08-31 for September 2026. The seven categories partition
 * the month exactly: 85 Library + 26 Recreation + 3 Forums + 1 Holiday = 115,
 * which matches the unfiltered grid.
 *
 * Library rows are all "Library Events (all)", which names the department
 * rather than the event, so they fall through to inference — see
 * NON_TYPE_CATEGORIES in taxonomy.ts.
 */
export const CITY_CATEGORY_BY_ID: Record<string, string> = {
  "283": "Holidays Observed",
  "9820": "Recreation & Community",
  "11425": "Recreation & Community",
  "11426": "Recreation & Community",
  "11857": "Recreation & Community",
  "12286": "Recreation & Community",
  "12287": "Recreation & Community",
  "12428": "Recreation & Community",
  "12893": "Recreation & Community",
  "12894": "Recreation & Community",
  "12895": "Recreation & Community",
  "12896": "Recreation & Community",
  "12897": "Recreation & Community",
  "12898": "Recreation & Community",
  "12899": "Recreation & Community",
  "12900": "Recreation & Community",
  "12901": "Recreation & Community",
  "12943": "Recreation & Community",
  "12961": "Recreation & Community",
};

/** Everything the library posts sits under this one city category. */
export const LIBRARY_CITY_CATEGORY = "Library Events (all)";

export interface CapturedRow {
  day: number;
  timeText: string;
  eventId: string;
  title: string;
}

export function parseRows(block: string): CapturedRow[] {
  return block.split("\n").map((line) => {
    const [day, timeText, eventId, ...rest] = line.split("|");
    return {
      day: Number(day),
      timeText: timeText.trim(),
      eventId: eventId.trim(),
      title: rest.join("|").trim(),
    };
  });
}
