/**
 * A numeric input with custom − / + steppers, replacing the cramped (and
 * inconsistent across browsers) native number spinners.
 *
 * Drop-in for `<input type="number">`: `onChange` hands back the raw string value
 * (like a native input's `e.target.value`), so callers that store a string can
 * pass their setter directly, and callers that want a number wrap with `Number()`.
 * The steppers clamp to `min`/`max`; typing is passed through untouched so a
 * half-typed value is never fought. Shares the `.stepper` styles in styles.css.
 */

interface NumberFieldProps {
  value: number | string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  /** Extra class on the wrapper, e.g. to widen the field in a given layout. */
  className?: string;
}

export default function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  placeholder,
  id,
  ariaLabel,
  className,
}: NumberFieldProps) {
  const decimals = (String(step).split('.')[1] || '').length;
  const fmt = (n: number) => (decimals ? n.toFixed(decimals) : String(Math.round(n)));
  const clamp = (n: number) => {
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const bump = (dir: 1 | -1) => {
    const cur = parseFloat(String(value));
    // From an empty/invalid field, either button seeds the min (or 0).
    const next = Number.isFinite(cur) ? cur + dir * step : (min ?? 0);
    onChange(fmt(clamp(next)));
  };

  const numeric = parseFloat(String(value));
  const atMin = min != null && Number.isFinite(numeric) && numeric <= min;
  const atMax = max != null && Number.isFinite(numeric) && numeric >= max;

  return (
    <div className={className ? `stepper ${className}` : 'stepper'}>
      <button
        type="button"
        className="step-btn step-down"
        onClick={() => bump(-1)}
        disabled={disabled || atMin}
        tabIndex={-1}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode={decimals ? 'decimal' : 'numeric'}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="step-btn step-up"
        onClick={() => bump(1)}
        disabled={disabled || atMax}
        tabIndex={-1}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
