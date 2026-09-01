import React, { useEffect, useState, useRef } from 'react';
import {
  Plus, Copy, Pencil, Trash2, Zap, Lock, Unlock, Play, Loader2,
  Globe, X, Sparkles, HelpCircle, ChevronRight,
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';
import { useSkillLevel } from '../../context/SkillLevelContext';
import { AiHelpModal } from '../../components/AiHelpModal';
import { EntityFocusPicker } from '../../components/EntityFocusPicker';
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
  { id: '', label: 'Let me decide automatically' },
  { id: 'whole story', label: 'Analyze the whole story' },
  { id: 'my characters', label: 'Focus on my characters' },
  { id: 'plot & structure', label: 'Focus on plot & structure' },
  { id: 'the open chapter', label: 'Work with the current chapter' },
  { id: 'world lore', label: 'Pull in world lore' },
  { id: 'nothing', label: 'Nothing — pure creative' },
];

const TEMPLATES = [
  {
    id: 'character_analyst',
    name: 'Character Analyst',
    icon: '👤',
    description: 'Analyze character depth, consistency, and development',
    prompt: 'Analyze the following characters for depth, consistency, and development opportunities. Look at their motivations, flaws, arcs, and how they interact with other characters.',
    sources: ['characters', 'plot'],
    input_kind: 'story_context',
    hint: 'my characters',
  },
  {
    id: 'world_checker',
    name: 'World Consistency',
    icon: '🌍',
    description: 'Check worldbuilding for contradictions and gaps',
    prompt: 'Review the worldbuilding elements for internal consistency. Check for contradictions in locations, factions, magic systems, and lore. Flag any gaps that need filling.',
    sources: ['overview', 'world_cities', 'world_factions', 'world_artifacts', 'world_glossary', 'world_mechanics'],
    input_kind: 'story_context',
    hint: 'world lore',
  },
  {
    id: 'chapter_editor',
    name: 'Chapter Editor',
    icon: '📝',
    description: 'Edit and improve a specific chapter',
    prompt: 'Edit the following chapter for prose quality, pacing, dialogue, and narrative flow. Suggest specific improvements while preserving the author\'s voice.',
    sources: ['chapter_prose', 'characters'],
    input_kind: 'selection',
    hint: 'the open chapter',
  },
  {
    id: 'image_describer',
    name: 'Image Describer',
    icon: '🖼️',
    description: 'Describe and caption concept art or reference images',
    prompt: 'Describe the following images in detail. For concept art, note the mood, setting, character details, and artistic style. Suggest how these could enhance the story.',
    sources: [],
    input_kind: 'images',
    model_family: 'vision',
    hint: '',
  },
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
  const { canUse } = useSkillLevel();
  const [customs, setCustoms] = useState([]);
  const [builtins, setBuiltins] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [testJob, setTestJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [pipelineMsg, setPipelineMsg] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sources, setSources] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [builtinSearch, setBuiltinSearch] = useState('');
  const [selectedBuiltin, setSelectedBuiltin] = useState(null);
  const [jobPage, setJobPage] = useState(0);

  const filteredBuiltins = builtinSearch.trim()
    ? builtins.filter((p) => (p.name + ' ' + p.description).toLowerCase().includes(builtinSearch.toLowerCase()))
    : builtins;

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
      setJobs(jobs);
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
    setShowAdvanced(false);
    setShowTemplates(true);
  };

  const applyTemplate = (tpl) => {
    setDraft((d) => ({
      ...d,
      prompt: tpl.prompt,
      input_kind: tpl.input_kind || d.input_kind,
      model_family: tpl.model_family || d.model_family,
      hint: tpl.hint || '',
    }));
    setSources([...tpl.sources]);
    setShowTemplates(false);
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
    setShowTemplates(false);
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
      setPipelineMsg(`Saved "${saved.name}" (${editingId ? 'updated' : 'created'}) with sources: ${(saved.routing?.sources || []).join(', ') || 'none'}.`);
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
      setPipelineMsg(`Ran "${draft.name}" — job ${job.status}${job.queue_position > 0 ? ` (queue pos ${job.queue_position})` : ''}.`);
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

  if (!canUse('skill.studio')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
          <Lock className="h-6 w-6" />
        </span>
        <p className="font-prose text-lg font-bold text-[var(--text-main)]">Skill Studio is a Pro feature</p>
        <p className="mt-1 text-xs text-[var(--text-muted)] max-w-sm">
          Level up to Pro to design your own AI pipelines and route exactly which story data each skill reads.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-prose text-2xl font-bold text-[var(--text-main)]">Skill Studio</h1>
          <p className="text-xs text-[var(--text-dim)] mt-1">
            Build custom AI skills. Name it, describe what it does, write the prompt — the AI figures out which story data to use.
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
                <p className="text-xs text-[var(--text-dim)]">None yet — hit "New skill" to create one.</p>
              )}
              {customs.map((s) => (
                <div
                  key={s.id}
                  className={`group relative rounded-xl border transition-all cursor-pointer ${
                    editingId === s.id
                      ? 'border-[var(--accent)] bg-[var(--accent-light)]/40'
                      : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/60'
                  }`}
                  onClick={() => editDraft(s)}
                  title={s.name}
                >
                  <div className="flex items-center gap-2 p-2">
                    <span className="text-lg shrink-0">{SKILL_EMOJI[s.id] || '✨'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-[var(--text-main)] truncate">{s.name}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); duplicate(s.id); }} title="Duplicate" className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)]"><Copy className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); editDraft(s); }} title="Edit" className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)]"><Pencil className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(s.id); }} title="Delete" className="p-1 rounded text-[var(--text-muted)] hover:text-rose-400 hover:bg-[var(--bg-hover)]"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-2">Built-in skills</h2>
            <input
              value={builtinSearch}
              onChange={(e) => setBuiltinSearch(e.target.value)}
              placeholder="Search skills…"
              className="w-full px-2.5 py-1.5 mb-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[11px] text-[var(--text-main)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {filteredBuiltins.length === 0 && !builtins.length && <p className="text-[10px] text-[var(--text-dim)] px-1">Loading…</p>}
              {filteredBuiltins.length === 0 && builtins.length > 0 && <p className="text-[10px] text-[var(--text-dim)] px-1">No matches.</p>}
              {filteredBuiltins.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedBuiltin(selectedBuiltin === p.id ? null : p.id)}
                  title={p.name}
                  className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border text-lg transition-all ${
                    selectedBuiltin === p.id
                      ? 'border-[var(--accent)] bg-[var(--accent-light)]/40'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  {SKILL_EMOJI[p.id] || '🤖'}
                </button>
              ))}
            </div>
            {selectedBuiltin !== null && (() => {
              const sb = builtins.find((x) => x.id === selectedBuiltin);
              return sb ? (
                <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 animate-in fade-in">
                  <p className="text-[11px] font-semibold text-[var(--text-main)]">{sb.name}</p>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5">{sb.description}</p>
                </div>
              ) : null;
            })()}
            <p className="text-[10px] text-[var(--text-dim)] mt-1.5">Built-ins are code-defined and read-only here.</p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Loader2 className="h-3.5 w-3.5 text-[var(--accent)]" />
              <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Job tracker</h2>
              {!activeStory?.id && <span className="text-[10px] text-[var(--text-dim)]">(needs a story)</span>}
            </div>
            <p className="text-[9px] text-[var(--text-dim)] mb-2">Auto-archives after 1 day, deletes after 7 days.</p>
            {!activeStory?.id ? (
              <p className="text-[10px] text-[var(--text-dim)]">Select a story to track AI jobs.</p>
            ) : jobs.length === 0 ? (
              <p className="text-[10px] text-[var(--text-dim)]">No jobs yet — run a skill to see it here.</p>
            ) : (() => {
              const sorted = jobs.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
              const pageCount = Math.max(1, Math.ceil(sorted.length / 5));
              const cur = jobPage >= pageCount ? pageCount - 1 : jobPage;
              const pageJobs = sorted.slice(cur * 5, cur * 5 + 5);
              const groups = [];
              for (const j of pageJobs) {
                const key = j.pipeline;
                const last = groups[groups.length - 1];
                if (last && last.key === key) last.jobs.push(j);
                else groups.push({ key, jobs: [j] });
              }
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] text-[var(--text-dim)]">{sorted.length} jobs</span>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setJobPage(Math.max(0, cur - 1))} disabled={cur === 0}
                          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-30 disabled:cursor-default">◀</button>
                        <span className="text-[9px] text-[var(--text-dim)]">{cur + 1}/{pageCount}</span>
                        <button onClick={() => setJobPage(Math.min(pageCount - 1, cur + 1))} disabled={cur >= pageCount - 1}
                          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-30 disabled:cursor-default">▶</button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {groups.map((g) => {
                      const info = jobPipeline(g.jobs[0], customs, builtins);
                      return (
                        <div key={`${cur}-${g.key}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-sm">{info.emoji}</span>
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] truncate flex-1">{info.name}</span>
                            <span className="text-[9px] text-[var(--text-dim)]">{g.jobs.length}</span>
                          </div>
                          <div className="space-y-1">
                            {g.jobs.map((j) => (
                              <JobRow
                                key={j.id}
                                job={j}
                                selected={selectedJob?.id === j.id}
                                pipelineInfo={info}
                                onSelect={setSelectedJob}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
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

              {/* Template picker */}
              {showTemplates && !editingId && (
                <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/40 animate-in fade-in">
                  <p className="text-[11px] font-medium text-[var(--text-muted)] mb-2">Start from a template</p>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/60 text-left transition-all"
                      >
                        <span className="text-lg shrink-0">{tpl.icon}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-[var(--text-main)]">{tpl.name}</p>
                          <p className="text-[10px] text-[var(--text-dim)] truncate">{tpl.description}</p>
                        </div>
                        <ChevronRight className="h-3 w-3 text-[var(--text-dim)] shrink-0 mt-0.5" />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowTemplates(false)} className="mt-2 text-[10px] text-[var(--accent)] hover:underline">
                    Skip — start from scratch
                  </button>
                </div>
              )}

              <div className="p-4 space-y-4">
                {/* Name + Description */}
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

                {/* Prompt */}
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                    Prompt <span className="text-[var(--text-dim)]">(use {'{{story_context}}'}, {'{{characters}}'}, {'{{open_chapter}}'}, {'{{plot}}'} to pull in data)</span>
                  </label>
                  <textarea value={draft.prompt} onChange={(e) => patch('prompt', e.target.value)} rows={6} placeholder="You are a careful editor. Audit the attached chapter for point-of-view drift…"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] font-mono leading-relaxed placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]" />
                </div>

                {/* Focus picker (simple mode) */}
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                    What should this skill focus on?
                  </label>
                  <p className="text-[10px] text-[var(--text-dim)] mb-1.5">Guides which story data the AI pulls in automatically.</p>
                  <div className="flex items-center gap-2">
                    <select value={draft.hint} onChange={(e) => patch('hint', e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]">
                      {HINTS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                    </select>
                    <button onClick={previewSources} disabled={previewing || !draft.prompt.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-color)] text-[12px] font-medium text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40 whitespace-nowrap">
                      {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Preview
                    </button>
                  </div>

                  {preview && (
                    <div className="mt-2 space-y-1.5 animate-in fade-in">
                      {preview.error && <p className="text-[11px] text-rose-400">{preview.error}</p>}
                      {!preview.error && (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-[var(--text-muted)]">Will use:</span>
                            {sources.length > 0
                              ? sources.map((s) => <span key={s} className="px-2 py-0.5 rounded-lg bg-[var(--accent-light)] text-[var(--accent)] text-[10px] font-medium">{SOURCE_LABEL[s] || s}</span>)
                              : <span className="text-[11px] text-[var(--text-dim)]">nothing yet — hit Preview</span>}
                          </div>
                          <p className="text-[10px] text-[var(--text-dim)]">{preview.reason} <span className="text-[var(--accent)]">· routed by {preview.routed_by}</span></p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Advanced toggle */}
                <div className="pt-1">
                  <button onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)] hover:underline">
                    <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▸</span>
                    {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
                  </button>
                  <p className="text-[10px] text-[var(--text-dim)] mt-0.5 pl-4">Model, temperature, input type, and fine-tune which data feeds the prompt.</p>
                </div>

                {/* Advanced section */}
                {showAdvanced && (
                  <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 p-3 animate-in fade-in">
                    {/* Model + Temperature + Input */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-[var(--text-muted)] mb-1">Model family</label>
                        <select value={draft.model_family} onChange={(e) => patch('model_family', e.target.value)}
                          className="w-full px-2 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] focus:outline-none">
                          <option value="text">Text</option>
                          <option value="vision">Vision</option>
                          <option value="ocr">OCR</option>
                        </select>
                        <p className="text-[9px] text-[var(--text-dim)] mt-0.5">Text for writing, Vision for images, OCR for scanned text</p>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--text-muted)] mb-1">Temperature</label>
                        <input type="number" min="0" max="2" step="0.05" value={draft.temperature} onChange={(e) => patch('temperature', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[13px] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]" />
                        <p className="text-[9px] text-[var(--text-dim)] mt-0.5">Lower = focused, Higher = creative</p>
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
                        <p className="text-[9px] text-[var(--text-dim)] mt-0.5">What the user provides when running this skill</p>
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

                    {/* Tab restrictions */}
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

                    {/* Entity Focus Picker */}
                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <span className="text-[11px] font-semibold text-[var(--text-main)]">What should the AI consider?</span>
                        </div>
                        <button onClick={previewSources} disabled={previewing || !draft.prompt.trim()}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] text-[11px] font-medium text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40">
                          {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Preview
                        </button>
                      </div>

                      {preview && !preview.error && (
                        <div className="mb-2 space-y-1 animate-in fade-in">
                          {preview.params_hint?.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {preview.params_hint.map((p) => (
                                <span key={p} className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 text-[10px] font-mono">param: {p}</span>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-[var(--text-dim)]">{preview.reason} <span className="text-[var(--accent)]">· routed by {preview.routed_by}</span></p>
                        </div>
                      )}

                      {activeStory?.id ? (
                        <EntityFocusPicker storyId={activeStory.id} sources={sources} onChange={setSources} />
                      ) : (
                        <p className="text-[10px] text-[var(--text-dim)]">Select a story to use the entity picker.</p>
                      )}

                      {sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-[var(--text-muted)]">Active:</span>
                          {sources.map((s) => (
                            <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--accent-light)] text-[var(--accent)] text-[10px] font-medium">
                              {SOURCE_LABEL[s] || s}
                              <button onClick={() => setSources((cur) => cur.filter((x) => x !== s))} className="hover:text-rose-400" aria-label={`Remove ${s}`}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-[var(--text-dim)] mt-2">Toggle groups to include. Lock routing to keep manual edits.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
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

      {showHelp && <AiHelpModal onClose={() => setShowHelp(false)} />}

      {selectedJob && activeStory?.id && (
        <JobDetailDrawer
          job={selectedJob}
          storyId={activeStory.id}
          pipelineInfo={jobPipeline(selectedJob, customs, builtins)}
          onCancel={cancelTest}
          onClose={() => setSelectedJob(null)}
        />
      )}

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

const jobPipeline = (job, customs, builtins) => {
  const c = Array.isArray(customs) ? customs.find((x) => x.id === job.pipeline) : null;
  if (c) return { name: c.name, emoji: '✨' };
  const b = Array.isArray(builtins) ? builtins.find((x) => x.id === job.pipeline) : null;
  if (b) return { name: b.name, emoji: SKILL_EMOJI[b.id] || '🤖' };
  return { name: job.pipeline, emoji: job.pipeline?.startsWith('custom-') ? '✨' : '🤖' };
};

const JOB_STATUS = {
  pending: { label: 'Queued', cls: 'text-amber-400 bg-amber-400/10' },
  running: { label: 'Running', cls: 'text-[var(--accent)] bg-[var(--accent-light)]' },
  done: { label: 'Done', cls: 'text-emerald-400 bg-emerald-400/10' },
  error: { label: 'Error', cls: 'text-rose-400 bg-rose-400/10' },
  cancelled: { label: 'Cancelled', cls: 'text-[var(--text-dim)] bg-[var(--bg-hover)]' },
  interrupted: { label: 'Interrupted', cls: 'text-amber-400 bg-amber-400/10' },
};

const jobAge = (createdAt) => {
  if (!createdAt) return null;
  const d = new Date(createdAt.replace('T', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (24 * 60))}d`;
};

const JobRow = ({ job, selected, pipelineInfo, onSelect }) => {
  const st = JOB_STATUS[job.status] || { label: job.status, cls: 'text-[var(--text-dim)] bg-[var(--bg-hover)]' };
  const elapsed = job.status === 'running' && job.started_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(job.started_at)) / 1000))
    : null;
  const age = jobAge(job.created_at);

  return (
    <button
      onClick={() => onSelect(job)}
      className={`w-full rounded-lg border text-left px-2.5 py-2 flex items-center gap-2 transition-all ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-light)]/30'
          : job.archived
            ? 'border-[var(--border-subtle)] bg-[var(--bg-base)] opacity-60 hover:opacity-90'
            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
      }`}
    >
      <span className={`text-base shrink-0 ${job.archived ? 'grayscale' : ''}`}>{pipelineInfo.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-[var(--text-main)] truncate">{pipelineInfo.name}</p>
        <p className={`text-[9px] font-medium ${st.cls} inline-block px-1 py-px rounded mt-0.5`}>{st.label}</p>
        {job.archived && <span className="text-[9px] text-[var(--text-dim)] bg-[var(--bg-hover)] px-1 py-px rounded ml-1">archived</span>}
        {elapsed !== null && <span className="text-[9px] text-[var(--text-dim)] ml-1">· {elapsed}s</span>}
        {job.queue_position > 0 && <span className="text-[9px] text-[var(--text-dim)] ml-1">· pos {job.queue_position}</span>}
      </div>
      <span className="text-[9px] text-[var(--text-dim)] shrink-0">{age && <>{age} ago</>}</span>
    </button>
  );
};

const JobDetailDrawer = ({ job, storyId, pipelineInfo, onCancel, onClose }) => {
  const [result, setResult] = useState(null);
  const st = JOB_STATUS[job.status] || { label: job.status, cls: 'text-[var(--text-dim)] bg-[var(--bg-hover)]' };
  const busy = job.status === 'running' || job.status === 'pending';
  const progress = job.steps_total > 0 ? Math.round((job.steps_done / job.steps_total) * 100) : null;
  const elapsed = job.status === 'running' && job.started_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(job.started_at)) / 1000))
    : null;
  const age = jobAge(job.created_at);

  useEffect(() => {
    setResult(null);
    if (job.status === 'done') {
      fetch(`/api/ai/results/${storyId}/${job.pipeline}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setResult)
        .catch(() => setResult(null));
    }
  }, [job.id, job.status, job.pipeline, storyId]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 animate-in fade-in" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur-xl shadow-2xl animate-in slide-in-from-right duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg shrink-0">{pipelineInfo.emoji}</span>
            <span className="font-prose font-semibold text-sm text-[var(--text-main)] truncate">{pipelineInfo.name}</span>
            {job.archived && <span className="text-[9px] text-[var(--text-dim)] bg-[var(--bg-hover)] px-1 py-px rounded shrink-0">archived</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[11px] font-medium ${st.cls} px-2 py-0.5 rounded-lg`}>{st.label}</span>
            <span className="text-[9px] text-[var(--text-dim)] font-mono">{job.id}</span>
            {age && <span className="text-[10px] text-[var(--text-dim)]">{age} ago</span>}
            {job.queue_position > 0 && <span className="text-[10px] text-[var(--text-dim)]">· pos {job.queue_position}</span>}
            {job.model && <span className="text-[10px] text-[var(--text-dim)] font-mono">{job.model}</span>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
              <span className="text-[var(--text-dim)]">Created</span>
              <p className="text-[var(--text-main)] mt-0.5">{job.created_at || '—'}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
              <span className="text-[var(--text-dim)]">Finished</span>
              <p className="text-[var(--text-main)] mt-0.5">{job.completed_at || (busy ? 'In progress…' : '—')}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
              <span className="text-[var(--text-dim)]">Steps</span>
              <p className="text-[var(--text-main)] mt-0.5">{job.steps_done}/{job.steps_total}{job.stage ? ` · ${job.stage}` : ''}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
              <span className="text-[var(--text-dim)]">Elapsed</span>
              <p className="text-[var(--text-main)] mt-0.5">{elapsed !== null ? `${elapsed}s` : '—'}</p>
            </div>
          </div>

          {busy && (
            <>
              {progress !== null && (
                <div className="h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: 'var(--accent)' }} />
                </div>
              )}
              <button onClick={() => onCancel(job.id)} className="text-[11px] text-rose-400 hover:underline">Cancel job</button>
            </>
          )}

          {job.error_message && (
            <div className="text-[11px] text-rose-400 bg-rose-400/10 rounded-lg p-2">{job.error_message}</div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">Response</p>
            {job.status === 'done' ? (
              result ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 max-h-[50vh] overflow-y-auto animate-in fade-in">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-[var(--text-dim)]">{result.model}</span>
                    <span className="text-[9px] font-mono text-[var(--text-dim)]">{result.created_at}</span>
                  </div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdStyle}>{result.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-[11px] text-[var(--text-dim)] animate-pulse">Loading result…</p>
              )
            ) : job.status === 'error' ? (
              <p className="text-[11px] text-[var(--text-dim)]">No response — the job errored.</p>
            ) : (
              <p className="text-[11px] text-[var(--text-dim)]">{job.status === 'cancelled' || job.status === 'interrupted' ? `No response — job ${job.status}.` : 'Waiting for the job to finish…'}</p>
            )}
          </div>
        </div>
      </div>
    </>
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
