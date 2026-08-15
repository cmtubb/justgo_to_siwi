#!/usr/bin/env python3
"""Scrape ICF canoe slalom world rankings from Siwi into per-release JSON.

The Siwi ranking page is a plain ASP.NET WebForm: the release and class
dropdowns are in the initial HTML, and switching either one is an ordinary
postback carrying the hidden `__VIEWSTATE` fields. That means no browser
automation is needed — which in turn means this can run in CI.

Output goes to `web/public/rankings/` so the web app can fetch it directly:

    index.json      the available releases, newest first
    <release>.json  one file per release, e.g. 2026-2.json

Releases that exist in the dropdown but have no results published yet (every
class comes back empty) are skipped, so re-running late in a quarter simply
picks up the new release once Siwi publishes it.
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = "https://www.siwidata.com/ICFWorldRanking.aspx"

# Earliest release to keep, as (year, number). Everything before this is
# historical and deliberately not published.
MIN_RELEASE = (2026, 1)

# Siwi class code -> does it live on the "-X" (kayak cross) release?
CLASSES = {
    "K1M": False,
    "C1M": False,
    "K1W": False,
    "C1W": False,
    "MCSLX": True,
    "WCSLX": True,
}

# Hidden WebForm fields that must be echoed back on every postback.
HIDDEN_FIELDS = ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION")

# Matches only plain "YYYY-N" releases. The "-X" / "-X-I" variants are derived
# from these (or, for "-X-I", ignored: those are the WCSLXI/MCSLXI classes we
# don't enter), and "ZERO" is skipped.
RELEASE_RE = re.compile(r"^(\d{4})-(\d+)$")

script_dir = Path(__file__).resolve().parent
default_out = (script_dir / ".." / ".." / "web" / "public" / "rankings").resolve()

# Be gentle with Siwi: this is a handful of requests, not a crawl.
REQUEST_DELAY = 1.0


def hidden_fields(soup: BeautifulSoup) -> dict[str, str]:
    """Pull the WebForm state fields out of a parsed page."""
    state = {}
    for name in HIDDEN_FIELDS:
        field = soup.find("input", {"name": name})
        if field is not None and field.has_attr("value"):
            state[name] = field["value"]
    return state


def release_ids(soup: BeautifulSoup) -> list[tuple[int, int]]:
    """Every plain release in the dropdown at or after MIN_RELEASE, oldest first.

    Release numbers roughly track quarters but aren't capped at four (2025 ran
    to 2025-5), so they're compared as (year, number) integers rather than as
    strings.
    """
    select = soup.find("select", {"name": "ddlRelease"})
    if select is None:
        raise RuntimeError("Could not find the release dropdown (ddlRelease)")

    found = []
    for option in select.find_all("option"):
        match = RELEASE_RE.match(option.get("value", ""))
        if match is None:
            continue
        release = (int(match.group(1)), int(match.group(2)))
        if release >= MIN_RELEASE:
            found.append(release)
    return sorted(found)


def parse_ranking_table(soup: BeautifulSoup) -> list[dict]:
    """Read the ranking table, keeping just the rank and competitor name.

    An empty list means the release exists but has no published results.
    """
    table = soup.find("table", {"id": "tblRanking"})
    if table is None:
        return []

    entries = []
    for row in table.find_all("tr")[1:]:
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        rank = cells[0].get_text(strip=True)
        name = cells[1].get_text(strip=True)
        if not rank or not name:
            continue

        # Ranks are integers in practice; keep anything unexpected as-is rather
        # than dropping the athlete.
        entries.append({"name": name, "ranking": int(rank) if rank.isdigit() else rank})
    return entries


def fetch_class(
    session: requests.Session, state: dict[str, str], release: str, cls: str
) -> list[dict]:
    """Post back for one release/class pair and return its ranking entries."""
    payload = dict(state)
    payload.update(
        {
            "__EVENTTARGET": "ddlClass",
            "__EVENTARGUMENT": "",
            "ddlRelease": release,
            "ddlClass": cls,
        }
    )

    response = session.post(URL, data=payload, timeout=60)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html5lib")

    # Each response carries a fresh viewstate for the next postback.
    state.update(hidden_fields(soup))
    return parse_ranking_table(soup)


def scrape_release(
    session: requests.Session, state: dict[str, str], year: int, number: int
) -> dict[str, list[dict]] | None:
    """Scrape every class for one release, or None if nothing is published yet."""
    plain = f"{year}-{number}"
    cross = f"{plain}-X"

    def fetch(cls: str) -> list[dict]:
        release = cross if CLASSES[cls] else plain
        entries = fetch_class(session, state, release, cls)
        print(f"  {cls:<6} {release:<10} {len(entries):>5} entries")
        time.sleep(REQUEST_DELAY)
        return entries

    # Probe one class from each release variant first. An unpublished release
    # returns an empty table for every class, so this rules it out in two
    # requests rather than six.
    classes = {cls: fetch(cls) for cls in ("K1M", "MCSLX")}
    if not any(classes.values()):
        return None

    for cls in CLASSES:
        if cls not in classes:
            classes[cls] = fetch(cls)

    # Restore the canonical class order for the output file.
    classes = {cls: classes[cls] for cls in CLASSES}

    empty = [cls for cls, entries in classes.items() if not entries]
    if empty:
        print(f"  warning: no results for {', '.join(empty)}", file=sys.stderr)

    return classes


def write_legacy_xlsx(classes: dict[str, list[dict]], path: Path) -> None:
    """Write the old one-sheet-per-class workbook the Python scripts still read."""
    import pandas as pd

    with pd.ExcelWriter(path) as writer:
        for cls, entries in classes.items():
            frame = pd.DataFrame(entries, columns=["name", "ranking"])
            frame.to_excel(writer, sheet_name=cls, index=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=default_out,
        help=f"Directory for the JSON files (default: {default_out})",
    )
    parser.add_argument(
        "--xlsx",
        type=Path,
        metavar="DIR",
        help="Also write the legacy workbook for the newest release into DIR "
        "(transitional, for the Python race scripts)",
    )
    args = parser.parse_args()

    session = requests.Session()
    session.headers.update({"User-Agent": "kayak-events ranking fetcher", "Referer": URL})

    response = session.get(URL, timeout=60)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html5lib")

    state = hidden_fields(soup)
    releases = release_ids(soup)
    if not releases:
        print(f"No releases at or after {MIN_RELEASE[0]}-{MIN_RELEASE[1]}", file=sys.stderr)
        return 1

    print(f"Found {len(releases)} candidate release(s) from {MIN_RELEASE[0]}-{MIN_RELEASE[1]}")

    args.out.mkdir(parents=True, exist_ok=True)
    scraped_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    index = []
    for year, number in releases:
        release = f"{year}-{number}"
        print(f"{release}:")

        classes = scrape_release(session, state, year, number)
        if classes is None:
            print("  no results published yet, skipping")
            continue

        document = {
            "release": release,
            "crossRelease": f"{release}-X",
            "scrapedAt": scraped_at,
            "classes": classes,
        }
        (args.out / f"{release}.json").write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        index.append(
            {
                "id": release,
                "file": f"{release}.json",
                "counts": {cls: len(entries) for cls, entries in classes.items()},
            }
        )

    if not index:
        print("No releases had published results", file=sys.stderr)
        return 1

    # Newest first: the app defaults to the head of this list.
    index.reverse()
    (args.out / "index.json").write_text(
        json.dumps(
            {"generatedAt": scraped_at, "releases": index},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"\nWrote {len(index)} release(s) to {args.out}")

    if args.xlsx:
        newest = index[0]["id"]
        args.xlsx.mkdir(parents=True, exist_ok=True)
        target = args.xlsx / f"icf_rankings_{newest}.xlsx"
        document = json.loads((args.out / f"{newest}.json").read_text(encoding="utf-8"))
        write_legacy_xlsx(document["classes"], target)
        print(f"Wrote legacy workbook {target}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
