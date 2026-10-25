import type {
  ColumnMapping,
  ConvertInput,
  ConvertResult,
  EventClass,
  GenderSplit,
  Rankings,
  Row,
} from "./types";

// " (CL000350)" style membership codes appended to club/region names.
const CL_CODE = / \(CL[0-9]+\)/g;
// First capital letter of each capitalised word, used to build club acronyms.
const ACRONYM = /([A-Z])[A-Za-z]+/g;

function stripCodes(value: string): string {
  return value.replace(CL_CODE, "");
}

/**
 * Treat `pattern` as a regular expression (matching pandas' Series.str.contains
 * default), falling back to a literal substring test for invalid regexes.
 */
function contains(haystack: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(haystack);
  } catch {
    return haystack.includes(pattern);
  }
}

/**
 * Collapse a comma-separated club list to a single club, then reduce it to an
 * acronym of its capitalised words (e.g. "Western Sydney Whitewater Club" -> "WSWC").
 */
function guessClub(stripped: string): string {
  const clubs = stripped.split(" of NSW Inc").join("").split(",");

  let club: string;
  if (clubs.length > 1) {
    club = clubs[0];
    if (clubs.includes("Derwent Canoe Club")) club = "Derwent Canoe Club";
    else if (clubs.includes("Big River Canoe Club")) club = "Big River Canoe Club";
    else if (clubs.includes("Western Sydney Whitewater Club"))
      club = "Western Sydney Whitewater Club";
    else if (clubs.includes("Melbourne Canoe Club")) club = "Melbourne Canoe Club";
  } else {
    club = clubs[0];
  }

  const letters: string[] = [];
  for (const match of club.matchAll(ACRONYM)) letters.push(match[1]);
  return letters.join("");
}

/** Pick a single region from a comma-separated list, preferring New South Wales. */
function guessRegion(stripped: string): string {
  const regions = stripped.split(",");
  if (regions.length > 1) {
    let region = regions[0];
    for (const r of regions.slice(1)) if (r === "New South Wales") region = r;
    return region;
  }
  return regions[0];
}

/**
 * Rename mapped headers to their internal names. A field mapped to several
 * headers gets their non-empty values joined with "|" (the originals are kept).
 */
function renameColumns(rows: Row[], columns: ColumnMapping): Row[] {
  const rename: Record<string, string> = {};
  for (const [internal, header] of Object.entries(columns)) {
    if (!Array.isArray(header)) rename[header] = internal;
  }

  return rows.map((row) => {
    const renamed: Row = {};
    for (const key of Object.keys(row)) {
      renamed[rename[key] ?? key] = row[key];
    }
    for (const [internal, header] of Object.entries(columns)) {
      if (Array.isArray(header)) {
        renamed[internal] = header
          .map((h) => (row[h] ?? "").trim())
          .filter((v) => v !== "")
          .join("|");
      }
    }
    return renamed;
  });
}

/** The individual class values in an athlete's "|"-separated Classes field. */
function classValues(classes: string): string[] {
  return classes
    .split("|")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

function normaliseGender(value: string): "male" | "female" | null {
  const v = value.trim().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return null;
}

/**
 * The Siwi class code (and its bib range) an athlete gets for `ev`, split by
 * gender when configured.
 */
function classCode(ev: EventClass, gender: "male" | "female" | null): GenderSplit {
  const split = gender === "male" ? ev.male : gender === "female" ? ev.female : undefined;
  if (split?.code.trim()) return { ...split, code: split.code.trim() };
  return { code: ev.code, bibStart: ev.bibStart, bibEnd: ev.bibEnd };
}

function hasGenderSplit(ev: EventClass): boolean {
  return Boolean(ev.male?.code.trim() || ev.female?.code.trim());
}

function quoteList(values: Iterable<string>): string {
  return [...values].map((v) => `'${v}'`).join(", ");
}

function lookupRanking(
  rankings: Rankings | undefined,
  classCode: string,
  name: string,
  missingClasses: Set<string>,
): string {
  if (!rankings) return "";
  const entries = rankings[classCode];
  if (!entries) {
    missingClasses.add(classCode);
    return "";
  }
  const found = entries.find((entry) => contains(entry.name, name));
  return found ? String(found.ranking) : "";
}

/** Ordinal (code-point) string comparison, matching Python's default ordering. */
function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Descending numeric comparison for Ranking. Python's Ranking column is read
 * back from Excel as int64 (pandas infers the numeric type), so it sorts
 * numerically rather than lexicographically. Unranked (empty) entries sort
 * before all ranked ones (and so get the highest bibs, tie-broken by age),
 * regardless of comparison order.
 */
function cmpRankingDesc(a: string, b: string): number {
  const av = a === "" ? null : Number(a);
  const bv = b === "" ? null : Number(b);
  if (av === null && bv === null) return 0;
  if (av === null) return -1;
  if (bv === null) return 1;
  return bv - av;
}

/**
 * Port of `JustGoToSiwi.calculate`. Produces the Summary table and the
 * ranked/bibbed "for Siwi" table from parsed JustGo rows.
 */
export function convert(input: ConvertInput): ConvertResult {
  const { columns, events } = input;
  const warnings: string[] = [];
  const internalNames = Object.keys(columns);

  let rows: Row[] = input.rows.map((r) => ({ ...r }));

  // If the CSV already has an "Age" column but Age is mapped elsewhere, drop the
  // original so the rename target doesn't collide.
  if (
    "Age" in columns &&
    columns.Age !== "Age" &&
    rows.length > 0 &&
    "Age" in rows[0]
  ) {
    for (const r of rows) delete r.Age;
  }

  rows = renameColumns(rows, columns);

  for (const override of input.dobOverrides ?? []) {
    for (const r of rows) {
      if (r.LastName === override.lastName) r.DOB = override.dob;
    }
  }

  // The Organisation field carries a comma-separated club list with codes.
  if (columns.Club === "Organisation") {
    for (const r of rows) r.Club = guessClub(stripCodes(r.Club ?? ""));
  }

  const hasRegions = rows.length > 0 && "Regions" in rows[0];
  if (hasRegions) {
    for (const r of rows) {
      const stripped = stripCodes(r.Regions ?? "");
      r.Regions = stripped;
      r.Region = guessRegion(stripped);
    }
  }

  const summaryColumns = ["FirstName", "LastName", "DOB"];
  if (hasRegions) summaryColumns.push("Region");
  summaryColumns.push(...internalNames);

  const summary: Row[] = rows.map((r) => {
    const picked: Row = {};
    for (const col of summaryColumns) picked[col] = r[col] ?? "";
    picked.LastName = (picked.LastName ?? "").toUpperCase();
    return picked;
  });

  // Split into per-class entries (an athlete may appear in several classes).
  const summaryOnly = new Set(input.summaryOnly ?? []);
  const siwiCols = [
    "FirstName",
    "LastName",
    "DOB",
    ...internalNames.filter((k) => k !== "Classes" && !summaryOnly.has(k)),
  ];

  const hasGender = internalNames.includes("Gender");
  // Class value -> codes of the classes that matched it, and how many entrants had it.
  const valueMatches = new Map<string, Set<string>>();
  const valueCounts = new Map<string, number>();
  for (const r of summary) {
    for (const value of new Set(classValues(r.Classes ?? ""))) {
      valueMatches.set(value, new Set());
      valueCounts.set(value, (valueCounts.get(value) ?? 0) + 1);
    }
  }

  const siwi: Row[] = [];
  // Bib range for each Siwi class code (null: no bibs), first class row to produce it wins.
  const bibRanges = new Map<string, GenderSplit | null>();
  for (const ev of events) {
    const matchedValues = new Set<string>();
    let unknownGender = 0;
    for (const r of summary) {
      const hits = classValues(r.Classes ?? "").filter((v) => contains(v, ev.search));
      if (hits.length === 0) continue;
      for (const v of hits) {
        matchedValues.add(v);
        valueMatches.get(v)?.add(ev.code);
      }
      const gender = hasGender ? normaliseGender(r.Gender ?? "") : null;
      if (hasGender && hasGenderSplit(ev) && gender === null) unknownGender++;
      const split = classCode(ev, gender);
      const code = split.code;
      if (!bibRanges.has(code)) bibRanges.set(code, ev.noBibs ? null : split);

      const entry: Row = {};
      for (const col of siwiCols) entry[col] = r[col] ?? "";
      entry.Class = code;
      siwi.push(entry);
    }

    if (matchedValues.size === 0) {
      warnings.push(`Class ${ev.code} (search '${ev.search}') matched no entrants.`);
    } else if (matchedValues.size > 1) {
      warnings.push(
        `Search '${ev.search}' (class ${ev.code}) matched ${matchedValues.size} different ` +
          `values: ${quoteList(matchedValues)}. If that's not intended, make it more ` +
          `specific, e.g. anchor it with '^'.`,
      );
    }
    if (hasGenderSplit(ev)) {
      if (!hasGender) {
        warnings.push(
          `Class ${ev.code} has male/female codes but no 'Gender' column is mapped, ` +
            `so its entrants were kept as ${ev.code}.`,
        );
      } else if (unknownGender > 0) {
        warnings.push(
          `${unknownGender} ${ev.code} entrant(s) had no recognised Gender and were kept as ${ev.code}.`,
        );
      }
    }
  }

  for (const [value, codes] of valueMatches) {
    if (codes.size > 1) {
      warnings.push(`Class value '${value}' matched several classes: ${quoteList(codes)}.`);
    }
  }
  const unassigned = [...valueMatches]
    .filter(([, codes]) => codes.size === 0)
    .map(([value]) => `'${value}' (${valueCounts.get(value)})`);
  if (unassigned.length > 0) {
    warnings.push(
      `Not assigned to any class (still listed in the Summary): ${unassigned.join(", ")}.`,
    );
  }

  const missingClasses = new Set<string>();
  for (const r of siwi) {
    let name = `${r.LastName} ${r.FirstName}`;
    for (const remap of input.nameRemaps ?? []) if (name === remap.from) name = remap.to;
    r.Ranking = lookupRanking(input.rankings, r.Class, name, missingClasses);
  }
  if (missingClasses.size > 0) {
    warnings.push(
      `No ranking sheet found for: ${[...missingClasses].join(", ")}. Those entries were left unranked.`,
    );
  }

  // Sort: Class descending, Ranking descending (numeric; unranked last),
  // Age ascending; original order breaks ties for stability.
  const hasAge = internalNames.includes("Age");
  if (!hasAge) {
    warnings.push(
      "No 'Age' column mapped: entries with the same ranking (or no ranking at " +
        "all) will keep the CSV's original row order instead of being ordered by age.",
    );
  }
  const indexed = siwi.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const byClass = cmpStr(b.r.Class, a.r.Class);
    if (byClass !== 0) return byClass;
    const byRanking = cmpRankingDesc(a.r.Ranking ?? "", b.r.Ranking ?? "");
    if (byRanking !== 0) return byRanking;
    if (hasAge) {
      const ageDiff = Number(a.r.Age) - Number(b.r.Age);
      if (ageDiff !== 0) return ageDiff;
    }
    return a.i - b.i;
  });
  const sorted = indexed.map((x) => x.r);

  // Assign bibs per class: highest-ranked (first after sort) gets the top bib.
  // Classes without bibs keep a blank Bib.
  for (const [code, ev] of bibRanges) {
    if (ev === null) continue;
    const classRows = sorted.filter((r) => r.Class === code);
    const count = classRows.length;
    if (ev.bibEnd - ev.bibStart < count) {
      warnings.push(
        `Not enough bibs for '${code}': ${count} entrants but range ${ev.bibStart}-${ev.bibEnd} only allows ${ev.bibEnd - ev.bibStart}.`,
      );
    }
    for (let i = 0; i < count; i++) {
      classRows[i].Bib = String(ev.bibStart + count - 1 - i);
    }
  }

  const forSiwiColumns = [
    "FirstName",
    "LastName",
    "DOB",
    ...internalNames.filter((k) => k !== "Classes" && k !== "Age" && !summaryOnly.has(k)),
    "Class",
    "Ranking",
    "Bib",
  ];

  const forSiwi: Row[] = sorted.map((r) => {
    const picked: Row = {};
    for (const col of forSiwiColumns) picked[col] = r[col] ?? "";
    return picked;
  });

  return { summary, summaryColumns, forSiwi, forSiwiColumns, warnings };
}

export type { EventClass };
