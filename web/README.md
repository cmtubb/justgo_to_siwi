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

Pushing changes under `web/` to the `main` branch triggers
`.github/workflows/deploy-pages.yml`, which builds the app and publishes it to
GitHub Pages. Enable Pages for the repo (Settings → Pages → Source: GitHub
Actions) once, and every push deploys the latest version.

The Vite `base` is set to `./` (relative), so the app works whether it's served
from a domain root or a project subpath like `https://<user>.github.io/<repo>/`.

## Rankings — current and future

Today rankings are an optional **upload** (the `.xlsx` from
`get_icf_rankings.py`). Because that scraper drives a real browser via Selenium,
it can't run inside a static page. The planned next step is a scheduled GitHub
Action that runs the scraper, commits `rankings/latest.json`, and has the app
fetch it automatically — same data shape, so no rework of the converter.
