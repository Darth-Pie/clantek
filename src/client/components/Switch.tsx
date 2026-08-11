/**
 * A rocker switch for on/off settings.
 *
 * The `<input type="checkbox">` IS the switch — `appearance: none` plus a
 * `::before` thumb, styled in place. The usual trick of hiding a real checkbox
 * behind decorative spans was the first attempt here and it dropped the control
 * out of the accessibility tree entirely: a 1px, opacity-0 input reads as
 * invisible. With nothing hidden there's nothing to fall out, and native
 * keyboard handling, focus rings and form semantics all come for free.
 *
 * `role="switch"` makes a screen reader announce "on/off" rather than
 * "checked/unchecked", which is what this control actually means.
 *
 * `label` is required and becomes the accessible name. Without it the name
 * would be read from the visible text — "On" — which tells a screen-reader user
 * the state twice and the subject never.
 */

export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  /** Replaces the "On"/"Off" text, e.g. "Off (needs hangar)". */
  stateText,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  stateText?: string;
}) {
  return (
    <label className={disabled ? 'rocker is-disabled' : 'rocker'}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="rocker-state">{stateText ?? (checked ? 'On' : 'Off')}</span>
    </label>
  );
}
