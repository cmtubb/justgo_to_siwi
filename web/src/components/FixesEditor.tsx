import type { DobOverride, NameRemap } from "../lib/types";

interface Props {
  dobOverrides: DobOverride[];
  nameRemaps: NameRemap[];
  onDobOverrides: (overrides: DobOverride[]) => void;
  onNameRemaps: (remaps: NameRemap[]) => void;
}

function replaceAt<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export function FixesEditor({ dobOverrides, nameRemaps, onDobOverrides, onNameRemaps }: Props) {
  return (
    <div>
      <p className="hint">
        <strong>DOB overrides</strong> force a date of birth for everyone with
        a given surname (as entered in JustGo), e.g. to put someone in the right
        age group.
      </p>
      {dobOverrides.length > 0 && (
        <div className="fix-row event-head">
          <span>Surname</span>
          <span>DOB</span>
          <span />
        </div>
      )}
      {dobOverrides.map((o, i) => (
        <div className="fix-row" key={i}>
          <input
            value={o.lastName}
            placeholder="Smith"
            onChange={(e) =>
              onDobOverrides(replaceAt(dobOverrides, i, { lastName: e.target.value }))
            }
          />
          <input
            value={o.dob}
            placeholder="01/01/1955"
            onChange={(e) => onDobOverrides(replaceAt(dobOverrides, i, { dob: e.target.value }))}
          />
          <button
            className="remove-btn"
            onClick={() => onDobOverrides(dobOverrides.filter((_, j) => j !== i))}
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => onDobOverrides([...dobOverrides, { lastName: "", dob: "" }])}>
        + Add DOB override
      </button>

      <p className="hint" style={{ marginTop: "1rem" }}>
        <strong>Name remaps</strong> change the name used to look up a paddler's
        ranking, written <code>SURNAME First</code>, e.g. when JustGo and the ICF
        spell it differently.
      </p>
      {nameRemaps.length > 0 && (
        <div className="fix-row event-head">
          <span>JustGo name</span>
          <span>Ranking name</span>
          <span />
        </div>
      )}
      {nameRemaps.map((r, i) => (
        <div className="fix-row" key={i}>
          <input
            value={r.from}
            placeholder="SMITH Jo"
            onChange={(e) => onNameRemaps(replaceAt(nameRemaps, i, { from: e.target.value }))}
          />
          <input
            value={r.to}
            placeholder="SMITH Joanne"
            onChange={(e) => onNameRemaps(replaceAt(nameRemaps, i, { to: e.target.value }))}
          />
          <button
            className="remove-btn"
            onClick={() => onNameRemaps(nameRemaps.filter((_, j) => j !== i))}
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => onNameRemaps([...nameRemaps, { from: "", to: "" }])}>
        + Add name remap
      </button>
    </div>
  );
}
