/**
 * Content → Training — manage training sections (collapsible groups) and the
 * courses inside them. Each course is an embedded Google Slides deck, can be
 * required for specific ranks, and is marked complete either by self-attest or by
 * an officer (per course). Completion is tracked per member on their profile.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';

interface Rank {
  id: number;
  name: string;
  sortOrder: number;
}

interface Section {
  id: number;
  title: string;
  sortOrder: number;
}

interface Course {
  id: number;
  title: string;
  description: string | null;
  embedUrl: string;
  completionMode: 'self' | 'officer';
  sectionId: number | null;
  sortOrder: number;
  requiredRankIds: number[];
}

interface Draft {
  id?: number;
  title: string;
  description: string;
  embedUrl: string;
  completionMode: 'self' | 'officer';
  sectionId: number | null;
  requiredRankIds: number[];
}

const BLANK: Draft = {
  title: '',
  description: '',
  embedUrl: '',
  completionMode: 'officer',
  sectionId: null,
  requiredRankIds: [],
};

export default function TrainingAdmin() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newSection, setNewSection] = useState('');
  const { run, busy, error, notice, warning } = useAction();

  const load = () =>
    api
      .get<{ trainings: Course[]; sections: Section[] }>('/training')
      .then((d) => {
        setCourses(d.trainings);
        setSections(d.sections ?? []);
      })
      .catch(() => setCourses([]));

  useEffect(() => {
    void load();
    api
      .get<{ ranks: Rank[] }>('/ranks')
      .then((d) => setRanks(d.ranks))
      .catch(() => setRanks([]));
  }, []);

  /* --- sections --- */
  const addSection = () =>
    run(async () => {
      const title = newSection.trim();
      if (!title) return '';
      await api.post('/training/sections', { title });
      setNewSection('');
      await load();
      return 'Section added.';
    });

  const renameSection = (sec: Section) =>
    run(async () => {
      const title = window.prompt('Rename section:', sec.title)?.trim();
      if (!title) return '';
      await api.patch(`/training/sections/${sec.id}`, { title });
      await load();
      return 'Section renamed.';
    });

  const deleteSection = (sec: Section) =>
    run(async () => {
      if (!window.confirm(`Delete section “${sec.title}”? Its courses stay, but become ungrouped.`)) return '';
      await api.del(`/training/sections/${sec.id}`);
      await load();
      return 'Section deleted.';
    });

  /* --- courses --- */
  const startNew = () => setDraft({ ...BLANK });
  const startEdit = (c: Course) =>
    setDraft({
      id: c.id,
      title: c.title,
      description: c.description ?? '',
      embedUrl: c.embedUrl,
      completionMode: c.completionMode,
      sectionId: c.sectionId,
      requiredRankIds: c.requiredRankIds,
    });

  const toggleRank = (rankId: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            requiredRankIds: d.requiredRankIds.includes(rankId)
              ? d.requiredRankIds.filter((r) => r !== rankId)
              : [...d.requiredRankIds, rankId],
          }
        : d,
    );

  const save = () =>
    run(async () => {
      if (!draft) return '';
      const body = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        embedUrl: draft.embedUrl.trim(),
        completionMode: draft.completionMode,
        sectionId: draft.sectionId,
        requiredRankIds: draft.requiredRankIds,
      };
      if (draft.id) await api.patch(`/training/${draft.id}`, body);
      else await api.post('/training', body);
      setDraft(null);
      await load();
      return 'Saved.';
    });

  const remove = (c: Course) =>
    run(async () => {
      if (!window.confirm(`Delete “${c.title}”? Members’ completion records for it are removed too.`)) return '';
      await api.del(`/training/${c.id}`);
      await load();
      return 'Course deleted.';
    });

  if (courses === null) return <div className="loading">Loading…</div>;

  const rankName = (id: number) => ranks.find((r) => r.id === id)?.name ?? `#${id}`;
  const sectionName = (id: number | null) => (id == null ? null : sections.find((s) => s.id === id)?.title ?? null);

  return (
    <section className="panel training-admin">
      <header className="panel-head">
        <h2>Training</h2>
        {!draft && (
          <button type="button" className="primary" onClick={startNew}>
            + New course
          </button>
        )}
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

      {/* Sections */}
      <div className="training-sections-admin">
        <h3>Sections</h3>
        <p className="muted small">Collapsible groups the courses are shown under in the module.</p>
        {sections.length > 0 && (
          <ul className="training-admin-list">
            {sections.map((sec) => (
              <li key={sec.id} className="training-admin-item">
                <span className="training-name">{sec.title}</span>
                <div className="training-admin-actions">
                  <button type="button" className="mini" disabled={busy} onClick={() => void renameSection(sec)}>
                    Rename
                  </button>
                  <button type="button" className="mini danger" disabled={busy} onClick={() => void deleteSection(sec)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="training-add-section">
          <input
            type="text"
            value={newSection}
            placeholder="New section name (e.g. Onboarding)"
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addSection();
              }
            }}
          />
          <button type="button" className="mini" disabled={busy || !newSection.trim()} onClick={() => void addSection()}>
            + Add section
          </button>
        </div>
      </div>

      {/* Course editor */}
      {draft && (
        <div className="training-form">
          <input
            type="text"
            value={draft.title}
            placeholder="Course title"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <textarea
            value={draft.description}
            placeholder="Short description (optional)"
            rows={2}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <input
            type="text"
            value={draft.embedUrl}
            placeholder="Google Slides link (Share → anyone with link, or Publish to web)"
            onChange={(e) => setDraft({ ...draft, embedUrl: e.target.value })}
          />
          <div className="training-form-row">
            <label className="inline-field">
              Section
              <select
                value={draft.sectionId ?? ''}
                onChange={(e) => setDraft({ ...draft, sectionId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">None (ungrouped)</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-field">
              Completion
              <select
                value={draft.completionMode}
                onChange={(e) => setDraft({ ...draft, completionMode: e.target.value as 'self' | 'officer' })}
              >
                <option value="officer">Officer-verified (a manager marks it)</option>
                <option value="self">Self-attested (members tick it off)</option>
              </select>
            </label>
          </div>

          <div className="training-ranks">
            <span className="muted small">Required for ranks (none = optional for everyone):</span>
            <div className="training-rank-grid">
              {[...ranks]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((r) => (
                  <label key={r.id} className="training-rank-opt">
                    <input
                      type="checkbox"
                      checked={draft.requiredRankIds.includes(r.id)}
                      onChange={() => toggleRank(r.id)}
                    />
                    {r.name}
                  </label>
                ))}
            </div>
          </div>

          <div className="training-form-actions">
            <button
              type="button"
              className="primary"
              disabled={busy || !draft.title.trim() || !draft.embedUrl.trim()}
              onClick={() => void save()}
            >
              {draft.id ? 'Save changes' : 'Create course'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Course list */}
      {courses.length === 0 && !draft ? (
        <p className="empty">No courses yet. Add one to build your training repository.</p>
      ) : (
        <ul className="training-admin-list">
          {courses.map((c) => (
            <li key={c.id} className="training-admin-item">
              <div className="training-admin-info">
                <div className="training-name">{c.title}</div>
                <div className="muted small">
                  {c.completionMode === 'self' ? 'Self-attested' : 'Officer-verified'}
                  {sectionName(c.sectionId) && <> · {sectionName(c.sectionId)}</>}
                  {c.requiredRankIds.length > 0 && <> · Required for {c.requiredRankIds.map(rankName).join(', ')}</>}
                </div>
              </div>
              <div className="training-admin-actions">
                <button type="button" className="mini" disabled={busy} onClick={() => startEdit(c)}>
                  Edit
                </button>
                <button type="button" className="mini danger" disabled={busy} onClick={() => void remove(c)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
