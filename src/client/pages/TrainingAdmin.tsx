/**
 * Content → Training — manage training sections (collapsible groups) and the
 * courses inside them. Each course is an embedded Google Slides deck, can be
 * required for specific ranks, and is marked complete either by self-attest or by
 * an officer (per course). Completion is tracked per member on their profile.
 */

import { useEffect, useState, type DragEvent } from 'react';
import { api } from '../lib/api';
import { useAction, Alerts } from '../lib/action';
import Switch from '../components/Switch';

type DragState = { id: number; kind: 'section' | 'course' } | null;
type OverState =
  | { kind: 'section'; id: number; after: boolean }
  | { kind: 'course'; id: number; after: boolean }
  | { kind: 'into'; sectionId: number | null }
  | null;

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
  const [sortMode, setSortMode] = useState<'custom' | 'alpha'>('custom');
  const [drag, setDrag] = useState<DragState>(null);
  const [over, setOver] = useState<OverState>(null);
  const { run, busy, error, notice, warning } = useAction();

  const load = () =>
    api
      .get<{ trainings: Course[]; sections: Section[]; sortMode?: string }>('/training')
      .then((d) => {
        setCourses(d.trainings);
        setSections(d.sections ?? []);
        setSortMode(d.sortMode === 'alpha' ? 'alpha' : 'custom');
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

  const setSort = (alpha: boolean) =>
    run(async () => {
      const sort = alpha ? 'alpha' : 'custom';
      setSortMode(sort);
      await api.put('/training/settings', { sort });
      return alpha ? 'The training page now sorts courses A–Z.' : 'The training page uses your custom drag order.';
    });

  /* --- drag to arrange sections + courses --- */
  // Persist the whole arrangement: section order + each course's order and
  // section. sortOrder becomes the index in the grouped, flattened list.
  const persist = (nextSections: Section[], nextCourses: Course[]) => {
    setSections(nextSections);
    setCourses(nextCourses);
    const isOrphan = (c: Course) => c.sectionId == null || !nextSections.some((s) => s.id === c.sectionId);
    const flat: { id: number; sectionId: number | null }[] = [];
    for (const sec of nextSections) {
      for (const c of nextCourses.filter((x) => x.sectionId === sec.id)) flat.push({ id: c.id, sectionId: sec.id });
    }
    for (const c of nextCourses.filter(isOrphan)) flat.push({ id: c.id, sectionId: null });
    void api
      .put('/training/order', { sections: nextSections.map((s) => s.id), courses: flat })
      .catch(() => void load());
  };

  const afterY = (e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };
  const clearDrag = () => {
    setDrag(null);
    setOver(null);
  };
  const startDrag = (id: number, kind: 'section' | 'course') => (e: DragEvent) => {
    setDrag({ id, kind });
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(id));
    } catch {
      /* ignore */
    }
  };

  const moveCourseRelative = (dragId: number, targetId: number, after: boolean, list: Course[]) => {
    if (dragId === targetId) return;
    const moved = list.find((c) => c.id === dragId);
    const target = list.find((c) => c.id === targetId);
    if (!moved || !target) return;
    const next = list.filter((c) => c.id !== dragId);
    const ti = next.findIndex((c) => c.id === targetId);
    next.splice(after ? ti + 1 : ti, 0, { ...moved, sectionId: target.sectionId });
    persist(sections, next);
  };
  const moveCourseInto = (dragId: number, sectionId: number | null, list: Course[]) => {
    const moved = list.find((c) => c.id === dragId);
    if (!moved) return;
    const next = list.filter((c) => c.id !== dragId);
    next.push({ ...moved, sectionId });
    persist(sections, next);
  };
  const moveSection = (dragId: number, targetId: number, after: boolean) => {
    if (dragId === targetId) return;
    const moved = sections.find((s) => s.id === dragId);
    if (!moved) return;
    const next = sections.filter((s) => s.id !== dragId);
    const ti = next.findIndex((s) => s.id === targetId);
    if (ti < 0) next.push(moved);
    else next.splice(after ? ti + 1 : ti, 0, moved);
    persist(next, courses ?? []);
  };

  const courseRowProps = (id: number) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (drag?.kind !== 'course') return;
      e.preventDefault();
      e.stopPropagation();
      setOver({ kind: 'course', id, after: afterY(e) });
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (drag?.kind !== 'course') return;
      e.preventDefault();
      e.stopPropagation();
      moveCourseRelative(drag.id, id, afterY(e), courses ?? []);
      clearDrag();
    },
  });
  const groupBodyProps = (sectionId: number | null) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (drag?.kind !== 'course') return;
      e.preventDefault();
      setOver({ kind: 'into', sectionId });
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (drag?.kind !== 'course') return;
      e.preventDefault();
      moveCourseInto(drag.id, sectionId, courses ?? []);
      clearDrag();
    },
  });
  const sectionHeadProps = (id: number) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (drag?.kind !== 'section') return;
      e.preventDefault();
      e.stopPropagation();
      setOver({ kind: 'section', id, after: afterY(e) });
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (drag?.kind !== 'section') return;
      e.preventDefault();
      e.stopPropagation();
      moveSection(drag.id, id, afterY(e));
      clearDrag();
    },
  });
  const gripProps = (id: number, kind: 'section' | 'course') => ({
    className: 'drag-grip',
    draggable: !busy,
    onDragStart: startDrag(id, kind),
    onDragEnd: clearDrag,
    title: 'Drag to reorder',
    'aria-hidden': true,
  });

  if (courses === null) return <div className="loading">Loading…</div>;

  const rankName = (id: number) => ranks.find((r) => r.id === id)?.name ?? `#${id}`;

  const orphan = (c: Course) => c.sectionId == null || !sections.some((s) => s.id === c.sectionId);
  const grouped = sections.map((sec) => ({ sec, items: courses.filter((c) => c.sectionId === sec.id) }));
  const ungrouped = courses.filter(orphan);

  const courseRow = (c: Course) => {
    const dragging = drag?.kind === 'course' && drag.id === c.id;
    const drop = over?.kind === 'course' && over.id === c.id ? (over.after ? ' drop-after' : ' drop-before') : '';
    return (
      <li key={c.id} className={`training-admin-item training-course-row${dragging ? ' dragging' : ''}${drop}`} {...courseRowProps(c.id)}>
        <span {...gripProps(c.id, 'course')}>⠿</span>
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
    );
  };

  return (
    <section className="panel training-admin">
      <header className="panel-head training-admin-head">
        <h2>Training</h2>
        <div className="training-admin-controls">
          <div className="check" title="When on, the member training page ignores the drag order and lists courses A–Z within each section.">
            <Switch
              checked={sortMode === 'alpha'}
              onChange={(v) => void setSort(v)}
              disabled={busy}
              label="Sort courses A–Z on the training page"
              hideState
            />
            <span className="muted small">Sort A–Z on page</span>
          </div>
          {!draft && (
            <button type="button" className="primary" onClick={startNew}>
              + New course
            </button>
          )}
        </div>
      </header>

      <Alerts error={error} warning={warning} notice={notice} />

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
                  <div key={r.id} className="training-rank-opt">
                    <Switch
                      checked={draft.requiredRankIds.includes(r.id)}
                      onChange={() => toggleRank(r.id)}
                      label={r.name}
                      hideState
                    />
                    {r.name}
                  </div>
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

      {/* Sections (draggable groups) with their courses, then an ungrouped bucket. */}
      <p className="muted small training-tree-hint">
        Drag the grips to reorder sections and courses, or drag a course into another section.
        {sortMode === 'alpha' && ' (The training page is sorting A–Z, so this order only applies once you switch that off.)'}
      </p>

      <div className="training-tree">
        {grouped.map(({ sec, items }) => {
          const headDrop =
            over?.kind === 'section' && over.id === sec.id ? (over.after ? ' drop-after' : ' drop-before') : '';
          const dragging = drag?.kind === 'section' && drag.id === sec.id;
          const intoOn = over?.kind === 'into' && over.sectionId === sec.id;
          return (
            <div key={sec.id} className={`training-group${dragging ? ' dragging' : ''}`}>
              <div className={`training-group-head${headDrop}`} {...sectionHeadProps(sec.id)}>
                <span {...gripProps(sec.id, 'section')}>⠿</span>
                <span className="training-name">{sec.title}</span>
                <span className="training-section-count muted small">{items.length}</span>
                <div className="training-admin-actions">
                  <button type="button" className="mini" disabled={busy} onClick={() => void renameSection(sec)}>
                    Rename
                  </button>
                  <button type="button" className="mini danger" disabled={busy} onClick={() => void deleteSection(sec)}>
                    Delete
                  </button>
                </div>
              </div>
              <ul className={`training-admin-list training-group-body${intoOn ? ' drop-into' : ''}`} {...groupBodyProps(sec.id)}>
                {items.length === 0 && <li className="muted small nav-child-empty">Empty — drag a course here.</li>}
                {items.map(courseRow)}
              </ul>
            </div>
          );
        })}

        <div className="training-group">
          <div className="training-group-head training-group-head-static">
            <span className="training-name">Ungrouped</span>
            <span className="training-section-count muted small">{ungrouped.length}</span>
          </div>
          <ul
            className={`training-admin-list training-group-body${over?.kind === 'into' && over.sectionId === null ? ' drop-into' : ''}`}
            {...groupBodyProps(null)}
          >
            {ungrouped.length === 0 && <li className="muted small nav-child-empty">Empty — drag a course here to un-file it.</li>}
            {ungrouped.map(courseRow)}
          </ul>
        </div>
      </div>

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
    </section>
  );
}
