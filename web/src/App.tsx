import { useMemo, useState } from "react";
import "./App.css";
import { ColumnMapper, type Mapping } from "./components/ColumnMapper";
import { EventEditor } from "./components/EventEditor";
import { ResultView } from "./components/ResultView";
import { convert } from "./lib/convert";
import {
  downloadForSiwiCsv,
  downloadRaceInfoXlsx,
  parseCsv,
  parseRankings,
  type ParsedCsv,
} from "./lib/io";
import type {
  ColumnMapping,
  ConvertResult,
  EventClass,
  Rankings,
} from "./lib/types";

const DEFAULT_MAPPINGS: Mapping[] = [
  { internal: "Age", header: "" },
  { internal: "Classes", header: "" },
  { internal: "Club", header: "" },
];

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
  const [rankingsName, setRankingsName] = useState("");
  const [ident, setIdent] = useState("event");
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
    } catch (e) {
      setError(`Could not parse CSV: ${String(e)}`);
    }
  };

  const onRankings = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const parsed = await parseRankings(file);
      setRankings(parsed);
      setRankingsName(file.name);
    } catch (e) {
      setError(`Could not read rankings workbook: ${String(e)}`);
    }
  };

  const columns: ColumnMapping = useMemo(() => {
    const out: ColumnMapping = {};
    for (const m of mappings) {
      if (m.internal.trim() && m.header) out[m.internal.trim()] = m.header;
    }
    return out;
  }, [mappings]);

  const outputIdent = ident.trim() || "event";

  const readyEvents = useMemo(
    () => events.filter((e) => e.code.trim() && e.search.trim()),
    [events],
  );

  const canConvert =
    csv !== null && "Classes" in columns && readyEvents.length > 0;

  const runConvert = () => {
    if (!csv) return;
    setError(null);
    try {
      const res = convert({
        rows: csv.rows,
        columns,
        events: readyEvents,
        rankings: rankings ?? undefined,
      });
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
      </Step>

      <Step num={2} title="Map columns" disabled={!csv}>
        {csv ? (
          <ColumnMapper
            headers={csv.headers}
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

      <Step num={4} title="Rankings (optional)" disabled={!csv}>
        <p className="hint">
          Upload the ICF rankings workbook (one sheet per class, with{" "}
          <code>name</code> and <code>ranking</code> columns) to seed bibs by
          ranking. Skip this to order bibs by age only.
        </p>
        <input
          className="file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => onRankings(e.target.files?.[0])}
        />
        {rankings && (
          <p className="hint">
            Loaded <strong>{rankingsName}</strong> —{" "}
            {Object.keys(rankings).map((c) => (
              <span className="tag" key={c}>
                {c}
              </span>
            ))}
          </p>
        )}
      </Step>

      <Step num={5} title="Generate">
        <div className="row">
          <label>
            Output name:{" "}
            <input value={ident} onChange={(e) => setIdent(e.target.value)} />
          </label>
          <button className="primary" disabled={!canConvert} onClick={runConvert}>
            Convert
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
