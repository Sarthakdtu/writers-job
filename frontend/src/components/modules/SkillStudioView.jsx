import React, { useEffect, useState, useRef } from 'react';
import {
  Plus, Copy, Pencil, Trash2, Zap, Lock, Unlock, Play, Loader2,
  Globe, X, Sparkles, HelpCircle,
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { AiHelpModal } from '../../components/AiHelpModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const FAMILY_LABEL = { text: 'Text', vision: 'Vision', ocr: 'OCR' };
const INPUT_LABEL = { story_context: 'Story context', selection: 'Selection', text: 'Text', images: 'Images' };

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'world', label: 'World' },
  { id: 'characters', label: 'Characters' },
  { id: 'outliner', label: 'Outliner' },
  { id: 'editor', label: 'Editor' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'home', label: 'Home' },
];

const SOURCE_LABEL = {
  overview: 'Story overview',
  characters: 'Characters',
  world_cities: 'Cities',
  world_factions: 'Factions',
  world_artifacts: 'Artifacts',
  world_glossary: 'Glossary',
  world_mechanics: 'Mechanics',
  books: 'Books',
  plot: 'Plot beats',
  arcs: 'Character arcs',
  chapter_prose: 'Open chapter',
  timeline: 'Timeline',
  gallery: 'Gallery',
  none: 'Nothing (pure)',
};

const SKILL_EMOJI = {
  story_overview: '📖', plot_holes: '🕳️', pacing_analysis: '⏱️', pitch_blurb: '📋',
  lore_check: '📜', mechanics_review: '⚙️', world_scene_ideas: '🌍',
  character_trajectory: '📈', character_consistency: '👤', dialogue_voice: '💬',
  gap_finder: '🔍', arc_trajectories: '🎯', pov_balance: '👁️', twist_check: '🌀',
  prose_critique: '✒️', continue_writing: '➡️', continuity_check: '🔗', show_tell: '🎭',
  handwriting_ocr: '📝', concept_art_caption: '🖼️', sticky_notes_dump: '🗒️',
};

const HINTS = [
  { id: '', label: 'No author hint (let the router decide)' },
  { id: 'whole story', label: 'Whole story' },
  { id: 'my characters', label: 'My characters' },
  { id: 'plot & structure', label: 'Plot & structure' },
  { id: 'the open chapter', label: 'The open chapter' },
  { id: 'world lore', label: 'World lore' },
  { id: 'nothing', label: 'Nothing / pure creative' },
];

const mdStyle = {
  p: ({ children }) => <p className="text-[13px] text-[var(--text-main)] leading-relaxed my-1.5">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 my-1.5 space-y-0.5 text-[13px] text-[var(--text-main)]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-1.5 space-y-0.5 text-[13px] text-[var(--text-main)]">{children}</ol>,
  li: ({ children }) => <li className="text-[13px] text-[var(--text-main)]">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-[var(--accent)]">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--accent)] pl-2 my-1.5 text-[13px] text-[var(--text-muted)] italic">{children}</blockquote>,
};

const EMPTY_DRAFT = {
  name: '',
  description: '',
  prompt: '',
  model_family: 'text',
  temperature: 0.2,
  input_kind: 'story_context',
  tabs: [],
  max_images: 0,
  save_targets: [],
  hint: '',
  routing_mode: null,
};

export const SkillStudioView = () => {
  const { activeStory } = useStory();
  const [customs, setCustoms] = useState([]);
  const [builtins, setBuiltins] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [testJob, setTestJob] = useState(null);
  const [pipelineMsg, setPipelineMsg] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [sources, setSources] = useState([]);
  const [sourceInput, setSourceInput] = useState('');
  const firstLoad = useRef(true);

  useEffect(() => {
    load();
    const id = setInterval(loadCustoms, 3000);
    return () => clearInterval(id);
  }, [activeStory?.id]);

  useEffect(() => {
    if (testJob && (testJob.status === 'running' || testJob.status === 'pending')) {
      loadCustoms();
    }
  }, [testJob?.status]);

  const load = async () => {
    await Promise.all([loadCustoms(), loadBuiltins()]);
  };

  const loadCustoms = async () => {
    try {
      const [list, jobs] = await Promise.all([
        fetch('/api/ai/custom').then((r) => (r.ok ? r.json() : [])),
        activeStory?.id
          ? fetch(`/api/ai/jobs/${activeStory.id}`).then((r) => (r.ok ? r.json() : []))
          : Promise.resolve([]),
      ]);
      setCustoms(list);
      if (jobs.length) {
        const mine = jobs.filter((j) => j.pipeline?.startsWith('custom-'));
        if (mine.length) setTestJob(mine[0]);
      }
    } catch (err) {
      console.error('loadCustoms failed:', err);
    }
  };

  const loadBuiltins = async () => {
    try {
      const res = await fetch('/api/ai/pipelines?story_id=all');
      if (!res.ok) return;
      const data = await res.json();
      const all = Array.isArray(data) ? data : data.pipelines || [];
      setBuiltins(all.filter((p) => !p.is_custom));
    } catch (err) {
      console.error('loadBuiltins failed:', err);
    }
  };

  const newDraft = () => {
    setDraft({ ...EMPTY_DRAFT });
    setEditingId(null);
    setPreview(null);
    setPipelineMsg('');
    setSources([]);
    setSourceInput('');
  };

  const editDraft = (skill) => {
    setDraft({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt,
      model_family: skill.model_family,
      temperature: skill.temperature,
      input_kind: skill.input_kind,
      tabs: [...(skill.tabs || [])],
      max_images: skill.max_images,
      save_targets: [...(skill.save_targets || [])],
      hint: skill.hint || '',
      routing_mode: skill.routing?.mode || 'auto',
    });
    setEditingId(skill.id);
    setSources([...(skill.routing?.sources || [])]);
    setPreview(skill.routing || null);
    setPipelineMsg('');
  };

  const patch = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleTab = (tab) => {
    setDraft((d) => {
      const cur = d.tabs.includes(tab)
        ? d.tabs.filter((t) => t !== tab)
        : [...d.tabs, tab];
      return { ...d, tabs: cur };
    });
  };

  const previewSources = async () => {
    if (!draft?.prompt.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch('/api/ai/custom/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          prompt: draft.prompt,
          hint: draft.hint || undefined,
        }),
      });
      const data = await res.json();
      setPreview(data);
      if (data.sources) setSources(data.sources);
    } catch (err) {
      setPreview({ error: String(err) });
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    if (!draft?.name.trim() || !draft?.prompt.trim()) return null;
    setSaving(true);
    setPipelineMsg('');
    try {
      const res = await fetch(editingId ? `/api/ai/custom/${editingId}` : '/api/ai/custom', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          prompt: draft.prompt,
          model_family: draft.model_family,
          temperature: draft.temperature,
          input_kind: draft.input_kind,
          tabs: draft.tabs,
          max_images: draft.input_kind === 'images' ? draft.max_images : 0,
          save_targets: draft.save_targets,
          hint: draft.hint || undefined,
          routing_mode: draft.routing_mode || undefined,
          routing_sources: draft.routing_mode === 'locked' ? sources : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err);
        setPipelineMsg(`Save failed: ${detail}`);
        return null;
      }
      const saved = await res.json();
      setPipelineMsg(`Saved “${saved.name}” (${editingId ? 'updated' : 'created'}) with sources: ${(saved.routing?.sources || []).join(', ') || 'none'}.`);
      setEditingId(saved.id);
      setPreview(saved.routing || null);
      await loadCustoms();
      return saved;
    } catch (err) {
      setPipelineMsg(`Save failed: ${String(err)}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (id) => {
    try {
      const res = await fetch(`/api/ai/custom/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const dup = await res.json();
        editDraft(dup);
        await loadCustoms();
      }
    } catch (err) {
      console.error('duplicate failed:', err);
    }
  };

  const remove = async (id) => {
    await fetch(`/api/ai/custom/${id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (editingId === id) setDraft(null);
    await loadCustoms();
  };

  const testRun = async () => {
    if (!activeStory?.id || !draft?.prompt.trim()) return;
    let skillId = editingId;
    if (!skillId) {
      const saved = await save();
      if (!saved) return;
      skillId = saved.id;
    }
    setPipelineMsg('');
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_id: activeStory.id,
          skill: skillId,
          input: { images: [], params: {} },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err);
        setPipelineMsg(`Run failed: ${detail}`);
        return;
      }
      const job = await res.json();
      setTestJob(job);
      setPipelineMsg(`Ran “${draft.name}” — job ${job.status}${job.queue_position > 0 ? ` (queue pos ${job.queue_position})` : ''}.`);
    } catch (err) {
      setPipelineMsg(`Run failed: ${String(err)}`);
    }
  };

  const cancelTest = async (jobId) => {
    if (!activeStory?.id) return;
    await fetch(`/api/ai/jobs/${jobId}/cancel?story_id=${activeStory.id}`, { method: 'POST' });
    await loadCustoms();
  };

  const elapsed = testJob?.status === 'running' && testJob?.started_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(testJob.started_at)) / 1000))
    : null;

  const showForm = !draft;

  return (
    <div className="animate-in fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-prose text-2xl font-bold text-[var(--text-main)]">Skill Studio</h1>
          <p className="text-xs text-[var(--text-dim)] mt-1">
            Build custom AI pipelines. The Context Router wires which story data each skill reads — review and lock its sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)]" title="How to use AI skills">
            <HelpCircle className="h-3.5 w-3.5" /> How to use
          </button>
          <button onClick={newDraft} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90" style={{ backgroundColor: 'var(--accent)' }}>
            <Plus className="h-3.5 w-3.5" /> New skill
          </button>
        </div>
      </div>

      {!activeStory?.id && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center text-xs text-[var(--text-dim)]">
          Select a story to test-run custom skills. (Skill catalog + editor work without one.)
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: catalog */}
        <div className="lg:col-span-1 space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Custom skills</h2>
            </div>
            <div className="space-y-2">
              {customs.length === 0 && (
                <p className="text-xs text-[var(--text-dim)]">None yet — hit “New skill” to create one.</p>
              )}
              {customs.map((s) => (
                <div
                  key={s.id}
                  className={`group relative rounded-xl border p-3 transition-all cursor-pointer hover:border-[var(--accent)]/60 ${
                    editingId === s.id
                      ? 'border-[var(--accent)] bg-[var(--accent-light)]/40'
                      : 'border-[var(--border-color)] bg-[var(--bg-card)]'
                  }`}
                  onClick={() => editDraft(s)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-main)] truncate">{s.name}</p>
                      <p className="text-[11px] text-[var(--text-dim)] truncate mt-0.5">{s.description || '—'}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); duplicate(s.id); }} title="Duplicate" className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)]"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); editDraft(s); }} title="Edit" className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)]"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(s.id); }} title="Delete" className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-hover)]"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] text-[9px] font-medium">{FAMILY_LABEL[s.model_family]}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] text-[9px] font-medium">{INPUT_LABEL[s.input_kind]}</span>
                    {s.routing?.mode === 'locked'
                      ? <span className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 text-[9px] flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" /> locked</span>
                      : <span className="px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-400 text-[9px] flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" /> auto</span>}
                    {s.hint && <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] text-[9px]">{s.hint}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-2">Built-in skills</h2>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
              {builtins.length === 0 && <p className="text-xs text-[var(--text-dim)] p-3">Loading…</p>}
              {builtins.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 group" title={p.description}>
                  <span className="text-sm" aria-hidden="true">{SKILL_EMOJI[p.id] || '🤖'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--text-main)] truncate">{p.name}</p>
                    <p className="text-[10px] text-[var(--text-dim)] truncate">{p.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] text-[9px]">{FAMILY_LABEL[p.family] || p.family}</span>
                    {p.needs_images && <span className="px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-400 text-[9px]">img</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-dim)] mt-1.5">Built-ins are code-defined and read-only here.</p>
          </div>
        </div>

        {/* Right: editor */}
        <div className="lg:col-span-2">
          {showForm ? (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-10 text-center">
              <Sparkles className="h-8 w-8 text-[var(--accent)] mx-auto mb-3 opacity-60" />
              <p className="text-sm font-medium text-[var(--text-main)]">No skill open</p>
              <p className="text-xs text-[var(--text-dim)] mt-1 mb-4">Select a skill on the left or create a new one.</p>
              <button onClick={newDraft} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: 'var(--accent)' }}>
                <Plus className="h-3.5 w-3.5" /> New skill
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--text-main)]">{editingId ? 'Edit skill' : 'New custom skill'}</h2>
                <button onClick={() => setDraft(null)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="h-4 w-4" /></button>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Name</label>
                    <input value={draft.name} onChange={(e) => patch('name', e.target.value)} placeholder="e.g. POV Auditor"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Description</label>
                    <input value={draft.description} onChange={(e) => patch('description', e.target.value)} placeholder="Briefly, what does it do?"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">Prompt <span className="text-[var(--text-dim)]">(may use <code className="font-mono">{'{{story_context}}'}</code>, <code className="font-mono">{'{{characters}}'}</code>, <code className="font-mono">{'{{open_chapter}}'}</code>, <code className="font-mono">{'{{plot}}'}</code>)</span></label>
                  <textarea value={draft.prompt} onChange={(e) => patch('prompt', e.target.value)} rows={6} placeholder="You are a careful editor. Audit the attached chapter for point-of-view drift…"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] font-mono leading-relaxed placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Model family</label>
                    <select value={draft.model_family} onChange={(e) => patch('model_family', e.target.value)}
                      className="w-full px-2 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] focus:outline-none">
                      <option value="text">Text</option>
                      <option value="vision">Vision</option>
                      <option value="ocr">OCR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Temperature</label>
                    <input type="number" min="0" max="2" step="0.05" value={draft.temperature} onChange={(e) => patch('temperature', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Input kind</label>
                    <select value={draft.input_kind} onChange={(e) => patch('input_kind', e.target.value)}
                      className="w-full px-2 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] focus:outline-none">
                      <option value="story_context">Story context</option>
                      <option value="selection">Selection</option>
                      <option value="text">Text</option>
                      <option value="images">Images</option>
                    </select>
                  </div>
                  {draft.input_kind === 'images' ? (
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">Max images</label>
                      <input type="number" min="1" max="6" value={draft.max_images} onChange={(e) => patch('max_images', parseInt(e.target.value) || 1)}
                        className="w-full px-2 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] focus:outline-none" />
                    </div>
                  ) : (
                    <div className="hidden md:block" />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">Show in these views <span className="text-[var(--text-dim)]">(none = everywhere)</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {TABS.map((t) => (
                      <button key={t.id} onClick={() => toggleTab(t.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                          draft.tabs.includes(t.id)
                            ? 'bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]'
                            : 'text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)]'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)]/60 p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span className="text-[11px] font-semibold text-[var(--text-main)]">Data sources (Context Router)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={draft.hint} onChange={(e) => patch('hint', e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[11px] text-[var(--text-main)]">
                        {HINTS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                      </select>
                      <button onClick={previewSources} disabled={previewing || !draft.prompt.trim()}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] text-[11px] font-medium text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40">
                        {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Preview
                      </button>
                    </div>
                  </div>

                  {preview && (
                    <div className="space-y-2 animate-in fade-in">
                      {preview.error && <p className="text-[11px] text-rose-400">{preview.error}</p>}
                      {!preview.error && (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {preview.params_hint?.length > 0 && preview.params_hint.map((p) => (
                              <span key={p} className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 text-[10px] font-mono">param: {p}</span>
                            ))}
                          </div>
                          <p className="text-[10px] text-[var(--text-dim)]">{preview.reason} <span className="text-[var(--accent)]">· routed by {preview.routed_by}</span></p>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {sources.map((s) => (
                      <span key={s} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent-light)] text-[var(--accent)] text-[10px] font-medium">
                        {SOURCE_LABEL[s] || s}
                        <button onClick={() => setSources((cur) => cur.filter((x) => x !== s))} className="hover:text-rose-400" aria-label={`Remove ${s}`}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    {sources.length === 0 && <span className="text-[10px] text-[var(--text-dim)]">No data stores yet — preview to route, or add manually.</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={sourceInput}
                      onChange={(e) => setSourceInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && sourceInput.trim()) {
                          e.preventDefault();
                          setSources((cur) => (cur.includes(sourceInput.trim()) ? cur : [...cur, sourceInput.trim()]));
                          setSourceInput('');
                        }
                      }}
                      placeholder="Manual source (e.g. overview, plot, arcs, chapter_prose…)"
                      className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[11px] text-[var(--text-main)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={() => {
                        if (sourceInput.trim()) {
                          setSources((cur) => (cur.includes(sourceInput.trim()) ? cur : [...cur, sourceInput.trim()]));
                          setSourceInput('');
                        }
                      }}
                      className="px-2 py-1.5 rounded-lg border border-[var(--border-color)] text-[10px] font-medium text-[var(--accent)] hover:border-[var(--accent)]"
                    >
                      + Add
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--text-dim)]">Source vocabulary: {Object.keys(SOURCE_LABEL).join(', ')}. Lock routing to keep manual edits.</p>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-[var(--border-color)] flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button onClick={() => patch('routing_mode', draft.routing_mode === 'locked' ? 'auto' : 'locked')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                      draft.routing_mode === 'locked'
                        ? 'bg-amber-400/15 text-amber-400 border-amber-400/40'
                        : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}>
                    {draft.routing_mode === 'locked' ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    Lock routing
                  </button>
                  <button onClick={testRun} disabled={saving || !activeStory?.id || !draft?.prompt.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-40" style={{ backgroundColor: 'var(--accent)' }}>
                    {testJob?.status === 'running' || testJob?.status === 'pending'
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Play className="h-3 w-3" />}
                    Test run
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />}
                  <button onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-lg text-[11px] text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-main)]">Cancel</button>
                  <button onClick={save} disabled={saving || !draft?.name.trim() || !draft?.prompt.trim()}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-40" style={{ backgroundColor: 'var(--accent)' }}>
                    Save {editingId ? 'changes' : 'skill'}
                  </button>
                </div>
              </div>

              {(pipelineMsg || testJob) && (
                <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/60 animate-in fade-in">
                  {pipelineMsg && <p className="text-[11px] text-[var(--text-muted)] mb-1.5">{pipelineMsg}</p>}
                  {testJob && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span>Test job <span className="font-mono text-[var(--accent)]">{testJob.id}</span></span>
                      <span className={`font-medium ${testJob.status === 'error' ? 'text-rose-400' : testJob.status === 'done' ? 'text-emerald-400' : 'text-[var(--accent)]'}`}>{testJob.status}</span>
                      {testJob.stage && <span className="text-[var(--text-dim)]">· {testJob.stage}</span>}
                      {elapsed !== null && <span className="text-[var(--text-dim)]">· {elapsed}s</span>}
                      {testJob.queue_position > 0 && <span className="text-[var(--text-dim)]">· pos {testJob.queue_position}</span>}
                      {(testJob.status === 'running' || testJob.status === 'pending') && (
                        <button onClick={() => cancelTest(testJob.id)} className="text-rose-400 hover:underline">cancel</button>
                      )}
                    </div>
                  )}
                  {testJob?.status === 'done' && activeStory?.id && <TestOutput storyId={activeStory.id} job={testJob} />}
                  {testJob?.error_message && <p className="text-[11px] text-rose-400 mt-1.5">{testJob.error_message}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* How-to modal */}
      {showHelp && <AiHelpModal onClose={() => setShowHelp(false)} />}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in" onClick={() => setConfirmDelete(null)}>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-prose text-base font-bold text-[var(--text-main)] mb-2">Delete this skill?</h3>
            <p className="text-xs text-[var(--text-dim)] mb-4">The custom skill will be removed and unchecked from every story's AI config.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-main)]">Cancel</button>
              <button onClick={() => remove(confirmDelete)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TestOutput = ({ storyId, job }) => {
  const [result, setResult] = useState(null);
  useEffect(() => {
    fetch(`/api/ai/results/${storyId}/${job.pipeline}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setResult)
      .catch(() => setResult(null));
  }, [storyId, job.pipeline, job.created_at]);
  if (!result) return null;
  return (
    <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 max-h-72 overflow-y-auto animate-in fade-in">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Output</span>
        <span className="font-mono text-[10px] text-[var(--text-dim)]">{result.created_at}</span>
      </div>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdStyle}>{result.content}</ReactMarkdown>
    </div>
  );
};

export default SkillStudioView;