import React, { useState, useEffect, useCallback } from 'react';
import {
  Wand2, Sparkles, ChevronRight, Loader2, Check, X,
  Plus, FileText, Users, Globe, GitBranch, TrendingUp,
  ClipboardPaste, BookOpen, Pencil, CheckCircle2,
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { useSkillLevel } from '../../context/SkillLevelContext';

const STAGES = [
  { key: 'split', label: 'Split', icon: FileText },
  { key: 'characters', label: 'Characters', icon: Users },
  { key: 'world', label: 'World', icon: Globe },
  { key: 'plot', label: 'Plot', icon: GitBranch },
  { key: 'arcs', label: 'Arcs', icon: TrendingUp },
  { key: 'done', label: 'Done', icon: CheckCircle2 },
];

// Which entity field docs we render per stage (editable cards)
const FIELD_LABELS = {
  city: { name: 'Name', region: 'Region', atmosphere: 'Atmosphere', key_locations: 'Key Locations' },
  faction: { name: 'Name', description: 'Description', leader: 'Leader', alignment: 'Alignment' },
  artifact: { name: 'Name', type: 'Type', properties: 'Properties', location: 'Location' },
  glossary: { term: 'Term', definition: 'Definition', category: 'Category' },
  character: { name: 'Name', role: 'Role', bio: 'Bio', traits: 'Traits' },
  arc: { character_name: 'Character', arc_summary: 'Summary', starting_state: 'Starting', ending_state: 'Ending', key_milestones: 'Milestones' },
  beat: { title: 'Title', description: 'Description', chapter_index: 'Chapter', importance: 'Importance' },
};

const CHARACTER_ICONS = ['👤', '👩', '👨', '🧓', '👦', '👧'];
const WORLD_ICONS = { city: '🏙️', faction: '⚔️', artifact: '💎', glossary: '📖' };

const STAGE_EMOJI = {
  split: '✂️', characters: '👥', world: '🌍', plot: '🕸️', arcs: '📈', done: '✅',
};

const ENTITY_KINDS = {
  characters: 'character',
  world: ['city', 'faction', 'artifact', 'glossary'],
  plot: 'beat',
  arcs: 'arc',
};

const COLOR_BY_IMPORTANCE = {
  major: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  sub: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  minor: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

// fetch helper with error message extraction
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

function Field({ label, value, onChange, textarea, placeholder }) {
  if (textarea) {
    return (
      <div className="mb-2">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)] mb-1">{label}</label>
        <textarea
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] resize-y"
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder}
          rows="2"
        />
      </div>
    );
  }
  return (
    <div className="mb-2">
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)] mb-1">{label}</label>
      <input
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}

// Generic editable entity card: shows fields, allows edit toggle + remove.
function EntityCard({ icon, title, subtitle, fields, draft, setDraft, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(draft);

  const update = (key, val) => {
    const next = { ...local, [key]: val };
    setLocal(next);
    setDraft(next);
  };

  const primary = fields.name || fields.character_name || fields.term || fields.title || 'name';
  const primaryKey = Object.keys(fields)[0];
  const titleVal = local[primaryKey] || local['name'] || local['term'] || 'Unnamed';

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-sm">
            {icon || '❔'}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text-main)]">{titleVal}</div>
            {subtitle && <div className="truncate text-[11px] text-[var(--text-dim)]">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onRemove && (
            <button onClick={onRemove} className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-rose-400" title="Remove">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setEditing(!editing)} className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]" title={editing ? 'Done' : 'Edit'}>
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          {Object.entries(fields).map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={Array.isArray(local[key]) ? (local[key] || []).join('\n') : local[key]}
              onChange={(e) => {
                const v = e.target.value;
                update(key, Array.isArray(local[key]) ? v.split('\n').map(s => s.trim()).filter(Boolean) : v);
              }}
              textarea={['bio', 'description', 'properties', 'arc_summary', 'starting_state', 'ending_state', 'definition', 'key_locations', 'traits', 'key_milestones'].includes(key)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {Object.entries(fields).filter(([k]) => k !== primaryKey).slice(0, 3).map(([key, label]) => {
            const val = Array.isArray(local[key]) ? (local[key] || []).join(', ') : local[key];
            if (!val) return null;
            return (
              <div key={key} className="text-[11px] text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-dim)]">{label}: </span>
                {val}
              </div>
            );
          })}
          {local.importance && (
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${COLOR_BY_IMPORTANCE[local.importance] || 'bg-slate-500/15 text-slate-300 border-slate-500/30'}`}>
              {local.importance}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const CreatorPipelineView = () => {
  const { activeStory, setActiveTab } = useStory();
  const { canUse } = useSkillLevel();

  const navigate = useCallback((tab) => setActiveTab(tab), [setActiveTab]);

  const [state, setState] = useState(null);
  const [summary, setSummary] = useState(null);
  const [rawText, setRawText] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [activeStage, setActiveStage] = useState('split');
  const [draft, setDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const storyId = activeStory?.id;

  const loadState = useCallback(async () => {
    if (!storyId) return;
    try {
      const [st, su] = await Promise.all([
        api(`/api/creator/${storyId}/state`),
        api(`/api/creator/${storyId}/summary`),
      ]);
      setState(st);
      setSummary(su);
      // default to the current/in-progress stage
      const current = st.batches?.length ? (st.current_stage || (st.current_batch ? 'split' : 'done')) : 'split';
      setActiveStage((prev) => prev || current);
    } catch (err) {
      console.error('Failed to load creator state:', err);
    }
  }, [storyId]);

  useEffect(() => {
    loadState();
  }, [storyId, loadState]);

  // Poll the active stage draft while running
  useEffect(() => {
    if (!storyId || activeStage === 'split' || activeStage === 'done' || draftLoading) return;
    // load the draft for the active stage if one exists
    (async () => {
      try {
        const d = await api(`/api/creator/${storyId}/draft/${activeStage}`);
        setDraft(d);
      } catch { /* no draft yet */ }
    })();
  }, [storyId, activeStage, draftLoading]);

  const handleSplit = async () => {
    if (!storyId || !rawText.trim()) return;
    setSaving(true); setError(null);
    try {
      const st = await api(`/api/creator/${storyId}/split`, {
        method: 'POST',
        body: JSON.stringify({ text: rawText, book_title: bookTitle || null }),
      });
      setState(st);
      setActiveStage('characters');
      setSummary(await api(`/api/creator/${storyId}/summary`));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runStage = async (stage) => {
    if (!storyId) return;
    setDraftLoading(true); setError(null); setDraft(null);
    try {
      const st = await api(`/api/creator/${storyId}/run-stage`, {
        method: 'POST',
        body: JSON.stringify({ stage }),
      });
      setState(st);
      const d = await api(`/api/creator/${storyId}/draft/${stage}`);
      setDraft(d);
      setDraftLoading(false);
    } catch (err) {
      setDraftLoading(false);
      setError(err.message);
    }
  };

  const approveStage = async (stage) => {
    if (!storyId || !draft) return;
    setSaving(true); setError(null);
    try {
      const st = await api(`/api/creator/${storyId}/approve/${stage}`, {
        method: 'PUT',
        body: JSON.stringify({ result: draft }),
      });
      setState(st);
      setDraft(null);
      setSummary(await api(`/api/creator/${storyId}/summary`));
      // advance to next stage
      const idx = STAGES.findIndex((s) => s.key === stage);
      setActiveStage(STAGES[idx + 1]?.key || 'done');
      if (stage === 'arcs') setActiveStage('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addEntity = (kind) => {
    if (!draft) return;
    const empty = {
      character: { name: '', role: 'supporting', bio: '', aliases: [], traits: [], relationships: [] },
      city: { name: '', region: '', atmosphere: '', key_locations: [] },
      faction: { name: '', description: '', leader: '', alignment: '' },
      artifact: { name: '', type: '', properties: '', location: '', belongs_to: [] },
      glossary: { term: '', definition: '', category: '' },
      beat: { title: '', description: '', chapter_index: 0, chapter_id: '', character_names: [], importance: 'minor' },
      arc: { character_name: '', arc_summary: '', starting_state: '', ending_state: '', key_milestones: [] },
    };
    const next = { ...draft };
    const listKey = appendListKey(kind, next);
    next[listKey] = [...(next[listKey] || []), empty[kind]];
    setDraft(next);
  };

  const removeEntity = (kind, index) => {
    if (!draft) return;
    const next = { ...draft };
    const listKey = appendListKey(kind, next);
    next[listKey] = (next[listKey] || []).filter((_, i) => i !== index);
    setDraft(next);
  };

  const appendListKey = (kind, d) => {
    if (kind === 'character') return 'characters';
    if (kind === 'city') return 'cities';
    if (kind === 'faction') return 'factions';
    if (kind === 'artifact') return 'artifacts';
    if (kind === 'glossary') return 'glossary';
    if (kind === 'beat') return 'beats';
    if (kind === 'arc') return 'arcs';
    return 'items';
  };

  const updateEntity = (kind, listKey, index, value) => {
    if (!draft) return;
    const next = { ...draft };
    next[listKey] = (next[listKey] || []).map((item, i) => (i === index ? value : item));
    setDraft(next);
  };

  const renderEntityList = (kind, listKey, fields, iconFor) => {
    const items = draft?.[listKey] || [];
    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center text-xs text-[var(--text-dim)]">
          Nothing extracted for this stage yet.
        </div>
      );
    }
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item, i) => (
          <EntityCard
            key={i}
            icon={iconFor ? iconFor(item, i) : STAGE_EMOJI[kind === 'character' ? 'characters' : kind]}
            fields={fields}
            draft={item}
            setDraft={(val) => updateEntity(kind, listKey, i, val)}
            onRemove={() => removeEntity(kind, i)}
          />
        ))}
      </div>
    );
  };

  const worldKinds = ENTITY_KINDS.world;

  const stageComplete = (stage) => {
    if (!state) return false;
    if (stage === 'split') return state.batches?.some(b => b.stages_completed?.includes('split'));
    return state.batches?.some(b => b.stages_completed?.includes(stage));
  };
  const allDone = state?.status === 'complete' || state?.batches?.some(b => b.completed_at);

  const renderContent = () => {
    switch (activeStage) {
      case 'split':
        return (
          <SplitPane
            rawText={rawText} setRawText={setRawText}
            bookTitle={bookTitle} setBookTitle={setBookTitle}
            onSplit={handleSplit} saving={saving}
            state={state} storyId={storyId}
          />
        );
      case 'characters':
        return (
          <ExtractionPane
            title="Character Extraction"
            emoji={STAGE_EMOJI.characters}
            stage="characters"
            draft={draft}
            draftLoading={draftLoading}
            onRun={() => runStage('characters')}
            onApprove={() => approveStage('characters')}
            saving={saving}
            done={stageComplete('characters')}
          >
            {draft && renderEntityList('character', 'characters', {
              name: 'Name', role: 'Role', bio: 'Bio', traits: 'Traits', aliases: 'Aliases',
            }, (c, i) => CHARACTER_ICONS[i % CHARACTER_ICONS.length])}
          </ExtractionPane>
        );
      case 'world':
        return (
          <ExtractionPane
            title="World Extraction"
            emoji={STAGE_EMOJI.world}
            stage="world"
            draft={draft}
            draftLoading={draftLoading}
            onRun={() => runStage('world')}
            onApprove={() => approveStage('world')}
            saving={saving}
            done={stageComplete('world')}
          >
            {draft && worldKinds.map((kind) => (
              <div key={kind} className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">{WORLD_ICONS[kind]} {kind === 'glossary' ? 'Glossary' : kind + 's'}</h4>
                  <button onClick={() => addEntity(kind)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)]">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {renderEntityList(kind, kind === 'glossary' ? 'glossary' : kind + 's', FIELD_LABELS[kind], () => WORLD_ICONS[kind])}
              </div>
            ))}
            {draft && (
              <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
                <Field label="Magic / Rules System" value={draft.magic_system} onChange={(e) => setDraft({ ...draft, magic_system: e.target.value })} />
                <Field label="Technology Level" value={draft.technology_level} onChange={(e) => setDraft({ ...draft, technology_level: e.target.value })} />
                <Field label="Global Rules (one per line)" value={(draft.global_rules || []).join('\n')} onChange={(e) => setDraft({ ...draft, global_rules: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} textarea />
              </div>
            )}
          </ExtractionPane>
        );
      case 'plot':
        return (
          <ExtractionPane
            title="Plot Extraction"
            emoji={STAGE_EMOJI.plot}
            stage="plot"
            draft={draft}
            draftLoading={draftLoading}
            onRun={() => runStage('plot')}
            onApprove={() => approveStage('plot')}
            saving={saving}
            done={stageComplete('plot')}
          >
            {draft && renderEntityList('beat', 'beats', {
              title: 'Title', description: 'Description', chapter_index: 'Chapter #', importance: 'Importance',
            }, (b) => (b.importance === 'major' ? '🔥' : '🕸️'))
            }
            {draft && (draft.themes?.length > 0) && (
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--accent)]">Themes</h4>
                <div className="flex flex-wrap gap-1.5">
                  {draft.themes.map((t, i) => (
                    <span key={i} className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-2.5 py-1 text-[11px] text-[var(--text-main)]">{t}</span>
                  ))}
                </div>
                <Field label="Add theme (return to add)" value={draft.themes.join('\n')} onChange={(e) => setDraft({ ...draft, themes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} textarea />
              </div>
            )}
          </ExtractionPane>
        );
      case 'arcs':
        return (
          <ExtractionPane
            title="Arc Extraction"
            emoji={STAGE_EMOJI.arcs}
            stage="arcs"
            draft={draft}
            draftLoading={draftLoading}
            onRun={() => runStage('arcs')}
            onApprove={() => approveStage('arcs')}
            saving={saving}
            done={stageComplete('arcs')}
          >
            {draft && renderEntityList('arc', 'arcs', {
              character_name: 'Character', arc_summary: 'Summary', starting_state: 'Starting State', ending_state: 'Ending State', key_milestones: 'Milestones',
            }, (a) => '📈')}
          </ExtractionPane>
        );
      case 'done':
        return <DonePane summary={summary} onNewBatch={() => { setActiveStage('split'); setRawText(''); setBookTitle(''); }} onOpenDashboard={() => navigate('dashboard')} />;
      default:
        return <SplitPane rawText={rawText} setRawText={setRawText} bookTitle={bookTitle} setBookTitle={setBookTitle} onSplit={handleSplit} saving={saving} state={state} storyId={storyId} />;
    }
  };

  if (!canUse('nav.creator')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]"><Wand2 className="h-6 w-6" /></span>
        <p className="text-sm text-[var(--text-muted)]">Creator Pipeline unlocks at Pro level.</p>
      </div>
    );
  }

  if (!activeStory) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-[var(--text-muted)]">Select a story to begin importing prose.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-prose text-2xl font-bold text-[var(--text-main)] flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-[var(--accent)]" /> Creator Pipeline
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {activeStory.title} — paste raw prose and this extracts characters, world, plot & arcs.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Batches</div>
          <div className="text-lg font-bold text-[var(--accent)]">{summary?.batches || 0}</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Stepper */}
      <div className="mb-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]/80 p-4 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const complete = s.key === 'split' ? stageComplete('split') : s.key === 'done' ? allDone : (stageComplete(s.key));
            const active = activeStage === s.key;
            return (
              <React.Fragment key={s.key}>
                {i > 0 && <div className={`h-px flex-1 mx-1 ${active || complete ? 'bg-[var(--accent)]' : 'bg-[var(--border-subtle)]'}`} />}
                <button
                  onClick={() => setActiveStage(s.key)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors ${active ? 'bg-[var(--accent)] text-white shadow-md' : 'hover:bg-[var(--bg-hover)]'}`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-white' : complete ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'}`} />
                  <span className={`text-[10px] font-medium ${active ? 'text-white' : complete ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'}`}>{s.label}</span>
                  {complete && !active && <Check className="h-3 w-3 text-emerald-400" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]/60 p-5 shadow-sm backdrop-blur-md">
        {renderContent()}
      </div>
    </div>
  );
};

// --- Split pane -----------------------------------------------------------

function SplitPane({ rawText, setRawText, bookTitle, setBookTitle, onSplit, saving, state, storyId }) {
  const [chapters, setChapters] = useState([]);
  useEffect(() => {
    if (!storyId) return;
    (async () => {
      try {
        const books = await api(`/api/stories/${storyId}/books`);
        if (books.length > 0) {
          const chs = await api(`/api/stories/${storyId}/books/${books[0].id}/chapters`);
          setChapters(chs);
        }
      } catch { /* ignore */ }
    })();
  }, [storyId, state?.status]);

  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 font-prose text-lg font-semibold text-[var(--text-main)]">
        <ClipboardPaste className="h-4 w-4 text-[var(--accent)]" /> {STAGE_EMOJI.split} Paste Your Prose
      </h3>
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        Paste chapters of a manuscript below. The Creator Pipeline splits them into chapters and builds a story on top.
        You can run this iteratively (e.g. chapters 1–5, then 6–9) — each batch merges with the last.
      </p>

      <textarea
        className="w-full min-h-[220px] rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-4 font-prose text-sm leading-relaxed text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] resize-y mb-3"
        placeholder="Paste your raw prose here… (using ## Chapter N or Chapter N markers helps the splitter)"
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
      />
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)] mb-1">Book Title (optional)</label>
          <input
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="e.g. Anna Karenina — Part II"
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
          />
        </div>
        <button
          onClick={onSplit}
          disabled={!rawText.trim() || saving}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Split into Chapters
        </button>
      </div>

      {chapters.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--accent)]">Chapters Detected ({chapters.length})</h4>
          <div className="space-y-1">
            {chapters.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate text-sm font-medium text-[var(--text-main)]">{ch.title}</span>
                  <span className="text-[11px] text-[var(--text-dim)]">{ch.word_count || 0} words</span>
                </div>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Extraction pane --------------------------------------------------------

function ExtractionPane({ title, emoji, stage, draft, draftLoading, onRun, onApprove, saving, done, children }) {
  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-prose text-lg font-semibold text-[var(--text-main)]">
            {emoji} {title}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {draftLoading ? 'Extracting with the local AI model… this can take a minute.' :
             done ? 'This stage has been approved and merged into the story.' :
             draft ? 'Review and edit the extraction below, then approve to merge it in.' :
             'Run this stage to extract the draft result for review.'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {draftLoading ? (
            <span className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" /> Extracting…
            </span>
          ) : (
            <>
              {!done && (
                <button onClick={onRun} disabled={draftLoading} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-hover)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-50">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Run Stage
                </button>
              )}
              {draft && !done && (
                <button onClick={onApprove} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve & Merge
                </button>
              )}
              {done && (
                <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Approved
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// --- Done pane --------------------------------------------------------------

function DonePane({ summary, onNewBatch, onOpenDashboard }) {
  const stats = [
    { label: 'Chapters', value: summary?.chapters ?? 0, icon: FileText },
    { label: 'Characters', value: summary?.characters ?? 0, icon: Users },
    { label: 'Cities', value: summary?.cities ?? 0, icon: Globe },
    { label: 'Factions', value: summary?.factions ?? 0, icon: GitBranch },
    { label: 'Artifacts', value: summary?.artifacts ?? 0, icon: Sparkles },
    { label: 'Glossary', value: summary?.glossary ?? 0, icon: BookOpen },
    { label: 'Plot Beats', value: summary?.beats ?? 0, icon: GitBranch },
    { label: 'Arcs', value: summary?.arcs ?? 0, icon: TrendingUp },
  ];
  return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
      <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">Story Import Complete</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Your imported story has been populated across the app.</p>

      <div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)] p-3">
              <Icon className="mx-auto mb-1 h-4 w-4 text-[var(--accent)]" />
              <div className="text-xl font-bold text-[var(--text-main)]">{s.value}</div>
              <div className="text-[10px] font-medium text-[var(--text-dim)]">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <button onClick={onNewBatch} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-hover)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--bg-hover)]">
          <Plus className="h-4 w-4 text-[var(--accent)]" /> Add Another Batch (e.g. 6–9)
        </button>
        <button
          onClick={onOpenDashboard}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Open in Dashboard
        </button>
      </div>
    </div>
  );
}
