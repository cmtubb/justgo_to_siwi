export type Row = Record<string, string>;

/**
 * Maps an internal field name (e.g. "Classes") to a JustGo CSV column header,
 * or to several headers whose non-empty values are joined with "|" (for
 * exports that have one column per class).
 */
export type ColumnMapping = Record<string, string | string[]>;

/** The class code (and bib range) entrants of one gender get, e.g. MCSLX. */
export interface GenderSplit {
  code: string;
  bibStart: number;
  bibEnd: number;
}

export interface EventClass {
  /** Siwi class code, e.g. "K1M". */
  code: string;
  /** Regex tested against each "|"-separated value of the athlete's Classes field. */
  search: string;
  bibStart: number;
  bibEnd: number;
  /** Code and bibs for male entrants (e.g. "MCSLX"); others keep `code`. Needs a mapped Gender. */
  male?: GenderSplit;
  /** Code and bibs for female entrants (e.g. "WCSLX"); others keep `code`. Needs a mapped Gender. */
  female?: GenderSplit;
  /** Include the class in Siwi (ranked and sorted) but leave its Bib blank. */
  noBibs?: boolean;
}

export interface RankingEntry {
  name: string;
  ranking: string;
}

/** Class code -> ranking rows (from the ICF rankings workbook). */
export type Rankings = Record<string, RankingEntry[]>;

/** One entry in the built-in rankings' index.json (newest release first). */
export interface RankingReleaseInfo {
  id: string;
  file: string;
  counts: Record<string, number>;
}

export interface RankingIndex {
  generatedAt: string;
  releases: RankingReleaseInfo[];
}

/** Force a DOB for an athlete matched by surname (replaces hardcoded fixes). */
export interface DobOverride {
  lastName: string;
  dob: string;
}

/** Remap an athlete's "LASTNAME Firstname" before ranking lookup. */
export interface NameRemap {
  from: string;
  to: string;
}

/** One row of the column-mapping step. */
export interface Mapping {
  internal: string;
  /** One or more CSV columns; several are joined with "|" (one column per class). */
  headers: string[];
  /** Pick columns from a checklist instead of a single dropdown. */
  multi: boolean;
  /** Keep the field in the Summary only, not the Siwi output. */
  summaryOnly: boolean;
}

/** A race config file (shared with justgo_to_siwi_convert.py). */
export interface SiwiConfig {
  version: 1;
  outputName?: string;
  columns: { field: string; columns: string[]; siwi?: boolean }[];
  classes: {
    code: string;
    search: string;
    /** [start, end], or null for no bibs. */
    bibs: [number, number] | null;
    male?: { code: string; bibs?: [number, number] };
    female?: { code: string; bibs?: [number, number] };
  }[];
  /** Ranking release id (e.g. "2026-2"), or null for none. */
  rankings?: string | null;
  dobOverrides?: DobOverride[];
  nameRemaps?: NameRemap[];
}

export interface ConvertInput {
  rows: Row[];
  columns: ColumnMapping;
  events: EventClass[];
  rankings?: Rankings;
  dobOverrides?: DobOverride[];
  nameRemaps?: NameRemap[];
  /** Mapped fields kept in the Summary but left out of the Siwi output. */
  summaryOnly?: string[];
}

export interface ConvertResult {
  summary: Row[];
  summaryColumns: string[];
  forSiwi: Row[];
  forSiwiColumns: string[];
  warnings: string[];
}
