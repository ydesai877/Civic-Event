/**
 * HTTP layer for ingestion.
 *
 * Both Sunnyvale sites sit behind Akamai Bot Manager. A bare fetch from a
 * datacenter IP gets a `bm-verify` interstitial instead of the page, so the
 * fetcher has two strategies:
 *
 *   "http"     plain fetch with browser-like headers. Fast and cheap.
 *              Works today for the month-grid pages.
 *   "browser"  headless Chromium via Playwright. Slower, but it executes
 *              the challenge script and gets the real page.
 *
 * Start on "http". When a response comes back with a challenge marker, the
 * fetcher escalates to "browser" for the rest of the run rather than failing.
 */

export type FetchStrategy = "http" | "browser";

const CHALLENGE_MARKERS = ["bm-verify", "_Incapsula_", "Just a moment...", "cf-browser-verification"];

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

export function looksChallenged(html: string): boolean {
  return CHALLENGE_MARKERS.some((m) => html.includes(m)) || html.length < 2000;
}

/**
 * Structural types for the slice of Playwright we use. Declaring them here
 * keeps `playwright` out of the app's dependency graph entirely: it is only
 * needed by whatever process runs ingestion.
 */
interface PwPage {
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
  waitForSelector(selector: string, opts: { timeout: number }): Promise<unknown>;
  content(): Promise<string>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(opts: Record<string, unknown>): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { launch(opts: { headless: boolean }): Promise<PwBrowser> };
}

export class Fetcher {
  private strategy: FetchStrategy;
  private browser: PwBrowser | null = null;
  private lastRequestAt = 0;

  constructor(
    strategy: FetchStrategy = "http",
    /** Minimum gap between requests, in ms. Be a good citizen. */
    private readonly minIntervalMs = 1200,
  ) {
    this.strategy = strategy;
  }

  private async throttle() {
    const wait = this.minIntervalMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  async html(url: string): Promise<string> {
    await this.throttle();

    if (this.strategy === "http") {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
      const body = await res.text();
      if (res.ok && !looksChallenged(body)) return body;

      console.warn(`[fetch] ${url} looks challenged (status ${res.status}); escalating to browser`);
      this.strategy = "browser";
    }

    return this.viaBrowser(url);
  }

  private async viaBrowser(url: string): Promise<string> {
    // webpackIgnore keeps the bundler from tracing Playwright into the app.
    // Only the ingestion process ever reaches this line.
    // The specifier is built at runtime so neither webpack nor tsc resolves
    // it. Playwright is an optional peer of the ingestion process only.
    const specifier = "play" + "wright";
    const pw = (await import(/* webpackIgnore: true */ specifier)) as PwModule;
    if (!this.browser) {
      this.browser = await pw.chromium.launch({ headless: true });
    }
    const page = await this.browser.newPage({
      userAgent: BROWSER_HEADERS["User-Agent"],
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
    });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      // The challenge resolves by reloading itself; wait for real content.
      await page
        .waitForSelector("table.calendar, .calendar_item, main", { timeout: 20_000 })
        .catch(() => undefined);
      return await page.content();
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
