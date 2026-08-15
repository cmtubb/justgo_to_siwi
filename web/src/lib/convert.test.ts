import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { convert } from "./convert";
import type { ColumnMapping, EventClass, Rankings, Row } from "./types";

function fixture(name: string): string {
  return fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
}

function parseCsvString(text: string): Row[] {
  const parsed = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const fields = parsed.meta.fields ?? [];
  return parsed.data.map((row) => {
    const clean: Row = {};
    for (const f of fields) clean[f] = row[f] ?? "";
    return clean;
  });
}

function loadRankings(): Rankings {
  const buf = readFileSync(fixture("rankings.xlsx"));
  const wb = XLSX.read(buf, { type: "buffer" });
  const rankings: Rankings = {};
  for (const sheet of wb.SheetNames) {
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], {
      defval: "",
    });
    rankings[sheet] = json.map((r) => ({
      name: String(r.name ?? ""),
      ranking: String(r.ranking ?? ""),
    }));
  }
  return rankings;
}

const NATIONALS_COLUMNS: ColumnMapping = {
  Age: "Age on Event Start Date",
  Classes: "2026 Canoe Slalom Nationals - NGB:Events entered:",
  Club: "Organisation",
};

const NATIONALS_EVENTS: EventClass[] = [
  { code: "K1M", search: "Men's K1", bibStart: 1, bibEnd: 80 },
  { code: "C1M", search: "Men's C1", bibStart: 1, bibEnd: 80 },
  { code: "K1W", search: "Women's K1", bibStart: 1, bibEnd: 80 },
  { code: "C1W", search: "Women's C1", bibStart: 1, bibEnd: 80 },
  { code: "MCSLX", search: "Men's Kayak Cross", bibStart: 1, bibEnd: 80 },
  { code: "WCSLX", search: "Women's Kayak Cross", bibStart: 1, bibEnd: 80 },
];

describe("convert (parity with justgo_to_siwi.py)", () => {
  it("reproduces the Python for_siwi output on the nationals example", () => {
    const rows = parseCsvString(readFileSync(fixture("example_nationals.csv"), "utf8"));
    const expected = parseCsvString(
      readFileSync(fixture("expected_nationals_for_siwi.csv"), "utf8"),
    );

    const result = convert({
      rows,
      columns: NATIONALS_COLUMNS,
      events: NATIONALS_EVENTS,
      rankings: loadRankings(),
    });

    expect(result.forSiwiColumns).toEqual([
      "FirstName",
      "LastName",
      "DOB",
      "Club",
      "Class",
      "Ranking",
      "Bib",
    ]);
    expect(result.forSiwi).toEqual(expected);
  });
});

describe("convert (targeted behaviour)", () => {
  const columns: ColumnMapping = { Age: "Age", Classes: "Classes", Club: "Organisation" };

  const rows: Row[] = [
    {
      FirstName: "Sam",
      LastName: "Jones",
      DOB: "01/01/2000",
      Age: "25",
      Classes: "Men's K1",
      Organisation: "Western Sydney Whitewater Club (CL000350)",
      Regions: "New South Wales (CL000152)",
    },
    {
      FirstName: "Alex",
      LastName: "Smith",
      DOB: "01/01/2001",
      Age: "24",
      Classes: "Men's K1",
      Organisation: "Derwent Canoe Club (CL000229),Big River Canoe Club (CL000999)",
      Regions: "Tasmania (CL000154)",
    },
  ];

  const events: EventClass[] = [{ code: "K1M", search: "Men's K1", bibStart: 1, bibEnd: 80 }];

  it("guesses club acronyms and strips membership codes", () => {
    const result = convert({ rows, columns, events });
    const clubs = Object.fromEntries(result.forSiwi.map((r) => [r.FirstName, r.Club]));
    expect(clubs.Sam).toBe("WSWC");
    expect(clubs.Alex).toBe("DCC");
  });

  it("uppercases surnames and derives a Region for the summary", () => {
    const result = convert({ rows, columns, events });
    expect(result.forSiwi[0].LastName).toBe(result.forSiwi[0].LastName.toUpperCase());
    expect(result.summaryColumns).toContain("Region");
    const sam = result.summary.find((r) => r.FirstName === "Sam");
    expect(sam?.Region).toBe("New South Wales");
  });

  it("ranks by ranking (numerically) then age, and assigns descending bibs", () => {
    const rankings: Rankings = {
      K1M: [
        { name: "JONES Sam", ranking: "10" },
        { name: "SMITH Alex", ranking: "2" },
      ],
    };
    const result = convert({ rows, columns, events, rankings });
    // Numeric order: 10 sorts before 2 descending, so Sam (rank 10) is first.
    expect(result.forSiwi.map((r) => r.FirstName)).toEqual(["Sam", "Alex"]);
    expect(result.forSiwi.map((r) => r.Bib)).toEqual(["2", "1"]);
    expect(result.forSiwi.map((r) => r.Ranking)).toEqual(["10", "2"]);
  });

  it("sorts unranked entries before ranked ones, giving them the highest bibs", () => {
    const rankings: Rankings = {
      K1M: [{ name: "SMITH Alex", ranking: "5" }],
    };
    const result = convert({ rows, columns, events, rankings });
    // Sam has no ranking entry, so gets the highest bib ahead of ranked Alex.
    expect(result.forSiwi.map((r) => r.FirstName)).toEqual(["Sam", "Alex"]);
    expect(result.forSiwi.map((r) => r.Ranking)).toEqual(["", "5"]);
    expect(result.forSiwi.map((r) => r.Bib)).toEqual(["2", "1"]);
  });

  it("orders multiple unranked entries by age, youngest getting the highest bib", () => {
    const unrankedRows: Row[] = [
      { ...rows[0], FirstName: "Older", Age: "30" },
      { ...rows[1], FirstName: "Younger", Age: "20" },
    ];
    const result = convert({ rows: unrankedRows, columns, events });
    expect(result.forSiwi.map((r) => r.FirstName)).toEqual(["Younger", "Older"]);
    expect(result.forSiwi.map((r) => r.Bib)).toEqual(["2", "1"]);
  });

  it("warns when a class has more entrants than bibs", () => {
    const tight: EventClass[] = [{ code: "K1M", search: "Men's K1", bibStart: 1, bibEnd: 2 }];
    const result = convert({ rows, columns, events: tight });
    expect(result.warnings.some((w) => w.includes("Not enough bibs"))).toBe(true);
  });
});
