import type { EventClass } from "../lib/types";

interface Props {
  events: EventClass[];
  onChange: (events: EventClass[]) => void;
}

export function EventEditor({ events, onChange }: Props) {
  const update = (index: number, patch: Partial<EventClass>) => {
    onChange(events.map((e, i) => (i === index ? { ...e, ...patch } : e)));
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
        the athlete's Classes field (regular expressions allowed), e.g.{" "}
        <code>Men's K1</code>. Bibs are assigned within the range, highest bib to
        the top-ranked paddler.
      </p>
      <div className="event-row event-head">
        <span>Class</span>
        <span>Search text</span>
        <span>Bib start</span>
        <span>Bib end</span>
        <span />
      </div>
      {events.map((ev, i) => (
        <div className="event-row" key={i}>
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
            onChange={(e) => update(i, { bibStart: Number(e.target.value) })}
          />
          <input
            type="number"
            value={ev.bibEnd}
            onChange={(e) => update(i, { bibEnd: Number(e.target.value) })}
          />
          <button className="remove-btn" onClick={() => remove(i)} title="Remove">
            ✕
          </button>
        </div>
      ))}
      <button onClick={add}>+ Add class</button>
    </div>
  );
}
