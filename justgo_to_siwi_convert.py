#!/usr/bin/env python3
"""Convert a JustGo attendee CSV for Siwi using a race config JSON file.

The config is the same file the web app saves and loads (see `configs/`).

    ./justgo_to_siwi_convert.py configs/2026_nationals.json data/2026_Nationals/Attendees.csv
    ./justgo_to_siwi_convert.py configs/2026_nationals.json examples/example_nationals.csv --name nationals_example
"""

import argparse
import sys
from pathlib import Path

import pandas as pd

script_dir = Path(__file__).resolve().parent
# Work from a checkout even if the package isn't pip-installed
sys.path.insert(0, str(script_dir / "src"))

from justgo_to_siwi import JustGoToSiwi  # noqa: E402
from justgo_to_siwi.config import (  # noqa: E402
    ConfigError,
    converter_args,
    load_config,
    missing_columns,
    missing_ranking_release,
)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("config", type=Path, help="race config JSON file")
    parser.add_argument("attendees", type=Path, help="JustGo attendee CSV export")
    parser.add_argument("--out-dir", type=Path,
                        help="where to write the outputs (default: the CSV's directory)")
    parser.add_argument("--name", help="output name (default: the config's outputName)")
    parser.add_argument("--rankings-dir", type=Path,
                        default=script_dir / "web" / "public" / "rankings",
                        help="directory of ranking release JSON files")
    args = parser.parse_args(argv)

    try:
        config = load_config(args.config)
    except ConfigError as e:
        print(f"Config {args.config} is invalid:\n{e}", file=sys.stderr)
        return 1

    try:
        headers = list(pd.read_csv(args.attendees, nrows=0).columns)
        problems = (missing_columns(config, headers)
                    + missing_ranking_release(config, args.rankings_dir))
        if problems:
            raise ConfigError(problems)
    except ConfigError as e:
        print(f"Config {args.config} doesn't fit {args.attendees}:\n{e}", file=sys.stderr)
        return 1

    attendees = args.attendees.resolve()
    jgs = JustGoToSiwi(attendees.parent,
                       attendees.name,
                       args.name or config.get("outputName") or "event",
                       out_dir=args.out_dir,
                       **converter_args(config, args.rankings_dir))
    jgs.calculate()
    print(f"Wrote {jgs.forsiwi}\n      {jgs.raceinfo}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
