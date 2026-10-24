import type { EventClass, GenderSplit } from "../lib/types";

interface Props {
  events: EventClass[];
  onChange: (events: EventClass[]) => void;
}

type Gender = "male" | "female";

export function EventEditor({ events, onChange }: Props) {
  const update = (index: number, patch: Partial<EventClass>) => {
    onChange(events.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };
  // A new gender split starts with the class's own bib range.
  const updateSplit = (index: number, gender: Gender, patch: Partial<GenderSplit>) => {
    const ev = events[index];
    const current = ev[gender] ?? { code: "", bibStart: ev.bibStart, bibEnd: ev.bibEnd };
    update(index, { [gender]: { ...current, ...patch } });
  };
  const remove = (index: number) => {
    onChange(events.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...events, { code: "", search: "", bibStart: 1, bibEnd: 80 }]);
  };

  return (
    <div>
      <p className="hint">
        Each row is a Siwi class. <strong>Search text</strong> is matched against
        each of the athlete's Classes values separately (regular expressions
        allowed), e.g. <code>Men's K1</code>, or <code>^C1</code> for values
        starting with C1 (so not <code>MC1</code>). Bibs are assigned within the
        range, highest bib to the top-ranked paddler.
      </p>
      <p className="hint">
        <strong>Male / Female code</strong> (optional) split a class by the
        mapped <code>Gender</code>, e.g. <code>CSLX</code> into{" "}
        <code>MCSLX</code> / <code>WCSLX</code>, each with its own bib range;
        anyone else keeps the class code and its range. Untick{" "}
        <strong>Bibs</strong> to include a class in Siwi with no bib numbers.
        Values no class picks up stay in the Summary.
      </p>
      <div className="event-row event-head">
        <span>Class</span>
        <span>Search text</span>
        <span>Bib start</span>
        <span>Bib end</span>
        <span>Male code</span>
        <span>Female code</span>
        <span>Bibs</span>
        <span />
      </div>
      {events.map((ev, i) => (
        <div key={i}>
          <div className="event-row">
            <input
              value={ev.code}
              placeholder="K1M"
              onChange={(e) => update(i, { code: e.target.value })}
            />
            <input
              value={ev.search}
              placeholder="Men's K1"
              onChange={(e) => update(i, { search: e.target.value })}
            />
            <input
              type="number"
              value={ev.bibStart}
              disabled={ev.noBibs}
              onChange={(e) => update(i, { bibStart: Number(e.target.value) })}
            />
            <input
              type="number"
              value={ev.bibEnd}
              disabled={ev.noBibs}
              onChange={(e) => update(i, { bibEnd: Number(e.target.value) })}
            />
            <input
              value={ev.male?.code ?? ""}
              placeholder="—"
              onChange={(e) => updateSplit(i, "male", { code: e.target.value })}
            />
            <input
              value={ev.female?.code ?? ""}
              placeholder="—"
              onChange={(e) => updateSplit(i, "female", { code: e.target.value })}
            />
            <input
              type="checkbox"
              checked={!ev.noBibs}
              title="Assign bib numbers (untick to leave this class's bibs blank)"
              onChange={(e) => update(i, { noBibs: !e.target.checked })}
            />
            <button className="remove-btn" onClick={() => remove(i)} title="Remove">
              ✕
            </button>
          </div>
          {(["male", "female"] as const).map((gender) => {
            const split = ev[gender];
            if (!split?.code.trim()) return null;
            return (
              <div className="event-row split-row" key={gender}>
                <span />
                <span className="muted">
                  ↳ {gender === "male" ? "Male" : "Female"} entrants as{" "}
                  <strong>{split.code}</strong>
                </span>
                <input
                  type="number"
                  value={split.bibStart}
                  disabled={ev.noBibs}
                  onChange={(e) =>
                    updateSplit(i, gender, { bibStart: Number(e.target.value) })
                  }
                />
                <input
                  type="number"
                  value={split.bibEnd}
                  disabled={ev.noBibs}
                  onChange={(e) => updateSplit(i, gender, { bibEnd: Number(e.target.value) })}
                />
                <span />
                <span />
                <span />
                <span />
              </div>
            );
          })}
        </div>
      ))}
      <button onClick={add}>+ Add class</button>
    </div>
  );
}
