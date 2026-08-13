/**
 * A themed color picker — a drop-in replacement for `<input type="color">`.
 *
 * The native control opens the OS picker, which ignores the site's styling and
 * looks foreign inside the admin. This is a small HSV picker instead: a swatch
 * button that opens a popover with a saturation/value square, a hue slider, a hex
 * field, and a strip of presets — all styled with the app's tokens.
 *
 * No dependencies. HSV is kept in local state so the hue survives dragging into a
 * grey (where hue is otherwise undefined); the committed value is always a
 * `#rrggbb` string passed to `onChange`, matching what the native input emitted.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface RGB {
  r: number;
  g: number;
  b: number;
}
interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

const PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#0f1115', '#334155', '#64748b', '#e2e8f0', '#ffffff', '#000000',
];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function hexToRgb(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => Math.round(clamp01(n / 255) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

const hsvToHex = (hsv: HSV) => rgbToHex(hsvToRgb(hsv));

export default function ColorPicker({
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel = 'Choose a color',
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const safeHex = useMemo(() => (hexToRgb(value) ? value : '#000000'), [value]);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(safeHex)!));
  const [hexText, setHexText] = useState(safeHex);
  const draggingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep internal state in step with an external value change (e.g. a theme
  // preset applied elsewhere), but never while the user is mid-drag.
  useEffect(() => {
    if (draggingRef.current) return;
    const rgb = hexToRgb(safeHex)!;
    setHsv(rgbToHsv(rgb));
    setHexText(safeHex);
  }, [safeHex]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (next: HSV) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onChange(hex);
  };

  const onSvPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = clamp01((e.clientX - r.left) / r.width);
    const v = 1 - clamp01((e.clientY - r.top) / r.height);
    commit({ ...hsv, s, v });
  };
  const onHuePointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    commit({ ...hsv, h: clamp01((e.clientX - r.left) / r.width) * 360 });
  };
  const startDrag = (handler: (e: ReactPointerEvent<HTMLDivElement>) => void) => (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handler(e);
  };
  const moveDrag = (handler: (e: ReactPointerEvent<HTMLDivElement>) => void) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) handler(e);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const typeHex = (raw: string) => {
    setHexText(raw);
    const rgb = hexToRgb(raw);
    if (rgb) commit(rgbToHsv(rgb));
  };

  const current = hsvToHex(hsv);
  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="colorpicker" ref={rootRef}>
      <button
        type="button"
        className="colorpicker-swatch"
        style={{ background: current }}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="colorpicker-swatch-hex">{current.toUpperCase()}</span>
      </button>

      {open && !disabled && (
        <div className="colorpicker-pop" role="dialog" aria-label={ariaLabel}>
          <div
            className="colorpicker-sv"
            style={{ background: hueHex }}
            onPointerDown={startDrag(onSvPointer)}
            onPointerMove={moveDrag(onSvPointer)}
            onPointerUp={endDrag}
          >
            <div className="colorpicker-sv-white" />
            <div className="colorpicker-sv-black" />
            <div
              className="colorpicker-thumb"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }}
            />
          </div>

          <div
            className="colorpicker-hue"
            onPointerDown={startDrag(onHuePointer)}
            onPointerMove={moveDrag(onHuePointer)}
            onPointerUp={endDrag}
          >
            <div className="colorpicker-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: hueHex }} />
          </div>

          <div className="colorpicker-row">
            <input
              className="colorpicker-hex"
              value={hexText}
              spellCheck={false}
              maxLength={7}
              aria-label="Hex color"
              onChange={(e) => typeHex(e.target.value)}
            />
          </div>

          <div className="colorpicker-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="colorpicker-preset"
                style={{ background: p }}
                title={p}
                aria-label={p}
                onClick={() => {
                  const rgb = hexToRgb(p)!;
                  commit(rgbToHsv(rgb));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
