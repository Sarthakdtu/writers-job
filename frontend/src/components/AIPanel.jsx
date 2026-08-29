import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Loader2, Sparkles, AlertCircle, CheckCircle, HelpCircle, ChevronDown, ChevronUp, Play, Pause, FileText, Settings, Zap } from 'lucide-react';
import { useStory } from '../context/StoryContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  story_overview: '📖',
  plot_holes: '🕳️',
  pacing_analysis: '⏱️',
  pitch_blurb: '📋',
  lore_check: '📜',
  mechanics_review: '⚙️',
  world_scene_ideas: '🌍',
  character_trajectory: '📈',
  character_consistency: '👤',
  dialogue_voice: '💬',
  gap_finder: '🔍',
  arc_trajectories: '🎯',
  pov_balance: '👁️',
  twist_check: '🌀',
  prose_critique: '✒️',
  continue_writing: '➡️',
  continuity_check: '🔗',
  show_tell: '🎭',
  handwriting_ocr: '📝',
  concept_art_caption: '🖼️',
  sticky_notes_dump: '🗒️',
};

const STAGE_LABELS = {
  'Asking the editor…': 'Asking the editor…',
  'Gathering context…': 'Gathering context…',
  'Routing context…': 'Routing context…',
  'Calling the model…': 'Calling the model…',
  'Saving result…': 'Saving result…',
  done: 'Done',
  error: 'Error',
  pending: 'Queued',
  running: 'Running…',
};

export const AIPanel = ({ isOpen, onClose }) => {
  const { activeStory } = useStory();
  const [pipelines, setPipelines] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('outliner');
  const [result, setResult] = useState(null);
  const [polling, setPolling] = useState(null);
  const [expandedSkills, setExpandedSkills] = useState(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const scrollAreaRef = useRef(null);

  const tabs = ['outliner', 'editor', 'world', 'characters', 'dashboard', 'quotes', 'home'];

  useEffect(() => {
    if (!isOpen) return;
    fetchPipelines();
    fetchConfig();
    fetchJobs();
    const id = setInterval(() => {
      fetchJobs();
      if (polling) fetchJob(polling);
    }, 2000);
    return () => clearInterval(id);
  }, [isOpen, activeStory, polling]);

  const fetchPipelines = async () => {
    try {
      const res = await fetch(`/api/ai/pipelines?story_id=${activeStory.id}&tab=${activeTab}`);
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
      }
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`/api/ai/config/${activeStory.id}`);
      if (res.ok) setConfig(await res.json());
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch(`/api/ai/jobs/${activeStory.id}`);
      if (res.ok) setJobs(await res.json());
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  };

  const fetchJob = async (jobId) => {
    try {
      const res = await fetch(`/api/ai/jobs/${activeStory.id}/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        setJobs((prev) => prev.map((j) => (j.id === jobId ? job : j)));
        if (job.status === 'done') {
          const rres = await fetch(`/api/ai/results/${activeStory.id}/${job.pipeline}`);
          if (rres.ok) setResult(await rres.json());
          setPolling(null);
        } else if (job.status === 'error' || job.status === 'cancelled') {
          setPolling(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch job:', err);
    }
  };

  const runSkill = async (skillId) => {
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: activeStory.id, skill: skillId, input: {} }),
      });
      if (res.ok) {
        const job = await res.json();
        setPolling(job.id);
        fetchJobs();
      }
    } catch (err) {
      console.error('Failed to run skill:', err);
    }
  };

  const cancelJob = async (jobId) => {
    try {
      await fetch(`/api/ai/jobs/${jobId}/cancel?story_id=${activeStory.id}`, { method: 'POST' });
      fetchJobs();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const updateConfig = async (patch) => {
    try {
      const res = await fetch(`/api/ai/config/${activeStory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, ...patch }),
      });
      if (res.ok) setConfig(await res.json());
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  const enabledSkills = config?.enabled_skills || null;
  const allPipelineIds = pipelines.map((p) => p.id);
  const isEnabled = (id) => enabledSkills === null || enabledSkills.includes(id);

  const filteredPipelines = pipelines.filter((p) => p.enabled);

  const runningJob = jobs.find((j) => j.status === 'running');
  const pendingJobs = jobs.filter((j) => j.status === 'pending');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row">
      <div
        className="w-full md:w-96 flex flex-col bg-[var(--bg-card)] border-l border-[var(--border-color)] animate-in slide-in-from-right-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
            <span className="font-prose font-semibold text-[var(--text-main)]">AI Assistant</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]" aria-label="Close AI Panel">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 p-2 border-b border-[var(--border-color)] overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); fetchPipelines(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
              }`}
            >
              {activeTab === tab && <Zap className="h-3 w-3" />}
              <span>{TAB_LABELS[tab]}</span>
            </button>
          ))}
        </div>

        {/* Settings Toggle */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-muted)]">Model Config</span>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            <Settings className="h-3.5 w-3.5" />
            {showSettings ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && config && (
          <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/50 space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Default Model</label>
              <select
                value={config.model}
                onChange={(e) => updateConfig({ model: e.target.value })}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden"
              >
                <option value="qwen3.5:9b">qwen3.5:9b (default)</option>
                <option value="llama3.1:8b">llama3.1:8b</option>
                <option value="gemma2:9b">gemma2:9b</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Temperature</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature_override ?? 0.2}
                onChange={(e) => updateConfig({ temperature_override: parseFloat(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
              <div className="text-right text-[10px] text-[var(--text-dim)] mt-0.5">
                {config.temperature_override ?? 0.2}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={enabledSkills === null}
                  onChange={(e) => updateConfig({ enabled_skills: e.target.checked ? null : [] })}
                  className="accent-[var(--accent)]"
                />
                <span className="text-[var(--text-main)]">Enable all skills (ignore list)</span>
              </label>
            </div>
          </div>
        )}

        {/* Skills List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredPipelines.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-dim)]">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No skills available for this context.</p>
            </div>
          ) : (
            filteredPipelines.map((p) => {
              const isCustom = p.id.startsWith('custom-');
              const job = jobs.find((j) => j.pipeline === p.id);
              const isRunning = job?.status === 'running';
              const isPending = job?.status === 'pending';
              const isDone = job?.status === 'done';
              const isError = job?.status === 'error';
              const isExpanded = expandedSkills.has(p.id);

              return (
                <div key={p.id} className="group rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)]/50 overflow-hidden transition-all hover:border-[var(--accent)]/50">
                  <button
                    onClick={() => setExpandedSkills((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })}
                    className="w-full flex items-center justify-between p-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-lg" aria-hidden="true">{SKILL_EMOJI[p.id] || (isCustom ? '✨' : '🤖')}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--text-main)] truncate">{p.name}</span>
                          {isCustom && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)]">Custom</span>}
                          {!p.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400">Disabled</span>}
                        </div>
                        <p className="text-[11px] text-[var(--text-dim)] truncate mt-0.5">{p.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRunning && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />}
                      {isPending && <Pause className="h-4 w-4 text-amber-400" title={`Queued (pos ${job.queue_position})`} />}
                      {isDone && <CheckCircle className="h-4 w-4 text-emerald-400" />}
                      {isError && <AlertCircle className="h-4 w-4 text-rose-400" />}
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-[var(--text-dim)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-dim)]" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--border-subtle)] p-3 space-y-2 bg-[var(--bg-base)]/30 animate-in fade-in">
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span>Input: {p.input_kind}</span>
                        {p.family && <span className="mx-1">·</span>}
                        {p.family && <span className="px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] text-[9px]">{p.family}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => runSkill(p.id)}
                          disabled={isRunning || isPending || !isEnabled(p.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: isRunning || isPending ? 'var(--accent-light)' : 'var(--accent)',
                            color: isRunning || isPending ? 'var(--accent)' : 'white',
                            border: 'none',
                          }}
                        >
                          {isRunning || isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          <span>{isRunning ? 'Running…' : isPending ? 'Queued' : 'Run'}</span>
                        </button>
                        {job && (job.status === 'running' || job.status === 'pending') && (
                          <button onClick={() => cancelJob(job.id)} className="px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-rose-400 hover:text-rose-400 hover:bg-rose-400/10">
                            Cancel
                          </button>
                        )}
                      </div>
                      {job && (
                        <div className="text-[11px] text-[var(--text-dim)] flex items-center gap-2">
                          <span>Status: <span className={`font-medium ${job.status === 'error' ? 'text-rose-400' : job.status === 'done' ? 'text-emerald-400' : ''}`}>{job.status}</span></span>
                          {job.stage && <span>· Stage: {STAGE_LABELS[job.stage] || job.stage}</span>}
                          {job.progress !== undefined && job.progress < 1 && <span>· {Math.round(job.progress * 100)}%</span>}
                          {job.model && <span>· Model: {job.model}</span>}
                        </div>
                      )}
                      {job && job.error_message && (
                        <div className="text-[11px] text-rose-400 bg-rose-400/10 rounded p-2">{job.error_message}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Result Panel */}
        {result && (
          <div className="border-t border-[var(--border-color)] p-3 bg-[var(--bg-base)]/50 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-[var(--text-main)]">Result — {result.pipeline}</span>
              <span className="text-[10px] text-[var(--text-dim)]">Model: {result.model}</span>
            </div>
            <div className="prose prose-sm max-w-none text-[var(--text-main)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Backdrop */}
      <div
        className="hidden md:block fixed inset-0 bg-black/30 z-40 animate-in fade-in"
        onClick={onClose}
      />
    </div>
  );
};