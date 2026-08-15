import Papa from "papaparse";
import * as XLSX from "xlsx";
import type {
  ConvertResult,
  Rankings,
  RankingEntry,
  RankingIndex,
  Row,
} from "./types";

// BASE_URL always has a trailing slash, and honours Vite's `base` config
// (relative in production, so this still works from a GitHub Pages project
// subpath), so built-in rankings are fetched from alongside the app itself.
const RANKINGS_BASE = `${import.meta.env.BASE_URL}rankings/`;

export interface ParsedCsv {
  headers: string[];
  rows: Row[];
}

/** Parse a JustGo attendee CSV, keeping every value as a string (no type coercion). */
export function parseCsv(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const rows = (results.data ?? []).map((row) => {
          const clean: Row = {};
          for (const h of headers) clean[h] = row[h] ?? "";
          return clean;
        });
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

/** List the built-in ranking releases available alongside the app, newest first. */
export async function fetchRankingIndex(): Promise<RankingIndex> {
  const res = await fetch(`${RANKINGS_BASE}index.json`);
  if (!res.ok) throw new Error(`Could not load ${RANKINGS_BASE}index.json (HTTP ${res.status})`);
  return (await res.json()) as RankingIndex;
}

/**
 * Fetch one built-in ranking release (as named by a `RankingReleaseInfo.file`
 * from `fetchRankingIndex`) and reshape it into `Rankings`.
 */
export async function fetchRankingRelease(file: string): Promise<Rankings> {
  const res = await fetch(`${RANKINGS_BASE}${file}`);
  if (!res.ok) throw new Error(`Could not load ${RANKINGS_BASE}${file} (HTTP ${res.status})`);
  const doc = (await res.json()) as {
    classes: Record<string, { name: string; ranking: number | string }[]>;
  };

  const rankings: Rankings = {};
  for (const [cls, entries] of Object.entries(doc.classes)) {
    rankings[cls] = entries.map(
      (e): RankingEntry => ({ name: e.name, ranking: String(e.ranking) }),
    );
  }
  return rankings;
}

function rowsToAoa(rows: Row[], columns: string[]): (string | number)[][] {
  const aoa: (string | number)[][] = [columns];
  for (const row of rows) aoa.push(columns.map((c) => row[c] ?? ""));
  return aoa;
}

export function timestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${y}-${mo}-${d}_${h}${mi}`;
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadForSiwiCsv(result: ConvertResult, ident: string): void {
  const csv = Papa.unparse(
    { fields: result.forSiwiColumns, data: result.forSiwi.map((r) => result.forSiwiColumns.map((c) => r[c] ?? "")) },
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(`for_siwi_${ident}_${timestamp()}.csv`, blob);
}

export function downloadRaceInfoXlsx(result: ConvertResult, ident: string): void {
  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(
    rowsToAoa(result.summary, result.summaryColumns),
  );
  const siwiSheet = XLSX.utils.aoa_to_sheet(
    rowsToAoa(result.forSiwi, result.forSiwiColumns),
  );
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(wb, siwiSheet, "For Siwi with Rankings");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], { type: "application/octet-stream" });
  triggerDownload(`race_info_${ident}_${timestamp()}.xlsx`, blob);
}
