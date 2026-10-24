import { useState } from "react";

export interface Mapping {
  internal: string;
  /** One or more CSV columns; several are joined with "|" (one column per class). */
  headers: string[];
  /** Pick columns from a checklist instead of a single dropdown. */
  multi: boolean;
  /** Keep the field in the Summary only, not the Siwi output. */
  summaryOnly: boolean;
}

interface Props {
  headers: string[];
  /** A few example values per header, to tell apart vaguely named columns. */
  samples: Record<string, string[]>;
  mappings: Mapping[];
  onChange: (mappings: Mapping[]) => void;
}

// These never go to Siwi as fields of their own, so the Siwi toggle doesn't apply.
const NOT_IN_SIWI = new Set(["Classes", "Age"]);
const SAMPLE_CHARS = 30;

function isBlank(h: string): boolean {
  return h.trim() === "" || h.endsWith(":");
}

function headerName(h: string): string {
  return isBlank(h) ? `${h}(blank)` : h;
}

/** The part after a form prefix like "NSW State Champs 2025 - Club:". */
function shortName(h: string): string {
  return isBlank(h) ? "(blank)" : h.slice(h.lastIndexOf(":") + 1);
}

function sampleText(values: string[]): string {
  return values
    .map((v) => (v.length > SAMPLE_CHARS ? `"${v.slice(0, SAMPLE_CHARS)}…"` : `"${v}"`))
    .join(", ");
}

interface PickerProps {
  headers: string[];
  samples: Record<string, string[]>;
  selected: string[];
  onChange: (selected: string[]) => void;
}

/** Checklist of every CSV column, filterable, with "select shown" for bulk picks. */
function MultiColumnPicker({ headers, samples, selected, onChange }: PickerProps) {
  const [open, setOpen] = useState(selected.length === 0);
  const [filter, setFilter] = useState("");

  const chosen = new Set(selected);
  // Keep the CSV's column order regardless of the order they were ticked in.
  const apply = (next: Set<string>) => onChange(headers.filter((h) => next.has(h)));
  const toggle = (h: string) => {
    const next = new Set(chosen);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    apply(next);
  };

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? headers.filter((h) =>
        [h, ...(samples[h] ?? [])].some((t) => t.toLowerCase().includes(needle)),
      )
    : headers;

  if (!open) {
    return (
      <div className="picker-summary">
        <span>
          {selected.length === 0 ? (
            <span className="muted">No columns selected</span>
          ) : (
            selected.map((h) => (
              <span className="tag" key={h} title={h}>
                {shortName(h)}
              </span>
            ))
          )}
        </span>
        <button className="link-btn" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="column-picker">
      <div className="picker-tools">
        <input
          value={filter}
          placeholder="Filter columns or values, e.g. State Champs"
          onChange={(e) => setFilter(e.target.value)}
        />
        <button onClick={() => apply(new Set([...selected, ...shown]))}>Select shown</button>
        <button onClick={() => apply(new Set(selected.filter((h) => !shown.includes(h))))}>
          Clear shown
        </button>
      </div>
      <div className="picker-list">
        {shown.map((h) => (
          <label key={h} className={chosen.has(h) ? "checked" : ""}>
            <input type="checkbox" checked={chosen.has(h)} onChange={() => toggle(h)} />
            <span>
              {headerName(h)}
              {(samples[h] ?? []).length > 0 && (
                <span className="muted"> — e.g. {sampleText(samples[h])}</span>
              )}
            </span>
          </label>
        ))}
        {shown.length === 0 && <p className="hint">No columns match.</p>}
      </div>
      <div className="picker-tools">
        <span className="muted">{selected.length} selected</span>
        <button className="primary" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </div>
  );
}

export function ColumnMapper({ headers, samples, mappings, onChange }: Props) {
  const update = (index: number, patch: Partial<Mapping>) => {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  // Switching back to a single column keeps the first one picked.
  const setMulti = (index: number, multi: boolean) => {
    const current = mappings[index].headers.filter((h) => h);
    update(index, { multi, headers: multi ? current : [current[0] ?? ""] });
  };
  const remove = (index: number) => {
    onChange(mappings.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...mappings, { internal: "", headers: [""], multi: false, summaryOnly: false }]);
  };

  return (
    <div>
      <p className="hint">
        Match each Siwi field to a column in your CSV. <code>Classes</code> is
        required; if the export has one column per class, choose{" "}
        <strong>pick several columns</strong> and tick each of them (their
        values are joined with <code>|</code>). <code>Age</code> is used to
        break ranking ties. <code>Gender</code> is needed for classes with
        male/female codes. Mapping <code>Club</code> to the{" "}
        <code>Organisation</code> column enables automatic club-acronym
        guessing. Untick <strong>Siwi</strong> to keep a field (e.g. a C2
        partner) in the Summary only.
      </p>
      <div className="mapping-row event-head">
        <span>Field</span>
        <span>CSV column</span>
        <span>Siwi</span>
        <span />
      </div>
      {mappings.map((m, i) => (
        <div className="mapping-row" key={i}>
          <input
            value={m.internal}
            placeholder="e.g. Classes"
            onChange={(e) => update(i, { internal: e.target.value })}
          />
          <div className="mapping-headers">
            {m.multi ? (
              <MultiColumnPicker
                headers={headers}
                samples={samples}
                selected={m.headers.filter((h) => h)}
                onChange={(selected) => update(i, { headers: selected })}
              />
            ) : (
              <select
                value={m.headers[0] ?? ""}
                onChange={(e) => update(i, { headers: [e.target.value] })}
              >
                <option value="">— not mapped —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {headerName(h)}
                    {(samples[h] ?? []).length > 0 && ` — e.g. ${sampleText(samples[h])}`}
                  </option>
                ))}
              </select>
            )}
            {(m.multi || m.internal.trim() === "Classes") && (
              <button className="link-btn" onClick={() => setMulti(i, !m.multi)}>
                {m.multi ? "pick one column" : "pick several columns"}
              </button>
            )}
          </div>
          <input
            type="checkbox"
            checked={!m.summaryOnly && !NOT_IN_SIWI.has(m.internal.trim())}
            disabled={NOT_IN_SIWI.has(m.internal.trim())}
            title="Include in the Siwi output (untick for Summary only)"
            onChange={(e) => update(i, { summaryOnly: !e.target.checked })}
          />
          <button className="remove-btn" onClick={() => remove(i)} title="Remove">
            ✕
          </button>
        </div>
      ))}
      <button onClick={add}>+ Add field</button>
    </div>
  );
}
