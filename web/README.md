# JustGo → Siwi (web app)

A browser version of the `justgo_to_siwi` converter. Upload a JustGo attendee
CSV, map the columns, define the race classes, and download the Siwi import CSV
and race-info spreadsheet — all in the browser.

**Nothing is uploaded.** The CSV is parsed and converted entirely on your
machine, so athlete data never leaves the browser. This also means it can be
served as a static site (e.g. GitHub Pages) with no backend.

## Using the hosted app

Once deployed to GitHub Pages, open the published URL and follow the steps:

1. **Upload attendee CSV** — the JustGo export.
2. **Map columns** — match the `Classes`, `Age`, and `Club` fields to the CSV's
   column headers. Mapping `Club` to the `Organisation` column enables the same
   club-acronym guessing as the Python script.
3. **Define classes & bib ranges** — one row per Siwi class, with the text to
   search for in each athlete's Classes field and the bib number range.
4. **Rankings (optional)** — upload the ICF rankings workbook (as produced by
   `src/tools/get_icf_rankings.py`) to seed bibs by ranking.
5. **Generate** — preview the results and download `for_siwi_*.csv` and
   `race_info_*.xlsx`.

## Local development

Requires [Node.js](https://nodejs.org/) 20+.

```bash
cd web
npm install
npm run dev        # start the dev server
npm test           # run the conversion tests
npm run build      # produce a production build in dist/
```

## How it stays faithful to the Python

`src/lib/convert.ts` is a direct port of `JustGoToSiwi.calculate()`. The test
suite (`src/lib/convert.test.ts`) runs the converter against the committed
example CSV and asserts the output is **identical** to what the Python script
produces (`src/lib/__fixtures__/expected_nationals_for_siwi.csv`), so the two
implementations stay in sync.

## Deployment

`.github/workflows/deploy-pages.yml` builds the app and publishes it to
GitHub Pages. It's manually triggered (Actions → Deploy web app to GitHub
Pages → Run workflow) rather than running on every push, so changes under
`web/` land on `main` without deploying automatically. Enable Pages for the
repo (Settings → Pages → Source: GitHub Actions) once, then run the workflow
whenever you want to publish the latest version.

The Vite `base` is set to `./` (relative), so the app works whether it's served
from a domain root or a project subpath like `https://<user>.github.io/<repo>/`.

## Rankings — current and future

Ranking data is committed to the repo as JSON under `public/rankings/`, one file
per ICF release plus an `index.json` listing what's available:

```
public/rankings/index.json    releases, newest first, with per-class counts
public/rankings/2026-2.json   { release, crossRelease, scrapedAt, classes }
```

`src/tools/get_icf_rankings.py` regenerates these. It scrapes Siwi over plain
HTTP (no browser or driver), collects every release from 2026-1 onwards, and
skips releases that Siwi lists but hasn't published results for yet. Because the
files ship with the site, they're served as static assets alongside the app.

The app still takes rankings as an optional `.xlsx` **upload**. Wiring it up to
select a built-in release instead is the next step; the entries have the same
`name`/`ranking` shape either way, so the converter needs no rework. After that,
a scheduled GitHub Action can re-run the scraper and commit refreshed JSON.
