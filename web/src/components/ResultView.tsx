import { useState } from "react";
import type { ConvertResult, Row } from "../lib/types";

interface Props {
  result: ConvertResult;
  onDownloadCsv: () => void;
  onDownloadXlsx: () => void;
}

const PREVIEW_ROWS = 50;

function PreviewTable({ columns, rows }: { columns: string[]; rows: Row[] }) {
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{row[c]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultView({ result, onDownloadCsv, onDownloadXlsx }: Props) {
  const [tab, setTab] = useState<"siwi" | "summary">("siwi");

  return (
    <div>
      {result.warnings.length > 0 ? (
        <div className="warnings">
          <strong>Warnings</strong>
          <ul>
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="ok-note">No warnings — {result.forSiwi.length} entries generated.</p>
      )}

      <div className="actions">
        <button className="primary" onClick={onDownloadCsv}>
          Download for_siwi CSV
        </button>
        <button onClick={onDownloadXlsx}>Download race_info XLSX</button>
      </div>

      <div className="tabs" style={{ marginTop: "1rem" }}>
        <button
          className={tab === "siwi" ? "active" : ""}
          onClick={() => setTab("siwi")}
        >
          For Siwi ({result.forSiwi.length})
        </button>
        <button
          className={tab === "summary" ? "active" : ""}
          onClick={() => setTab("summary")}
        >
          Summary ({result.summary.length})
        </button>
      </div>

      {tab === "siwi" ? (
        <PreviewTable columns={result.forSiwiColumns} rows={result.forSiwi} />
      ) : (
        <PreviewTable columns={result.summaryColumns} rows={result.summary} />
      )}
      {result.forSiwi.length > PREVIEW_ROWS && (
        <p className="hint">Showing first {PREVIEW_ROWS} rows. Download for the full set.</p>
      )}
    </div>
  );
}
