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
├── justgo_to_siwi_convert.py  # Command-line converter: race config + attendee CSV
├── configs/               # Race configs (JSON), shared by the web app and the CLI
├── examples/              # Sample JustGo CSVs, and expected/ outputs for the tests
├── data/                  # Event-specific input data (gitignored)
├── src/
│   ├── justgo_to_siwi/    # Core conversion library and config loading
│   └── tools/             # Utilities (ranking fetcher, filename helper)
├── tests/                 # Python tests
├── web/                   # Browser version of the converter (no install needed)
│   └── public/rankings/   # ICF ranking releases (JSON), shared by the web app and the CLI
└── pyproject.toml
```

## Two ways to use it

- **[Web app](web/)** (`web/`) — a static, browser-based version of the converter for non-technical users. No install, nothing is uploaded (all processing happens locally in the browser), and it can be hosted on GitHub Pages. See [`web/README.md`](web/README.md).
- **Python command line** (`justgo_to_siwi_convert.py`) — the same conversion, driven by a race config file, and the only way to run the ICF rankings scraper. Documented below.

Both use the same **race config** files (`configs/*.json`), so a config saved
from the web app can be run from the command line and vice versa.

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
uv run ./justgo_to_siwi_convert.py configs/2026_nationals.json examples/example_nationals.csv
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

Both the web app and the command line read these same JSON files — a race
config picks a release by id (`"rankings": "2026-2"`).

### 2. Prepare event data

Place the JustGo attendee CSV in `data/<event_name>/`. The `data/` directory is gitignored.

Some JustGo exports have spaces in the filename — `src/tools/clean_filename.sh` can rename them:

```bash
./src/tools/clean_filename.sh "Attendees My Event.csv"
```

### 3. Run the converter

Give it a race config and the attendee CSV:

```bash
./justgo_to_siwi_convert.py configs/2026_nationals.json data/2026_Nationals/Attendees.csv
```

To try it on the example files without real event data (`--name` sets the
output name, `--out-dir` where the files go):

```bash
./justgo_to_siwi_convert.py configs/2026_nationals.json examples/example_nationals.csv --name nationals_example
./justgo_to_siwi_convert.py configs/2026_age_nationals.json examples/example_age_nationals.csv --name age_nationals_example
./justgo_to_siwi_convert.py configs/2026_nsw_state_champs.json examples/example_state_champs.csv --name state_champs_example
```

If the config doesn't fit the CSV — a column it names isn't there, or its
ranking release doesn't exist — the converter stops and lists every problem
(with "did you mean …" suggestions), rather than producing a partial result.
Other issues, like a class that matches no entrants, are printed as warnings.

### 4. Outputs

The converter writes two timestamped files next to the CSV (or into `--out-dir`):

| File | Description |
|------|-------------|
| `for_siwi_<ident>_<timestamp>.csv` | Siwi import file with class, ranking, and bib |
| `race_info_<ident>_<timestamp>.xlsx` | Summary sheet plus ranked entries for review |

These output files are also gitignored.

## Adding a new event

The easiest way is to set the event up in the [web app](web/) with its
attendee CSV, then **Save config** and commit the file to `configs/`. Or copy
an existing config and edit it. A config looks like:

```json
{
  "version": 1,
  "outputName": "2026_nsw_state_champs",
  "columns": [
    { "field": "Age", "columns": ["Age on Event Start Date"] },
    { "field": "Classes", "columns": ["NSW State Champs 2025 - Club:MK1", "NSW State Champs 2025 - Club:MC1"] },
    { "field": "Club", "columns": ["Organisation"] },
    { "field": "C2Partner", "columns": ["NSW State Champs 2025 - Club:C2 partner"], "siwi": false }
  ],
  "classes": [
    { "code": "K1M", "search": "^MK1$", "bibs": [1, 80] },
    { "code": "CSLX", "search": "^CSLX", "bibs": [1, 80],
      "male": { "code": "MCSLX", "bibs": [101, 180] },
      "female": { "code": "WCSLX", "bibs": [201, 280] } },
    { "code": "C2", "search": "^C2", "bibs": null }
  ],
  "rankings": "2026-2",
  "dobOverrides": [{ "lastName": "Smith", "dob": "01/01/1955" }],
  "nameRemaps": [{ "from": "SMITH Jo", "to": "SMITH Joanne" }]
}
```

- **`outputName`** — names the output files (`--name` overrides it).
- **`columns`** — maps each field to one or more CSV column headers, in output
  order. `Classes` is required; give it several columns for exports with one
  column per class (their non-empty values are joined with `|`). `Age` breaks
  ranking ties; `Club` mapped to `Organisation` gets club acronyms guessed;
  `Gender` is needed for male/female class codes. `"siwi": false` keeps a field
  in the Summary only.
- **`classes`** — one per Siwi class. `search` is a regex tested against each
  `|`-separated Classes value (so `^C1` won't match `MC1`). `bibs` is the
  `[start, end]` range, or `null` to include the class with blank bibs.
  Optional `male` / `female` codes split the class by `Gender`, each with its
  own `bibs` (defaulting to the class's range); anyone else keeps the class
  code. Class values no class matches (e.g. teams events) stay in the Summary
  only. The Siwi output lists classes in this order (a split class gives its
  male, female, then catch-all code).
- **`rankings`** — the ICF ranking release id from `web/public/rankings/`, or
  `null` for none.
- **`dobOverrides`** — force a DOB for everyone with a given surname.
- **`nameRemaps`** — change a `SURNAME First` name before the ranking lookup.

The converter prints warnings for searches that match several different class
values, values matched by several classes, values no class picked up, classes
that match no entrants, and classes with no ranking data.

## Race configs

| Config | Event |
|--------|-------|
| `2026_nationals.json` | 2026 Canoe Slalom Nationals |
| `2026_age_nationals.json` | 2026 Age Nationals (rescheduled) |
| `2026_may_wswc_club_race.json` | WS Whitewater Club race (May 2026) |
| `2026_may_v2_wswc_club_race.json` | WS Whitewater Club race v2 (May 2026) |
| `2026_nsw_state_champs.json` | NSW State Champs (one column per class) |

## Tests

```bash
uv sync                 # or: pip install pytest
python -m pytest
```

The tests run each example CSV through its race config and compare the result
with `examples/expected/`. The web app's tests check the same files, so both
converters stay in step.
