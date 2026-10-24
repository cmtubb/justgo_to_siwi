export interface Mapping {
  internal: string;
  /** One or more CSV columns; several are joined with "|" (one column per class). */
  headers: string[];
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

export function ColumnMapper({ headers, samples, mappings, onChange }: Props) {
  const update = (index: number, patch: Partial<Mapping>) => {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const setHeader = (index: number, slot: number, header: string) => {
    const next = mappings[index].headers.map((h, j) => (j === slot ? header : h));
    update(index, { headers: next });
  };
  const addHeader = (index: number) => {
    update(index, { headers: [...mappings[index].headers, ""] });
  };
  const removeHeader = (index: number, slot: number) => {
    update(index, { headers: mappings[index].headers.filter((_, j) => j !== slot) });
  };
  const remove = (index: number) => {
    onChange(mappings.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...mappings, { internal: "", headers: [""], summaryOnly: false }]);
  };

  const label = (h: string) => {
    const name = h.trim() === "" || h.endsWith(":") ? `${h}(blank)` : h;
    const eg = (samples[h] ?? []).map((v) =>
      v.length > SAMPLE_CHARS ? `"${v.slice(0, SAMPLE_CHARS)}…"` : `"${v}"`,
    );
    return eg.length > 0 ? `${name} — e.g. ${eg.join(", ")}` : name;
  };

  return (
    <div>
      <p className="hint">
        Match each Siwi field to a column in your CSV. <code>Classes</code> is
        required; if the export has one column per class, use{" "}
        <strong>+ column</strong> to add each of them (their values are joined
        with <code>|</code>). <code>Age</code> is used to break ranking ties.{" "}
        <code>Gender</code> is needed for classes with male/female codes.
        Mapping <code>Club</code> to the <code>Organisation</code> column
        enables automatic club-acronym guessing. Untick <strong>Siwi</strong>{" "}
        to keep a field (e.g. a C2 partner) in the Summary only.
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
            {m.headers.map((header, j) => (
              <div className="mapping-header" key={j}>
                <select value={header} onChange={(e) => setHeader(i, j, e.target.value)}>
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {label(h)}
                    </option>
                  ))}
                </select>
                {m.headers.length > 1 && (
                  <button
                    className="remove-btn"
                    onClick={() => removeHeader(i, j)}
                    title="Remove column"
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            <button className="link-btn" onClick={() => addHeader(i)}>
              + column
            </button>
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
