/**
 * Content → Training — manage training courses: an embedded Google Slides deck
 * per course, which ranks it's required for, and how it's marked complete
 * (self-attest or officer-verified). Completion itself is tracked per member and
 * shown on their profile; this panel is the course catalog + editor.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';

interface Rank {
  id: number;
  name: string;
  sortOrder: number;
}

interface Course {
  id: number;
  title: string;
  description: string | null;
  embedUrl: string;
  completionMode: 'self' | 'officer';
  sortOrder: number;
  requiredRankIds: number[];
}

interface Draft {
  id?: number;
  title: string;
  description: string;
  embedUrl: string;
  completionMode: 'self' | 'officer';
  requiredRankIds: number[];
}

const BLANK: Draft = { title: '', description: '', embedUrl: '', completionMode: 'officer', requiredRankIds: [] };

export default function TrainingAdmin() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { run, busy, error, notice, warning } = useAction();

  const load = () =>
    api
      .get<{ trainings: Course[] }>('/training')
      .then((d) => setCourses(d.trainings))
      .catch(() => setCourses([]));

  useEffect(() => {
    void load();
    api
      .get<{ ranks: Rank[] }>('/ranks')
      .then((d) => setRanks(d.ranks))
      .catch(() => setRanks([]));
  }, []);

  const startNew = () => setDraft({ ...BLANK });
  const startEdit = (c: Course) =>
    setDraft({
      id: c.id,
      title: c.title,
      description: c.description ?? '',
      embedUrl: c.embedUrl,
      completionMode: c.completionMode,
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
            <button type="button" className="primary" disabled={busy || !draft.title.trim() || !draft.embedUrl.trim()} onClick={() => void save()}>
              {draft.id ? 'Save changes' : 'Create course'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
