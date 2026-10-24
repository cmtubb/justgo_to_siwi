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
