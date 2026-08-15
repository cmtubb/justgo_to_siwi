# kayak-events

Scripts for converting Australian canoe slalom event registrations from [JustGo](https://www.justgo.com/) (Paddle Australia attendee exports) into CSV format for [Siwi](https://www.siwidata.com/) race management, with ICF world ranking lookups for bib assignment.

## What it does

1. Reads a JustGo attendee CSV export for an event.
2. Normalises columns (names, clubs, regions, event classes).
3. Splits athletes into Siwi classes (K1M, C1M, K1W, C1W, MCSLX, WCSLX, etc.).
4. Looks up each athlete's ICF ranking from a committed JSON ranking release.
5. Assigns bib numbers by ranking (highest-ranked paddler gets the highest bib in each class range).
6. Writes output files ready to import into Siwi.

## Project layout

```
events/
├── examples/              # Sample JustGo CSVs for testing (--example mode)
├── data/                  # Event-specific input data (gitignored)
├── src/
│   ├── justgo_to_siwi/    # Core conversion library
│   ├── races/             # Per-event conversion scripts
│   └── tools/             # Utilities (ranking fetcher, filename helper)
├── web/                   # Browser version of the converter (no install needed)
│   └── public/rankings/   # ICF ranking releases (JSON), shared by the web app and race scripts
└── pyproject.toml
```

## Two ways to use it

- **[Web app](web/)** (`web/`) — a static, browser-based version of the converter for non-technical users. No install, nothing is uploaded (all processing happens locally in the browser), and it can be hosted on GitHub Pages. See [`web/README.md`](web/README.md).
- **Python scripts** (`src/`) — the original CLI workflow, and the only way to run the ICF rankings scraper. Documented below.

## Setup

Requires Python 3.10+.

### pip

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .
```

### uv

```bash
uv sync
```

This creates `.venv` and installs the project and its dependencies. Activate the environment before running scripts:

```bash
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

Or run commands through uv without activating:

```bash
uv run python src/races/convert_2026_nationals.py --example
```

`get_icf_rankings.py` talks to Siwi over plain HTTP, so it needs no browser or
driver.

## Basic usage

### 1. Fetch ICF rankings (optional, but needed for ranked bib assignment)

Downloads every published ranking release from 2026-1 onwards and writes one
JSON file per release (plus an `index.json`) into `web/public/rankings/`, where
the web app reads them:

```bash
python src/tools/get_icf_rankings.py
```

Releases that Siwi lists but hasn't published results for yet are skipped, so
re-running mid-year simply picks up each new release as it appears.

Both the web app and the race scripts read these same JSON files — point your
event script at the release you want (see `rankings=` in the race scripts).

### 2. Prepare event data

Place the JustGo attendee CSV in `data/<event_name>/`. The `data/` directory is gitignored.

Some JustGo exports have spaces in the filename — `src/tools/clean_filename.sh` can rename them:

```bash
./src/tools/clean_filename.sh "Attendees My Event.csv"
```

### 3. Run a conversion script

Each event has a script under `src/races/`. Several support `--example` to run against the files in `examples/` without real event data:

```bash
# Nationals example
python src/races/convert_2026_nationals.py --example

# Age nationals example
python src/races/convert_2025_age_nationals.py --example
```

For a real event, run the script without `--example` after placing the CSV in the expected `data/` subdirectory (paths are configured in each script).

### 4. Outputs

Scripts write two timestamped files into the data directory:

| File | Description |
|------|-------------|
| `for_siwi_<ident>_<timestamp>.csv` | Siwi import file with class, ranking, and bib |
| `race_info_<ident>_<timestamp>.xlsx` | Summary sheet plus ranked entries for review |

These output files are also gitignored.

## Adding a new event

Create a new script in `src/races/` following an existing one. You need to configure:

- **`columns`** — maps internal field names to JustGo CSV column headers
- **`events`** — maps Siwi class codes to `(search_string, (bib_start, bib_end))` tuples; the search string is matched against the classes column
- **`datadir` / `infile`** — where the input CSV lives
- **`rankings`** — path to an ICF ranking release JSON file (see `web/public/rankings/`)

Then instantiate `JustGoToSiwi` and call `calculate()`:

```python
from justgo_to_siwi import JustGoToSiwi

jgs = JustGoToSiwi(datadir, infile, out_ident, events, columns, rankings)
df, df_r, df_siwi = jgs.calculate()
```

## Existing race scripts

| Script | Event |
|--------|-------|
| `convert_2026_nationals.py` | 2026 Canoe Slalom Nationals |
| `convert_2025_age_nationals.py` | 2026 Age Nationals (rescheduled) |
| `convert_2026_may_wswc_club_race.py` | WS Whitewater Club race (May 2026) |
| `convert_2026_may_v2_wswc_club_race.py` | WS Whitewater Club race v2 (May 2026) |
