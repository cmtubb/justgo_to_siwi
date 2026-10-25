import type {
  ColumnMapping,
  ConvertInput,
  DobOverride,
  EventClass,
  Mapping,
  NameRemap,
  Rankings,
  Row,
  SiwiConfig,
} from "./types";

// Mirrors src/justgo_to_siwi/config.py: the same file drives both converters.
// The web app loads what it can and warns; the Python tool errors instead.

export const CONFIG_VERSION = 1;

const DEFAULT_BIBS: [number, number] = [1, 80];
const NOT_IN_SIWI = new Set(["Classes", "Age"]);

/** Everything a config sets in the app. */
export interface AppSettings {
  mappings: Mapping[];
  events: EventClass[];
  rankings: string | null;
  outputName: string;
  dobOverrides: DobOverride[];
  nameRemaps: NameRemap[];
}

export interface ParsedConfig {
  /** Undefined when the file couldn't be loaded at all (see `errors`). */
  settings?: AppSettings;
  errors: string[];
  warnings: string[];
}

/** Build a config from the app's settings, skipping incomplete rows. */
export function buildConfig(settings: AppSettings): SiwiConfig {
  const columns: SiwiConfig["columns"] = [];
  for (const m of settings.mappings) {
    const field = m.internal.trim();
    const headers = m.headers.filter((h) => h);
    if (!field || headers.length === 0) continue;
    columns.push({
      field,
      columns: headers,
      ...(m.summaryOnly && !NOT_IN_SIWI.has(field) ? { siwi: false } : {}),
    });
  }

  const classes: SiwiConfig["classes"] = [];
  for (const ev of settings.events) {
    if (!ev.code.trim() || !ev.search.trim()) continue;
    const cls: SiwiConfig["classes"][number] = {
      code: ev.code.trim(),
      search: ev.search,
      bibs: ev.noBibs ? null : [ev.bibStart, ev.bibEnd],
    };
    for (const gender of ["male", "female"] as const) {
      const split = ev[gender];
      if (!split?.code.trim()) continue;
      cls[gender] = ev.noBibs
        ? { code: split.code.trim() }
        : { code: split.code.trim(), bibs: [split.bibStart, split.bibEnd] };
    }
    classes.push(cls);
  }

  return {
    version: CONFIG_VERSION,
    outputName: settings.outputName,
    columns,
    classes,
    rankings: settings.rankings,
    dobOverrides: settings.dobOverrides.filter((o) => o.lastName.trim()),
    nameRemaps: settings.nameRemaps.filter((r) => r.from.trim()),
  };
}

/** Pretty JSON with [start, end] bib pairs kept on one line. */
export function formatConfig(config: SiwiConfig): string {
  return (
    JSON.stringify(config, null, 2).replace(
      /\[\s+(-?\d+),\s+(-?\d+)\s+\]/g,
      "[$1, $2]",
    ) + "\n"
  );
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBibs(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => Number.isInteger(v)) &&
    value[0] <= value[1]
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function unknownKeys(where: string, item: Json, allowed: string[], warnings: string[]) {
  for (const key of Object.keys(item)) {
    if (!allowed.includes(key)) warnings.push(`${where}: unknown setting '${key}' was ignored.`);
  }
}

/**
 * Parse a config file's text into app settings. Structural problems are
 * errors (nothing loads); unknown or unusable entries are skipped with a
 * warning. Column names aren't checked here; see `checkMappings`.
 */
export function parseConfig(text: string): ParsedConfig {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`Not valid JSON: ${String(e)}`], warnings };
  }
  if (!isObject(raw)) return { errors: ["The config must be a JSON object."], warnings };
  if (raw.version !== CONFIG_VERSION) {
    return {
      errors: [`Unsupported config version ${JSON.stringify(raw.version)} (expected ${CONFIG_VERSION}).`],
      warnings,
    };
  }
  unknownKeys(
    "config",
    raw,
    ["version", "outputName", "columns", "classes", "rankings", "dobOverrides", "nameRemaps"],
    warnings,
  );
  if (!Array.isArray(raw.columns)) errors.push("'columns' must be a list.");
  if (!Array.isArray(raw.classes)) errors.push("'classes' must be a list.");
  if (errors.length > 0) return { errors, warnings };

  const mappings: Mapping[] = [];
  (raw.columns as unknown[]).forEach((col, i) => {
    const where = `columns[${i}]`;
    if (
      !isObject(col) ||
      !nonEmptyString(col.field) ||
      !Array.isArray(col.columns) ||
      !col.columns.every((h) => typeof h === "string")
    ) {
      warnings.push(`${where}: needs a 'field' and a list of 'columns'; skipped.`);
      return;
    }
    unknownKeys(where, col, ["field", "columns", "siwi"], warnings);
    const headers = col.columns as string[];
    mappings.push({
      internal: col.field,
      headers: headers.length > 0 ? headers : [""],
      multi: headers.length > 1,
      summaryOnly: col.siwi === false,
    });
  });

  const events: EventClass[] = [];
  (raw.classes as unknown[]).forEach((cls, i) => {
    const where = `classes[${i}]`;
    if (!isObject(cls) || !nonEmptyString(cls.code) || !nonEmptyString(cls.search)) {
      warnings.push(`${where}: needs a 'code' and 'search'; skipped.`);
      return;
    }
    unknownKeys(where, cls, ["code", "search", "bibs", "male", "female"], warnings);
    let bibs = DEFAULT_BIBS;
    if (cls.bibs !== null && !isBibs(cls.bibs)) {
      warnings.push(`${where} (${cls.code}): 'bibs' should be [start, end] or null; using 1-80.`);
    } else if (cls.bibs !== null) {
      bibs = cls.bibs;
    }
    const ev: EventClass = {
      code: cls.code,
      search: cls.search,
      bibStart: bibs[0],
      bibEnd: bibs[1],
      ...(cls.bibs === null ? { noBibs: true } : {}),
    };
    for (const gender of ["male", "female"] as const) {
      const split = cls[gender];
      if (split === undefined) continue;
      if (!isObject(split) || !nonEmptyString(split.code)) {
        warnings.push(`${where}.${gender}: needs a 'code'; ignored.`);
        continue;
      }
      let splitBibs = bibs;
      if (split.bibs !== undefined && !isBibs(split.bibs)) {
        warnings.push(`${where}.${gender}: 'bibs' should be [start, end]; using the class range.`);
      } else if (split.bibs !== undefined) {
        splitBibs = split.bibs;
      }
      ev[gender] = { code: split.code, bibStart: splitBibs[0], bibEnd: splitBibs[1] };
    }
    events.push(ev);
  });

  let rankings: string | null = null;
  if (typeof raw.rankings === "string") rankings = raw.rankings;
  else if (raw.rankings !== undefined && raw.rankings !== null) {
    warnings.push("'rankings' should be a release id (e.g. \"2026-2\") or null; using none.");
  }

  // Pairs of strings under keys `a` and `b`, skipping (with a warning) any that aren't.
  const stringPairs = (key: string, a: string, b: string): [string, string][] => {
    const items = raw[key];
    if (items === undefined) return [];
    if (!Array.isArray(items)) {
      warnings.push(`'${key}' should be a list; ignored.`);
      return [];
    }
    const pairs: [string, string][] = [];
    items.forEach((item, i) => {
      if (!isObject(item) || typeof item[a] !== "string" || typeof item[b] !== "string") {
        warnings.push(`${key}[${i}]: needs '${a}' and '${b}'; skipped.`);
        return;
      }
      pairs.push([item[a], item[b]]);
    });
    return pairs;
  };
  const dobOverrides: DobOverride[] = stringPairs("dobOverrides", "lastName", "dob").map(
    ([lastName, dob]) => ({ lastName, dob }),
  );
  const nameRemaps: NameRemap[] = stringPairs("nameRemaps", "from", "to").map(([from, to]) => ({
    from,
    to,
  }));

  return {
    settings: {
      mappings,
      events,
      rankings,
      outputName: typeof raw.outputName === "string" ? raw.outputName : "",
      dobOverrides,
      nameRemaps,
    },
    errors,
    warnings,
  };
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** The CSV header closest to `header`, if any is reasonably close. */
export function closestHeader(header: string, headers: string[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const h of headers) {
    const d = editDistance(header.toLowerCase(), h.toLowerCase());
    if (d < bestDistance) {
      best = h;
      bestDistance = d;
    }
  }
  return best !== null && bestDistance <= Math.max(3, Math.floor(header.length * 0.4))
    ? best
    : null;
}

/**
 * Drop mapped columns the CSV doesn't have, with a warning for each. A field
 * mapped to several columns keeps the ones that exist.
 */
export function checkMappings(
  mappings: Mapping[],
  headers: string[],
): { mappings: Mapping[]; warnings: string[] } {
  const available = new Set(headers);
  const warnings: string[] = [];
  const checked = mappings.map((m) => {
    const kept: string[] = [];
    for (const h of m.headers) {
      if (!h || available.has(h)) {
        kept.push(h);
        continue;
      }
      const close = closestHeader(h, headers);
      warnings.push(
        `${m.internal || "(unnamed field)"}: column '${h}' isn't in this CSV, so it was left ` +
          `out${close ? ` (did you mean '${close}'?)` : ""}.`,
      );
    }
    const nonEmpty = kept.filter((h) => h);
    return { ...m, headers: nonEmpty.length > 0 ? (m.multi ? nonEmpty : [nonEmpty[0]]) : [""] };
  });
  return { mappings: checked, warnings };
}

/** The converter input for the app's settings, skipping incomplete rows. */
export function convertInput(
  settings: Pick<AppSettings, "mappings" | "events" | "dobOverrides" | "nameRemaps">,
  rows: Row[],
  rankings?: Rankings,
): ConvertInput {
  const columns: ColumnMapping = {};
  for (const m of settings.mappings) {
    const headers = m.headers.filter((h) => h);
    if (!m.internal.trim() || headers.length === 0) continue;
    columns[m.internal.trim()] = headers.length === 1 ? headers[0] : headers;
  }
  return {
    rows,
    columns,
    events: settings.events.filter((e) => e.code.trim() && e.search.trim()),
    rankings,
    summaryOnly: settings.mappings.filter((m) => m.summaryOnly).map((m) => m.internal.trim()),
    dobOverrides: settings.dobOverrides.filter((o) => o.lastName.trim()),
    nameRemaps: settings.nameRemaps.filter((r) => r.from.trim()),
  };
}
