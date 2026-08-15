export type Row = Record<string, string>;

/** Maps an internal field name (e.g. "Classes") to a JustGo CSV column header. */
export type ColumnMapping = Record<string, string>;

export interface EventClass {
  /** Siwi class code, e.g. "K1M". */
  code: string;
  /** Substring/regex searched within the athlete's Classes field. */
  search: string;
  bibStart: number;
  bibEnd: number;
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
}

export interface ConvertResult {
  summary: Row[];
  summaryColumns: string[];
  forSiwi: Row[];
  forSiwiColumns: string[];
  warnings: string[];
}
