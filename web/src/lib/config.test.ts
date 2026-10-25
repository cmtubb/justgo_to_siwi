import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import {
  buildConfig,
  checkMappings,
  closestHeader,
  convertInput,
  formatConfig,
  parseConfig,
} from "./config";
import { convert } from "./convert";
import type { Mapping, Rankings, Row } from "./types";

// The race configs, example CSVs and expected outputs are shared with the
// Python tests (tests/test_config.py), so both converters are held to the same files.
function repoFile(path: string): string {
  return fileURLToPath(new URL(`../../../${path}`, import.meta.url));
}

function parseCsvString(text: string): { headers: string[]; rows: Row[] } {
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data.map((row) => {
    const clean: Row = {};
    for (const h of headers) clean[h] = row[h] ?? "";
    return clean;
  });
  return { headers, rows };
}

function loadRelease(id: string): Rankings {
  const doc = JSON.parse(readFileSync(repoFile(`web/public/rankings/${id}.json`), "utf8")) as {
    classes: Record<string, { name: string; ranking: number | string }[]>;
  };
  const rankings: Rankings = {};
  for (const [cls, entries] of Object.entries(doc.classes)) {
    rankings[cls] = entries.map((e) => ({ name: e.name, ranking: String(e.ranking) }));
  }
  return rankings;
}

const EXAMPLES = [
  { config: "2026_nationals", csv: "example_nationals.csv" },
  { config: "2026_age_nationals", csv: "example_age_nationals.csv" },
  { config: "2026_nsw_state_champs", csv: "example_state_champs.csv" },
];

const ALL_CONFIGS = [
  "2026_nationals",
  "2026_age_nationals",
  "2026_may_wswc_club_race",
  "2026_may_v2_wswc_club_race",
  "2026_nsw_state_champs",
];

describe("race configs (parity with justgo_to_siwi_convert.py)", () => {
  it.each(EXAMPLES)("$config converts $csv to the expected Siwi output", ({ config, csv }) => {
    const parsed = parseConfig(readFileSync(repoFile(`configs/${config}.json`), "utf8"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    const settings = parsed.settings!;

    const { headers, rows } = parseCsvString(readFileSync(repoFile(`examples/${csv}`), "utf8"));
    const checked = checkMappings(settings.mappings, headers);
    expect(checked.warnings).toEqual([]);

    const rankings = settings.rankings ? loadRelease(settings.rankings) : undefined;
    const result = convert(convertInput({ ...settings, mappings: checked.mappings }, rows, rankings));

    const expected = parseCsvString(
      readFileSync(repoFile(`examples/expected/${config}.csv`), "utf8"),
    );
    expect(result.forSiwiColumns).toEqual(expected.headers);
    expect(result.forSiwi).toEqual(expected.rows);
  });

  it.each(ALL_CONFIGS)("saving %s after loading it reproduces the file exactly", (config) => {
    const text = readFileSync(repoFile(`configs/${config}.json`), "utf8");
    const settings = parseConfig(text).settings!;
    expect(formatConfig(buildConfig(settings))).toBe(text);
  });
});

describe("parseConfig", () => {
  it("rejects invalid JSON and unknown versions", () => {
    expect(parseConfig("{nope").errors[0]).toMatch(/Not valid JSON/);
    expect(parseConfig('{"version": 2, "columns": [], "classes": []}').errors[0]).toMatch(
      /Unsupported config version 2/,
    );
    expect(parseConfig('{"version": 1}').settings).toBeUndefined();
  });

  it("skips unusable entries with a warning instead of failing", () => {
    const parsed = parseConfig(
      JSON.stringify({
        version: 1,
        extra: true,
        columns: [{ field: "Classes", columns: ["A"] }, { columns: ["B"] }],
        classes: [
          { code: "K1M", search: "MK1", bibs: [80, 1] },
          { code: "C1M" },
          { code: "C2", search: "^C2", bibs: null, male: { code: "MC2" } },
        ],
        rankings: 7,
      }),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([
      "config: unknown setting 'extra' was ignored.",
      "columns[1]: needs a 'field' and a list of 'columns'; skipped.",
      "classes[0] (K1M): 'bibs' should be [start, end] or null; using 1-80.",
      "classes[1]: needs a 'code' and 'search'; skipped.",
      "'rankings' should be a release id (e.g. \"2026-2\") or null; using none.",
    ]);
    const settings = parsed.settings!;
    expect(settings.mappings.map((m) => m.internal)).toEqual(["Classes"]);
    expect(settings.events.map((e) => e.code)).toEqual(["K1M", "C2"]);
    expect(settings.events[0]).toMatchObject({ bibStart: 1, bibEnd: 80 });
    expect(settings.events[1]).toMatchObject({ noBibs: true, male: { code: "MC2" } });
    expect(settings.rankings).toBeNull();
  });
});

describe("checkMappings", () => {
  const headers = ["Age on Event Start Date", "Form:MK1", "Form:MC1", "Organisation"];
  const mapping = (internal: string, cols: string[]): Mapping => ({
    internal,
    headers: cols,
    multi: cols.length > 1,
    summaryOnly: false,
  });

  it("drops columns the CSV doesn't have, keeping the rest of a multi-column field", () => {
    const checked = checkMappings(
      [
        mapping("Classes", ["Form:MK1", "Form:XYZ", "Form:MC1"]),
        mapping("Club", ["Organization"]),
        mapping("Age", ["Age on Event Start Date"]),
      ],
      headers,
    );
    expect(checked.mappings.map((m) => m.headers)).toEqual([
      ["Form:MK1", "Form:MC1"],
      [""],
      ["Age on Event Start Date"],
    ]);
    expect(checked.warnings).toEqual([
      "Classes: column 'Form:XYZ' isn't in this CSV, so it was left out (did you mean 'Form:MK1'?).",
      "Club: column 'Organization' isn't in this CSV, so it was left out (did you mean 'Organisation'?).",
    ]);
  });

  it("only suggests reasonably close headers", () => {
    expect(closestHeader("Organization", headers)).toBe("Organisation");
    expect(closestHeader("Paddler's School", headers)).toBeNull();
  });
});

describe("buildConfig", () => {
  it("skips incomplete rows and only writes siwi: false where it applies", () => {
    const config = buildConfig({
      mappings: [
        { internal: "Classes", headers: ["A", "B"], multi: true, summaryOnly: false },
        { internal: "Age", headers: ["Age"], multi: false, summaryOnly: true },
        { internal: "C2Partner", headers: ["P"], multi: false, summaryOnly: true },
        { internal: "Gender", headers: [""], multi: false, summaryOnly: true },
      ],
      events: [
        { code: "K1M", search: "MK1", bibStart: 1, bibEnd: 80 },
        { code: "", search: "x", bibStart: 1, bibEnd: 80 },
        {
          code: "C2", search: "^C2", bibStart: 1, bibEnd: 80, noBibs: true,
          male: { code: "MC2", bibStart: 5, bibEnd: 9 },
          female: { code: "", bibStart: 1, bibEnd: 80 },
        },
      ],
      rankings: null,
      outputName: "race",
      dobOverrides: [{ lastName: "", dob: "" }],
      nameRemaps: [],
    });
    expect(config.columns).toEqual([
      { field: "Classes", columns: ["A", "B"] },
      { field: "Age", columns: ["Age"] },
      { field: "C2Partner", columns: ["P"], siwi: false },
    ]);
    expect(config.classes).toEqual([
      { code: "K1M", search: "MK1", bibs: [1, 80] },
      { code: "C2", search: "^C2", bibs: null, male: { code: "MC2" } },
    ]);
    expect(config.dobOverrides).toEqual([]);
  });
});
