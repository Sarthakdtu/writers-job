import React, { useState, useEffect } from 'react';
import {
  X, Loader2, Sparkles, AlertCircle, CheckCircle, HelpCircle,
  ChevronDown, ChevronUp, Play, Pause, FileText, Settings, Zap, RotateCcw, Image as ImageIcon, Trash2, Lock, XCircle,
} from 'lucide-react';
import { AiHelpModal } from './AiHelpModal';
import { useStory } from '../context/StoryContext';
import { useSkillLevel } from '../context/SkillLevelContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SaveAsChapter from './SaveAsChapter';
import { CharacterPicker } from './CharacterPicker';

const TAB_LABELS = {
  outliner: 'Outliner',
  editor: 'Editor',
  world: 'World',
  characters: 'Characters',
  dashboard: 'Dashboard',
  home: 'Home',
  quotes: 'Quotes',
};

const SKILL_EMOJI = {
  story_overview: '📖', plot_holes: '🕳️', pacing_analysis: '⏱️', pitch_blurb: '📋',
  lore_check: '📜', mechanics_review: '⚙️', world_scene_ideas: '🌍',
  character_trajectory: '📈', character_consistency: '👤', dialogue_voice: '💬',
  gap_finder: '🔍', arc_trajectories: '🎯', pov_balance: '👁️', twist_check: '🌀',
  prose_critique: '✒️', continue_writing: '➡️', continuity_check: '🔗', show_tell: '🎭',
  chapter_draft: '📝',
  chapter_art: '🎨',
  handwriting_ocr: '📝', concept_art_caption: '🖼️', sticky_notes_dump: '🗒️',
};

const JOB_CATEGORIES = [
  { key: 'running', label: 'Running', statuses: ['pending', 'running'], color: 'text-[var(--accent)]' },
  { key: 'success', label: 'Success', statuses: ['done'], color: 'text-emerald-400' },
  { key: 'failed', label: 'Failed', statuses: ['error'], color: 'text-rose-400' },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'interrupted'], color: 'text-amber-400' },
];

const STAGE_LABELS = {
  'Asking the editor…': 'Asking the editor…',
  'Gathering context…': 'Gathering context…',
  'Routing context…': 'Routing context…',
  'Calling the model…': 'Calling the model…',
  'Saving result…': 'Saving result…',
};

const mdStyle = {
  p: ({ children }) => <p className="text-[13px] text-[var(--text-main)] leading-relaxed my-1.5">{children}</p>,
  h1: ({ children }) => <h1 className="text-base font-bold text-[var(--text-main)] mt-3 mb-1.5">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-[var(--text-main)] mt-3 mb-1.5">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[13px] font-bold text-[var(--text-main)] mt-2 mb-1">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-4 my-1.5 space-y-0.5 text-[13px] text-[var(--text-main)]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-1.5 space-y-0.5 text-[13px] text-[var(--text-main)]">{children}</ol>,
  li: ({ children }) => <li className="text-[13px] text-[var(--text-main)]">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-[var(--accent)]">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--accent)] pl-2 my-1.5 text-[13px] text-[var(--text-muted)] italic">{children}</blockquote>,
};

export const AIPanel = ({ isOpen, onClose }) => {
  const { activeStory } = useStory();
  const { canUse } = useSkillLevel();
  const [pipelines, setPipelines] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('outliner');
  const [results, setResults] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [images, setImages] = useState({});
  const [libImages, setLibImages] = useState([]);
  const [pickerSkill, setPickerSkill] = useState(null);
  const [allIds, setAllIds] = useState([]);
  const [runScope, setRunScope] = useState({});
  const [scopeChars, setScopeChars] = useState([]);
  const [scopeChapters, setScopeChapters] = useState([]);

  const tabs = ['outliner', 'editor', 'world', 'characters', 'dashboard', 'quotes', 'home', 'jobs'];

  const safeStory = activeStory?.id ? activeStory : null;

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(poll, 2000);
    fetchPipelines();
    fetchConfig();
    fetchAllIds();
    fetchScopeData();
    poll();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, safeStory?.id]);

  const poll = async () => {
    if (!safeStory) return;
    try {
      const res = await fetch(`/api/ai/jobs/${safeStory.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data);
      const runningDone = data.filter((j) => j.status === 'done');
      const missing = runningDone.filter((r) => !results[r.pipeline]);
      if (missing.length) {
        for (const r of missing) {
          const rres = await fetch(`/api/ai/results/${safeStory.id}/${r.pipeline}`);
          if (rres.ok) {
            const rj = await rres.json();
            setResults((prev) => ({ ...prev, [r.pipeline]: rj }));
          }
        }
      }
    } catch (err) {
      console.error('AI poll failed:', err);
    }
  };

  const fetchPipelines = async () => {
    if (!safeStory) return;
    try {
      const res = await fetch(`/api/ai/pipelines?story_id=${safeStory.id}&tab=${activeTab}`);
      if (res.ok) setPipelines(await res.json());
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
    }
  };

  const fetchAllIds = async () => {
    if (!safeStory) return;
    try {
      const res = await fetch(`/api/ai/pipelines?story_id=${safeStory.id}`);
      if (res.ok) setAllIds((await res.json()).map((p) => p.id));
    } catch (err) {
      console.error('Failed to fetch full pipeline list:', err);
    }
  };

  const fetchScopeData = async () => {
    if (!safeStory) return;
    try {
      const [charsRes, booksRes] = await Promise.all([
        fetch(`/api/stories/${safeStory.id}/characters`),
        fetch(`/api/stories/${safeStory.id}/books`),
      ]);
      if (charsRes.ok) setScopeChars(await charsRes.json());
      if (booksRes.ok) {
        const books = await booksRes.json();
        const chs = [];
        for (const b of (Array.isArray(books) ? books : [])) {
          try {
            const cres = await fetch(`/api/stories/${safeStory.id}/books/${b.id}/chapters`);
            if (cres.ok) {
              const chapters = await cres.json();
              for (const ch of (Array.isArray(chapters) ? chapters : [])) {
                chs.push({ id: ch.id, title: ch.title, bookId: b.id, bookTitle: b.title });
              }
            }
          } catch {}
        }
        setScopeChapters(chs);
      }
    } catch (err) {
      console.error('Failed to fetch scope data:', err);
    }
  };

  const fetchConfig = async () => {
    if (!safeStory) return;
    try {
      const res = await fetch(`/api/ai/config/${safeStory.id}`);
      if (res.ok) setConfig(await res.json());
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  const updateConfig = async (patch) => {
    if (!config) return;
    try {
      const res = await fetch(`/api/ai/config/${safeStory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, ...patch }),
      });
      if (res.ok) {
        setConfig(await res.json());
        fetchPipelines();
      }
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  const isEnabled = (id) => !config?.enabled_skills || config.enabled_skills.includes(id);

  const toggleSkill = async (id) => {
    if (!config) return;
    const currently = isEnabled(id);
    let next;
    if (!config.enabled_skills) {
      next = (allIds.length ? allIds : pipelines.map((p) => p.id)).filter((pid) => pid !== id);
    } else if (currently) {
      next = config.enabled_skills.filter((s) => s !== id);
    } else {
      next = [...config.enabled_skills, id];
    }
    await updateConfig({ enabled_skills: next });
  };

  const addImage = async (skillId) => {
    if (!safeStory) return;
    try {
      const res = await fetch(`/api/stories/${safeStory.id}/images/library`);
      if (res.ok) setLibImages(await res.json());
      setPickerSkill(skillId);
    } catch (err) {
      console.error('Failed to load image library:', err);
    }
  };

  const pickImage = (img) => {
    setImages((prev) => {
      const cur = prev[pickerSkill] || [];
      const next = cur.includes(img.image_url) ? cur.filter((u) => u !== img.image_url) : [...cur, img.image_url];
      return { ...prev, [pickerSkill]: next };
    });
  };

  const runSkill = async (skillId) => {
    if (!safeStory) return;
    const p = pipelines.find((x) => x.id === skillId);
    const scope = runScope[skillId] || {};
    const params = {};
    if (scope.character_id) params.character_id = scope.character_id;
    if (scope.chapter_id) {
      params.chapter_id = scope.chapter_id;
      if (scope.book_id) params.book_id = scope.book_id;
    }
    const input = {
      text: undefined,
      images: p?.needs_images ? (images[skillId] || []) : [],
      params,
    };
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: safeStory.id, skill: skillId, input }),
      });
      if (res.ok) poll();
      else {
        const err = await res.json().catch(() => ({}));
        const detail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err) || 'Unknown error';
        window.alert(`Could not start “${p?.name || skillId}”:\n\n${detail}`);
      }
    } catch (err) {
      console.error('Failed to run skill:', err);
    }
  };

  const cancelJob = async (jobId) => {
    try {
      await fetch(`/api/ai/jobs/${jobId}/cancel?story_id=${safeStory.id}`, { method: 'POST' });
      poll();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  if (!isOpen) return null;

  if (!canUse('ai.panel')) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30 animate-in fade-in" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur-xl shadow-2xl animate-in slide-in-from-right duration-150">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
              <Lock className="h-6 w-6" />
            </span>
            <p className="font-prose text-base font-bold text-[var(--text-main)]">The AI Studio is a Pro feature</p>
            <p className="text-xs text-[var(--text-muted)] max-w-xs">
              Level up to Pro to unlock every AI pipeline, custom Skill Studio, Chapter Judge and more.
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Back
            </button>
          </div>
        </div>
      </>
    );
  }

  const jobFor = (pipelineId) => jobs.find((j) => j.pipeline === pipelineId);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 animate-in fade-in" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur-xl shadow-2xl animate-in slide-in-from-right duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
            <span className="font-prose font-semibold text-[var(--text-main)]">AI Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
              title="How to use AI skills"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}
              title="Model config"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!safeStory && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--text-dim)] p-6">
            <HelpCircle className="h-8 w-8 opacity-50" />
            <p className="text-xs text-center">Select a story to use the AI Studio.</p>
          </div>
        )}

        {safeStory && (
          <>
            {/* Model row */}
            <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--text-dim)] uppercase tracking-wider">Model</span>
              <span className="font-mono text-xs text-[var(--accent)]">{config?.model || 'qwen3.5:9b'}</span>
            </div>

            {/* Settings */}
            {showSettings && config && (
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/60 space-y-3 animate-in fade-in">
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">Temperature</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={config.temperature_override ?? 0.2}
                      onChange={(e) => updateConfig({ temperature_override: parseFloat(e.target.value) })}
                      className="flex-1 accent-[var(--accent)]"
                    />
                    <span className="font-mono text-xs text-[var(--text-main)] w-8 text-right">{config.temperature_override ?? 0.2}</span>
                  </div>
                </div>
                <div>
                  <button
                    onClick={() => updateConfig({ enabled_skills: null })}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Enable all skills
                  </button>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 px-3 py-2 border-b border-[var(--border-color)] overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {activeTab === tab && <Zap className="h-3 w-3" />}
                  {TAB_LABELS[tab] || (tab === 'jobs' ? 'Jobs' : tab)}
                  {tab === 'jobs' && jobs.some((j) => j.status === 'running' || j.status === 'pending') && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-[9px] font-bold leading-none">
                      {jobs.filter((j) => j.status === 'running' || j.status === 'pending').length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Skills or Jobs */}
            {activeTab === 'jobs' ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {jobs.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-dim)] py-10 animate-in fade-in">
                    <FileText className="h-8 w-8 opacity-50" />
                    <p className="text-xs text-center">No jobs yet. Run a skill to see activity here.</p>
                  </div>
                )}
                {JOB_CATEGORIES.map((cat) => {
                  const catJobs = jobs.filter((j) => cat.statuses.includes(j.status));
                  if (catJobs.length === 0) return null;
                  return (
                    <div key={cat.key}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
                        <span className="text-[10px] text-[var(--text-dim)]">({catJobs.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {catJobs.map((j) => {
                          const skillDef = pipelines.find((p) => p.id === j.pipeline);
                          const skillName = skillDef?.name || j.pipeline;
                          const emoji = SKILL_EMOJI[j.pipeline] || (skillDef?.is_custom ? '✨' : '🤖');
                          const isJobRunning = j.status === 'running';
                          const isJobPending = j.status === 'pending';
                          const isJobBusy = isJobRunning || isJobPending;
                          const isJobDone = j.status === 'done';
                          const isJobError = j.status === 'error';
                          const elapsed = isJobRunning && j.started_at
                            ? Math.max(0, Math.round((Date.now() - Date.parse(j.started_at)) / 1000))
                            : null;
                          return (
                            <div
                              key={j.id}
                              className={`rounded-xl border px-3 py-2.5 transition-all ${
                                isJobRunning
                                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5'
                                  : 'border-[var(--border-color)] bg-[var(--bg-card)]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm shrink-0">{emoji}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-semibold text-[var(--text-main)] truncate">{skillName}</span>
                                    {isJobRunning && <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)] shrink-0" />}
                                    {isJobPending && <Pause className="h-3 w-3 text-amber-400 shrink-0" />}
                                    {isJobDone && <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />}
                                    {isJobError && <AlertCircle className="h-3 w-3 text-rose-400 shrink-0" />}
                                    {(j.status === 'cancelled' || j.status === 'interrupted') && <XCircle className="h-3 w-3 text-amber-400 shrink-0" />}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-dim)] flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {j.model && <span className="font-mono">{j.model}</span>}
                                    {j.started_at && <span>· {new Date(j.started_at).toLocaleTimeString()}</span>}
                                    {elapsed !== null && <span>· {elapsed}s</span>}
                                    {j.stage && STAGE_LABELS[j.stage] && <span>· {STAGE_LABELS[j.stage]}</span>}
                                  </div>
                                  {j.error_message && (
                                    <div className="text-[11px] text-rose-400 bg-rose-400/10 rounded-lg px-2 py-1 mt-1.5">{j.error_message}</div>
                                  )}
                                </div>
                                {isJobBusy && (
                                  <button
                                    onClick={() => cancelJob(j.id)}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border-color)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-rose-400 hover:text-rose-400 shrink-0 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {pipelines.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 text-[var(--text-dim)] py-10 animate-in fade-in">
                    <HelpCircle className="h-8 w-8 opacity-50" />
                    <p className="text-xs text-center">No AI skills for this tab.</p>
                  </div>
                )}

                {pipelines.map((p) => {
                  const enabled = p.enabled;
                  const job = jobFor(p.id);
                  const isRunning = job?.status === 'running';
                  const isPending = job?.status === 'pending';
                  const isError = job?.status === 'error';
                  const isCancelled = job?.status === 'cancelled';
                  const isDone = job?.status === 'done';
                  const isExpanded = expanded.has(p.id);
                  const res = results[p.id];
                  const skillImages = images[p.id] || [];
                  const busy = isRunning || isPending;

                  const elapsed = isRunning && job?.started_at
                    ? Math.max(0, Math.round((Date.now() - Date.parse(job.started_at)) / 1000))
                    : null;

                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border overflow-hidden transition-all ${
                      enabled
                        ? 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-base)] opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                      <button
                        onClick={() => setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          return next;
                        })}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <span className="text-lg" aria-hidden="true">{SKILL_EMOJI[p.id] || (p.is_custom ? '✨' : '🤖')}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--text-main)] truncate">{p.name}</span>
                            {p.is_custom && <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] shrink-0">custom</span>}
                            {!enabled && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-400/15 text-amber-400 shrink-0">off</span>}
                          </div>
                          <p className="text-[11px] text-[var(--text-dim)] truncate mt-0.5">{p.description}</p>
                        </div>
                      </button>
                      {isRunning && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)] shrink-0" />}
                      {isPending && <Pause className="h-4 w-4 text-amber-400 shrink-0" title={`Queued (pos ${job.queue_position})`} />}
                      {isDone && <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
                      {isError && <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />}
                      <button
                        onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                        className="p-1 text-[var(--text-dim)] hover:text-[var(--text-main)]"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[var(--border-subtle)] px-3 py-2.5 space-y-2 animate-in fade-in bg-[var(--bg-base)]/40">
                        <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>Input: <span className="font-mono text-[var(--text-main)]">{p.input_kind}</span></span>
                          {p.needs_selection && <span className="px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] text-[9px]">needs selection</span>}
                          {p.needs_images && <span className="px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] text-[9px]">needs images</span>}
                          {p.family === 'import' && <span className="px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-400 text-[9px]">import</span>}
                        </div>

                        {p.required_models && p.required_models.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-[var(--text-dim)] font-semibold uppercase">Models:</span>
                            {p.required_models.map((m) => (
                              <span key={m} className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)]
                                text-[10px] font-mono border border-[var(--border-subtle)]">{m}</span>
                            ))}
                          </div>
                        )}

                        {/* image attach */}
                        {p.needs_images && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {skillImages.map((u) => (
                                <div key={u} className="relative">
                                  <img src={u} alt="" className="h-12 w-12 rounded-lg object-cover border border-[var(--border-color)]" />
                                  <button
                                    onClick={() => setImages((prev) => ({ ...prev, [p.id]: (prev[p.id] || []).filter((x) => x !== u) }))}
                                    className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-rose-500 text-white"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addImage(p.id)}
                                className="flex items-center gap-1 text-[11px] text-[var(--accent)] border border-dashed border-[var(--border-color)] rounded-lg px-2 py-1.5 hover:border-[var(--accent)]"
                              >
                                <ImageIcon className="h-3.5 w-3.5" /> Add image(s)
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Quick Run scope */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider shrink-0">Focus on:</span>
                          <div className="min-w-[140px]">
                            <CharacterPicker
                              characters={scopeChars}
                              selected={runScope[p.id]?.character_id || ''}
                              onSelect={(id) => setRunScope((prev) => ({
                                ...prev,
                                [p.id]: { ...prev[p.id], character_id: id || undefined },
                              }))}
                              placeholder="All characters"
                              compact
                            />
                          </div>
                          <select
                            value={runScope[p.id]?.chapter_id || ''}
                            onChange={(e) => {
                              const ch = scopeChapters.find((c) => c.id === e.target.value);
                              setRunScope((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...prev[p.id],
                                  chapter_id: e.target.value || undefined,
                                  book_id: ch?.bookId || prev[p.id]?.book_id,
                                },
                              }));
                            }}
                            className="px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] text-[11px] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] max-w-[140px]"
                          >
                            <option value="">All chapters</option>
                            {scopeChapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
                          </select>
                        </div>

                        {/* run / cancel */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => runSkill(p.id)}
                            disabled={busy || !enabled}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ backgroundColor: 'var(--accent)' }}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (isDone ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />)}
                            <span>{isRunning ? 'Running…' : isPending ? 'Queued…' : isDone ? 'Run again' : 'Run'}</span>
                          </button>
                          <button
                            onClick={() => toggleSkill(p.id)}
                            className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                            title={enabled ? 'Disable skill' : 'Enable skill'}
                          >
                            {enabled ? 'Disable' : 'Enable'}
                          </button>
                          {job && busy && (
                            <button
                              onClick={() => cancelJob(job.id)}
                              className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-rose-400 hover:text-rose-400"
                            >
                              Cancel
                            </button>
                          )}
                        </div>

                        {/* status line */}
                        {job && (
                          <div className="text-[11px] text-[var(--text-dim)] flex items-center gap-2 flex-wrap">
                            <span>Status: <span className={`font-medium ${isError ? 'text-rose-400' : isDone ? 'text-emerald-400' : isRunning ? 'text-[var(--accent)]' : ''}`}>{job.status}</span></span>
                            {job.stage && STAGE_LABELS[job.stage] && <span>· {STAGE_LABELS[job.stage]}</span>}
                            {elapsed !== null && <span>· {elapsed}s</span>}
                            {job.queue_position > 0 && <span>· queue pos {job.queue_position}</span>}
                            {job.model && <span>· <span className="font-mono">{job.model}</span></span>}
                          </div>
                        )}
                        {job?.error_message && (
                          <div className="text-[11px] text-rose-400 bg-rose-400/10 rounded-lg p-2">{job.error_message}</div>
                        )}

                        {/* result */}
                        {res && (
                          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 max-h-64 overflow-y-auto animate-in fade-in">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Latest result</span>
                              <span className="font-mono text-[10px] text-[var(--text-dim)]">{res.created_at}</span>
                            </div>
                            <div className="space-y-1">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdStyle}>
                                {res.content}
                              </ReactMarkdown>
                            </div>
                            <SaveAsChapter
                              storyId={safeStory.id}
                              result={res}
                              hidden={res.content?.trim().startsWith('![')}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </>
        )}
      </div>

      {/* Image picker modal */}
      {pickerSkill && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in" onClick={() => setPickerSkill(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-prose text-base font-bold text-[var(--text-main)]">Pick reference image(s)</h3>
              <button onClick={() => setPickerSkill(null)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {libImages.map((img) => (
                <button
                  key={`${img.source}-${img.id}`}
                  onClick={() => pickImage(img)}
                  className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-all ${
                    (images[pickerSkill] || []).includes(img.image_url) ? 'border-[var(--accent)]' : 'border-transparent hover:border-[var(--accent)]/50'
                  }`}
                >
                  <img src={img.image_url} alt={img.title || ''} className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{img.title || img.character_name || ''}</span>
                </button>
              ))}
              {libImages.length === 0 && <p className="col-span-3 text-xs text-[var(--text-dim)] py-8 text-center">No images in this story's library yet.</p>}
            </div>
            <button
              onClick={() => setPickerSkill(null)}
              className="mt-4 w-full rounded-lg bg-[var(--accent)] py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Done ({(images[pickerSkill] || []).length} selected)
            </button>
          </div>
        </div>
      )}

      {/* How-to modal */}
      {showHelp && <AiHelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
};

export default AIPanel;