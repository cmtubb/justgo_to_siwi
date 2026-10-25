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

describe("convert (one column per class)", () => {
  const rows: Row[] = [
    { FirstName: "Sam", LastName: "Jones", DOB: "01/01/2000", Age: "25", Gender: "Male",
      A: "MK1", B: "MC1", C: "C1 Teams", D: "CSLX", E: "C2 - Open", P: "Elsa" },
    { FirstName: "Jo", LastName: "Brown", DOB: "01/01/2001", Age: "24", Gender: "Female",
      A: "WK1", B: "WC1", C: "", D: "CSLX", E: "", P: "" },
    { FirstName: "Lee", LastName: "Grey", DOB: "01/01/2002", Age: "23", Gender: "",
      A: "", B: "", C: "", D: "CSLX", E: "", P: "" },
  ];
  const columns: ColumnMapping = {
    Age: "Age",
    Classes: ["A", "B", "C", "D", "E"],
    Gender: "Gender",
    C2Partner: "P",
  };
  const run = (events: EventClass[], extra: Partial<Parameters<typeof convert>[0]> = {}) =>
    convert({ rows, columns, events, ...extra });

  it("joins the non-empty class columns with '|' for the Summary", () => {
    const result = run([]);
    expect(result.summary.map((r) => r.Classes)).toEqual([
      "MK1|MC1|C1 Teams|CSLX|C2 - Open",
      "WK1|WC1|CSLX",
      "CSLX",
    ]);
  });

  it("matches each class value separately, so '^C1' only picks the teams value", () => {
    const result = run([{ code: "C1T", search: "^C1", bibStart: 1, bibEnd: 80 }]);
    expect(result.forSiwi.map((r) => r.FirstName)).toEqual(["Sam"]);
    expect(result.warnings.some((w) => w.includes("matched 2 different"))).toBe(false);
  });

  it("warns when a search matches several different values", () => {
    const result = run([{ code: "C1T", search: "C1", bibStart: 1, bibEnd: 80 }]);
    const warning = result.warnings.find((w) => w.includes("matched 3 different values"));
    expect(warning).toContain("'MC1', 'C1 Teams', 'WC1'");
  });

  it("warns when one value matches several classes", () => {
    const result = run([
      { code: "K1M", search: "MK1", bibStart: 1, bibEnd: 80 },
      { code: "K1X", search: "K1", bibStart: 1, bibEnd: 80 },
    ]);
    expect(result.warnings).toContain("Class value 'MK1' matched several classes: 'K1M', 'K1X'.");
  });

  it("lists class values no class picked up, with entrant counts", () => {
    const result = run([{ code: "CSLX", search: "^CSLX", bibStart: 1, bibEnd: 80 }]);
    const warning = result.warnings.find((w) => w.startsWith("Not assigned to any class"));
    expect(warning).toContain("'MK1' (1)");
    expect(warning).not.toContain("'CSLX'");
  });

  it("splits a class by gender with its own bib ranges, falling back when gender is unknown", () => {
    const cslx: EventClass = {
      code: "CSLX", search: "^CSLX", bibStart: 1, bibEnd: 80,
      male: { code: "MCSLX", bibStart: 101, bibEnd: 180 },
      female: { code: "WCSLX", bibStart: 201, bibEnd: 280 },
    };
    const result = run([cslx]);
    const classes = Object.fromEntries(
      result.forSiwi.map((r) => [r.FirstName, `${r.Class} ${r.Bib}`]),
    );
    expect(classes).toEqual({ Sam: "MCSLX 101", Jo: "WCSLX 201", Lee: "CSLX 1" });
    expect(result.warnings).toContain(
      "1 CSLX entrant(s) had no recognised Gender and were kept as CSLX.",
    );
  });

  it("keeps a gender-split class as its own code when Gender isn't mapped", () => {
    const { Gender: _, ...noGender } = columns;
    const result = convert({
      rows,
      columns: noGender,
      events: [
        {
          code: "CSLX", search: "^CSLX", bibStart: 1, bibEnd: 80,
          male: { code: "MCSLX", bibStart: 1, bibEnd: 80 },
        },
      ],
    });
    expect(result.forSiwi.map((r) => r.Class)).toEqual(["CSLX", "CSLX", "CSLX"]);
    expect(result.warnings.some((w) => w.includes("no 'Gender' column is mapped"))).toBe(true);
  });

  it("includes no-bib classes in Siwi with a blank Bib", () => {
    const result = run([
      { code: "K1M", search: "^MK1$", bibStart: 1, bibEnd: 80 },
      { code: "C2", search: "^C2", bibStart: 1, bibEnd: 0, noBibs: true },
    ]);
    const bibs = Object.fromEntries(result.forSiwi.map((r) => [r.Class, r.Bib]));
    expect(bibs).toEqual({ K1M: "1", C2: "" });
    expect(result.warnings.some((w) => w.includes("Not enough bibs"))).toBe(false);
  });

  it("keeps summary-only fields in the Summary but not the Siwi output", () => {
    const result = run([{ code: "K1M", search: "^MK1$", bibStart: 1, bibEnd: 80 }], {
      summaryOnly: ["Gender", "C2Partner"],
    });
    expect(result.summaryColumns).toEqual(
      expect.arrayContaining(["Gender", "C2Partner"]),
    );
    expect(result.summary[0].C2Partner).toBe("Elsa");
    expect(result.forSiwiColumns).not.toContain("C2Partner");
    expect(result.forSiwiColumns).not.toContain("Gender");
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

  it("warns when Age isn't mapped, since ties then keep CSV row order instead of age order", () => {
    const noAgeColumns: ColumnMapping = { Classes: "Classes", Club: "Organisation" };
    const result = convert({ rows, columns: noAgeColumns, events });
    expect(result.warnings.some((w) => w.includes("No 'Age' column mapped"))).toBe(true);
  });

  it("does not warn about Age when it is mapped", () => {
    const result = convert({ rows, columns, events });
    expect(result.warnings.some((w) => w.includes("No 'Age' column mapped"))).toBe(false);
  });
});
