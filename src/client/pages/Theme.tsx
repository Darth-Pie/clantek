/**
 * Theme editor — the admin surface for the theming pipeline that already runs
 * the whole app (see lib/theme.tsx). Every control edits a CSS custom property
 * and previews it live on :root, so the admin sees the change across the site
 * as they make it; Save persists it for everyone, Discard rolls back to the
 * last saved theme, and leaving the page without saving drops the preview.
 *
 * The token set here is exactly what styles.css consumes — keep them in sync.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTheme, DEFAULT_THEME, type ThemeTokens } from '../lib/theme';
import { useAction, Alerts } from '../lib/action';
import ColorPicker from '../components/ColorPicker';

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

const NAV_ALIGN: { label: string; value: string }[] = [
  { label: 'Left', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'flex-end' },
];

const FONT_STACKS: { label: string; value: string }[] = [
  { label: 'System', value: 'system-ui, sans-serif' },
  { label: 'Humanist sans', value: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: 'ui-monospace, "SFMono-Regular", Menlo, monospace' },
];

// Complete palettes as starting points. Each is a full token set so applying
// one leaves nothing half-changed. Dark palettes spread the default and swap a
// few tokens; light palettes are spelled out in full (different text/muted).
// A light base every light theme builds on.
const LIGHT_BASE: ThemeTokens = {
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
};

const PRESETS: { name: string; tokens: ThemeTokens }[] = [
  // --- Dark ---
  { name: 'Midnight', tokens: DEFAULT_THEME },
  {
    name: 'Slate',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#0d1117', '--color-surface': '#161b22', '--color-border': '#30363d', '--color-accent': '#2f81f7' },
  },
  {
    name: 'Forest',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#0e1512', '--color-surface': '#152019', '--color-border': '#26362c', '--color-accent': '#2f9e5f' },
  },
  {
    name: 'Ember',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#17110d', '--color-surface': '#211812', '--color-border': '#3a2a1e', '--color-accent': '#e8833a' },
  },
  {
    name: 'Amethyst',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#131019', '--color-surface': '#1c1726', '--color-border': '#2f2740', '--color-accent': '#a56bf0' },
  },
  {
    name: 'Ocean',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#0b1417', '--color-surface': '#111f24', '--color-border': '#1f333b', '--color-accent': '#22b8cf', '--color-accent-text': '#04141a' },
  },
  {
    name: 'Rose',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#190f14', '--color-surface': '#24151d', '--color-border': '#3a2330', '--color-accent': '#ec4899' },
  },
  {
    name: 'Nord',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#2e3440', '--color-surface': '#3b4252', '--color-border': '#4c566a', '--color-text': '#eceff4', '--color-muted': '#c2cbdc', '--color-accent': '#88c0d0', '--color-accent-text': '#2e3440' },
  },
  {
    name: 'Mono',
    tokens: { ...DEFAULT_THEME, '--color-bg': '#000000', '--color-surface': '#0d0d0d', '--color-border': '#2a2a2a', '--color-text': '#ffffff', '--color-muted': '#a0a0a0', '--color-accent': '#ffffff', '--color-accent-text': '#000000' },
  },
  // --- Light ---
  { name: 'Daylight', tokens: LIGHT_BASE },
  {
    name: 'Paper',
    tokens: { ...LIGHT_BASE, '--color-bg': '#f5f1e8', '--color-surface': '#fffdf8', '--color-border': '#e2dccb', '--color-text': '#2b2620', '--color-muted': '#6b6355', '--color-accent': '#b45309' },
  },
  {
    name: 'Sky',
    tokens: { ...LIGHT_BASE, '--color-bg': '#f4f8fc', '--color-surface': '#ffffff', '--color-border': '#d5e2ef', '--color-text': '#14243a', '--color-muted': '#566a82', '--color-accent': '#2563eb' },
  },
];

function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/**
 * A live example of a single token, shown beside its control. Each reads the CSS
 * variables straight off :root (which `preview` keeps in sync with the draft), so
 * every example updates the instant you change any setting.
 */
function TokenExample({ tokenKey }: { tokenKey: string }) {
  const surface: CSSProperties = {
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  };
  switch (tokenKey) {
    case '--color-bg':
      return <div className="tex" style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>Page background</div>;
    case '--color-surface':
      return <div className="tex" style={surface}>Panel surface</div>;
    case '--color-border':
      return <div className="tex" style={{ background: 'var(--color-surface)', color: 'var(--color-muted)', border: '2px solid var(--color-border)' }}>Bordered</div>;
    case '--color-text':
      return <div className="tex" style={surface}>The quick brown fox</div>;
    case '--color-muted':
      return <div className="tex" style={{ ...surface, color: 'var(--color-muted)' }}>Secondary text</div>;
    case '--color-accent':
    case '--color-accent-text':
      return (
        <div className="tex" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="tex-btn" style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}>Button</span>
        </div>
      );
    case '--font-display':
      return <div className="tex" style={{ ...surface, fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700 }}>Heading Aa</div>;
    case '--font-body':
      return <div className="tex" style={{ ...surface, fontFamily: 'var(--font-body)' }}>Body text sample Aa</div>;
    case '--radius':
      return (
        <div className="tex" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="tex-radius" style={{ background: 'var(--color-accent)', borderRadius: 'var(--radius)' }} />
        </div>
      );
    case '--nav-justify':
      return (
        <div className="tex tex-navbar">
          <span className="tex-nav-brand" />
          <div className="tex-nav-links" style={{ justifyContent: 'var(--nav-justify)' }}>
            <b /><b /><b />
          </div>
        </div>
      );
    default:
      return null;
  }
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

      <div className="theme-layout">
        <div className="theme-main">
          <fieldset className="theme-group">
            <legend>Colors</legend>
            {COLOR_TOKENS.map(({ key, label }) => (
              <div key={key} className="theme-row">
                <div className="theme-row-main">
                  <label className="theme-row-label">
                    {label}
                    <code>{key}</code>
                  </label>
                  <div className="theme-row-controls">
                    <ColorPicker
                      value={isHex(draft[key] ?? '') ? draft[key]! : '#000000'}
                      disabled={busy}
                      onChange={(hex) => update(key, hex)}
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
                <div className="theme-row-example">
                  <TokenExample tokenKey={key} />
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
                  <div className="theme-row-main">
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
                  <div className="theme-row-example">
                    <TokenExample tokenKey={key} />
                  </div>
                </div>
              );
            })}
          </fieldset>

          <fieldset className="theme-group">
            <legend>Shape</legend>
            <div className="theme-row">
              <div className="theme-row-main">
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
              <div className="theme-row-example">
                <TokenExample tokenKey="--radius" />
              </div>
            </div>
          </fieldset>

          <fieldset className="theme-group">
            <legend>Header menu</legend>
            <div className="theme-row">
              <div className="theme-row-main">
                <label className="theme-row-label">
                  Menu alignment
                  <code>--nav-justify</code>
                </label>
                <div className="theme-row-controls seg-control">
                  {NAV_ALIGN.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={(draft['--nav-justify'] ?? 'flex-start') === o.value ? 'seg active' : 'seg'}
                      disabled={busy}
                      onClick={() => update('--nav-justify', o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="theme-row-example">
                <TokenExample tokenKey="--nav-justify" />
              </div>
            </div>
            <p className="muted small">
              Where the top menu sits relative to the logo. “Left” keeps it just past the logo’s
              widest (full-size) footprint so they never overlap.
            </p>
          </fieldset>

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
        </div>

        {/* Presets as a vertical menu on the right. */}
        <aside className="theme-rail" aria-label="Start from a preset">
          <div className="theme-rail-title">Start from</div>
          <div className="theme-presets-vertical">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className="preset"
                disabled={busy}
                // A palette shouldn't reset a layout choice, so keep the current menu alignment.
                onClick={() => applyTokens({ ...p.tokens, '--nav-justify': draft['--nav-justify'] ?? 'flex-start' })}
              >
                <span className="preset-swatch" style={{ background: p.tokens['--color-accent'] }} />
                {p.name}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
