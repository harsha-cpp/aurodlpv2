export default function ChipSelect<T extends string>({
  options,
  selected,
  onChange,
  labelFor,
  label,
}: {
  options: readonly T[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  labelFor: (value: T) => string;
  label?: string;
}) {
  function toggle(value: T) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  return (
    <div className="field">
      {label && <span className="label">{label}</span>}
      <div className="chip-list">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="chip"
            aria-pressed={selected.includes(option)}
            onClick={() => toggle(option)}
          >
            {labelFor(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
