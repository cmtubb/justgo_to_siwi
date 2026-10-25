import { useMemo, useState } from "react";
import "./App.css";
import { ColumnMapper } from "./components/ColumnMapper";
import { EventEditor } from "./components/EventEditor";
import { FixesEditor } from "./components/FixesEditor";
import { ResultView } from "./components/ResultView";
import {
  buildConfig,
  checkMappings,
  convertInput,
  formatConfig,
  parseConfig,
} from "./lib/config";
import { convert } from "./lib/convert";
import {
  downloadConfigJson,
  downloadForSiwiCsv,
  downloadRaceInfoXlsx,
  fetchRankingIndex,
  fetchRankingRelease,
  parseCsv,
  type ParsedCsv,
} from "./lib/io";
import type {
  ConvertResult,
  DobOverride,
  EventClass,
  Mapping,
  NameRemap,
  RankingIndex,
  Rankings,
} from "./lib/types";

type RankingSource = "none" | "builtin";

const DEFAULT_MAPPINGS: Mapping[] = [
  { internal: "Age", headers: [""], multi: false, summaryOnly: false },
  { internal: "Classes", headers: [""], multi: false, summaryOnly: false },
  { internal: "Club", headers: [""], multi: false, summaryOnly: false },
  { internal: "Gender", headers: [""], multi: false, summaryOnly: true },
];

const SAMPLES_PER_COLUMN = 2;

const DEFAULT_EVENTS: EventClass[] = [
  { code: "K1M", search: "Men's K1", bibStart: 1, bibEnd: 80 },
  { code: "C1M", search: "Men's C1", bibStart: 1, bibEnd: 80 },
  { code: "K1W", search: "Women's K1", bibStart: 1, bibEnd: 80 },
  { code: "C1W", search: "Women's C1", bibStart: 1, bibEnd: 80 },
  { code: "MCSLX", search: "Men's Kayak Cross", bibStart: 1, bibEnd: 80 },
  { code: "WCSLX", search: "Women's Kayak Cross", bibStart: 1, bibEnd: 80 },
];

function Step({
  num,
  title,
  disabled,
  children,
}: {
  num: number;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`step${disabled ? " disabled" : ""}`}>
      <h2>
        <span className="step-num">{num}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function App() {
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [csvName, setCsvName] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>(DEFAULT_MAPPINGS);
  const [events, setEvents] = useState<EventClass[]>(DEFAULT_EVENTS);
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [rankingSource, setRankingSource] = useState<RankingSource>("none");
  const [rankingIndex, setRankingIndex] = useState<RankingIndex | null>(null);
  const [rankingIndexLoading, setRankingIndexLoading] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<string | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [dobOverrides, setDobOverrides] = useState<DobOverride[]>([]);
  const [nameRemaps, setNameRemaps] = useState<NameRemap[]>([]);
  const [ident, setIdent] = useState("event");
  const [configName, setConfigName] = useState("");
  // From reading the config file, and from checking its columns against the CSV.
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [columnWarnings, setColumnWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCsv = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const parsed = await parseCsv(file);
      setCsv(parsed);
      setCsvName(file.name);
      // Mappings from a config (or an earlier CSV) may name columns this CSV lacks.
      const checked = checkMappings(mappings, parsed.headers);
      setMappings(checked.mappings);
      setColumnWarnings(checked.warnings);
    } catch (e) {
      setError(`Could not parse CSV: ${String(e)}`);
    }
  };

  const loadRelease = async (index: RankingIndex, releaseId: string) => {
    const info = index.releases.find((r) => r.id === releaseId);
    if (!info) return;
    setReleaseLoading(true);
    setError(null);
    try {
      const parsed = await fetchRankingRelease(info.file);
      setRankings(parsed);
      setSelectedRelease(releaseId);
    } catch (e) {
      setError(`Could not load ranking release: ${String(e)}`);
    } finally {
      setReleaseLoading(false);
    }
  };

  const ensureRankingIndex = async (): Promise<RankingIndex | null> => {
    if (rankingIndex) return rankingIndex;
    setRankingIndexLoading(true);
    try {
      const index = await fetchRankingIndex();
      setRankingIndex(index);
      return index;
    } catch (e) {
      setError(`Could not load ranking releases: ${String(e)}`);
      return null;
    } finally {
      setRankingIndexLoading(false);
    }
  };

  const selectRankingSource = async (next: RankingSource) => {
    setRankingSource(next);
    setError(null);
    setRankings(null);
    if (next !== "builtin") return;

    const index = await ensureRankingIndex();
    const releaseId = selectedRelease ?? index?.releases[0]?.id;
    if (index && releaseId) await loadRelease(index, releaseId);
  };

  /** Select a config's ranking release, returning a warning if it isn't available. */
  const applyConfigRankings = async (releaseId: string | null): Promise<string | null> => {
    if (releaseId === null) {
      await selectRankingSource("none");
      return null;
    }
    const index = await ensureRankingIndex();
    if (!index?.releases.some((r) => r.id === releaseId)) {
      await selectRankingSource("none");
      const available = index?.releases.map((r) => r.id).join(", ") || "none";
      return `Ranking release '${releaseId}' isn't available (available: ${available}), so rankings were set to None.`;
    }
    setRankingSource("builtin");
    setRankings(null);
    await loadRelease(index, releaseId);
    return null;
  };

  const onConfig = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    const parsed = parseConfig(await file.text());
    if (!parsed.settings) {
      setConfigName("");
      setConfigWarnings([]);
      setError(`Could not load config ${file.name}: ${parsed.errors.join(" ")}`);
      return;
    }
    const { settings } = parsed;
    setConfigName(file.name);
    setEvents(settings.events);
    setIdent(settings.outputName || "event");
    setDobOverrides(settings.dobOverrides);
    setNameRemaps(settings.nameRemaps);
    if (csv) {
      const checked = checkMappings(settings.mappings, csv.headers);
      setMappings(checked.mappings);
      setColumnWarnings(checked.warnings);
    } else {
      setMappings(settings.mappings);
      setColumnWarnings([]);
    }
    const rankingWarning = await applyConfigRankings(settings.rankings);
    setConfigWarnings([...parsed.warnings, ...(rankingWarning ? [rankingWarning] : [])]);
  };

  const saveConfig = () => {
    const config = buildConfig({
      mappings,
      events,
      rankings: rankingSource === "builtin" ? selectedRelease : null,
      outputName: outputIdent,
      dobOverrides,
      nameRemaps,
    });
    downloadConfigJson(formatConfig(config), outputIdent);
  };

  const onSelectRelease = (releaseId: string) => {
    if (rankingIndex) loadRelease(rankingIndex, releaseId);
  };

  // A few distinct non-empty values per column, shown beside each header.
  const samples = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const h of csv?.headers ?? []) {
      const seen = new Set<string>();
      for (const row of csv?.rows ?? []) {
        const v = (row[h] ?? "").trim();
        if (v) seen.add(v);
        if (seen.size >= SAMPLES_PER_COLUMN) break;
      }
      out[h] = [...seen];
    }
    return out;
  }, [csv]);

  const input = useMemo(
    () =>
      convertInput(
        { mappings, events, dobOverrides, nameRemaps },
        csv?.rows ?? [],
        rankings ?? undefined,
      ),
    [mappings, events, dobOverrides, nameRemaps, csv, rankings],
  );

  const outputIdent = ident.trim() || "event";

  const canConvert = csv !== null && "Classes" in input.columns && input.events.length > 0;

  const runConvert = () => {
    if (!csv) return;
    setError(null);
    try {
      const res = convert(input);
      setResult(res);
    } catch (e) {
      setError(`Conversion failed: ${String(e)}`);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>JustGo → Siwi</h1>
        <p>
          Convert a JustGo attendee export into Siwi race entries with ranked bib
          numbers. Everything runs in your browser — no files are uploaded.
        </p>
      </header>

      {error && (
        <div className="warnings">
          <strong>Error:</strong> {error}
        </div>
      )}

      <Step num={1} title="Upload attendee CSV">
        <input
          className="file-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onCsv(e.target.files?.[0])}
        />
        {csv && (
          <p className="hint">
            Loaded <strong>{csvName}</strong>: {csv.rows.length} rows,{" "}
            {csv.headers.length} columns.
          </p>
        )}
        <h3 className="sub-head">Race config (optional)</h3>
        <p className="hint">
          Load a config saved from an earlier run (<strong>Save config</strong>{" "}
          in the last step) to fill in every step below. Settings that don't fit
          this CSV are left out, with a warning.
        </p>
        <input
          className="file-input"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            onConfig(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {configName && (
          <p className="hint">
            Loaded config <strong>{configName}</strong>.
          </p>
        )}
        {(configWarnings.length > 0 || columnWarnings.length > 0) && (
          <div className="warnings">
            <strong>Config warnings</strong>
            <ul>
              {[...configWarnings, ...columnWarnings].map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </Step>

      <Step num={2} title="Map columns" disabled={!csv}>
        {csv ? (
          <ColumnMapper
            headers={csv.headers}
            samples={samples}
            mappings={mappings}
            onChange={setMappings}
          />
        ) : (
          <p className="hint">Upload a CSV first.</p>
        )}
      </Step>

      <Step num={3} title="Define classes & bib ranges" disabled={!csv}>
        <EventEditor events={events} onChange={setEvents} />
      </Step>

      <Step num={4} title="Athlete fixes (optional)" disabled={!csv}>
        <FixesEditor
          dobOverrides={dobOverrides}
          nameRemaps={nameRemaps}
          onDobOverrides={setDobOverrides}
          onNameRemaps={setNameRemaps}
        />
      </Step>

      <Step num={5} title="Rankings (optional)" disabled={!csv}>
        <p className="hint">
          Seed bib numbers from an ICF world ranking release. Skip this to
          order bibs by age only.
        </p>
        <div className="tabs">
          <button
            type="button"
            className={rankingSource === "none" ? "active" : ""}
            onClick={() => selectRankingSource("none")}
          >
            None
          </button>
          <button
            type="button"
            className={rankingSource === "builtin" ? "active" : ""}
            onClick={() => selectRankingSource("builtin")}
          >
            ICF Rankings
          </button>
        </div>

        {rankingSource === "builtin" && (
          <div>
            {rankingIndexLoading && <p className="hint">Loading available releases…</p>}
            {rankingIndex && (
              <label>
                Release:{" "}
                <select
                  value={selectedRelease ?? ""}
                  onChange={(e) => onSelectRelease(e.target.value)}
                >
                  {rankingIndex.releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {releaseLoading && <p className="hint">Loading {selectedRelease}…</p>}
            {rankings && !releaseLoading && (
              <p className="hint">
                Using release <strong>{selectedRelease}</strong> —{" "}
                {Object.keys(rankings).map((c) => (
                  <span className="tag" key={c}>
                    {c}
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </Step>

      <Step num={6} title="Generate">
        <div className="row">
          <label>
            Output name:{" "}
            <input value={ident} onChange={(e) => setIdent(e.target.value)} />
          </label>
          <button className="primary" disabled={!canConvert} onClick={runConvert}>
            Convert
          </button>
          <button onClick={saveConfig} title="Download these settings to reuse next time">
            Save config
          </button>
        </div>
        {!canConvert && (
          <p className="hint">
            Need a CSV, a <code>Classes</code> column mapping, and at least one
            class with search text.
          </p>
        )}
        {result && (
          <div style={{ marginTop: "1rem" }}>
            <ResultView
              result={result}
              onDownloadCsv={() => downloadForSiwiCsv(result, outputIdent)}
              onDownloadXlsx={() => downloadRaceInfoXlsx(result, outputIdent)}
            />
          </div>
        )}
      </Step>
    </div>
  );
}
