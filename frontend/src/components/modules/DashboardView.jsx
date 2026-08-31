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
  Quote,
  Flame,
  Trophy,
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useStory } from '../../context/StoryContext';

const DEFAULT_OVERVIEW_HINT =
  "Add paragraphs to this story's overview below — a logline, premise, tone, or anything that frames the whole universe.";

const formatNumber = (n) => Number(n || 0).toLocaleString();

const timeAgo = (isoStr) => {
  if (!isoStr) return null;
  const then = new Date(isoStr);
  const diffMs = Date.now() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString();
};

const preamble = (isoStr) => {
  const date = new Date(isoStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

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

  // Standalone quotes (from Quotes tab)
  const [standaloneQuotes, setStandaloneQuotes] = useState([]);

  // Writing progress
  const [writingStats, setWritingStats] = useState(null);

  // Memorable quotes carousel: one random sliding quote, auto-advancing
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quotesPaused, setQuotesPaused] = useState(false);
  const [expandedQuote, setExpandedQuote] = useState(false);

  const loadWritingStats = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/writing-stats`);
      if (res.ok) {
        setWritingStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to load writing stats:', err);
    }
  }, [activeStory?.id]);

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

  const loadStandaloneQuotes = useCallback(async () => {
    if (!activeStory) return;
    try {
      const res = await fetch(`/api/stories/${activeStory.id}/quotes`);
      if (res.ok) {
        const quotes = await res.json();
        setStandaloneQuotes(quotes);
      }
    } catch (err) {
      console.error('Failed to load standalone quotes:', err);
    }
  }, [activeStory?.id]);

  useEffect(() => {
    loadFunFacts();
  }, [loadFunFacts]);

  useEffect(() => {
    loadCharacterQuotes();
  }, [loadCharacterQuotes]);

  useEffect(() => {
    loadStandaloneQuotes();
  }, [loadStandaloneQuotes]);

  useEffect(() => {
    loadWritingStats();
  }, [loadWritingStats]);

  const overview = activeStory?.overview || [];

  // Merge character quotes and standalone quotes for display
  const allQuotes = [
    ...characterQuotes.map((q) => ({ ...q, source: 'character' })),
    ...standaloneQuotes.map((q) => ({ quote: q.text, character: q.note ? `— ${q.note}` : '— (Standalone)', note: q.note, tags: q.tags, source: 'standalone' })),
  ];

  // Auto-advance the quote carousel every 5s (paused while user is navigating)
  useEffect(() => {
    if (!allQuotes.length || quotesPaused) return;
    const id = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % allQuotes.length);
      setExpandedQuote(false);
    }, 5000);
    return () => clearInterval(id);
  }, [allQuotes.length, quotesPaused]);

  const currentQuote = allQuotes[quoteIndex] || null;

  const pickQuote = (i) => {
    setQuotesPaused(true);
    setExpandedQuote(false);
    setQuoteIndex(i);
  };

  const goPrevQuote = () => {
    setQuotesPaused(true);
    setExpandedQuote(false);
    setQuoteIndex((i) => (i - 1 + allQuotes.length) % allQuotes.length);
  };

  const goNextQuote = () => {
    setQuotesPaused(true);
    setExpandedQuote(false);
    setQuoteIndex((i) => (i + 1) % allQuotes.length);
  };

  const manualNav = {
    onMouseEnter: () => setQuotesPaused(true),
    onMouseLeave: () => setQuotesPaused(false),
  };

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

  const maxDayWords = writingStats?.recent_activity?.length
    ? Math.max(...writingStats.recent_activity.map((d) => d.words), 1)
    : 1;

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

      {/* Writing Progress Section */}
      <div className="literary-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Flame className="h-3.5 w-3.5 text-[var(--accent)]" />
            Writing Progress
          </span>
          {writingStats?.last_active && (
            <span className="text-[10px] font-medium text-[var(--text-dim)]">
              Last active {timeAgo(writingStats.last_active)}
            </span>
          )}
        </div>

        {!writingStats ? (
          <p className="text-xs italic text-[var(--text-dim)]">
            Writing stats are derived from your saved drafts.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <BookOpen className="h-3 w-3" />
                  Total Words
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {formatNumber(writingStats.total_words)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <Flame className="h-3 w-3 text-[var(--accent)]" />
                  Current Streak
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {writingStats.current_streak} day{writingStats.current_streak === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <Trophy className="h-3 w-3" />
                  Longest Streak
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {writingStats.longest_streak} day{writingStats.longest_streak === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  <Calendar className="h-3 w-3" />
                  Writing Days
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--text-main)]">
                  {writingStats.writing_days_total}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
                  Daily Words · Last 14 Days
                </span>
                {writingStats.today_words > 0 ? (
                  <span className="text-[10px] font-medium text-[var(--accent)]">
                    Today: {formatNumber(writingStats.today_words)} words across {writingStats.today_chapters} chapter{writingStats.today_chapters === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-[var(--text-dim)]">
                    No activity today
                  </span>
                )}
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {writingStats.recent_activity.map((day) => {
                  const height = day.words > 0 ? Math.max(4, Math.round((day.words / maxDayWords) * 64)) : 2;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center justify-end gap-1 group"
                      title={`${preamble(day.date)} — ${formatNumber(day.words)} words, ${day.chapters} chapter${day.chapters === 1 ? '' : 's'}`}
                    >
                      <div
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${day.words > 0 ? height : 3}px`,
                          backgroundColor: day.words > 0 ? 'var(--accent)' : 'var(--border-subtle)',
                          opacity: day.words > 0 ? 1 : 0.4,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 mt-1">
                {writingStats.recent_activity.map((day) => (
                  <div key={day.date} className="flex-1 text-center text-[9px] text-[var(--text-dim)]">
                    {new Date(day.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
      <div className="literary-card rounded-2xl p-6 space-y-4" {...manualNav}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Quote className="h-3.5 w-3.5 text-[var(--accent)]" />
            Memorable Quotes {allQuotes.length > 0 && `(${formatNumber(allQuotes.length)})`}
          </span>
          {allQuotes.length > 1 && (
            <span className="text-[10px] font-medium text-[var(--text-dim)]">
              {quotesPaused ? 'Paused' : 'Auto-advancing'}
            </span>
          )}
        </div>

        {allQuotes.length === 0 ? (
          <p className="text-xs italic text-[var(--text-dim)]">
            No quotes saved yet. Add memorable lines to your characters or the Quotes tab and they'll appear here.
          </p>
        ) : (
          <>
            <div key={quoteIndex} className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5 pr-5 animate-in fade-in h-[96px] flex flex-col">
              <Quote className="absolute top-4 left-4 h-4 w-4 text-[var(--accent)]/40" />
              <p
                className={`pl-8 font-prose text-base italic text-[var(--text-main)] leading-snug ${expandedQuote ? 'overflow-y-auto' : 'truncate'}`}
                title={expandedQuote ? undefined : currentQuote.quote}
                style={{ lineHeight: '1.4' }}
              >
                "{currentQuote.quote}"
              </p>
              <button
                onClick={() => setExpandedQuote((v) => !v)}
                className="self-start mt-auto pl-8 text-[10px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                {expandedQuote ? 'Show less' : 'Expand'}
              </button>
              <div className="pl-8 text-[10px] font-semibold text-[var(--accent)] font-mono truncate">
                {currentQuote.character}
              </div>
              {currentQuote.tags && currentQuote.tags.length > 0 && (
                <div className="mt-1 pl-8 flex flex-wrap gap-1 overflow-hidden">
                  {currentQuote.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-medium text-[var(--text-dim)] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {allQuotes.length > 1 && (
              <div className="flex items-center justify-between">
                <button
                  onClick={goPrevQuote}
                  className="flex items-center gap-1 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
                  title="Previous quote"
                >
                  <ChevronUp className="h-3.5 w-3.5 rotate-90" />
                  Prev
                </button>
                <div className="flex gap-1.5">
                  {allQuotes.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => pickQuote(i)}
                      className={`h-1.5 w-1.5 rounded-full transition-all cursor-pointer ${i === quoteIndex ? 'bg-[var(--accent)] w-4' : 'bg-[var(--border-subtle)] hover:bg-[var(--text-dim)]'}`}
                      title={`Quote ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  onClick={goNextQuote}
                  className="flex items-center gap-1 rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
                  title="Next quote"
                >
                  Next
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
                </button>
              </div>
            )}
          </>
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
