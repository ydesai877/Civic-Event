/**
 * The shared vocabulary.
 *
 * Two independent axes, because they answer different questions:
 *
 *   audience  — who is it for.   Four values. Drives the card's border color.
 *   eventType — what is it.      27 values. Shown as text on the card.
 *
 * The 27 types come from Sunnyvale Public Library's own facet list. They are
 * the canonical vocabulary for the whole site: every source maps into them,
 * whether or not its own platform uses the same words. A city that publishes
 * no types at all gets them inferred from the title.
 */

/* --------------------------------------------------------------- audience */

export const AUDIENCES = ["kids", "teens", "adults", "all"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  kids: "Kids",
  teens: "Teens",
  adults: "Adults",
  all: "All ages",
};

/** What publishers call each audience. Lowercased before lookup. */
const AUDIENCE_VOCABULARY: Record<string, Audience> = {
  children: "kids",
  child: "kids",
  kids: "kids",
  "kids & families": "kids",
  babies: "kids",
  toddlers: "kids",
  preschool: "kids",
  "elementary school": "kids",
  "school age": "kids",
  tweens: "kids",

  teens: "teens",
  teen: "teens",
  "young adult": "teens",
  "middle school": "teens",
  "high school": "teens",

  adults: "adults",
  adult: "adults",
  seniors: "adults",
  "older adults": "adults",
  "18+": "adults",

  "all ages": "all",
  everyone: "all",
  families: "all",
  "family": "all",
  general: "all",
  "all": "all",
};

export function mapPublisherAudience(raw: string | undefined | null): Audience | null {
  if (!raw) return null;
  return AUDIENCE_VOCABULARY[raw.trim().toLowerCase()] ?? null;
}

/**
 * Last resort: read the audience out of the title. Order matters — "Teen
 * Volunteer Club" is for teens, not volunteers in general, and "Adults
 * Create" is for adults even though "create" says nothing about age.
 */
export function inferAudience(title: string): Audience {
  const t = title.toLowerCase();
  if (/\bteens?\b|\byoung adults?\b|\btween\b/.test(t)) return "teens";
  if (/\bbab(y|ies)\b|\btoddlers?\b|\bpreschool\b|\bkids?\b|\bchildren\b|\blapsit\b|\bstorytime\b|\blego\b|\bpaws to read\b/.test(t))
    return "kids";
  if (/\badults?\b|\bseniors?\b|\b18\+\b/.test(t)) return "adults";
  return "all";
}

/* -------------------------------------------------------------- eventType */

export const EVENT_TYPES = [
  "academic-support",
  "artificial-intelligence",
  "book-sale",
  "books-authors",
  "career-business",
  "celebrations",
  "citizenship-immigration",
  "coding",
  "community-resources",
  "computer-help",
  "crafts-hobbies",
  "culture-traditions",
  "exhibit",
  "games-entertainment",
  "graphic-novels",
  "health-wellness",
  "history",
  "learn-english",
  "learn-a-language",
  "music-dance",
  "nature-gardening",
  "poetry-literature",
  "steam",
  "self-directed",
  "storytime",
  "volunteer",
  "writing-literacy",
  // Not in the library's list. The city runs programming a library never
  // does, and forcing it into the library's vocabulary misfiles it: the
  // Farmers' Market landed in "Celebrations" and Youth Drop-In Basketball in
  // "Self-Directed Activities" before these existed.
  "recreation",
  "environment",
  "civic-meeting",
  "closure",
  "uncategorized",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  "academic-support": "Academic Support & Homework Help",
  "artificial-intelligence": "Artificial Intelligence (AI)",
  "book-sale": "Book Sale",
  "books-authors": "Books & Authors",
  "career-business": "Career & Business",
  celebrations: "Celebrations & Festivities",
  "citizenship-immigration": "Citizenship & Immigration",
  coding: "Coding",
  "community-resources": "Community Resources & Support Groups",
  "computer-help": "Computer Help",
  "crafts-hobbies": "Crafts & Hobbies",
  "culture-traditions": "Culture & Traditions",
  exhibit: "Exhibit",
  "games-entertainment": "Games & Family Entertainment",
  "graphic-novels": "Graphic Novels",
  "health-wellness": "Health & Wellness",
  history: "History",
  "learn-english": "Learn English",
  "learn-a-language": "Learn a Language",
  "music-dance": "Music & Dance",
  "nature-gardening": "Nature & Gardening",
  "poetry-literature": "Poetry & Literature",
  steam: "STEAM",
  "self-directed": "Self-Directed Activities",
  storytime: "Storytime",
  volunteer: "Volunteer Opportunity",
  "writing-literacy": "Writing & Adult Literacy",
  recreation: "Recreation & Sport",
  environment: "Environment & Sustainability",
  "civic-meeting": "Civic Meeting",
  closure: "Closure & Holiday",
  uncategorized: "Uncategorized",
};

/**
 * What other platforms call these types.
 *
 * Sunnyvale's LibCal instance uses a much smaller vocabulary than the
 * library's public facet list — the events readable there are tagged
 * "Passive", which maps to Self-Directed Activities. Every other city added
 * will bring its own words; they go here, not into the classifier.
 */
const TYPE_VOCABULARY: Record<string, EventType> = {
  passive: "self-directed",
  "self-directed": "self-directed",
  display: "exhibit",
  exhibit: "exhibit",
  storytime: "storytime",
  "story time": "storytime",
  "early literacy": "storytime",
  "books & authors": "books-authors",
  "book club": "books-authors",
  "author talk": "books-authors",
  "book sale": "book-sale",
  "arts & crafts": "crafts-hobbies",
  "crafts & hobbies": "crafts-hobbies",
  crafts: "crafts-hobbies",
  "health & wellness": "health-wellness",
  health: "health-wellness",
  "music & dance": "music-dance",
  music: "music-dance",
  "nature & gardening": "nature-gardening",
  gardening: "nature-gardening",
  steam: "steam",
  stem: "steam",
  coding: "coding",
  "computer help": "computer-help",
  technology: "computer-help",
  "artificial intelligence (ai)": "artificial-intelligence",
  "artificial intelligence": "artificial-intelligence",
  ai: "artificial-intelligence",
  "career & business": "career-business",
  careers: "career-business",
  "learn english": "learn-english",
  esl: "learn-english",
  "learn a language": "learn-a-language",
  "world languages": "learn-a-language",
  "citizenship & immigration": "citizenship-immigration",
  citizenship: "citizenship-immigration",
  "culture & traditions": "culture-traditions",
  culture: "culture-traditions",
  "celebrations & festivities": "celebrations",
  celebration: "celebrations",
  history: "history",
  "graphic novels": "graphic-novels",
  "poetry & literature": "poetry-literature",
  poetry: "poetry-literature",
  "writing & adult literacy": "writing-literacy",
  writing: "writing-literacy",
  literacy: "writing-literacy",
  "academic support & homework help": "academic-support",
  "homework help": "academic-support",
  tutoring: "academic-support",
  "community resources & support groups": "community-resources",
  "support group": "community-resources",
  "community resources": "community-resources",
  "games & family entertainment": "games-entertainment",
  games: "games-entertainment",
  gaming: "games-entertainment",
  "volunteer opportunity": "volunteer",
  volunteering: "volunteer",

  // City of Sunnyvale calendar categories, read off the calendar's own
  // category filter. Only four of the seven name a kind of event; the other
  // three are listed in NON_TYPE_CATEGORIES below.
  "recreation & community": "recreation",
  "community forums & workshops": "community-resources",
  environmental: "environment",
  "holidays observed": "closure",
};

/**
 * Publisher labels that describe WHO runs an event, not WHAT it is.
 *
 * Sunnyvale's city calendar mixes both axes in one dropdown: "Recreation &
 * Community" is a kind of event, but "Library Events (all)", "City Events"
 * and "Non-City Classes & Events" only say which department posted it —
 * which this app already tracks as the source. Letting them set eventType
 * would fill the field with three values that mean nothing to a reader, so
 * they are recorded as provenance and the type falls through to inference.
 */
const NON_TYPE_CATEGORIES = new Set([
  "city events",
  "library events (all)",
  "library events",
  "non-city classes & events",
]);

/**
 * Translate a publisher's own type words into the canonical vocabulary.
 * Returns the first that maps: a publisher may tag one event several ways,
 * and this site shows one type.
 */
export function mapPublisherTypes(raw: string[] | undefined | null): EventType | null {
  if (!raw?.length) return null;
  for (const value of raw) {
    const key = value.trim().toLowerCase();
    if (NON_TYPE_CATEGORIES.has(key)) continue;
    const hit = TYPE_VOCABULARY[key];
    if (hit) return hit;
  }
  return null;
}

/** True when a publisher label says who posted it rather than what it is. */
export function isProvenanceLabel(value: string): boolean {
  return NON_TYPE_CATEGORIES.has(value.trim().toLowerCase());
}

/**
 * Infer the type from the title, for sources that publish no types.
 *
 * Ordered, first match wins. The order encodes precedence, so the specific
 * rules come before the general ones: "Home Repair Workshop" is a community
 * resource, not a craft, and a council study session is a civic meeting even
 * though "session" appears in plenty of other titles.
 *
 * These rules are a stopgap and they are wrong some of the time. Every event
 * they touch is stored with typeSource "inferred", so their accuracy is
 * measurable rather than assumed.
 */
const TYPE_RULES: Array<[EventType, RegExp]> = [
  ["civic-meeting", /\b(city council|commission|board meeting|public hearing|study session|subcommittee|town hall)\b/i],
  ["closure", /\b(closed|closure|holiday)\b/i],

  ["citizenship-immigration", /\b(citizenship|naturalization|immigrant|immigration)\b/i],
  ["learn-english", /\b(esl|english conversation|learn english|english as a second)\b/i],
  ["learn-a-language", /\b(spanish|mandarin|hebrew|hindi|japanese|french|bilingual|language|asl|sign language)\b/i],
  ["artificial-intelligence", /\b(artificial intelligence|\bai\b|chatgpt|machine learning)\b/i],
  ["coding", /\b(coding|scratch|python|javascript|programming|hour of code)\b/i],
  ["computer-help", /\b(get connected|computer help|tech help|digital literacy|device help)\b/i],
  ["steam", /\b(steam|stem|science|robotics|engineering|makerspace|vivarium)\b/i],

  ["storytime", /\b(storytime|story time|lapsit|baby|toddler|preschool|paws to read)\b/i],
  ["graphic-novels", /\b(graphic novel|manga|comics?)\b/i],
  ["poetry-literature", /\b(poetry|poem|open mic|literature)\b/i],
  ["book-sale", /\b(book sale|friends of the library sale)\b/i],
  ["books-authors", /\b(book club|book group|author talk|silent book|reading|author)\b/i],
  ["writing-literacy", /\b(writing|writers|adult literacy|literacy)\b/i],
  ["academic-support", /\b(homework|tutoring|study hall|college admissions|sat prep)\b/i],

  ["volunteer", /\b(volunteer)\b/i],
  ["career-business", /\b(career|resume|job search|business|entrepreneur|networking)\b/i],
  ["community-resources", /\b(counseling|tenant|landlord|support group|tax help|legal|clinic|resource fair|repair workshop|helping parents|food giveaway|pantry)\b/i],

  ["recreation", /\b(drop-in|basketball|pickleball|soccer|softball|swim|skate|playground|park|clinic|league|open gym)\b/i],
  ["environment", /\b(recycl|compost|sustainab|climate|water conservation|zero waste|creek clean)/i],
  ["health-wellness", /\b(yoga|zumba|fitness|mindfulness|meditation|wellness|health|tai chi|burnout|resilience|nutrition|bike safety)\b/i],
  ["nature-gardening", /\b(garden|master gardener|tree|plant|nature|creek|compost|veggies)\b/i],
  ["music-dance", /\b(concert|music|taiko|band|orchestra|dance|choir|film|movie|screening)\b/i],
  ["crafts-hobbies", /\b(sewing|yarn|knit|quilt|craft|create|paint|draw|lego|origami|playhouse)\b/i],
  ["games-entertainment", /\b(board game|game|bingo|trivia|puppet|magic show|family fun|farm)\b/i],
  ["culture-traditions", /\b(mid-autumn|lunar new year|diwali|heritage|cultural|tradition|festival)\b/i],
  ["celebrations", /\b(celebration|parade|fair|ceremony|anniversary|birthday|grand opening|fitfest|market)\b/i],
  ["history", /\b(history|historian|historical|archive|genealogy)\b/i],
  ["exhibit", /\b(exhibit|display|gallery|showcase)\b/i],
  ["self-directed", /\b(passive|self-directed|scavenger hunt|drop-in|take.and.make|sign up month)\b/i],
];

export function inferEventType(title: string, description?: string | null): EventType {
  const text = `${title} ${description ?? ""}`;
  for (const [type, pattern] of TYPE_RULES) {
    if (pattern.test(text)) return type;
  }
  return "uncategorized";
}

/** Where an event's type came from. Lets you audit the classifier later. */
export type TypeSource = "publisher" | "inferred";

export function resolveEventType(
  title: string,
  description: string | null | undefined,
  publisherTypes: string[] | undefined | null,
): { eventType: EventType; typeSource: TypeSource } {
  const fromPublisher = mapPublisherTypes(publisherTypes);
  if (fromPublisher) return { eventType: fromPublisher, typeSource: "publisher" };
  return { eventType: inferEventType(title, description), typeSource: "inferred" };
}

export function resolveAudience(
  title: string,
  publisherAudience: string | undefined | null,
): { audience: Audience; audienceSource: TypeSource } {
  const mapped = mapPublisherAudience(publisherAudience);
  if (mapped) return { audience: mapped, audienceSource: "publisher" };
  return { audience: inferAudience(title), audienceSource: "inferred" };
}
