import React, { useState, useEffect, useRef } from 'react';
import { Sprout, BookOpen, Sparkles, ChevronUp, ChevronDown, Lock, Check, X, Compass } from 'lucide-react';
import { useSkillLevel, SKILL_LEVELS, LEVEL_ORDER } from '../context/SkillLevelContext';

const ICONS = { Sprout, BookOpen, Sparkles };

// A compact "trail" selector: three icons climbing left->right. Current level glows.
export const SkillLevelToggle = () => {
  const { level, setLevel, rank } = useSkillLevel();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-36 items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:border-[var(--accent)] transition-all shadow-sm"
        title="Skill Level — tailor LoreSmith to you"
      >
        <span className="text-base leading-none">{SKILL_LEVELS[rank].symbol}</span>
        <span className="truncate">{SKILL_LEVELS[rank].name}</span>
        {open ? (
          <ChevronUp className="h-3 w-3 text-[var(--text-dim)]" />
        ) : (
          <ChevronDown className="h-3 w-3 text-[var(--text-dim)]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
            Your Skill Level
          </div>

          {/* The ascension trail */}
          <div className="relative mx-2 mt-1 mb-2 flex items-center justify-between px-1">
            <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--bg-hover)]" />
            <div
              className="absolute left-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `calc(${(rank / (LEVEL_ORDER.length - 1)) * 100}% )` }}
            />
            {SKILL_LEVELS.map((s) => {
              const idx = LEVEL_ORDER.indexOf(s.id);
              const Icon = ICONS[s.icon];
              const isActive = idx === rank;
              const isUnlocked = idx <= rank;
              return (
                <button
                  key={s.id}
                  onClick={() => setLevel(s.id)}
                  className="relative z-10 flex flex-col items-center gap-1"
                  title={s.name}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                      isActive
                        ? 'border-[var(--accent)] text-[var(--accent)] shadow-md'
                        : isUnlocked
                        ? 'border-[var(--border-color)] text-[var(--text-muted)] bg-[var(--bg-card)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-dim)] bg-[var(--bg-hover)]'
                    }`}
                    style={isActive ? { backgroundColor: 'var(--accent-light)' } : undefined}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      isActive ? 'text-[var(--accent)]' : isUnlocked ? 'text-[var(--text-muted)]' : 'text-[var(--text-dim)]'
                    }`}
                  >
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Description of current level */}
          <div className="mx-2 mb-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-main)]">
              {SKILL_LEVELS[rank].name}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {SKILL_LEVELS[rank].description}
            </div>
            <div className="mt-1.5 text-[11px] font-medium text-[var(--accent)]">
              {SKILL_LEVELS[rank].features}
            </div>
          </div>

          {/* Next tier teaser */}
          {rank < LEVEL_ORDER.length - 1 && (
            <button
              onClick={() => setLevel(LEVEL_ORDER[rank + 1])}
              className="mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg bg-[var(--accent-light)] px-2.5 py-2 text-left text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              <span>Level up to {SKILL_LEVELS[rank + 1].name}: {SKILL_LEVELS[rank + 1].lockedLabel}</span>
            </button>
          )}

          <div className="mx-2 mt-1 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-1.5 pb-0.5">
            {rank > 0 && (
              <button
                onClick={() => setLevel(LEVEL_ORDER[rank - 1])}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              >
                <ChevronDown className="h-3 w-3" /> Simplify
              </button>
            )}
            <span className="ml-auto text-[10px] text-[var(--text-dim)]">Toggle any time</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Full-screen welcome/onboarding modal shown when entering a tier for the first time.
export const SkillLevelModal = ({ onDone }) => {
  const { level, setLevel } = useSkillLevel();
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterFeature, setRosterFeature] = useState([]);

  const roster = {
    beginner: [
      'Home gallery & easy story creation',
      'Story dashboard, quotes & writing progress',
      'Focused Draft Editor with autosave',
      'Character roster & timeline',
      'Quick search, themes & trash',
    ],
    intermediate: [
      'Worldbuilding Hub (cities, factions, artifacts)',
      'Book Outliner (tree & plot beats)',
      'Character relationship Map',
      'Universe Explorer quick-access widget',
      'Google Docs editing & Focus Mode',
    ],
    pro: [
      'Full AI Studio panel (every pipeline)',
      'Skill Studio — build your own AI skills',
      'Chapter Judge, character arcs & POV tracker',
      'Perspective Rewrite in the editor',
      'Advanced AI settings & image picker',
    ],
  };

  const showRoster = (features) => {
    setRosterFeature(features);
    setRosterOpen(true);
  };

  const current = SKILL_LEVELS.find((s) => s.id === level) || SKILL_LEVELS[0];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl animate-in zoom-in-95">
        <div className="mb-3 flex items-center gap-2">
          <Compass className="h-5 w-5 text-[var(--accent)]" />
          <h3 className="font-prose text-xl font-bold text-[var(--text-main)]">Choose your skill level</h3>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          LoreSmith grows with you. Pick a level and the interface gently adapts — you can switch at any time and nothing is ever lost.
        </p>

        <div className="space-y-2">
          {SKILL_LEVELS.map((s) => {
            const Icon = ICONS[s.icon];
            const isActive = level === s.id;
            const idx = LEVEL_ORDER.indexOf(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setLevel(s.id)}
                className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-base)] hover:border-[var(--accent)]'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                    isActive ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-color)] text-[var(--text-dim)]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-main)]">
                    {s.name}
                    {isActive && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
                  </span>
                  <span className="block text-[11px] text-[var(--text-muted)]">{s.tagline}</span>
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    showRoster(roster[s.id]);
                  }}
                  className="shrink-0 rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
                >
                  Features
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-[11px] text-[var(--text-muted)] mb-1.5">
            <span className="font-semibold text-[var(--text-main)]">Tip:</span> Start where you feel at home and climb when you're ready. Level {LEVEL_ORDER.indexOf(level) + 1} of {LEVEL_ORDER.length}.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onDone}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Let's go
            </button>
          </div>
        </div>
      </div>

      {/* Features roster popup */}
      {rosterOpen && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4"
          onClick={() => setRosterOpen(false)}
        >
          <div
            className="relative w-full max-w-xs rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setRosterOpen(false)}
              className="absolute right-3 top-3 rounded-full p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)]"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="h-4 w-4 text-[var(--accent)]" />
              <h4 className="font-prose text-base font-bold text-[var(--text-main)]">
                What {SKILL_LEVELS.find((s) => s.id === level)?.name} unlocks
              </h4>
            </div>
            <ul className="space-y-2">
              {rosterFeature.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
