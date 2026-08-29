import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  StickyNote,
  Lightbulb,
  Shuffle,
  ArrowLeft,
  BookOpen,
  Check,
  Edit3,
  X,
  Quote
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';

const DEFAULT_OVERVIEW_HINT =
  "Add paragraphs to this story's overview below — a logline, premise, tone, or anything that frames the whole universe.";

export const DashboardView = () => {
  const {
    activeStory,
    updateActiveStory,
    setActiveTab,
  } = useStory();

  // Overview paragraphs (like character notes)
  const [overviewDraft, setOverviewDraft] = useState('');
  const [showOverviewInput, setShowOverviewInput] = useState(false);
  const [editingOverviewIdx, setEditingOverviewIdx] = useState(null);
  const [editingOverviewDraft, setEditingOverviewDraft] = useState('');

  // Fun facts
  const [funFacts, setFunFacts] = useState([]);
  const [currentFact, setCurrentFact] = useState(null);

  // Character quotes (from all characters in the cast)
  const [characterQuotes, setCharacterQuotes] = useState([]);

  const loadFunFacts = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/fun-facts`);
      if (res.ok) {
        const facts = await res.json();
        setFunFacts(facts);
        setCurrentFact(facts.length > 0 ? facts[Math.floor(Math.random() * facts.length)] : null);
      }
    } catch (err) {
      console.error('Failed to load fun facts:', err);
    }
  }, [activeStory?.id]);

  const loadCharacterQuotes = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/characters`);
      if (res.ok) {
        const chars = await res.json();
        const quotes = (chars || [])
          .flatMap((c) => (c.quotes || []).map((q) => ({ quote: q, character: c.name })));
        setCharacterQuotes(quotes);
      }
    } catch (err) {
      console.error('Failed to load character quotes:', err);
    }
  }, [activeStory?.id]);

  useEffect(() => {
    loadFunFacts();
  }, [loadFunFacts]);

  useEffect(() => {
    loadCharacterQuotes();
  }, [loadCharacterQuotes]);

  const overview = activeStory?.overview || [];

  const handleAddOverview = async () => {
    if (!activeStory || !overviewDraft.trim()) return;
    const updated = [...overview, overviewDraft.trim()];
    await updateActiveStory({ overview: updated });
    setOverviewDraft('');
    setShowOverviewInput(false);
  };

  const handleDeleteOverview = async (idx) => {
    if (!activeStory) return;
    const updated = overview.filter((_, i) => i !== idx);
    await updateActiveStory({ overview: updated });
  };

  const handleUpdateOverview = async (idx) => {
    if (!activeStory || !editingOverviewDraft.trim()) return;
    const updated = overview.map((para, i) => (i === idx ? editingOverviewDraft.trim() : para));
    await updateActiveStory({ overview: updated });
    setEditingOverviewIdx(null);
    setEditingOverviewDraft('');
  };

  const shuffleFact = () => {
    if (funFacts.length === 0) return;
    let next = currentFact;
    while (next === currentFact && funFacts.length > 1) {
      next = funFacts[Math.floor(Math.random() * funFacts.length)];
    }
    setCurrentFact(next);
  };

  if (!activeStory) {
    return (
      <div className="p-8 text-center text-xs text-[var(--text-muted)]">
        Please select a story universe first.
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header Banner */}
      <div className="literary-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <button
              onClick={() => setActiveTab('home')}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Home
            </button>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-1">
              <Sparkles className="h-4 w-4" />
              <span>Story Dashboard</span>
            </div>
            <h1 className="font-prose text-3xl md:text-4xl font-bold text-[var(--text-main)]">
              {activeStory.title}
            </h1>
            {activeStory?.tags && activeStory.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {activeStory.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-lg bg-[var(--accent-light)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)] border border-[var(--border-subtle)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-dim)] font-mono">slug: {activeStory.id}</span>
          </div>
        </div>
      </div>

      {/* Overview Section (paragraphs like character notes) */}
      <div className="literary-card rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <StickyNote className="h-3.5 w-3.5 text-[var(--accent)]" />
            Overview ({overview.length})
          </span>
          {!showOverviewInput && (
            <button
              onClick={() => setShowOverviewInput(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Paragraph
            </button>
          )}
        </div>

        {showOverviewInput && (
          <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-light)]/40 p-3 animate-in fade-in zoom-in-95">
            <textarea
              value={overviewDraft}
              onChange={(e) => setOverviewDraft(e.target.value)}
              placeholder="Write an overview paragraph (logline, premise, tone...)"
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOverviewDraft('');
                  setShowOverviewInput(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddOverview}
                disabled={!overviewDraft.trim()}
                className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                Save Paragraph
              </button>
            </div>
          </div>
        )}

        {overview.length === 0 && (
          <p className="text-xs italic text-[var(--text-dim)]">{DEFAULT_OVERVIEW_HINT}</p>
        )}

        {overview.map((para, idx) => (
          <div key={idx} className="group flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/10 text-[10px] font-bold text-[var(--accent)]">
              {idx + 1}
            </span>
            {editingOverviewIdx === idx ? (
              <>
                <textarea
                  value={editingOverviewDraft}
                  onChange={(e) => setEditingOverviewDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  className="flex-1 whitespace-pre-wrap rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-hidden resize-y"
                />
                <div className="flex flex-col gap-1 pt-0.5">
                  <button
                    onClick={() => handleUpdateOverview(idx)}
                    disabled={!editingOverviewDraft.trim()}
                    className="rounded-md p-1 text-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Save paragraph"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setEditingOverviewIdx(null); setEditingOverviewDraft(''); }}
                    className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                    title="Cancel edit"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="flex-1 whitespace-pre-wrap text-sm text-[var(--text-muted)] leading-relaxed font-prose">
                  {para}
                </p>
                <div className="mt-0.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => { setEditingOverviewIdx(idx); setEditingOverviewDraft(para); }}
                    className="rounded-md p-1 text-[var(--text-dim)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                    title="Edit paragraph"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteOverview(idx)}
                    className="rounded-md p-1 text-[var(--text-dim)] hover:bg-red-500/10 hover:text-red-500"
                    title="Delete paragraph"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Quotes Section */}
      <div className="literary-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Quote className="h-3.5 w-3.5 text-[var(--accent)]" />
            Memorable Quotes ({characterQuotes.length})
          </span>
        </div>

        {characterQuotes.length === 0 ? (
          <p className="text-xs italic text-[var(--text-dim)]">
            No quotes saved yet. Add memorable lines to your characters and they'll appear here.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characterQuotes.map((q, idx) => (
              <div key={idx} className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 pr-5">
                <Quote className="absolute top-3 left-3 h-4 w-4 text-[var(--accent)]/40" />
                <p className="pl-6 font-prose text-sm italic text-[var(--text-main)] leading-relaxed">
                  "{q.quote}"
                </p>
                <div className="mt-2 pl-6 text-xs font-semibold text-[var(--accent)] font-mono">
                  — {q.character}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary / Fun Fact Section */}
      <div className="literary-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Lightbulb className="h-3.5 w-3.5 text-[var(--accent)]" />
            Summary · Fun Fact
          </span>
          <button
            onClick={shuffleFact}
            disabled={funFacts.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Shuffle a new random fact"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle
          </button>
        </div>

        {funFacts.length === 0 ? (
          <p className="text-xs italic text-[var(--text-dim)]">
            No fun facts yet. Add characters, cities, factions, artifacts or chapters to generate
            random facts from your universe.
          </p>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-light)]/30 p-4 animate-in fade-in">
            <BookOpen className="h-5 w-5 shrink-0 mt-0.5 text-[var(--accent)]" />
            <p className="flex-1 text-sm text-[var(--text-main)] leading-relaxed font-prose">
              {currentFact}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
