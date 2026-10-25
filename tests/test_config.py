"""Race configs drive justgo_to_siwi_convert.py the same way they drive the web app.

The configs, example CSVs and expected outputs are shared with the web tests
(web/src/lib/config.test.ts), so both converters are held to the same files.
"""

import json
from pathlib import Path

import pytest

import justgo_to_siwi_convert
from justgo_to_siwi.config import (
    converter_args,
    load_config,
    missing_columns,
    validate_config,
)

ROOT = Path(__file__).resolve().parent.parent

EXAMPLES = [
    ("2026_nationals", "example_nationals.csv"),
    ("2026_age_nationals", "example_age_nationals.csv"),
    ("2026_nsw_state_champs", "example_state_champs.csv"),
]


@pytest.mark.parametrize("config, csv", EXAMPLES)
def test_example_matches_expected_output(config, csv, tmp_path):
    status = justgo_to_siwi_convert.main([
        str(ROOT / "configs" / f"{config}.json"),
        str(ROOT / "examples" / csv),
        "--out-dir", str(tmp_path),
    ])
    assert status == 0
    [output] = tmp_path.glob(f"for_siwi_{config}_*.csv")
    expected = ROOT / "examples" / "expected" / f"{config}.csv"
    assert output.read_text() == expected.read_text()
    assert len(list(tmp_path.glob(f"race_info_{config}_*.xlsx"))) == 1


@pytest.mark.parametrize("config", sorted(p.stem for p in (ROOT / "configs").glob("*.json")))
def test_committed_configs_are_valid(config):
    load_config(ROOT / "configs" / f"{config}.json")


def test_errors_when_config_columns_are_missing_from_the_csv(tmp_path, capsys):
    status = justgo_to_siwi_convert.main([
        str(ROOT / "configs" / "2026_age_nationals.json"),
        str(ROOT / "examples" / "example_nationals.csv"),
        "--out-dir", str(tmp_path),
    ])
    assert status == 1
    err = capsys.readouterr().err
    assert ("Classes: column '2026 Canoe Slalom Age Nats - Rescheduled - NGB:Events Entered' "
            "isn't in the CSV (did you mean '2026 Canoe Slalom Nationals - NGB:Events entered:'?)") in err
    assert "School: column" in err
    assert list(tmp_path.iterdir()) == []


def test_errors_on_unknown_ranking_release(tmp_path, capsys):
    config = json.loads((ROOT / "configs" / "2026_nationals.json").read_text())
    config["rankings"] = "1999-1"
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config))
    status = justgo_to_siwi_convert.main([str(path), str(ROOT / "examples" / "example_nationals.csv"),
                                          "--out-dir", str(tmp_path)])
    assert status == 1
    assert "ranking release '1999-1' not found" in capsys.readouterr().err


def test_errors_on_invalid_config(tmp_path, capsys):
    path = tmp_path / "config.json"
    path.write_text("{not json")
    status = justgo_to_siwi_convert.main([str(path), str(ROOT / "examples" / "example_nationals.csv")])
    assert status == 1
    assert "is invalid" in capsys.readouterr().err


def test_validate_config_lists_every_problem():
    problems = validate_config({
        "version": 2,
        "extra": 1,
        "columns": [{"field": "Club", "columns": []}],
        "classes": [
            {"code": "K1M", "search": "MK1", "bibs": [80, 1]},
            {"code": "K1M", "search": "x", "bibs": None, "male": {"bibs": [1, 2]}},
        ],
        "rankings": 3,
        "nameRemaps": [{"from": "A"}],
    })
    assert problems == [
        "'version' must be 1, got 2",
        "config: unknown key 'extra'",
        "columns[0]: 'columns' must be a non-empty list of column names",
        "'columns' must map the 'Classes' field",
        "classes[0]: 'bibs' must be [start, end] or null",
        "classes[1]: class code 'K1M' appears more than once",
        "classes[1].male: 'code' must be a non-empty string",
        "'rankings' must be a release id (e.g. \"2026-2\") or null",
        "nameRemaps[0]: must have string 'from' and 'to'",
    ]


def test_missing_columns_checks_every_column_of_a_multi_column_field():
    config = {"columns": [{"field": "Classes", "columns": ["Form:MK1", "Form:XYZ"]}]}
    assert missing_columns(config, ["Form:MK1", "Form:MC1"]) == [
        "Classes: column 'Form:XYZ' isn't in the CSV (did you mean 'Form:MK1'?)"
    ]


def test_converter_args():
    config = load_config(ROOT / "configs" / "2026_nsw_state_champs.json")
    args = converter_args(config, Path("/rankings"))
    assert args["columns"]["Club"] == "Organisation"
    assert len(args["columns"]["Classes"]) == 8
    assert args["summary_only"] == ["Gender", "C2Partner"]
    assert args["events"]["CSLX"] == (
        "^CSLX", (1, 80), {"male": ("MCSLX", (101, 180)), "female": ("WCSLX", (201, 280))})
    assert args["events"]["C2"] == ("^C2", (0, 0), {"bibs": False})
    assert args["rankings"] == Path("/rankings/2026-2.json")


def test_warns_when_a_class_matches_no_entrants(tmp_path):
    config = json.loads((ROOT / "configs" / "2026_nationals.json").read_text())
    config["classes"].append({"code": "C2M", "search": "Men's C2", "bibs": [1, 80]})
    config["rankings"] = None
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config))

    from justgo_to_siwi import JustGoToSiwi
    jgs = JustGoToSiwi(ROOT / "examples", "example_nationals.csv", "test", out_dir=tmp_path,
                       **converter_args(load_config(path), ROOT / "web" / "public" / "rankings"))
    jgs.calculate()
    assert "Class C2M (search 'Men's C2') matched no entrants." in jgs.warnings
