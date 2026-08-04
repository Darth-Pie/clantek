/**
 * Theme editor — the admin surface for the theming pipeline that already runs
 * the whole app (see lib/theme.tsx). Every control edits a CSS custom property
 * and previews it live on :root, so the admin sees the change across the site
 * as they make it; Save persists it for everyone, Discard rolls back to the
 * last saved theme, and leaving the page without saving drops the preview.
 *
 * The token set here is exactly what styles.css consumes — keep them in sync.
 */

import { useEffect, useRef, useState } from 'react';
import { useTheme, DEFAULT_THEME, type ThemeTokens } from '../lib/theme';
import { useAction, Alerts } from '../lib/action';

const TOKEN_KEYS = Object.keys(DEFAULT_THEME);

const COLOR_TOKENS: { key: string; label: string }[] = [
  { key: '--color-bg', label: 'Background' },
  { key: '--color-surface', label: 'Surface / panels' },
  { key: '--color-border', label: 'Borders & dividers' },
  { key: '--color-text', label: 'Text' },
  { key: '--color-muted', label: 'Muted text' },
  { key: '--color-accent', label: 'Accent' },
  { key: '--color-accent-text', label: 'Text on accent' },
];

const FONT_TOKENS: { key: string; label: string }[] = [
  { key: '--font-display', label: 'Headings' },
  { key: '--font-body', label: 'Body' },
];

const FONT_STACKS: { label: string; value: string }[] = [
  { label: 'System', value: 'system-ui, sans-serif' },
  { label: 'Humanist sans', value: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: 'ui-monospace, "SFMono-Regular", Menlo, monospace' },
];

// Complete palettes as starting points. Each is a full token set so applying
// one leaves nothing half-changed.
const PRESETS: { name: string; tokens: ThemeTokens }[] = [
  { name: 'Midnight', tokens: DEFAULT_THEME },
  {
    name: 'Slate',
    tokens: {
      ...DEFAULT_THEME,
      '--color-bg': '#0d1117',
      '--color-surface': '#161b22',
      '--color-border': '#30363d',
      '--color-accent': '#2f81f7',
    },
  },
  {
    name: 'Forest',
    tokens: {
      ...DEFAULT_THEME,
      '--color-bg': '#0e1512',
      '--color-surface': '#152019',
      '--color-border': '#26362c',
      '--color-accent': '#2f9e5f',
    },
  },
  {
    name: 'Light',
    tokens: {
      '--color-bg': '#f6f7f9',
      '--color-surface': '#ffffff',
      '--color-border': '#d9dee6',
      '--color-text': '#1b1f27',
      '--color-muted': '#5c6672',
      '--color-accent': '#c0392b',
      '--color-accent-text': '#ffffff',
      '--font-body': 'system-ui, sans-serif',
      '--font-display': 'system-ui, sans-serif',
      '--radius': '8px',
    },
  },
];

function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export default function Theme() {
  const { tokens, preview, save } = useTheme();
  // Local working copy. Baseline is the last *saved* theme, held in a ref so
  // the unmount cleanup can revert to it without re-subscribing.
  const [draft, setDraft] = useState<ThemeTokens>(() => ({ ...DEFAULT_THEME, ...tokens }));
  const baselineRef = useRef<ThemeTokens>({ ...DEFAULT_THEME, ...tokens });
  const { run, busy, error, notice } = useAction();

  // Leaving the editor with unsaved edits shouldn't leak a preview into the
  // rest of the app — restore the last saved theme on unmount.
  useEffect(() => () => preview(baselineRef.current), [preview]);

  const dirty = TOKEN_KEYS.some((k) => draft[k] !== baselineRef.current[k]);

  const update = (key: string, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    preview(next);
  };

  const applyTokens = (t: ThemeTokens) => {
    const next = { ...DEFAULT_THEME, ...t };
    setDraft(next);
    preview(next);
  };

  const onSave = () =>
    run(async () => {
      await save(draft);
      baselineRef.current = { ...draft };
      return 'Theme saved — everyone sees this now.';
    });

  const radiusPx = parseInt(draft['--radius'] ?? '0', 10) || 0;

  return (
    <section className="panel theme-page">
      <header className="panel-head">
        <h2>Theme</h2>
        <p className="muted">
          Restyle the whole site. Changes preview live as you edit; Save applies them for everyone.
        </p>
      </header>

      <Alerts error={error} notice={notice} />

      <div className="theme-presets">
        <span className="mab-label">Start from</span>
        {PRESETS.map((p) => (
          <button key={p.name} className="preset" disabled={busy} onClick={() => applyTokens(p.tokens)}>
            <span className="preset-swatch" style={{ background: p.tokens['--color-accent'] }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="theme-grid">
        <div className="theme-controls">
          <fieldset className="theme-group">
            <legend>Colors</legend>
            {COLOR_TOKENS.map(({ key, label }) => (
              <div key={key} className="theme-row">
                <label className="theme-row-label">
                  {label}
                  <code>{key}</code>
                </label>
                <div className="theme-row-controls">
                  <input
                    type="color"
                    value={isHex(draft[key] ?? '') ? draft[key]! : '#000000'}
                    disabled={busy}
                    onChange={(e) => update(key, e.target.value)}
                    aria-label={`${label} color`}
                  />
                  <input
                    type="text"
                    className="theme-hex"
                    value={draft[key] ?? ''}
                    disabled={busy}
                    spellCheck={false}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className="theme-group">
            <legend>Typography</legend>
            {FONT_TOKENS.map(({ key, label }) => {
              const known = FONT_STACKS.some((f) => f.value === draft[key]);
              return (
                <div key={key} className="theme-row">
                  <label className="theme-row-label">
                    {label}
                    <code>{key}</code>
                  </label>
                  <div className="theme-row-controls">
                    <select
                      value={known ? draft[key] : '__custom'}
                      disabled={busy}
                      onChange={(e) => e.target.value !== '__custom' && update(key, e.target.value)}
                    >
                      {FONT_STACKS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                      <option value="__custom">Custom…</option>
                    </select>
                    <input
                      type="text"
                      className="theme-font"
                      value={draft[key] ?? ''}
                      disabled={busy}
                      spellCheck={false}
                      style={{ fontFamily: draft[key] }}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </fieldset>

          <fieldset className="theme-group">
            <legend>Shape</legend>
            <div className="theme-row">
              <label className="theme-row-label">
                Corner radius
                <code>--radius</code>
              </label>
              <div className="theme-row-controls">
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={radiusPx}
                  disabled={busy}
                  onChange={(e) => update('--radius', `${e.target.value}px`)}
                />
                <span className="theme-radius-value">{draft['--radius']}</span>
              </div>
            </div>
          </fieldset>
        </div>

        {/* Live sample. It uses the same tokens, so it reflects edits instantly. */}
        <aside className="theme-preview" aria-label="Live preview">
          <h3>Preview</h3>
          <div className="tp-card">
            <div className="tp-title">Roster</div>
            <p className="tp-body">Body text sits on the surface color.</p>
            <p className="tp-muted">Muted secondary text.</p>
            <div className="tp-actions">
              <button className="primary" type="button">
                Primary
              </button>
              <button type="button">Default</button>
              <span className="rank-chip">General</span>
            </div>
            <input className="tp-input" defaultValue="An input field" readOnly />
          </div>
        </aside>
      </div>

      <div className="theme-actions">
        <button className="primary" disabled={busy || !dirty} onClick={() => void onSave()}>
          Save theme
        </button>
        <button disabled={busy || !dirty} onClick={() => applyTokens(baselineRef.current)}>
          Discard changes
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={() => applyTokens(DEFAULT_THEME)}
          title="Load the built-in defaults (then Save to keep them)"
        >
          Load defaults
        </button>
      </div>
    </section>
  );
}
