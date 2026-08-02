export interface Mapping {
  internal: string;
  header: string;
}

interface Props {
  headers: string[];
  mappings: Mapping[];
  onChange: (mappings: Mapping[]) => void;
}

export function ColumnMapper({ headers, mappings, onChange }: Props) {
  const update = (index: number, patch: Partial<Mapping>) => {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const remove = (index: number) => {
    onChange(mappings.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...mappings, { internal: "", header: "" }]);
  };

  return (
    <div>
      <p className="hint">
        Match each Siwi field to a column in your CSV. <code>Classes</code> is
        required. <code>Age</code> is used to break ranking ties. Mapping{" "}
        <code>Club</code> to the <code>Organisation</code> column enables
        automatic club-acronym guessing.
      </p>
      <div className="mapping-row event-head">
        <span>Field</span>
        <span>CSV column</span>
        <span />
      </div>
      {mappings.map((m, i) => (
        <div className="mapping-row" key={i}>
          <input
            value={m.internal}
            placeholder="e.g. Classes"
            onChange={(e) => update(i, { internal: e.target.value })}
          />
          <select
            value={m.header}
            onChange={(e) => update(i, { header: e.target.value })}
          >
            <option value="">— not mapped —</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <button className="remove-btn" onClick={() => remove(i)} title="Remove">
            ✕
          </button>
        </div>
      ))}
      <button onClick={add}>+ Add field</button>
    </div>
  );
}
