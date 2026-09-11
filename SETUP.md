# Setup

Getting this live on GitHub Pages. About 15 minutes, all free, no credit card.

You do **not** need a database. The scraper writes one JSON file, the site is
built from it, and GitHub serves the result as plain files.

---

## What you end up with

1. A **scraper** that GitHub runs twice a day. It reads the city calendars and
   saves `data/events.json` into your repo.
2. A **build** that turns that file into a website.
3. A **site** at `https://YOUR-USERNAME.github.io/Civic-Event/`

Step 1 finishing is what starts step 2. You don't trigger anything by hand.

---

## Part A — push the code

1. Open Terminal.
2. Go to the folder:

   ```
   cd ~/Downloads/civic-events
   ```

3. Confirm the hidden files are there:

   ```
   ls -a
   ```

   You need to see `.github` in the list. If it's missing, nothing else works.

4. Push:

   ```
   git add .
   git commit -m "Static site on GitHub Pages"
   git push
   ```

---

## Part B — turn on GitHub Pages

5. Go to your repo on github.com.
6. Click **Settings**.
7. Click **Pages** in the left sidebar.
8. Under **Source**, choose **GitHub Actions**.
9. That's it. Nothing to save.

> If you pick "Deploy from a branch" instead, it will not work. It has to be
> **GitHub Actions**.

---

## Part C — let the scraper run once

The repo ships with `data/events.json` already filled in from saved copies of
the calendars, so the site builds even before the scraper runs. But you want
real, current events.

10. Click the **Actions** tab.
11. Click **ingest** in the left sidebar.
12. Click **Run workflow** → **Run workflow**.
13. Wait. First run takes 3–5 minutes because it installs a browser.

**What it's doing:** visiting the city calendar, reading every event, and
saving them. It needs a real browser because Sunnyvale's site blocks plain
robots.

---

## Part D — watch it publish

14. Still in **Actions**, you'll see **pages** start on its own once **ingest**
    finishes.
15. When it goes green, open:

    ```
    https://YOUR-USERNAME.github.io/Civic-Event/
    ```

Done. From here it updates itself twice a day.

---

## If something goes wrong

**"pages" never runs**
Check Part B. Source has to be **GitHub Actions**, not a branch.

**"ingest" fails**
Click the failed run to read the log. The usual cause is the city site
blocking the scraper. Re-run it — it often passes on the second try.

**Site loads but has no events**
The scraper hasn't run yet, or it ran and found nothing. Open `data/events.json`
in your repo — if it's there and full, the problem is the build, not the scrape.

**Everything is broken and you want to see it locally**

```
npm install
npm run scrape:fixtures
npm run dev
```

Then open http://localhost:3000. This uses saved copies of the calendars, so it
works with no network and no GitHub.

---

## Everyday commands

| I want to… | Command |
|---|---|
| See the site on my machine | `npm run dev` |
| Refresh events from the real calendars | `npm run scrape` |
| Rebuild events from saved copies | `npm run scrape:fixtures` |
| Check nothing is broken | `npm test` |
| Publish a change | `git add . && git commit -m "..." && git push` |

---

## Adding another city

1. Open `src/ingest/sources.ts`.
2. Copy the `sunnyvale-city` block.
3. Change the id, name, jurisdiction and `calendarUrl`.
4. Run `npm run scrape -- --source=your-new-id --months=1` and check the count
   looks sane.
5. Spot-check five events against the city's real page.
6. Push.

Only works out of the box if that city also runs CivicEngage — look for
`/Home/Components/Calendar/Event/` in their event links. A different platform
needs a new adapter in `src/ingest/adapters/`.

---

## The database, if you ever want it

There's a full Postgres path in the repo (`src/db/`, `npm run ingest`) that
isn't used. The JSON file is simpler and free, and it holds up to roughly 20
cities or a year of history — about 500 KB.

Past that, point `DATABASE_URL` at a Postgres, run `npm run db:push`, and use
`npm run ingest` instead of `npm run scrape`. Both share the same scraping and
classifying code, so nothing else changes.
