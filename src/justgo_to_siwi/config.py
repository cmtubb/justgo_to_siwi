"""Load and check a converter config: the JSON file shared with the web app.

A config (version 1) looks like:

    {
      "version": 1,
      "outputName": "2026_nsw_state_champs",
      "columns": [
        {"field": "Age", "columns": ["Age on Event Start Date"]},
        {"field": "Classes", "columns": ["...:MK1", "...:MC1"]},
        {"field": "C2Partner", "columns": ["...:C2 partner"], "siwi": false}
      ],
      "classes": [
        {"code": "K1M", "search": "^MK1$", "bibs": [1, 80]},
        {"code": "CSLX", "search": "^CSLX", "bibs": [1, 80],
         "male": {"code": "MCSLX", "bibs": [101, 180]},
         "female": {"code": "WCSLX"}},
        {"code": "C2", "search": "^C2", "bibs": null}
      ],
      "rankings": "2026-2",
      "dobOverrides": [{"lastName": "Smith", "dob": "01/01/1955"}],
      "nameRemaps": [{"from": "SMITH Jo", "to": "SMITH Joanne"}]
    }

`"bibs": null` means a class gets no bibs; a gender split without `bibs`
shares its class's range; `"rankings": null` means no ranking lookup.
"""

import difflib
import json
from pathlib import Path

CONFIG_VERSION = 1

TOP_LEVEL_KEYS = {"version", "outputName", "columns", "classes", "rankings",
                  "dobOverrides", "nameRemaps"}


class ConfigError(ValueError):
    """The config file is malformed or doesn't fit the attendee CSV."""

    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("\n".join(f"  - {p}" for p in problems))


def _is_bibs(value) -> bool:
    return (isinstance(value, list) and len(value) == 2
            and all(isinstance(v, int) and not isinstance(v, bool) for v in value)
            and value[0] <= value[1])


def _check_keys(where: str, item: dict, allowed: set[str], problems: list[str]) -> None:
    for key in item.keys() - allowed:
        problems.append(f"{where}: unknown key '{key}'")


def validate_config(config) -> list[str]:
    """Problems with the config's shape (empty if it's well formed)."""
    if not isinstance(config, dict):
        return ["the config must be a JSON object"]

    problems = []
    if config.get("version") != CONFIG_VERSION:
        problems.append(f"'version' must be {CONFIG_VERSION}, got {config.get('version')!r}")
    _check_keys("config", config, TOP_LEVEL_KEYS, problems)

    if not isinstance(config.get("outputName", ""), str):
        problems.append("'outputName' must be a string")

    columns = config.get("columns")
    if not isinstance(columns, list):
        problems.append("'columns' must be a list")
        columns = []
    fields = []
    for i, col in enumerate(columns):
        where = f"columns[{i}]"
        if not isinstance(col, dict):
            problems.append(f"{where}: must be an object")
            continue
        _check_keys(where, col, {"field", "columns", "siwi"}, problems)
        field = col.get("field")
        if not isinstance(field, str) or not field.strip():
            problems.append(f"{where}: 'field' must be a non-empty string")
        elif field in fields:
            problems.append(f"{where}: field '{field}' appears more than once")
        else:
            fields.append(field)
        headers = col.get("columns")
        if (not isinstance(headers, list) or not headers
                or not all(isinstance(h, str) for h in headers)):
            problems.append(f"{where}: 'columns' must be a non-empty list of column names")
        if not isinstance(col.get("siwi", True), bool):
            problems.append(f"{where}: 'siwi' must be true or false")
    if "Classes" not in fields:
        problems.append("'columns' must map the 'Classes' field")

    classes = config.get("classes")
    if not isinstance(classes, list) or not classes:
        problems.append("'classes' must be a non-empty list")
        classes = []
    for i, cl in enumerate(classes):
        where = f"classes[{i}]"
        if not isinstance(cl, dict):
            problems.append(f"{where}: must be an object")
            continue
        _check_keys(where, cl, {"code", "search", "bibs", "male", "female"}, problems)
        for key in ("code", "search"):
            if not isinstance(cl.get(key), str) or not cl.get(key).strip():
                problems.append(f"{where}: '{key}' must be a non-empty string")
        if any(isinstance(other, dict) and other.get("code") == cl.get("code")
               for other in classes[:i]):
            problems.append(f"{where}: class code '{cl.get('code')}' appears more than once")
        if cl.get("bibs") is not None and not _is_bibs(cl.get("bibs")):
            problems.append(f"{where}: 'bibs' must be [start, end] or null")
        for gender in ("male", "female"):
            split = cl.get(gender)
            if split is None:
                continue
            if not isinstance(split, dict):
                problems.append(f"{where}.{gender}: must be an object")
                continue
            _check_keys(f"{where}.{gender}", split, {"code", "bibs"}, problems)
            if not isinstance(split.get("code"), str) or not split.get("code").strip():
                problems.append(f"{where}.{gender}: 'code' must be a non-empty string")
            if "bibs" in split and not _is_bibs(split["bibs"]):
                problems.append(f"{where}.{gender}: 'bibs' must be [start, end]")

    if config.get("rankings") is not None and not isinstance(config.get("rankings"), str):
        problems.append("'rankings' must be a release id (e.g. \"2026-2\") or null")

    for key, item_keys in (("dobOverrides", ("lastName", "dob")), ("nameRemaps", ("from", "to"))):
        items = config.get(key, [])
        if not isinstance(items, list):
            problems.append(f"'{key}' must be a list")
            continue
        for i, item in enumerate(items):
            if (not isinstance(item, dict)
                    or not all(isinstance(item.get(k), str) for k in item_keys)):
                problems.append(f"{key}[{i}]: must have string {' and '.join(repr(k) for k in item_keys)}")
            else:
                _check_keys(f"{key}[{i}]", item, set(item_keys), problems)

    return problems


def load_config(path: Path | str) -> dict:
    """Read and validate a config file, raising ConfigError if it's malformed."""
    try:
        with open(path, encoding="utf-8") as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        raise ConfigError([f"{path} is not valid JSON: {e}"]) from e
    problems = validate_config(config)
    if problems:
        raise ConfigError(problems)
    return config


def missing_columns(config: dict, headers: list[str]) -> list[str]:
    """Problems for every configured column the CSV doesn't have."""
    problems = []
    for col in config["columns"]:
        for header in col["columns"]:
            if header not in headers:
                close = difflib.get_close_matches(header, headers, n=1)
                hint = f" (did you mean '{close[0]}'?)" if close else ""
                problems.append(f"{col['field']}: column '{header}' isn't in the CSV{hint}")
    return problems


def missing_ranking_release(config: dict, rankings_dir: Path) -> list[str]:
    release = config.get("rankings")
    if release is None or (rankings_dir / f"{release}.json").exists():
        return []
    available = sorted(p.stem for p in rankings_dir.glob("*.json") if p.stem != "index")
    return [f"ranking release '{release}' not found in {rankings_dir} "
            f"(available: {', '.join(available) or 'none'})"]


def converter_args(config: dict, rankings_dir: Path) -> dict:
    """`JustGoToSiwi` keyword arguments (other than paths and output name) for a config."""
    columns = {}
    summary_only = []
    for col in config["columns"]:
        headers = col["columns"]
        columns[col["field"]] = headers[0] if len(headers) == 1 else list(headers)
        if not col.get("siwi", True):
            summary_only.append(col["field"])

    events = {}
    for cl in config["classes"]:
        bibs = tuple(cl["bibs"]) if cl.get("bibs") is not None else (0, 0)
        options = {}
        for gender in ("male", "female"):
            if split := cl.get(gender):
                options[gender] = (split["code"], tuple(split.get("bibs", bibs)))
        if cl.get("bibs") is None:
            options["bibs"] = False
        events[cl["code"]] = (cl["search"], bibs, options)

    release = config.get("rankings")
    return {
        "events": events,
        "columns": columns,
        "summary_only": summary_only,
        "rankings": rankings_dir / f"{release}.json" if release else None,
        "dob_overrides": [(o["lastName"], o["dob"]) for o in config.get("dobOverrides", [])],
        "name_remaps": [(r["from"], r["to"]) for r in config.get("nameRemaps", [])],
    }
